import type { DatabaseSync } from "node:sqlite";
import type { Importance, Memory, MemorySource, MemoryStatus, MemoryType } from "../types.ts";

type MemoryRow = {
  id: number;
  client_id: string;
  type: MemoryType;
  content: string;
  importance: number;
  source: MemorySource;
  status: MemoryStatus;
  session_id: string | null;
  supersedes: number | null;
  embedding: string | null;
  created_at: string;
  updated_at: string;
};

function toMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    clientId: row.client_id,
    type: row.type,
    content: row.content,
    importance: row.importance as Importance,
    source: row.source,
    status: row.status,
    sessionId: row.session_id,
    supersedes: row.supersedes,
    embedding: row.embedding ? (JSON.parse(row.embedding) as number[]) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type NewMemory = {
  clientId: string;
  type: MemoryType;
  content: string;
  importance: Importance;
  source: MemorySource;
  sessionId?: string | null;
  supersedes?: number | null;
  embedding?: number[] | null;
  createdAt: string;
};

/**
 * Memória de longo prazo do cliente.
 * Toda leitura é filtrada por client_id: a memória de um cliente nunca entra no contexto de outro.
 * Nada é apagado fisicamente: uma memória atualizada vira "substituida" (com rastro de qual a substituiu)
 * e uma memória removida a pedido vira "esquecida" (e deixa de ser usada).
 */
export class MemoryRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  insert(memory: NewMemory): Memory {
    const result = this.db
      .prepare(
        `INSERT INTO memories (client_id, type, content, importance, source, session_id, supersedes, embedding, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        memory.clientId,
        memory.type,
        memory.content,
        memory.importance,
        memory.source,
        memory.sessionId ?? null,
        memory.supersedes ?? null,
        memory.embedding ? JSON.stringify(memory.embedding) : null,
        memory.createdAt,
        memory.createdAt,
      );
    return this.find(Number(result.lastInsertRowid))!;
  }

  find(id: number): Memory | undefined {
    const row = this.db.prepare("SELECT * FROM memories WHERE id = ?").get(id) as MemoryRow | undefined;
    return row ? toMemory(row) : undefined;
  }

  /** Memórias ativas do cliente, das mais recentes para as mais antigas. */
  listActive(clientId: string): Memory[] {
    const rows = this.db
      .prepare("SELECT * FROM memories WHERE client_id = ? AND status = 'ativa' ORDER BY created_at DESC, id DESC")
      .all(clientId) as MemoryRow[];
    return rows.map(toMemory);
  }

  /** Histórico completo do cliente (inclui substituídas e esquecidas), para auditoria e para o relatório. */
  listAll(clientId: string): Memory[] {
    const rows = this.db
      .prepare("SELECT * FROM memories WHERE client_id = ? ORDER BY id ASC")
      .all(clientId) as MemoryRow[];
    return rows.map(toMemory);
  }

  /**
   * Atualiza um fato: a versão antiga vira "substituida" e a nova aponta para ela (supersedes).
   * Só substitui memórias ativas do MESMO cliente.
   */
  supersede(oldId: number, replacement: NewMemory): Memory {
    const old = this.find(oldId);
    if (!old || old.clientId !== replacement.clientId || old.status !== "ativa") {
      throw new Error(`Memória ${oldId} não está ativa para este cliente.`);
    }

    this.db.exec("BEGIN");
    try {
      this.db
        .prepare("UPDATE memories SET status = 'substituida', updated_at = ? WHERE id = ?")
        .run(replacement.createdAt, oldId);
      const created = this.insert({ ...replacement, supersedes: oldId });
      this.db.exec("COMMIT");
      return created;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  /** Marca a memória como esquecida (não é mais usada). Retorna false se não pertence ao cliente. */
  forget(clientId: string, id: number, at: string): boolean {
    const result = this.db
      .prepare("UPDATE memories SET status = 'esquecida', updated_at = ? WHERE id = ? AND client_id = ? AND status = 'ativa'")
      .run(at, id, clientId);
    return Number(result.changes) > 0;
  }

  setEmbedding(id: number, embedding: number[]): void {
    this.db.prepare("UPDATE memories SET embedding = ? WHERE id = ?").run(JSON.stringify(embedding), id);
  }

  /** Memórias ativas sem embedding (ex.: a API falhou na gravação), para completar depois. */
  listMissingEmbeddings(): Memory[] {
    const rows = this.db
      .prepare("SELECT * FROM memories WHERE status = 'ativa' AND embedding IS NULL")
      .all() as MemoryRow[];
    return rows.map(toMemory);
  }
}
