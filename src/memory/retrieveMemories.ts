import { SETTINGS } from "../config/settings.ts";
import type { Embedder, Memory } from "../types.ts";
import { estimateTextTokens } from "./estimateTokens.ts";
import { formatMemoryLine } from "./stitchContext.ts";
import { cosineSimilarity, hybridScore, keywordScore } from "./scoring.ts";

export type ScoredMemory = {
  memory: Memory;
  /** Score final (0 a 1) usado no corte e na ordenação. */
  score: number;
  semantic: number;
  keyword: number;
  /** essencial = preferência de importância 3 (entra sempre); relevante = passou no corte por relevância. */
  reason: "essencial" | "relevante";
};

export type RetrievalSettings = {
  topK: number;
  minScore: number;
  minKeywordScore: number;
  semanticWeight: number;
  maxTokens: number;
  maxEssentials: number;
};

export type RetrievalResult = {
  selected: ScoredMemory[];
  /** Memórias ativas avaliadas e deixadas de fora (abaixo do corte, além do topK ou do orçamento). */
  discarded: ScoredMemory[];
  tokens: number;
  /** true quando a busca semântica falhou e a relevância veio só de palavras-chave. */
  degraded: boolean;
};

/**
 * Recupera, entre as memórias ATIVAS do cliente, apenas as que ajudam a responder a mensagem atual.
 *
 *  1. Essenciais: preferências de importância 3 (ex.: canal de contato), até `maxEssentials`.
 *  2. Relevantes: score híbrido (semântico + palavra-chave) >= `minScore`, no máximo `topK`.
 *  3. Orçamento: o bloco inteiro respeita `maxTokens`; o que não cabe é descartado (menor score primeiro).
 *
 * `queryEmbedding` null significa que a busca semântica falhou: o score passa a ser só palavra-chave,
 * com um corte mais exigente (`minKeywordScore`), para não encher o contexto de memórias fracas.
 */
export function rankMemories(
  memories: Memory[],
  query: string,
  queryEmbedding: number[] | null,
  settings: RetrievalSettings = SETTINGS.longTerm,
): RetrievalResult {
  const degraded = queryEmbedding === null;

  const scored = memories.map((memory) => {
    const keyword = keywordScore(query, memory.content);
    const semantic = queryEmbedding && memory.embedding ? cosineSimilarity(queryEmbedding, memory.embedding) : 0;
    const score = degraded ? keyword : hybridScore(semantic, keyword, settings.semanticWeight);
    return { memory, score, semantic, keyword };
  });

  const byRelevance = (a: { score: number; memory: Memory }, b: { score: number; memory: Memory }) =>
    b.score - a.score || b.memory.importance - a.memory.importance || b.memory.createdAt.localeCompare(a.memory.createdAt);

  const essentials: ScoredMemory[] = scored
    .filter((item) => item.memory.type === "preferencia" && item.memory.importance === 3)
    .sort((a, b) => b.memory.createdAt.localeCompare(a.memory.createdAt))
    .slice(0, settings.maxEssentials)
    .map((item) => ({ ...item, reason: "essencial" }));
  const essentialIds = new Set(essentials.map((item) => item.memory.id));

  const cutoff = degraded ? settings.minKeywordScore : settings.minScore;
  const candidates: ScoredMemory[] = scored
    .filter((item) => !essentialIds.has(item.memory.id) && item.score >= cutoff)
    .sort(byRelevance)
    .slice(0, settings.topK)
    .map((item) => ({ ...item, reason: "relevante" }));

  const selected: ScoredMemory[] = [];
  let tokens = 0;
  for (const item of [...essentials, ...candidates]) {
    const cost = estimateTextTokens(formatMemoryLine(item.memory));
    if (tokens + cost > settings.maxTokens) continue;
    selected.push(item);
    tokens += cost;
  }

  const selectedIds = new Set(selected.map((item) => item.memory.id));
  const discarded = scored
    .filter((item) => !selectedIds.has(item.memory.id))
    .sort(byRelevance)
    .map((item): ScoredMemory => ({ ...item, reason: "relevante" }));

  return { selected, discarded, tokens, degraded };
}

/**
 * Gera o embedding da mensagem e ranqueia as memórias do cliente.
 * Se o embedding falhar (mesmo após as retentativas de quem chamou), cai para palavra-chave.
 */
export async function retrieveMemories(params: {
  memories: Memory[];
  query: string;
  embed: Embedder["embed"];
  onDegraded?: (error: unknown) => void;
  settings?: RetrievalSettings;
}): Promise<RetrievalResult> {
  let queryEmbedding: number[] | null = null;
  try {
    queryEmbedding = await params.embed(params.query);
  } catch (error) {
    params.onDegraded?.(error);
  }
  return rankMemories(params.memories, params.query, queryEmbedding, params.settings);
}
