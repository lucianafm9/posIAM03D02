/** Palavras sem valor de busca, ignoradas no score por palavra-chave. */
const STOPWORDS = new Set([
  "a", "o", "as", "os", "um", "uma", "uns", "umas", "de", "do", "da", "dos", "das", "em", "no", "na", "nos",
  "nas", "por", "para", "pra", "com", "sem", "que", "se", "e", "ou", "mas", "como", "mais", "menos", "muito",
  "ao", "aos", "à", "às", "é", "ser", "foi", "era", "são", "está", "estao", "esta", "isso", "isto", "esse",
  "essa", "este", "aquele", "aquela", "eu", "voce", "voces", "nos", "ele", "ela", "eles", "elas", "meu",
  "minha", "seu", "sua", "nosso", "nossa", "vocês", "me", "te", "lhe", "já", "ja", "não", "nao", "sim",
  "também", "tambem", "qual", "quais", "quando", "onde", "sobre", "ter", "tem", "têm", "temos", "tenho",
  "vai", "vou", "vamos", "pode", "podem", "fazer", "ola", "olá", "bom", "dia", "tarde", "noite", "obrigado",
  "obrigada", "favor", "aqui", "agora", "ainda",
]);

/** Minúsculas, sem acentos, sem pontuação e sem stopwords. */
export function normalizeTerms(text: string, minLength = 3): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= minLength && !STOPWORDS.has(term));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  return normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Fração dos termos da consulta presentes no texto.
 * Usa prefixo de 5 letras como "radical" simples (notebook/notebooks, atraso/atrasou).
 */
export function keywordScore(query: string, text: string): number {
  const terms = [...new Set(normalizeTerms(query))];
  if (terms.length === 0) return 0;

  const textTerms = normalizeTerms(text);
  const stem = (term: string) => term.slice(0, 5);
  const stems = new Set(textTerms.map(stem));
  const hits = terms.filter((term) => stems.has(stem(term)));
  return hits.length / terms.length;
}

export function hybridScore(semantic: number, keyword: number, semanticWeight = 0.7): number {
  return semanticWeight * semantic + (1 - semanticWeight) * keyword;
}
