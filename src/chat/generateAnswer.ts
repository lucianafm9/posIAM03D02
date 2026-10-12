import type { LlmClient, Message, Output } from "../types.ts";
import { describeError, EmptyResponseError } from "../utils/errors.ts";
import { retryPolicy, type Sleep } from "../utils/retryPolicy.ts";
import { withRetry } from "../utils/withRetry.ts";

/**
 * Revisor da autocrítica. Além dos critérios do D01 (fidelidade, responder à pergunta, formato),
 * agora verifica o USO DA MEMÓRIA: fato inventado, memória irrelevante, preferência desrespeitada.
 */
export const CRITIC_PROMPT = [
  "Você é um revisor rigoroso de respostas de um assistente de relacionamento com clientes B2B.",
  "Recebe as INSTRUÇÕES do assistente, a MEMÓRIA disponível do cliente, a MENSAGEM do cliente e a RESPOSTA.",
  "Critérios:",
  "(1) não inventa fatos: todo pedido, valor, prazo ou chamado citado está na memória ou na conversa;",
  "(2) responde de fato à mensagem;",
  "(3) usa a memória quando ela é relevante (dá continuidade, evita que o cliente repita informação);",
  "(4) NÃO cita memórias sem relação com a mensagem;",
  "(5) respeita as preferências registradas e o formato de saída.",
  'Responda SOMENTE com JSON no formato {"approved": boolean, "issues": ["problema 1", "problema 2"]}.',
  "Use approved=true apenas se não houver problemas relevantes; nesse caso, issues deve ser [].",
].join("\n");

const REVISE_INSTRUCTION =
  "Reescreva a resposta final corrigindo os problemas apontados pela revisão, mantendo o formato de saída exigido. " +
  "Responda apenas com a resposta final, sem mencionar a revisão.";

export type Critique = { approved: boolean; issues: string[] };

export type CritiqueOutcome =
  | { status: "desativada" }
  | { status: "aprovada" }
  | { status: "revisada"; issues: string[]; draft: string }
  | { status: "falhou"; error: string };

export type GeneratedAnswer = { text: string; critique: CritiqueOutcome };

/** Interpreta o JSON do revisor. Se vier malformado, aprova (a autocrítica nunca deve piorar a resposta). */
export function parseCritique(raw: string): Critique {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    const parsed: unknown = JSON.parse(cleaned);
    if (typeof parsed === "object" && parsed !== null && "approved" in parsed) {
      const { approved, issues } = parsed as { approved: unknown; issues?: unknown };
      const list = Array.isArray(issues) ? issues.filter((i): i is string => typeof i === "string") : [];
      return { approved: approved === true || list.length === 0, issues: list };
    }
  } catch {
    // cai no retorno padrão abaixo
  }
  return { approved: true, issues: [] };
}

export type GenerateAnswerParams = {
  llm: LlmClient;
  systemPrompt: string;
  /** Contexto já costurado (memória + resumo + mensagens recentes), sem a mensagem atual. */
  context: Message[];
  question: string;
  /** Bloco de memória mostrado ao revisor (para checar se o uso foi correto). */
  memoryForReview: string | null;
  out: Output;
  critique: boolean;
  sleep?: Sleep;
};

/**
 * Fluxo de geração:
 *  1. rascunho com streaming;
 *  2. autocrítica (o modelo revisa o rascunho contra instruções, memória e mensagem);
 *  3. se reprovado, versão revisada, também com streaming.
 * Todas as chamadas passam por withRetry. Se a autocrítica ou a revisão falharem, o rascunho é mantido:
 * a autocrítica nunca deixa o cliente sem resposta. Só uma falha no rascunho (após as retentativas) é lançada.
 */
export async function generateAnswer(params: GenerateAnswerParams): Promise<GeneratedAnswer> {
  const { llm, systemPrompt, context, question, out } = params;

  let printedTokens = false;
  const breakLine = () => {
    const prefix = printedTokens ? "\n\n" : "";
    printedTokens = false;
    return prefix;
  };
  const policy = (label: string) => retryPolicy(out, label, params.sleep, breakLine);

  const streamOnce = async (messages: Message[]): Promise<string> => {
    const text = await llm.stream(messages, (token) => {
      printedTokens = true;
      out.write(token);
    });
    if (text.trim() === "") throw new EmptyResponseError();
    return text;
  };

  // 1. Rascunho
  const draft = await withRetry(
    () => streamOnce([{ role: "system", content: systemPrompt }, ...context, { role: "user", content: question }]),
    policy("Falha na geração"),
  );
  out.write("\n");
  printedTokens = false;

  if (!params.critique) return { text: draft, critique: { status: "desativada" } };

  // 2. Autocrítica
  let critique: Critique;
  try {
    out.write("[Autocrítica: revisando a resposta...]\n");
    const raw = await withRetry(
      () =>
        llm.complete(
          [
            { role: "system", content: CRITIC_PROMPT },
            {
              role: "user",
              content:
                `<instrucoes>\n${systemPrompt}\n</instrucoes>\n\n` +
                `<memoria>\n${params.memoryForReview ?? "(nenhuma memória disponível)"}\n</memoria>\n\n` +
                `<mensagem>\n${question}\n</mensagem>\n\n<resposta>\n${draft}\n</resposta>`,
            },
          ],
          { json: true, temperature: 0 },
        ),
      policy("Falha na autocrítica"),
    );
    critique = parseCritique(raw);
  } catch (error) {
    const reason = describeError(error);
    out.write(`[Autocrítica indisponível (${reason}). Mantendo a resposta original.]\n`);
    return { text: draft, critique: { status: "falhou", error: reason } };
  }

  if (critique.approved) {
    out.write("[Autocrítica: resposta aprovada.]\n");
    return { text: draft, critique: { status: "aprovada" } };
  }

  // 3. Versão revisada
  out.write(`[Autocrítica: pontos a melhorar -> ${critique.issues.join("; ")}]\n`);
  out.write("\nVersão revisada:\n");
  printedTokens = false;
  try {
    const revised = await withRetry(
      () =>
        streamOnce([
          { role: "system", content: systemPrompt },
          ...context,
          {
            role: "user",
            content:
              `${question}\n\n---\nRascunho anterior:\n${draft}\n\n` +
              `Problemas apontados pela revisão:\n- ${critique.issues.join("\n- ")}\n\n${REVISE_INSTRUCTION}`,
          },
        ]),
      policy("Falha na revisão"),
    );
    out.write("\n");
    return { text: revised, critique: { status: "revisada", issues: critique.issues, draft } };
  } catch (error) {
    const reason = describeError(error);
    out.write(`\n[Revisão indisponível (${reason}). Mantendo a resposta original.]\n`);
    return { text: draft, critique: { status: "falhou", error: reason } };
  }
}
