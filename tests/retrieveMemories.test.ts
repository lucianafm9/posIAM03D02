import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createLocalEmbedder } from "../src/llm/scriptedClient.ts";
import { MemoryRepository } from "../src/memory/memoryRepository.ts";
import { rankMemories, retrieveMemories } from "../src/memory/retrieveMemories.ts";
import { keywordScore } from "../src/memory/scoring.ts";
import { memory, seededDb } from "./helpers.ts";

const settings = { topK: 2, minScore: 0.35, minKeywordScore: 0.5, semanticWeight: 0.7, maxTokens: 450, maxEssentials: 3 };

describe("keywordScore", () => {
  it("ignora acentos, stopwords e variações simples de plural", () => {
    assert.equal(keywordScore("notebooks da obra", "Comprou 20 notebook para a OBRA"), 1);
    assert.equal(keywordScore("VPN lenta", "lentidão na vpn"), 0.5);
    assert.equal(keywordScore("de para com", "qualquer coisa"), 0);
  });
});

describe("rankMemories (recuperação relevante)", () => {
  const embedder = createLocalEmbedder();
  const build = async (content: string, extra: Parameters<typeof memory>[0] = { content }) =>
    memory({ ...extra, content, embedding: await embedder.embed(content) });

  it("seleciona só o que é relevante, respeita topK e sempre inclui preferências essenciais", async () => {
    const memories = [
      await build("Comprou 20 notebooks Dell Latitude 5450 em junho."),
      await build("Relatou lentidão na VPN de Sorocaba em agosto.", { content: "", type: "problema" }),
      await build("Elogiou a palestra sobre backup em nuvem no evento.", { content: "", type: "relacionamento" }),
      await build("Prefere retornos por e-mail.", { content: "", type: "preferencia", importance: 3 }),
    ];
    const query = "Preciso de mais notebooks Dell iguais aos de junho";
    const result = rankMemories(memories, query, await embedder.embed(query), settings);

    const contents = result.selected.map((s) => s.memory.content);
    assert.ok(contents.includes("Prefere retornos por e-mail."), "essencial sempre entra");
    assert.equal(result.selected.find((s) => s.memory.type === "preferencia")!.reason, "essencial");
    assert.ok(contents.includes("Comprou 20 notebooks Dell Latitude 5450 em junho."));
    assert.ok(!contents.some((c) => c.includes("palestra")), "memória irrelevante fica de fora");
    assert.ok(result.discarded.length >= 1);
  });

  it("respeita o orçamento de tokens do bloco de memória", async () => {
    const memories = [await build("Pedido de notebooks A " + "x".repeat(250)), await build("Pedido de notebooks B " + "y".repeat(250))];
    const query = "pedido de notebooks";
    const result = rankMemories(memories, query, await embedder.embed(query), { ...settings, maxTokens: 120 });
    assert.equal(result.selected.length, 1);
    assert.ok(result.tokens <= 120);
  });

  it("degrada para palavra-chave (com corte maior) quando o embedding falha", async () => {
    const memories = [await build("Relatou lentidão na VPN de Sorocaba."), await build("Comprou licenças Microsoft 365.")];
    const result = await retrieveMemories({
      memories,
      query: "VPN de Sorocaba lenta",
      embed: async () => {
        throw new Error("embeddings fora do ar");
      },
      settings,
    });
    assert.equal(result.degraded, true);
    assert.deepEqual(
      result.selected.map((s) => s.memory.content),
      ["Relatou lentidão na VPN de Sorocaba."],
    );
  });
});

describe("isolamento entre clientes", () => {
  it("a memória de um cliente nunca aparece na lista de outro", async () => {
    const { db } = await seededDb();
    const repo = new MemoryRepository(db);
    const alvorada = repo.listActive("alvorada");
    const bemviver = repo.listActive("bemviver");
    assert.ok(alvorada.length > 0 && bemviver.length > 0);
    assert.ok(alvorada.every((m) => m.clientId === "alvorada"));
    assert.ok(!bemviver.some((m) => m.content.includes("Latitude")));
  });
});
