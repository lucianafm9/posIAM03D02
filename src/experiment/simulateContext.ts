import { mkdirSync, writeFileSync } from "node:fs";
import { CrmAssistant, type CompressionInfo } from "../chat/crmAssistant.ts";
import { SETTINGS } from "../config/settings.ts";
import { callKind, createLocalEmbedder } from "../llm/scriptedClient.ts";
import { openDatabase } from "../memory/database.ts";
import { readSeed, seedDatabase } from "../memory/seedDatabase.ts";
import { MEMORY_MODES, type LlmClient, type MemoryMode, type Message } from "../types.ts";
import { CONTEXT_SPEC } from "./contextSpec.ts";
import { SCENARIOS } from "./scenarios.ts";

/**
 * Avaliação de CONTEXTO, sem chave de API (npm run simulate).
 *
 * Executa o código real do assistente (recuperação, janela, compressão, costura do contexto, extração e
 * persistência) e registra o contexto exato que seria enviado ao modelo a cada mensagem, em cada modo.
 * Mede se os fatos necessários chegam ao modelo, se entra ruído (memória irrelevante, desatualizada ou de
 * outro cliente), quantos tokens são gastos e onde a compressão acontece.
 *
 * O que é SIMULADO (e por isso esta avaliação não mede a qualidade das respostas):
 *  - respostas: texto neutro com o tamanho típico de uma resposta real (~250 tokens);
 *  - resumos (compressão e fim de atendimento): extrativos, com as frases do cliente;
 *  - extração de memória: gabarito do que um extrator correto registraria (contextSpec.ts);
 *  - embeddings: locais (bag-of-words), não os da OpenAI.
 */

const FILLER =
  "Texto neutro de preenchimento com o tamanho aproximado de uma resposta real do assistente, sem nenhum fato do cliente. ".repeat(7);

type TurnContext = {
  turno: string;
  tokensContexto: number;
  memoriasInjetadas: number;
  compressao: CompressionInfo | null;
  necessarios: Array<{ desc: string; presente: boolean }>;
  ruidos: Array<{ desc: string; presente: boolean }>;
};

type ModeContext = { modo: MemoryMode; turnos: TurnContext[] };

/** Resumo extrativo: as frases do cliente (e o resumo anterior), cada uma truncada. */
function extractiveSummary(messages: Message[]): string {
  const text = messages[1]?.content ?? "";
  const lines = text
    .split("\n")
    .filter((line) => line.startsWith("Cliente: "))
    .map((line) => line.slice("Cliente: ".length))
    // O resumo anterior entra inteiro (é acumulativo); as frases novas são truncadas.
    .map((line) => (line.startsWith("Resumo anterior do atendimento:") ? line.slice("Resumo anterior do atendimento:".length).trim() : line.slice(0, 220)));
  return lines.join(" | ");
}

