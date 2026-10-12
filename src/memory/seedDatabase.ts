import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { Client, Importance, MemoryType } from "../types.ts";
import { ClientRepository } from "./clientRepository.ts";
import { MemoryRepository } from "./memoryRepository.ts";

export type SeedFile = {
  clients: Array<
    Client & {
      memories: Array<{ type: MemoryType; importance: Importance; date: string; content: string }>;
    }
  >;
};

export const SEED_FILE = "data/seed/crm.json";

export function readSeed(file: string = SEED_FILE): SeedFile {
  return JSON.parse(readFileSync(file, "utf8")) as SeedFile;
}

/**
 * Carga inicial: clientes e memórias vindas do CRM (source = "crm").
 * `embed` pode devolver null (API indisponível): a memória é gravada sem vetor e completada depois.
 */
export async function seedDatabase(
  db: DatabaseSync,
  seed: SeedFile,
  embed: (text: string) => Promise<number[] | null>,
): Promise<{ clients: number; memories: number; withoutEmbedding: number }> {
  db.exec("DELETE FROM memories; DELETE FROM messages; DELETE FROM sessions; DELETE FROM clients;");
  const clients = new ClientRepository(db);
  const memories = new MemoryRepository(db);
  let count = 0;
  let withoutEmbedding = 0;

  for (const { memories: items, ...client } of seed.clients) {
    clients.upsert(client);
    for (const item of items) {
      const embedding = await embed(item.content);
      if (!embedding) withoutEmbedding++;
      memories.insert({
        clientId: client.id,
        type: item.type,
        content: item.content,
        importance: item.importance,
        source: "crm",
        embedding,
        createdAt: `${item.date}T12:00:00.000Z`,
      });
      count++;
    }
  }

  return { clients: seed.clients.length, memories: count, withoutEmbedding };
}

/** Completa os embeddings que ficaram faltando (ex.: a API falhou quando a memória foi gravada). */
export async function ensureEmbeddings(db: DatabaseSync, embed: (text: string) => Promise<number[] | null>): Promise<number> {
  const repo = new MemoryRepository(db);
  let fixed = 0;
  for (const memory of repo.listMissingEmbeddings()) {
    const embedding = await embed(memory.content);
    if (embedding) {
      repo.setEmbedding(memory.id, embedding);
      fixed++;
    }
  }
  return fixed;
}
