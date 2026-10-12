import type { DatabaseSync } from "node:sqlite";
import type { Message } from "../types.ts";

export type Session = {
  id: string;
  clientId: string;
  startedAt: string;
  endedAt: string | null;
  summary: string | null;
  compressedSummary: string | null;
  /** Quantas mensagens (desde o início do atendimento) já estão cobertas por compressedSummary. */
  compressedUpto: number;
  messageCount: number;
};

type SessionRow = {
  id: string;
  client_id: string;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  compressed_summary: string | null;
  compressed_upto: number;
  message_count: number;
};

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    clientId: row.client_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    summary: row.summary,
    compressedSummary: row.compressed_summary,
    compressedUpto: row.compressed_upto,
    messageCount: row.message_count,
  };
}

const SELECT_SESSION = `
  SELECT s.*, (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS message_count
  FROM sessions s`;

/**
 * Atendimentos e suas mensagens (o MessageRepository da aula, agora ligado a um cliente).
 * As mensagens são ordenadas por id (e não por created_at), o que preserva a ordem mesmo
 * quando duas mensagens são gravadas no mesmo segundo.
 */
export class SessionRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  create(id: string, clientId: string, startedAt: string): Session {
    this.db.prepare("INSERT INTO sessions (id, client_id, started_at) VALUES (?, ?, ?)").run(id, clientId, startedAt);
    return this.find(id)!;
  }

  find(id: string): Session | undefined {
    const row = this.db.prepare(`${SELECT_SESSION} WHERE s.id = ?`).get(id) as SessionRow | undefined;
    return row ? toSession(row) : undefined;
  }

  /** Último atendimento do cliente que tenha ao menos uma mensagem (candidato a ser retomado). */
  findLast(clientId: string): Session | undefined {
    const row = this.db
      .prepare(`${SELECT_SESSION} WHERE s.client_id = ? AND message_count > 0 ORDER BY s.started_at DESC, s.rowid DESC LIMIT 1`)
      .get(clientId) as SessionRow | undefined;
    return row ? toSession(row) : undefined;
  }

  /** Resumos dos atendimentos encerrados mais recentes (memória episódica), do mais antigo ao mais novo. */
  recentSummaries(clientId: string, limit: number, excludeSessionId?: string): Array<{ date: string; summary: string }> {
    const rows = this.db
      .prepare(
        `SELECT started_at, summary FROM sessions
         WHERE client_id = ? AND summary IS NOT NULL AND id <> ?
         ORDER BY started_at DESC, rowid DESC LIMIT ?`,
      )
      .all(clientId, excludeSessionId ?? "", limit) as Array<{ started_at: string; summary: string }>;
    return rows.reverse().map((row) => ({ date: row.started_at.slice(0, 10), summary: row.summary }));
  }

  saveMessage(sessionId: string, message: Message, createdAt: string): void {
    if (message.role === "system") throw new Error("Mensagens de sistema não são persistidas.");
    this.db
      .prepare("INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)")
      .run(sessionId, message.role, message.content, createdAt);
  }

  /** Grava pergunta e resposta juntas: uma interação só existe no histórico se estiver completa. */
  saveTurn(sessionId: string, question: string, answer: string, createdAt: string): void {
    this.db.exec("BEGIN");
    try {
      this.saveMessage(sessionId, { role: "user", content: question }, createdAt);
      this.saveMessage(sessionId, { role: "assistant", content: answer }, createdAt);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  loadMessages(sessionId: string): Message[] {
    const rows = this.db
      .prepare("SELECT role, content FROM messages WHERE session_id = ? ORDER BY id ASC")
      .all(sessionId) as Array<{ role: "user" | "assistant"; content: string }>;
    return rows.map((row) => ({ role: row.role, content: row.content }));
  }

  saveCompression(sessionId: string, summary: string, upto: number): void {
    this.db
      .prepare("UPDATE sessions SET compressed_summary = ?, compressed_upto = ? WHERE id = ?")
      .run(summary, upto, sessionId);
  }

  close(sessionId: string, endedAt: string, summary: string | null): void {
    this.db.prepare("UPDATE sessions SET ended_at = ?, summary = COALESCE(?, summary) WHERE id = ?").run(endedAt, summary, sessionId);
  }
}
