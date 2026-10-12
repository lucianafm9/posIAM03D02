import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CrmAssistant } from "../src/chat/crmAssistant.ts";
import { createLocalEmbedder, createScriptedLlm } from "../src/llm/scriptedClient.ts";
import { createAssistant, createCapture, HttpError, noSleep } from "./helpers.ts";

const contents = (messages: Array<{ content: string }>) => messages.map((m) => m.content).join("\n---\n");

describe("CrmAssistant: memória entre atendimentos (statefulness)", () => {
  it("lembra em um NOVO atendimento o que foi aprendido no anterior, sem reenviar a conversa antiga", async () => {
    const { assistant, llm, setClock } = await createAssistant({
      streams: ["Combinado, preparo a proposta.", "Sua proposta de 15 notebooks para Campinas está em preparação."],
      completes: {
        extracao: [
          JSON.stringify({
            operacoes: [
              { acao: "ADICIONAR", tipo: "pedido", conteudo: "Pediu proposta de 15 notebooks para a obra nova de Campinas (novembro de 2026).", importancia: 2 },
            ],
          }),
        ],
        resumo: ["Cliente pediu proposta de 15 notebooks para a obra de Campinas."],
      },
    });

    setClock("2026-10-05T12:00:00.000Z");
    assistant.startSession("alvorada");
    await assistant.handle("Preciso de 15 notebooks para a obra nova de Campinas.");
    await assistant.endSession();

    setClock("2026-10-12T12:00:00.000Z");
    assistant.startSession("alvorada");
    const result = await assistant.handle("Como está a proposta dos notebooks da obra de Campinas?");

    const sent = contents(llm.streamCalls[1]!);
    assert.ok(sent.includes("15 notebooks para a obra nova de Campinas"), "memória extraída na sessão 1 é recuperada");
    assert.ok(sent.includes("Atendimentos anteriores"), "resumo do atendimento anterior entra no contexto");
    assert.ok(!sent.includes("Combinado, preparo a proposta."), "a conversa antiga não é reenviada literalmente");
    assert.ok(result.retrieval!.selected.some((s) => s.memory.source === "conversa"));
  });

  it("modo sem_memoria não envia histórico nem memória; modo curta só a conversa da sessão", async () => {
    const semMemoria = await createAssistant({ streams: ["r1", "r2"] }, { mode: "sem_memoria" });
    semMemoria.assistant.startSession("alvorada");
    await semMemoria.assistant.handle("pergunta 1");
    await semMemoria.assistant.handle("pergunta 2");
    assert.equal(semMemoria.llm.streamCalls[1]!.length, 2, "só sistema + mensagem atual");
    assert.ok(!contents(semMemoria.llm.streamCalls[1]!).includes("memoria_cliente"));

    const curta = await createAssistant({ streams: ["r1", "r2"] }, { mode: "curta" });
    curta.assistant.startSession("alvorada");
    await curta.assistant.handle("pergunta 1");
    await curta.assistant.handle("pergunta 2");
    const sent = contents(curta.llm.streamCalls[1]!);
    assert.ok(sent.includes("pergunta 1") && sent.includes("r1"));
    assert.ok(!sent.includes("memoria_cliente"));
    assert.equal(curta.llm.completeCalls.length, 0, "sem extração de memória de longo prazo");
  });

  it("modo sem_filtro injeta todas as memórias; o modo completa só as relevantes", async () => {
    const completa = await createAssistant({ streams: ["ok"] });
    completa.assistant.startSession("alvorada");
    const r1 = await completa.assistant.handle("Qual a vigência das licenças Microsoft 365?");

    const semFiltro = await createAssistant({ streams: ["ok"] }, { mode: "sem_filtro" });
    semFiltro.assistant.startSession("alvorada");
    const r2 = await semFiltro.assistant.handle("Qual a vigência das licenças Microsoft 365?");

    assert.ok(r1.retrieval!.selected.length < r2.retrieval!.selected.length);
    assert.ok(r1.contextTokens < r2.contextTokens);
    assert.ok(r1.retrieval!.selected.some((s) => s.memory.content.includes("Microsoft 365")));
  });
});

