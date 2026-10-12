import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractMemories, parseOperations } from "../src/memory/extractMemories.ts";
import { MemoryRepository } from "../src/memory/memoryRepository.ts";
import { seededDb } from "./helpers.ts";

const NOW = "2026-10-12T12:00:00.000Z";

async function setup() {
  const { db } = await seededDb();
  const repo = new MemoryRepository(db);
  db.prepare("INSERT INTO sessions (id, client_id, started_at) VALUES ('s1', 'bemviver', ?)").run(NOW);
  return { db, repo };
}

function run(repo: MemoryRepository, operacoes: unknown[], clientId = "bemviver") {
  return extractMemories({
    complete: async () => JSON.stringify({ operacoes }),
    repo,
    clientId,
    clientName: "Clínica Bem Viver",
    sessionId: "s1",
    now: NOW,
    question: "pergunta",
    answer: "resposta",
    maxExisting: 40,
    embed: async () => [1, 0, 0],
  });
}

describe("MemoryRepository", () => {
  it("substitui uma memória mantendo o rastro (consistência ao longo do tempo)", async () => {
    const { repo } = await setup();
    const old = repo.listActive("bemviver").find((m) => m.content.includes("WhatsApp"))!;

    const created = repo.supersede(old.id, {
      clientId: "bemviver",
      type: "preferencia",
      content: "Prefere contato por e-mail.",
      importance: 3,
      source: "conversa",
      createdAt: NOW,
    });

    assert.equal(created.supersedes, old.id);
    assert.equal(repo.find(old.id)!.status, "substituida");
    assert.ok(!repo.listActive("bemviver").some((m) => m.content.includes("WhatsApp")), "a versão antiga deixa de ser usada");
    assert.ok(repo.listAll("bemviver").some((m) => m.id === old.id), "mas continua no histórico");
  });

  it("não deixa um cliente esquecer ou substituir memória de outro cliente", async () => {
    const { repo } = await setup();
    const alheia = repo.listActive("alvorada")[0]!;
    assert.equal(repo.forget("bemviver", alheia.id, NOW), false);
    assert.throws(() =>
      repo.supersede(alheia.id, { clientId: "bemviver", type: "pedido", content: "x", importance: 1, source: "conversa", createdAt: NOW }),
    );
  });
});

describe("extractMemories (armazenar interações como memória)", () => {
  it("adiciona fatos novos e atualiza os que mudaram", async () => {
    const { repo } = await setup();
    const whatsapp = repo.listActive("bemviver").find((m) => m.content.includes("WhatsApp"))!;

    const result = await run(repo, [
      { acao: "ADICIONAR", id_substituida: null, tipo: "pedido", conteudo: "Quer contratar mais 1 TB de backup em novembro de 2026.", importancia: 2 },
      { acao: "ATUALIZAR", id_substituida: whatsapp.id, tipo: "preferencia", conteudo: "Prefere contato por e-mail; o WhatsApp foi desativado.", importancia: 3 },
    ]);

    assert.equal(result.applied.length, 2);
    assert.equal(result.rejected.length, 0);
    const updated = result.applied.find((a) => a.acao === "ATUALIZAR")!;
    assert.equal(updated.replaced!.id, whatsapp.id);
    assert.equal(updated.memory.source, "conversa");
    assert.equal(updated.memory.sessionId, "s1");
  });

  it("rejeita dado sensível, tipo inválido e atualização de memória de outro cliente", async () => {
    const { repo } = await setup();
    const alheia = repo.listActive("alvorada")[0]!;

    const result = await run(repo, [
      { acao: "ADICIONAR", tipo: "preferencia", conteudo: "A senha do Wi-Fi é: clinica2026", importancia: 2 },
      { acao: "ADICIONAR", tipo: "fofoca", conteudo: "algo", importancia: 1 },
      { acao: "ATUALIZAR", id_substituida: alheia.id, tipo: "pedido", conteudo: "Comprou 1 notebook.", importancia: 2 },
    ]);

    assert.equal(result.applied.length, 0);
    assert.equal(result.rejected.length, 3);
    assert.equal(repo.find(alheia.id)!.status, "ativa");
  });

  it("ignora duplicata exata de memória ativa", async () => {
    const { repo } = await setup();
    const existing = repo.listActive("bemviver")[0]!;
    const result = await run(repo, [{ acao: "ADICIONAR", tipo: existing.type, conteudo: existing.content, importancia: 2 }]);
    assert.equal(result.applied.length, 0);
  });

  it("JSON inválido do extrator vira erro claro", () => {
    assert.throws(() => parseOperations("não é json"), /JSON inválido/);
    assert.deepEqual(parseOperations('```json\n{"operacoes": []}\n```'), []);
  });
});
