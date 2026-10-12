import type { LlmClient, Message } from "../types.ts";

export const SUMMARY_PROMPT = [
  "Você é um assistente especializado em resumir atendimentos de clientes B2B.",
  "Resuma a conversa em um único parágrafo curto (até 80 palavras), em português do Brasil.",
  "Registre: o que o cliente pediu ou relatou, decisões e compromissos assumidos (com prazos e números),",
  "e o que ficou pendente. Não invente nada que não esteja na conversa e não inclua saudações.",
].join("\n");

/** Resumo automático de um trecho de conversa (usado na compressão e no encerramento do atendimento). */
export async function summarizeHistory(llm: LlmClient, messages: Message[]): Promise<string> {
  const transcript = messages
    .map((message) => `${message.role === "user" ? "Cliente" : "Assistente"}: ${message.content}`)
    .join("\n");

  const summary = await llm.complete(
    [
      { role: "system", content: SUMMARY_PROMPT },
      { role: "user", content: `<conversa>\n${transcript}\n</conversa>` },
    ],
    { temperature: 0 },
  );
  return summary.trim();
}
