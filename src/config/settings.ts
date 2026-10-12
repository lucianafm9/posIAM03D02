/** Parâmetros fixos da aplicação (não são configuráveis pelo usuário final). */
export const SETTINGS = {
  defaultModel: "gpt-4o-mini",
  embeddingModel: "text-embedding-3-small",
  databaseFile: "data/crm-memoria.db",
  requestTimeoutMs: 60_000,
  retry: {
    maxAttempts: 3,
    baseDelayMs: 1_000,
    maxDelayMs: 8_000,
  },
  /** Estimativa usada em todo o controle de contexto: 1 token ≈ 3 caracteres em português. */
  charsPerToken: 3,
  /** Memória de curto prazo: a conversa do atendimento atual. */
  shortTerm: {
    /** Quantas interações (pergunta + resposta) a janela deslizante guarda. */
    maxTurns: 10,
    /** Acima deste total estimado, a metade mais antiga da janela é resumida (maybeCompress). */
    maxTokens: 1_200,
  },
  /** Memória de longo prazo: fatos do cliente que persistem entre atendimentos. */
  longTerm: {
    /** Máximo de memórias recuperadas por relevância a cada mensagem. */
    topK: 5,
    /** Relevância mínima (0 a 1) para uma memória entrar no contexto. */
    minScore: 0.35,
    /** Sem embeddings (falha na API), a relevância vem só das palavras-chave, que exigem nota maior. */
    minKeywordScore: 0.5,
    /** Peso da similaridade semântica no score híbrido (o restante é palavra-chave). */
    semanticWeight: 0.7,
    /** Orçamento de tokens do bloco de memória (essenciais + relevantes). */
    maxTokens: 450,
    /** Preferências de importância 3 entram sempre, até este limite. */
    maxEssentials: 3,
    /** Memórias existentes enviadas ao extrator para evitar duplicatas e detectar mudanças. */
    maxExistingForExtraction: 40,
  },
  /** Memória episódica: resumos dos atendimentos anteriores do mesmo cliente. */
  episodic: {
    lastSessions: 2,
  },
  limits: {
    maxMessageChars: 2_000,
    maxMemoryChars: 300,
  },
  exitWords: ["sair", "exit", "quit"],
} as const;
