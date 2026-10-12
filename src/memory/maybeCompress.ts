import type { LlmClient, Message } from "../types.ts";
import type { ContextWindow } from "./contextWindow.ts";
import { estimateTokens } from "./estimateTokens.ts";
import { summarizeHistory } from "./summarizeHistory.ts";

export type CompressionResult = {
  /** Resumo acumulado da parte antiga do atendimento (ou null se nunca foi preciso comprimir). */
  summary: string | null;
  /** Mensagens recentes que seguem literais no contexto. */
  messages: Message[];
  compressed: boolean;
  tokensBefore: number;
  tokensAfter: number;
};

/**
 * Compressão da memória de curto prazo.
 * Se a janela (mais o resumo anterior) passar de `maxTokens`, a metade mais antiga das mensagens é
 * resumida junto com o resumo anterior e removida da janela; a metade recente segue literal.
 * O resumo resultante é acumulativo, então nenhuma parte do atendimento é resumida duas vezes.
 */
export async function maybeCompress(params: {
  window: ContextWindow;
  previousSummary: string | null;
  maxTokens: number;
  summarize: (messages: Message[]) => Promise<string>;
}): Promise<CompressionResult> {
  const { window, previousSummary, maxTokens, summarize } = params;
  const messages = window.getMessages();
  const summaryTokens = previousSummary ? estimateTokens([{ role: "user", content: previousSummary }]) : 0;
  const tokensBefore = estimateTokens(messages) + summaryTokens;

  if (tokensBefore <= maxTokens || messages.length < 4) {
    return { summary: previousSummary, messages, compressed: false, tokensBefore, tokensAfter: tokensBefore };
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

  const tokensAfter = estimateTokens(toKeep) + estimateTokens([{ role: "user", content: summary }]);
  return { summary, messages: toKeep, compressed: true, tokensBefore, tokensAfter };
}

export function summarizerFor(llm: LlmClient): (messages: Message[]) => Promise<string> {
  return (messages) => summarizeHistory(llm, messages);
}
