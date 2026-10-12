import { CrmAssistant, type AssistantDeps } from "../src/chat/crmAssistant.ts";
import { createLocalEmbedder, createScriptedLlm, type CallKind, type ScriptedReply } from "../src/llm/scriptedClient.ts";
import { openDatabase } from "../src/memory/database.ts";
import { readSeed, seedDatabase } from "../src/memory/seedDatabase.ts";
import type { Importance, Memory, MemoryType } from "../src/types.ts";

export function createCapture() {
  let text = "";
  return {
    write(chunk: string) {
      text += chunk;
      return true;
    },
    get text() {
      return text;
    },
  };
}

export const noSleep = async () => {};

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

/** Banco em memória com o CRM de exemplo (embeddings locais, sem API). */
export async function seededDb() {
  const db = openDatabase(":memory:");
  const embedder = createLocalEmbedder();
  await seedDatabase(db, readSeed(), (text) => embedder.embed(text));
  return { db, embedder };
}

export async function createAssistant(
  script: { streams?: ScriptedReply[]; completes?: Partial<Record<CallKind, ScriptedReply[]>> } = {},
  overrides: Partial<AssistantDeps> = {},
) {
  const { db, embedder } = await seededDb();
  const llm = createScriptedLlm(script);
  const out = createCapture();
  let clock = new Date("2026-10-12T12:00:00.000Z");
  const assistant = new CrmAssistant({
    llm,
    embedder,
    db,
    out,
    mode: "completa",
    critique: false,
    sleep: noSleep,
    now: () => clock,
    ...overrides,
  });
  return {
    assistant,
    llm,
    out,
    db,
    setClock: (iso: string) => {
      clock = new Date(iso);
    },
  };
}

let nextId = 1;
export function memory(partial: Partial<Memory> & { content: string }): Memory {
  return {
    id: nextId++,
    clientId: "c1",
    type: "pedido" as MemoryType,
    importance: 2 as Importance,
    source: "crm",
    status: "ativa",
    sessionId: null,
    supersedes: null,
    embedding: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}