describe("CrmAssistant: retomada do atendimento", () => {
  it("restaura o histórico de mensagens da sessão a partir do SQLite", async () => {
    const first = await createAssistant({ streams: ["resposta A"] });
    first.assistant.startSession("bemviver");
    await first.assistant.handle("pergunta A");
    const sessionId = first.assistant.currentSession!.id;

    const llm = createScriptedLlm({ streams: ["resposta B"] });
    const resumed = new CrmAssistant({
      llm,
      embedder: createLocalEmbedder(),
      db: first.db,
      out: createCapture(),
      mode: "completa",
      critique: false,
      sleep: noSleep,
    });
    assert.equal(resumed.startSession("bemviver", sessionId), 2);
    await resumed.handle("pergunta B");
    const sent = contents(llm.streamCalls[0]!);
    assert.ok(sent.includes("pergunta A") && sent.includes("resposta A"));
  });
});

describe("CrmAssistant: falhas não contaminam histórico nem memória", () => {
  it("erro na geração: nada é gravado", async () => {
    const { assistant, llm } = await createAssistant({ streams: [new HttpError(401)] });
    assistant.startSession("alvorada");
    const result = await assistant.handle("Qual a vigência das licenças?");
    assert.equal(result.status, "erro");
    assert.equal(assistant.sessions.loadMessages(assistant.currentSession!.id).length, 0);
    assert.equal(llm.completeCalls.length, 0, "não tenta extrair memória");
  });

  it("guardrail de saída: resposta citando outro cliente é descartada", async () => {
    const { assistant, out } = await createAssistant({ streams: ["A Logística Rota Sul também usa."] });
    assistant.startSession("bemviver");
    const result = await assistant.handle("Quem mais usa o Backup Pro?");
    assert.equal(result.status, "saida_bloqueada");
    assert.equal(assistant.sessions.loadMessages(assistant.currentSession!.id).length, 0);
    assert.match(out.text, /Guardrail de saída/);
  });

  it("guardrail de entrada: dado sensível não chega ao modelo", async () => {
    const { assistant, llm } = await createAssistant();
    assistant.startSession("bemviver");
    const result = await assistant.handle("Meu CPF é 123.456.789-09");
    assert.equal(result.status, "entrada_bloqueada");
    assert.equal(llm.streamCalls.length, 0);
  });

  it("falha na extração: a resposta é mantida e gravada, só a memória não é atualizada", async () => {
    const { assistant, out } = await createAssistant({ streams: ["ok"], completes: { extracao: ["isto não é JSON"] } });
    assistant.startSession("bemviver");
    const before = assistant.listMemories().length;
    const result = await assistant.handle("Vamos contratar mais 1 TB de backup.");
    assert.equal(result.status, "respondida");
    assert.equal(assistant.sessions.loadMessages(assistant.currentSession!.id).length, 2);
    assert.equal(assistant.listMemories().length, before);
    assert.match(out.text, /Memória não atualizada/);
  });
});

describe("CrmAssistant: autocrítica", () => {
  it("revisor reprova o rascunho e a versão revisada é a que fica no histórico", async () => {
    const { assistant, out, llm } = await createAssistant(
      {
        streams: ["Qual modelo vocês compraram?", "Vou cotar o Dell Latitude 5450, igual ao PED-2291."],
        completes: { critica: [JSON.stringify({ approved: false, issues: ["Ignorou a última compra registrada na memória."] })] },
      },
      { critique: true },
    );
    assistant.startSession("alvorada");
    const result = await assistant.handle("Quero notebooks iguais aos da última compra.");

    assert.equal(result.critique!.status, "revisada");
    assert.equal(result.answer, "Vou cotar o Dell Latitude 5450, igual ao PED-2291.");
    assert.match(out.text, /Versão revisada/);
    const reviewInput = llm.completeCalls.find((c) => c[0]!.content.includes("revisor rigoroso"))!;
    assert.ok(reviewInput[1]!.content.includes("<memoria>"), "o revisor recebe a memória para checar o uso");
    assert.equal(assistant.sessions.loadMessages(assistant.currentSession!.id)[1]!.content, result.answer);
  });
});
