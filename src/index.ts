import { CrmAssistant } from "./chat/crmAssistant.ts";
import { LineReader } from "./cli/lineReader.ts";
import { runCli } from "./cli/session.ts";
import { SETTINGS } from "./config/settings.ts";
import { createOpenAiClient, createOpenAiEmbedder, readApiKey } from "./llm/openaiClient.ts";
import { openDatabase } from "./memory/database.ts";
import { ensureEmbeddings } from "./memory/seedDatabase.ts";
import { MEMORY_MODES, type MemoryMode } from "./types.ts";

const apiKey = readApiKey();
if (!apiKey) {
  console.error("OPENAI_API_KEY não configurada. Copie .env.example para .env (npm run env:setup) e informe a sua chave.");
  process.exit(1);
}

const modeArg = process.argv.find((arg) => arg.startsWith("--modo="))?.slice("--modo=".length) ?? "completa";
if (!MEMORY_MODES.includes(modeArg as MemoryMode)) {
  console.error(`Modo inválido: ${modeArg}. Use um de: ${MEMORY_MODES.join(", ")}.`);
  process.exit(1);
}

const db = openDatabase(SETTINGS.databaseFile);
const llm = createOpenAiClient(apiKey, process.env.OPENAI_MODEL || SETTINGS.defaultModel);
const embedder = createOpenAiEmbedder(apiKey);

const assistant = new CrmAssistant({
  llm,
  embedder,
  db,
  out: process.stdout,
  mode: modeArg as MemoryMode,
  critique: !process.argv.includes("--sem-autocritica"),
  debug: process.argv.includes("--debug"),
  answerPrefix: "\nAssistente: ",
});

if (assistant.clients.list().length === 0) {
  console.error("Banco vazio. Rode `npm run seed` para carregar os clientes de exemplo.");
  process.exit(1);
}

// Memórias gravadas sem embedding (API indisponível no momento) são completadas na abertura.
await ensureEmbeddings(db, (text) => embedder.embed(text).catch(() => null));

const reader = new LineReader(process.stdin, process.stdout);
try {
  await runCli({ assistant, reader, out: process.stdout });
} finally {
  reader.close();
  db.close();
}
