export type Role = "system" | "user" | "assistant";

export type Message = {
  role: Role;
  content: string;
};

export type CompleteOptions = {
  json?: boolean;
  temperature?: number;
};

/** Contrato mínimo do provedor de LLM (permite trocar/simular o provedor em testes e na demo). */
export type LlmClient = {
  complete(messages: Message[], options?: CompleteOptions): Promise<string>;
  stream(messages: Message[], onToken: (token: string) => void): Promise<string>;
};

/** Gera o vetor (embedding) de um texto, usado na recuperação semântica das memórias. */
export type Embedder = {
  embed(text: string): Promise<number[]>;
};

export type Output = {
  write(text: string): unknown;
};

export type ValidationResult = {
  isValid: boolean;
  errors: string[];
};

/** Cliente B2B (empresa) atendido pelo assistente. */
export type Client = {
  id: string;
  name: string;
  segment: string;
  contactName: string;
  contactRole: string;
  customerSince: string;
};

/**
 * Tipos de memória de longo prazo, alinhados ao contexto do desafio:
 * histórico de pedidos, preferências, problemas anteriores e contexto de relacionamento.
 */
export const MEMORY_TYPES = ["pedido", "preferencia", "problema", "relacionamento"] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

/** crm = veio do sistema da empresa (carga inicial); conversa = aprendida no atendimento. */
export type MemorySource = "crm" | "conversa";

/** ativa = em uso; substituida = trocada por uma versão mais nova; esquecida = removida a pedido. */
export type MemoryStatus = "ativa" | "substituida" | "esquecida";

/** 1 = detalhe, 2 = útil, 3 = essencial (preferências essenciais entram em todo atendimento). */
export type Importance = 1 | 2 | 3;

export type Memory = {
  id: number;
  clientId: string;
  type: MemoryType;
  content: string;
  importance: Importance;
  source: MemorySource;
  status: MemoryStatus;
  sessionId: string | null;
  /** Id da memória que esta substituiu (rastreia a evolução de um fato ao longo do tempo). */
  supersedes: number | null;
  embedding: number[] | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Modos de memória comparados no experimento:
 * - sem_memoria: cada mensagem é respondida isoladamente (stateless);
 * - curta: só a janela da sessão atual (perde tudo ao encerrar o atendimento);
 * - completa: janela + memória de longo prazo filtrada por relevância + resumos de atendimentos;
 * - sem_filtro: como a completa, mas injeta TODAS as memórias do cliente (uso excessivo).
 */
export const MEMORY_MODES = ["sem_memoria", "curta", "completa", "sem_filtro"] as const;
export type MemoryMode = (typeof MEMORY_MODES)[number];
