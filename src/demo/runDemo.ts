import { CrmAssistant } from "../chat/crmAssistant.ts";
import { createFailingEmbedder, createLocalEmbedder, createScriptedLlm, type ScriptedReply, type CallKind } from "../llm/scriptedClient.ts";
import { openDatabase } from "../memory/database.ts";
import { readSeed, seedDatabase } from "../memory/seedDatabase.ts";
import type { Embedder } from "../types.ts";

/**
 * Demonstração SEM chave de API do tratamento de erros e da autocrítica.
 * O modelo é simulado (respostas roteirizadas) para provocar cada falha de forma reproduzível;
 * o fluxo executado (CrmAssistant, withRetry, guardrails, memória) é exatamente o da aplicação real.
 */

class HttpError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

class ConnectionError extends Error {
  constructor() {
    super("Connection error.");
    this.name = "APIConnectionError";
  }
}

type DemoCase = {
  title: string;
  explanation: string;
  clientId: string;
  message: string;
  streams?: ScriptedReply[];
  completes?: Partial<Record<CallKind, ScriptedReply[]>>;
  embedder?: Embedder;
  critique?: boolean;
};

const CASES: DemoCase[] = [
  {
    title: "1. Erro temporário (HTTP 429) com retentativa bem-sucedida",
    explanation: "429/5xx/rede/timeout/resposta vazia são retentáveis: até 3 tentativas com backoff exponencial (1s, 2s; teto 8s) e jitter.",
    clientId: "alvorada",
    message: "Qual é a vigência das nossas licenças do Microsoft 365?",
    streams: [new HttpError(429), "As 50 licenças Microsoft 365 Business Standard renovadas em 15/03/2026 valem até 14/03/2027."],
  },
  {
    title: "2. Falha de conexão em todas as tentativas",
    explanation: "Esgotadas as 3 tentativas, o usuário recebe a causa em linguagem clara e NADA é gravado (histórico e memória intactos).",
    clientId: "alvorada",
    message: "Qual é a vigência das nossas licenças do Microsoft 365?",
    streams: [new ConnectionError(), new ConnectionError(), new ConnectionError()],
  },
  {
    title: "3. Erro permanente (HTTP 401): sem retentativa",
    explanation: "401/403/404/400 não melhoram repetindo: a falha é imediata, com a orientação de como corrigir.",
    clientId: "alvorada",
    message: "Qual é a vigência das nossas licenças do Microsoft 365?",
    streams: [new HttpError(401)],
  },
  {
    title: "4. Busca semântica indisponível: degradação para palavras-chave",
    explanation: "Se a API de embeddings falhar após as retentativas, a recuperação continua só com palavras-chave (corte mais exigente).",
    clientId: "alvorada",
    message: "A VPN de Sorocaba está lenta de novo.",
    embedder: createFailingEmbedder(new HttpError(503)),
    streams: [(messages) => `Entendido. Vejo o histórico do chamado CH-4471 (agosto). ${messages.some((m) => m.content.includes("CH-4471")) ? "Memória recuperada por palavra-chave." : ""} Vou abrir um chamado prioritário.`],
  },
  {
    title: "5. Extração de memória falhou (JSON inválido)",
    explanation: "A resposta já entregue é mantida e gravada no histórico; só a memória de longo prazo deixa de ser atualizada nesta interação.",
    clientId: "bemviver",
    message: "Vamos contratar mais 1 TB de backup no mês que vem.",
    streams: ["Ótimo! Vou registrar o pedido de mais 1 TB no Backup Pro e o time comercial envia a proposta por mensagem."],
    completes: { extracao: ["isto não é JSON"] },
  },
  {
    title: "6. Guardrail de entrada: dado sensível",
    explanation: "A mensagem não chega ao modelo e não é gravada em lugar nenhum.",
    clientId: "bemviver",
    message: "Meu CPF é 123.456.789-09, podem atualizar o cadastro?",
  },
  {
    title: "7. Guardrail de saída: resposta cita outro cliente",
    explanation: "Resposta reprovada não entra no histórico nem vira memória (segunda linha de defesa; a primeira é a recuperação filtrada por cliente).",
    clientId: "bemviver",
    message: "Quais clientes de vocês também usam o Backup Pro?",
    streams: ["Além de vocês, a Logística Rota Sul também usa."],
  },
  {
    title: "8. Autocrítica reprova o rascunho e gera versão revisada",
    explanation: "O revisor compara a resposta com a MEMÓRIA disponível: o rascunho ignorou o histórico e pediu algo que já se sabia.",
    clientId: "alvorada",
    message: "Quero mais notebooks iguais aos da última compra. Pode cotar 5 unidades?",
    critique: true,
    streams: [
      "Claro! Qual modelo de notebook vocês compraram da última vez? Assim preparo a cotação.",
      "Claro! Vou cotar 5 notebooks Dell Latitude 5450, o mesmo modelo do pedido PED-2291, com o prazo de entrega em destaque. Envio a proposta por e-mail, em tópicos.",
    ],
    completes: {
      critica: [
        JSON.stringify({
          approved: false,
          issues: [
            "Pergunta o modelo, mas a memória registra a última compra: Dell Latitude 5450 (PED-2291).",
            "Não destaca o prazo de entrega, preferência registrada após o atraso do PED-2291.",
          ],
        }),
      ],
    },
  },
  {
    title: "9. Autocrítica indisponível: o rascunho é mantido",
    explanation: "A autocrítica nunca deixa o cliente sem resposta: se o revisor falhar, vale o rascunho.",
    clientId: "alvorada",
    message: "Qual é a vigência das nossas licenças do Microsoft 365?",
    critique: true,
    streams: ["As 50 licenças Microsoft 365 renovadas em 15/03/2026 valem até 14/03/2027."],
    completes: { critica: [new HttpError(500), new HttpError(500), new HttpError(500)] },
  },
];

const out = process.stdout;
const noSleep = async () => {};

for (const demo of CASES) {
  const db = openDatabase(":memory:");
  const local = createLocalEmbedder();
  await seedDatabase(db, readSeed(), (text) => local.embed(text));

  const assistant = new CrmAssistant({
    llm: createScriptedLlm({ streams: demo.streams ?? [], completes: demo.completes ?? {} }),
    embedder: demo.embedder ?? local,
    db,
    out,
    mode: "completa",
    critique: demo.critique ?? false,
    sleep: noSleep,
    answerPrefix: "Assistente: ",
    now: () => new Date("2026-10-12T15:00:00.000Z"),
  });
  assistant.startSession(demo.clientId);

  out.write(`\n${"=".repeat(100)}\n${demo.title}\n${demo.explanation}\n${"-".repeat(100)}\n`);
  out.write(`Você: ${demo.message}\n`);
  const result = await assistant.handle(demo.message);
  const saved = assistant.sessions.loadMessages(assistant.currentSession!.id).length;
  out.write(`\n=> status: ${result.status} | mensagens gravadas no histórico: ${saved}\n`);
  db.close();
}