function simulatedLlm(currentTurn: () => string): LlmClient {
  return {
    async stream(_messages, onToken) {
      onToken(FILLER);
      return FILLER;
    },
    async complete(messages) {
      const kind = callKind(messages);
      if (kind === "resumo") return extractiveSummary(messages);
      if (kind === "extracao") {
        const existing = messages[1]?.content ?? "";
        const operacoes = (CONTEXT_SPEC[currentTurn()]?.extracao ?? []).map((op) => {
          if (op.acao === "ADICIONAR") return op;
          const line = existing.split("\n").find((l) => l.startsWith("- [M") && op.substitui.test(l));
          const id = line?.match(/^- \[M(\d+)/)?.[1];
          const { substitui: _ignored, ...rest } = op;
          return id ? { ...rest, id_substituida: Number(id) } : { ...rest, acao: "ADICIONAR" };
        });
        return JSON.stringify({ operacoes });
      }
      return '{"approved": true, "issues": []}';
    },
  };
}

async function runMode(mode: MemoryMode): Promise<ModeContext> {
  const db = openDatabase(":memory:");
  const embedder = createLocalEmbedder();
  await seedDatabase(db, readSeed(), (text) => embedder.embed(text));

  let turnId = "";
  let lastContext: Message[] = [];
  const llm = simulatedLlm(() => turnId);
  const capturing: LlmClient = {
    complete: (messages, options) => llm.complete(messages, options),
    stream: (messages, onToken) => {
      lastContext = messages;
      return llm.stream(messages, onToken);
    },
  };

  let clock = new Date();
  const assistant = new CrmAssistant({ llm: capturing, embedder, db, out: { write: () => true }, mode, critique: false, now: () => clock });

  const turnos: TurnContext[] = [];
  for (const scenario of SCENARIOS) {
    for (const session of scenario.sessoes) {
      clock = new Date(session.data);
      assistant.startSession(scenario.clienteId);
      for (const turn of session.turnos) {
        turnId = turn.id;
        clock = new Date(clock.getTime() + 2 * 60_000);
        const result = await assistant.handle(turn.mensagem);

        // Só o contexto de memória: sem o prompt de sistema e sem a mensagem atual do cliente.
        const memoryContext = lastContext.slice(1, -1).map((m) => m.content).join("\n");
        const spec = CONTEXT_SPEC[turn.id] ?? {};
        turnos.push({
          turno: turn.id,
          tokensContexto: result.contextTokens,
          memoriasInjetadas: result.retrieval?.selected.length ?? 0,
          compressao: result.compression,
          necessarios: (spec.necessario ?? []).map((m) => ({ desc: m.desc, presente: m.re.test(memoryContext) })),
          ruidos: (spec.ruido ?? []).map((m) => ({ desc: m.desc, presente: m.re.test(memoryContext) })),
        });
      }
      clock = new Date(clock.getTime() + 60_000);
      await assistant.endSession();
    }
  }
  db.close();
  return { modo: mode, turnos };
}

const MODE_LABEL: Record<MemoryMode, string> = {
  sem_memoria: "Sem memória",
  curta: "Só memória curta",
  completa: "Memória completa",
  sem_filtro: "Sem filtro",
};

export function buildContextReport(runs: ModeContext[]): string {
  const turnIds = runs[0]?.turnos.map((t) => t.turno) ?? [];
  const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);

  const summary = runs.map((run) => {
    const needed = run.turnos.flatMap((t) => t.necessarios);
    const present = needed.filter((n) => n.presente).length;
    const noisy = run.turnos.filter((t) => t.ruidos.some((r) => r.presente));
    const compressions = run.turnos.filter((t) => t.compressao);
    return (
      `| ${MODE_LABEL[run.modo]} | **${present}/${needed.length} (${Math.round((present / Math.max(1, needed.length)) * 100)}%)** | ` +
      `${noisy.length}${noisy.length > 0 ? ` (${noisy.map((t) => t.turno).join(", ")})` : ""} | ` +
      `${Math.round(avg(run.turnos.map((t) => t.tokensContexto)))} | ${avg(run.turnos.map((t) => t.memoriasInjetadas)).toFixed(1)} | ${compressions.length} |`
    );
  });

  const perTurn = turnIds.map((id) => {
    const cells = runs.map((run) => {
      const t = run.turnos.find((x) => x.turno === id)!;
      const parts: string[] = [];
      if (t.necessarios.length > 0) {
        const ok = t.necessarios.filter((n) => n.presente).length;
        parts.push(`${ok === t.necessarios.length ? "✅" : ok === 0 ? "❌" : "⚠️"} ${ok}/${t.necessarios.length}`);
      }
      const noise = t.ruidos.filter((r) => r.presente);
      if (noise.length > 0) parts.push(`🔸 ruído: ${noise.map((r) => r.desc).join(", ")}`);
      if (t.compressao) parts.push("⚡");
      parts.push(`${t.tokensContexto} tk`);
      return parts.join(" · ");
    });
    return `| ${id} | ${cells.join(" | ")} |`;
  });

  const missing = runs
    .filter((r) => r.modo === "completa")
    .flatMap((r) => r.turnos.flatMap((t) => t.necessarios.filter((n) => !n.presente).map((n) => `${t.turno}: ${n.desc}`)));

  return [
    "# Avaliação de contexto (simulação, sem modelo real)",
    "",
    "Gerado por `npm run simulate`. O código real do assistente roda em cada modo e o contexto exato que seria enviado",
    "ao modelo é verificado em cada mensagem. **Respostas, resumos, extração de memória e embeddings são simulados**",
    "(ver `src/experiment/simulateContext.ts`), então esta avaliação mede a ARQUITETURA DE MEMÓRIA (o que chega ao modelo),",
    "não a qualidade das respostas. A comparação com respostas reais e juiz é feita por `npm run experiment`.",
    "",
    "## Resumo por modo",
    "",
    "| Modo | Fatos necessários no contexto | Mensagens com ruído | Tokens de contexto (média) | Memórias injetadas (média) | Compressões |",
    "|---|---|---|---|---|---|",
    ...summary,
    "",
    "## Por mensagem",
    "",
    "✅/⚠️/❌ = fatos necessários presentes no contexto · 🔸 = ruído no contexto · ⚡ = compressão antes da mensagem · tk = tokens de contexto.",
    "",
    `| Turno | ${runs.map((r) => MODE_LABEL[r.modo]).join(" | ")} |`,
    `|---|${runs.map(() => "---").join("|")}|`,
    ...perTurn,
    "",
    "## Fatos que faltaram no modo completa",
    "",
    missing.length === 0 ? "Nenhum." : missing.map((m) => `- ${m}`).join("\n"),
    "",
  ].join("\n");
}

if (import.meta.main) {
  const runs: ModeContext[] = [];
  for (const mode of MEMORY_MODES) runs.push(await runMode(mode));
  mkdirSync("results", { recursive: true });
  writeFileSync("results/simulacao-contexto.json", `${JSON.stringify({ geradoEm: new Date().toISOString(), configuracao: SETTINGS, modos: runs }, null, 2)}\n`);
  const report = buildContextReport(runs);
  writeFileSync("results/simulacao-contexto.md", report);
  console.log(report);
}
