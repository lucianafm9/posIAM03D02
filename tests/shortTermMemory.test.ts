import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ContextWindow } from "../src/memory/contextWindow.ts";
import { estimateTokens } from "../src/memory/estimateTokens.ts";
import { maybeCompress } from "../src/memory/maybeCompress.ts";
import { buildMemoryBlock, stitchContext } from "../src/memory/stitchContext.ts";
import { memory } from "./helpers.ts";

describe("ContextWindow (memória de curto prazo)", () => {
  it("separa mensagens do usuário e do assistente e mantém só as últimas N interações", () => {
    const window = new ContextWindow(2);
    for (let i = 1; i <= 3; i++) {
      window.addUserMessage(`pergunta ${i}`);
      window.addAssistantMessage(`resposta ${i}`);
    }
    const messages = window.getMessages();
    assert.equal(messages.length, 4);
    assert.deepEqual(messages[0], { role: "user", content: "pergunta 2" });
    assert.deepEqual(messages[3], { role: "assistant", content: "resposta 3" });
  });
});

describe("estimateTokens", () => {
  it("estima ~1 token a cada 3 caracteres", () => {
    assert.equal(estimateTokens([{ role: "user", content: "x".repeat(30) }, { role: "assistant", content: "y".repeat(31) }]), 10 + 11);
  });
});

describe("maybeCompress", () => {
  const fill = (turns: number) => {
    const window = new ContextWindow(50);
    for (let i = 1; i <= turns; i++) {
      window.addUserMessage(`pergunta ${i} ${"a".repeat(60)}`);
      window.addAssistantMessage(`resposta ${i} ${"b".repeat(60)}`);
    }
    return window;
  };

  it("não comprime abaixo do orçamento", async () => {
    const window = fill(2);
    let called = false;
    const result = await maybeCompress({
      window,
      previousSummary: null,
      maxTokens: 10_000,
      maxMessages: 20,
      summarize: async () => ((called = true), "x"),
    });
    assert.equal(result.compressed, false);
    assert.equal(result.trigger, "nenhum");
    assert.equal(called, false);
    assert.equal(result.messages.length, 4);
  });

  it("resume a metade antiga (com o resumo anterior) e mantém a metade recente literal", async () => {
    const window = fill(6);
    let summarized: string[] = [];
    const result = await maybeCompress({
      window,
      previousSummary: "Resumo antigo.",
      maxTokens: 100,
      maxMessages: 20,
      summarize: async (messages) => {
        summarized = messages.map((m) => m.content);
        return "Resumo novo.";
      },
    });

    assert.equal(result.compressed, true);
    assert.equal(result.trigger, "tokens");
    assert.equal(result.summarizedMessages, 6);
    assert.equal(result.summary, "Resumo novo.");
    assert.ok(summarized[0]!.includes("Resumo antigo."), "o resumo anterior entra no novo resumo");
    assert.equal(window.size, 6, "a janela fica só com a metade recente");
    assert.ok(window.getMessages()[0]!.content.startsWith("pergunta 4"), "não separa pergunta da resposta");
    assert.ok(result.tokensAfter < result.tokensBefore);
  });

  it("comprime quando a janela fica cheia, antes que a janela deslizante descarte mensagens sem resumo", async () => {
    const window = new ContextWindow(3);
    for (let i = 1; i <= 3; i++) {
      window.addUserMessage(`p${i}`);
      window.addAssistantMessage(`r${i}`);
    }
    const result = await maybeCompress({
      window,
      previousSummary: null,
      maxTokens: 10_000,
      maxMessages: 6,
      summarize: async (messages) => messages.map((m) => m.content).join(","),
    });

    assert.equal(result.trigger, "limite_de_mensagens");
    assert.equal(result.summary, "p1,r1");
    assert.deepEqual(window.getMessages().map((m) => m.content), ["p2", "r2", "p3", "r3"]);
  });

  it("não comprime com menos de 4 mensagens, mesmo acima do orçamento", async () => {
    const window = new ContextWindow(10);
    window.addUserMessage("x".repeat(3_000));
    window.addAssistantMessage("y".repeat(3_000));
    const result = await maybeCompress({ window, previousSummary: null, maxTokens: 100, maxMessages: 20, summarize: async () => "s" });
    assert.equal(result.compressed, false);
  });

  it("se o resumo falhar, a janela fica intacta", async () => {
    const window = fill(6);
    await assert.rejects(
      maybeCompress({
        window,
        previousSummary: null,
        maxTokens: 100,
        maxMessages: 20,
        summarize: async () => {
          throw new Error("API fora do ar");
        },
      }),
    );
    assert.equal(window.size, 12);
  });
});

describe("stitchContext", () => {
  it("costura memória, resumo da sessão e mensagens recentes nessa ordem", () => {
    const stitched = stitchContext({
      memoryBlock: "<memoria_cliente>x</memoria_cliente>",
      sessionSummary: "resumo",
      recentMessages: [{ role: "user", content: "oi" }],
    });
    assert.equal(stitched.length, 5);
    assert.ok(stitched[0]!.content.includes("<memoria_cliente>"));
    assert.ok(stitched[2]!.content.includes("<resumo_atendimento_atual>"));
    assert.deepEqual(stitched[4], { role: "user", content: "oi" });
  });

  it("não injeta bloco vazio quando não há memória", () => {
    const client = { id: "c1", name: "ACME", segment: "x", contactName: "Ana", contactRole: "TI", customerSince: "2020" };
    assert.equal(buildMemoryBlock({ client, memories: [], pastSessions: [] }), null);
    const block = buildMemoryBlock({ client, memories: [memory({ content: "Comprou 3 servidores." })], pastSessions: [] });
    assert.ok(block!.includes("Comprou 3 servidores."));
    assert.equal(stitchContext({ memoryBlock: null, recentMessages: [] }).length, 0);
  });
});
