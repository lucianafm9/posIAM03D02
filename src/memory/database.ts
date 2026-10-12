import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Estrutura de armazenamento da memória (SQLite, módulo nativo node:sqlite).
 *
 *  clients   -> cadastro do cliente B2B (empresa e contato principal)
 *  sessions  -> cada atendimento; guarda o resumo final (memória episódica) e o resumo de compressão
 *  messages  -> mensagens do atendimento (memória de curto prazo persistida; permite retomar a sessão)
 *  memories  -> fatos de longo prazo do cliente: pedido, preferência, problema, relacionamento
 */
const SCHEMA = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS clients (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    segment        TEXT NOT NULL,
    contact_name   TEXT NOT NULL,
    contact_role   TEXT NOT NULL,
    customer_since TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id                  TEXT PRIMARY KEY,
    client_id           TEXT NOT NULL REFERENCES clients(id),
    started_at          TEXT NOT NULL,
    ended_at            TEXT,
    summary             TEXT,
    compressed_summary  TEXT,
    compressed_upto     INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT NOT NULL REFERENCES sessions(id),
    role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content     TEXT NOT NULL,
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS memories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id   TEXT NOT NULL REFERENCES clients(id),
    type        TEXT NOT NULL CHECK (type IN ('pedido', 'preferencia', 'problema', 'relacionamento')),
    content     TEXT NOT NULL,
    importance  INTEGER NOT NULL CHECK (importance BETWEEN 1 AND 3),
    source      TEXT NOT NULL CHECK (source IN ('crm', 'conversa')),
    status      TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'substituida', 'esquecida')),
    session_id  TEXT REFERENCES sessions(id),
    supersedes  INTEGER REFERENCES memories(id),
    embedding   TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_client ON sessions (client_id, started_at);
  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages (session_id, id);
  CREATE INDEX IF NOT EXISTS idx_memories_client ON memories (client_id, status);
`;

/** Abre (e cria, se preciso) o banco. Use ":memory:" para um banco temporário (testes e experimento). */
export function openDatabase(file: string): DatabaseSync {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  return db;
}
