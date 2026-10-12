import type { Client, Memory, MemoryType, Message } from "../types.ts";

const TYPE_LABEL: Record<MemoryType, string> = {
  pedido: "pedido",
  preferencia: "preferência",
  problema: "problema",
  relacionamento: "relacionamento",
};

/** Uma memória por linha, com id, tipo e data, para o modelo saber de onde e de quando vem cada fato. */
export function formatMemoryLine(memory: Memory): string {
  return `- [M${memory.id} | ${TYPE_LABEL[memory.type]} | ${memory.createdAt.slice(0, 10)}] ${memory.content}`;
}

/**
 * Bloco de memória de longo prazo do cliente, delimitado como DADOS.
 * Retorna null quando não há nada a injetar (o contexto fica menor em vez de levar um bloco vazio).
 */
export function buildMemoryBlock(params: {
  client: Client;
  memories: Memory[];
  pastSessions: Array<{ date: string; summary: string }>;
}): string | null {
  const { client, memories, pastSessions } = params;
  if (memories.length === 0 && pastSessions.length === 0) return null;

  const lines = [
    `<memoria_cliente cliente="${client.name}">`,
    `Perfil: ${client.name} | ${client.segment} | contato: ${client.contactName} (${client.contactRole}) | cliente desde ${client.customerSince}`,
  ];
  if (memories.length > 0) {
    lines.push("Memórias selecionadas para esta mensagem:", ...memories.map(formatMemoryLine));
  }
  if (pastSessions.length > 0) {
    lines.push("Atendimentos anteriores (resumos):", ...pastSessions.map((s) => `- ${s.date}: ${s.summary}`));
  }
  lines.push("</memoria_cliente>");
  return lines.join("\n");
}

/**
 * Costura o contexto enviado ao modelo (stitchedContext da aula), sempre na mesma ordem:
 *  1. memória de longo prazo do cliente (perfil, memórias relevantes, resumos de atendimentos);
 *  2. resumo da parte antiga do atendimento atual (quando houve compressão);
 *  3. mensagens recentes do atendimento atual (literais).
 * Cada bloco de contexto vai como um par user/assistant, separado das mensagens reais da conversa.
 */
export function stitchContext(params: {
  memoryBlock?: string | null;
  sessionSummary?: string | null;
  recentMessages: Message[];
}): Message[] {
  const stitched: Message[] = [];

  if (params.memoryBlock) {
    stitched.push({ role: "user", content: params.memoryBlock });
    stitched.push({ role: "assistant", content: "Entendido. Vou usar essas memórias apenas quando forem relevantes." });
  }

  if (params.sessionSummary) {
    stitched.push({ role: "user", content: `<resumo_atendimento_atual>\n${params.sessionSummary}\n</resumo_atendimento_atual>` });
    stitched.push({ role: "assistant", content: "Entendido, vou continuar a partir deste ponto." });
  }

  return [...stitched, ...params.recentMessages];
}
