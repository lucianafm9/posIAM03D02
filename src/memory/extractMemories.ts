import { validateMemory } from "../guardrails/validateMemory.ts";
import type { Importance, Memory, MemoryType, Message } from "../types.ts";
import type { MemoryRepository } from "./memoryRepository.ts";
import { formatMemoryLine } from "./stitchContext.ts";

export const EXTRACTION_PROMPT = [
  "Você é um extrator de memórias de um CRM B2B. Sua tarefa é decidir o que vale lembrar do cliente em atendimentos FUTUROS.",
  "Tipos de memória:",
  "- pedido: compra, contratação, renovação ou intenção concreta de compra (itens, quantidades, prazos, valores);",
  "- preferencia: como o cliente quer ser atendido (canal, formato, horários, nível de detalhe, prioridades);",
  "- problema: falha, reclamação ou incidente relatado (e seu andamento);",
  "- relacionamento: contexto da conta (planos da empresa, mudanças de contato, satisfação, riscos de cancelamento).",
  "Regras:",
  "1. Registre apenas fatos AFIRMADOS ou CONFIRMADOS pelo cliente. Sugestões e explicações do assistente não são memória.",
  "2. Ignore saudações, perguntas genéricas (dúvidas conceituais), conversa sem consequência e o que já está registrado.",
  "3. Se a mensagem MUDAR ou CORRIGIR uma memória existente, use ATUALIZAR com o id dela e escreva o fato completo atualizado.",
  "4. Escreva cada memória como uma frase curta em terceira pessoa (até 200 caracteres), com datas absolutas (use a data de hoje informada).",
  "5. Nunca registre dados sensíveis (senhas, CPF, cartões, tokens).",
  "6. importancia: 3 somente para preferências que devem orientar TODO atendimento (ex.: canal de contato); 2 = útil; 1 = detalhe.",
  "Responda SOMENTE com JSON no formato:",
  '{"operacoes": [{"acao": "ADICIONAR" | "ATUALIZAR", "id_substituida": number | null, "tipo": "pedido" | "preferencia" | "problema" | "relacionamento", "conteudo": string, "importancia": 1 | 2 | 3}]}',
  'Se não houver nada novo a lembrar, responda {"operacoes": []}.',
].join("\n");

export type AppliedOperation = { acao: "ADICIONAR" | "ATUALIZAR"; memory: Memory; replaced?: Memory };
export type RejectedOperation = { raw: unknown; errors: string[] };

export type ExtractionResult = { applied: AppliedOperation[]; rejected: RejectedOperation[] };

/** Lê o JSON do extrator. JSON malformado lança erro (quem chama decide manter o atendimento sem memória nova). */
export function parseOperations(raw: string): unknown[] {
  const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("O extrator de memória devolveu um JSON inválido.");
  }
  if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as { operacoes?: unknown }).operacoes)) {
    throw new Error('Resposta do extrator sem a lista "operacoes".');
  }
  return (parsed as { operacoes: unknown[] }).operacoes;
}

export function buildExtractionInput(params: {
  clientName: string;
  today: string;
  existing: Memory[];
  question: string;
  answer: string;
}): string {
  const existing = params.existing.length > 0 ? params.existing.map(formatMemoryLine).join("\n") : "(nenhuma)";
  return [
    `Cliente: ${params.clientName}`,
    `Data de hoje: ${params.today}`,
    "",
    "<memorias_existentes>",
    existing,
    "</memorias_existentes>",
    "",
    "<interacao>",
    `Cliente: ${params.question}`,
    `Assistente: ${params.answer}`,
    "</interacao>",
  ].join("\n");
}

/**
 * Pede ao modelo as operações de memória da interação e as aplica com validação:
 * - ADICIONAR: grava uma memória nova (ignora duplicata exata);
 * - ATUALIZAR: a memória antiga (do MESMO cliente e ativa) vira "substituida" e a nova aponta para ela.
 * Operações inválidas (tipo desconhecido, dado sensível, id de outro cliente...) são rejeitadas e reportadas.
 */
export async function extractMemories(params: {
  /** Chamada ao modelo em modo JSON (quem chama aplica as retentativas). */
  complete: (messages: Message[]) => Promise<string>;
  repo: MemoryRepository;
  clientId: string;
  clientName: string;
  sessionId: string;
  now: string;
  question: string;
  answer: string;
  maxExisting: number;
  /** Embedding da memória nova; null se a API falhar (é completado depois). */
  embed: (text: string) => Promise<number[] | null>;
}): Promise<ExtractionResult> {
  const existing = params.repo.listActive(params.clientId).slice(0, params.maxExisting);
  const messages: Message[] = [
    { role: "system", content: EXTRACTION_PROMPT },
    {
      role: "user",
      content: buildExtractionInput({
        clientName: params.clientName,
        today: params.now.slice(0, 10),
        existing,
        question: params.question,
        answer: params.answer,
      }),
    },
  ];
  const raw = await params.complete(messages);
  const operations = parseOperations(raw);

  const result: ExtractionResult = { applied: [], rejected: [] };
  const activeContents = new Set(existing.map((memory) => memory.content.trim().toLowerCase()));

  for (const op of operations) {
    const candidate = (typeof op === "object" && op !== null ? op : {}) as Record<string, unknown>;
    const check = validateMemory({ type: candidate.tipo, content: candidate.conteudo, importance: candidate.importancia });
    const acao = candidate.acao === "ATUALIZAR" ? "ATUALIZAR" : candidate.acao === "ADICIONAR" ? "ADICIONAR" : null;
    if (!acao) check.errors.push(`Ação inválida: ${String(candidate.acao)}.`);
    if (!check.isValid || !acao) {
      result.rejected.push({ raw: op, errors: check.errors });
      continue;
    }

    const content = String(candidate.conteudo).trim();
    if (activeContents.has(content.toLowerCase())) continue;

    const newMemory = {
      clientId: params.clientId,
      type: candidate.tipo as MemoryType,
      content,
      importance: candidate.importancia as Importance,
      source: "conversa" as const,
      sessionId: params.sessionId,
      createdAt: params.now,
      embedding: await params.embed(content),
    };

    if (acao === "ATUALIZAR") {
      const oldId = Number(candidate.id_substituida);
      const old = params.repo.find(oldId);
      if (!old || old.clientId !== params.clientId || old.status !== "ativa") {
        result.rejected.push({ raw: op, errors: [`ATUALIZAR aponta para uma memória inexistente ou de outro cliente (M${String(candidate.id_substituida)}).`] });
        continue;
      }
      const memory = params.repo.supersede(oldId, newMemory);
      result.applied.push({ acao, memory, replaced: old });
    } else {
      const memory = params.repo.insert(newMemory);
      result.applied.push({ acao, memory });
    }
    activeContents.add(content.toLowerCase());
  }

  return result;
}
