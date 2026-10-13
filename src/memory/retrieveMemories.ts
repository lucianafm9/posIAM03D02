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
  /** Corte relativo: também entra a memória com score >= relativeRatio × melhor score (e >= minRelativeScore). */
  relativeRatio: number;
  minRelativeScore: number;
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
 *  2. Relevantes: score híbrido (semântico + palavra-chave), no máximo `topK`. Entra quem passa do corte
 *     absoluto (`minScore`) OU fica perto da melhor memória (>= `relativeRatio` × melhor score, com piso
 *     `minRelativeScore`). O corte relativo não depende da escala do modelo de embeddings: o que importa
 *     é a memória se destacar das demais.
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
  /** Mensagem atual sozinha: palavra-chave e similaridade usam o maior valor entre ela e a consulta completa,
   * para que o contexto anterior (incluído em `query`) ajude em follow-ups curtos sem diluir a mensagem atual. */
  currentMessage?: string,
  currentEmbedding?: number[] | null,
): RetrievalResult {
  const degraded = queryEmbedding === null;

  const scored = memories.map((memory) => {
    const keyword = Math.max(keywordScore(query, memory.content), currentMessage ? keywordScore(currentMessage, memory.content) : 0);
    const semantic =
      queryEmbedding && memory.embedding
        ? Math.max(cosineSimilarity(queryEmbedding, memory.embedding), currentEmbedding ? cosineSimilarity(currentEmbedding, memory.embedding) : 0)
        : 0;
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

  const others = scored.filter((item) => !essentialIds.has(item.memory.id));
  const best = Math.max(0, ...others.map((item) => item.score));
  const passes = (score: number) =>
    degraded
      ? score >= settings.minKeywordScore
      : score >= settings.minScore || (score >= settings.minRelativeScore && score >= settings.relativeRatio * best);
  const candidates: ScoredMemory[] = others
    .filter((item) => passes(item.score))
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
  /** Mensagem atual sozinha (ver rankMemories). */
  currentMessage?: string;
  embed: Embedder["embed"];
  onDegraded?: (error: unknown) => void;
  settings?: RetrievalSettings;
}): Promise<RetrievalResult> {
  let queryEmbedding: number[] | null = null;
  let currentEmbedding: number[] | null = null;
  try {
    queryEmbedding = await params.embed(params.query);
    if (params.currentMessage && params.currentMessage !== params.query) currentEmbedding = await params.embed(params.currentMessage);
  } catch (error) {
    queryEmbedding = null;
    params.onDegraded?.(error);
  }
  return rankMemories(params.memories, params.query, queryEmbedding, params.settings, params.currentMessage, currentEmbedding);
}
