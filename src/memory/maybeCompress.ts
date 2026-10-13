import type { Message } from "../types.ts";
import type { ContextWindow } from "./contextWindow.ts";
import { estimateTokens, estimateTextTokens } from "./estimateTokens.ts";

/** Por que a compressão foi acionada (ou "nenhum", quando não foi). */
export type CompressionTrigger = "tokens" | "limite_de_mensagens" | "nenhum";

export type CompressionResult = {
  /** Resumo acumulado da parte antiga do atendimento (ou null se nunca foi preciso comprimir). */
  summary: string | null;
  /** Mensagens recentes que seguem literais no contexto. */
  messages: Message[];
  compressed: boolean;
  trigger: CompressionTrigger;
  /** Quantas mensagens foram resumidas nesta compressão. */
  summarizedMessages: number;
  /** Tokens estimados da memória curta (mensagens + resumo anterior) antes e depois. */
  tokensBefore: number;
  tokensAfter: number;
};

/** Menos que isso não vale resumir: sobraria uma interação literal e um resumo de uma só. */
const MIN_MESSAGES = 4;

/**
 * Compressão da memória de curto prazo, chamada ANTES de cada nova mensagem.
 *
 * Quando comprime (qualquer um dos gatilhos):
 *  - "tokens": mensagens da janela + resumo anterior passam de `maxTokens`;
 *  - "limite_de_mensagens": a janela está cheia (`maxMessages`) e a próxima interação faria a janela
 *    deslizante descartar mensagens antigas sem resumo. Comprimir antes garante que nada saia do contexto
 *    sem antes entrar no resumo.
 *
 * Como comprime:
 *  1. separa a metade mais antiga das mensagens, cortando em número par (pergunta e resposta ficam juntas);
 *  2. resume essa metade JUNTO com o resumo anterior, gerando um resumo acumulativo (nada é resumido duas vezes);
 *  3. tira a metade antiga da janela; a metade recente segue literal.
 *
 * Se `summarize` falhar, o erro sobe e a janela fica intacta (quem chama decide seguir sem comprimir).
 */
export async function maybeCompress(params: {
  window: ContextWindow;
  previousSummary: string | null;
  maxTokens: number;
  maxMessages: number;
  summarize: (messages: Message[]) => Promise<string>;
}): Promise<CompressionResult> {
  const { window, previousSummary, maxTokens, maxMessages, summarize } = params;
  const messages = window.getMessages();
  const summaryTokens = previousSummary ? estimateTextTokens(previousSummary) : 0;
  const tokensBefore = estimateTokens(messages) + summaryTokens;

  const trigger: CompressionTrigger =
    messages.length < MIN_MESSAGES ? "nenhum" : tokensBefore > maxTokens ? "tokens" : messages.length >= maxMessages ? "limite_de_mensagens" : "nenhum";

  if (trigger === "nenhum") {
    return { summary: previousSummary, messages, compressed: false, trigger, summarizedMessages: 0, tokensBefore, tokensAfter: tokensBefore };
  }

  // Corta em número par para não separar uma pergunta da sua resposta.
  const half = Math.floor(messages.length / 4) * 2;
  const toSummarize = messages.slice(0, half);
  const toKeep = messages.slice(half);

  const input: Message[] = previousSummary
    ? [{ role: "user", content: `Resumo anterior do atendimento: ${previousSummary}` }, ...toSummarize]
    : toSummarize;
  const summary = await summarize(input);

  window.clear();
  toKeep.forEach((message) => window.restore(message));

  const tokensAfter = estimateTokens(toKeep) + estimateTextTokens(summary);
  return { summary, messages: toKeep, compressed: true, trigger, summarizedMessages: half, tokensBefore, tokensAfter };
}
