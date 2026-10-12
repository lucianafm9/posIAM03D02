import { SETTINGS } from "./config/settings.ts";
import { createOpenAiEmbedder, readApiKey } from "./llm/openaiClient.ts";
import { openDatabase } from "./memory/database.ts";
import { readSeed, seedDatabase } from "./memory/seedDatabase.ts";
import { describeError } from "./utils/errors.ts";

/** Recria o banco local com os clientes e memórias de exemplo (APAGA conversas e memórias existentes). */
const apiKey = readApiKey();
if (!apiKey) {
  console.error("OPENAI_API_KEY não configurada (necessária para gerar os embeddings das memórias).");
  process.exit(1);
}

const embedder = createOpenAiEmbedder(apiKey);
const db = openDatabase(SETTINGS.databaseFile);
let firstError: string | null = null;

const result = await seedDatabase(db, readSeed(), async (text) => {
  try {
    return await embedder.embed(text);
  } catch (error) {
    firstError ??= describeError(error);
    return null;
  }
});
db.close();

console.log(`Banco ${SETTINGS.databaseFile} recriado: ${result.clients} clientes e ${result.memories} memórias.`);
if (result.withoutEmbedding > 0) {
  console.warn(`${result.withoutEmbedding} memórias ficaram sem embedding (${firstError}). Serão completadas ao abrir o assistente.`);
}
