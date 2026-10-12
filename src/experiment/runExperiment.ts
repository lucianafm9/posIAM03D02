import { mkdirSync, writeFileSync } from "node:fs";
import { CrmAssistant } from "../chat/crmAssistant.ts";
import type { CritiqueOutcome } from "../chat/generateAnswer.ts";
import { SETTINGS } from "../config/settings.ts";
import { createOpenAiClient, createOpenAiEmbedder, readApiKey } from "../llm/openaiClient.ts";
import { openDatabase } from "../memory/database.ts";
import { readSeed, seedDatabase } from "../memory/seedDatabase.ts";
import { MEMORY_MODES, type Embedder, type LlmClient, type Memory, type MemoryMode } from "../types.ts";
import { describeError } from "../utils/errors.ts";
import { withRetry } from "../utils/withRetry.ts";
import { judge, type JudgeVerdict } from "./judge.ts";
import { buildReport } from "./report.ts";
import { SCENARIOS, type ScenarioTurn } from "./scenarios.ts";

export type CheckResult = { tipo: "deve" | "naoDeve"; desc: string; ok: boolean };

export type TurnRecord = {
  cenario: string;
  turno: string;
  data: string;
  mensagem: string;
  status: string;
  resposta: string | null;
  checks: CheckResult[];
  juiz: JudgeVerdict | null;
  aprovado: boolean;
  tokensContexto: number;
  tokensMemoria: number;
  memoriasUsadas: Array<{ id: number; tipo: string; conteudo: string; score: number; motivo: string }>;
  memoriasDescartadas: number;
  memoriasGravadas: Array<{ acao: string; id: number; substituiu: number | null; tipo: string; conteudo: string }>;
  autocritica: CritiqueOutcome | null;
};

export type ModeRun = {
  modo: MemoryMode;
  turnos: TurnRecord[];
  /** Estado final da memória dos clientes dos cenários (inclui substituídas), para mostrar a evolução. */
  memoriaFinal: Record<string, Array<Pick<Memory, "id" | "type" | "content" | "source" | "status" | "supersedes" | "createdAt">>>;
};

export type ExperimentResults = {
  geradoEm: string;
  modelo: string;
  modeloJuiz: string;
  modeloEmbedding: string;
  autocritica: boolean;
  configuracao: typeof SETTINGS;
  modos: ModeRun[];
};

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

const silent = { write: () => true };

export function evaluateChecks(turn: ScenarioTurn, answer: string): CheckResult[] {
  return [
    ...(turn.deve ?? []).map((m) => ({ tipo: "deve" as const, desc: m.desc, ok: m.re.test(answer) })),
    ...(turn.naoDeve ?? []).map((m) => ({ tipo: "naoDeve" as const, desc: m.desc, ok: !m.re.test(answer) })),
  ];
}

export function isApproved(turn: ScenarioTurn, status: string, checks: CheckResult[], verdict: JudgeVerdict | null): boolean {
  if (status !== "respondida" || !verdict) return false;
  if (checks.some((c) => !c.ok)) return false;
  if (verdict.nota < 4 || verdict.usoIrrelevante || verdict.inconsistente || verdict.usoMemoria === "incorreto") return false;
  return !(turn.memoriaEsperada === "deve_usar" && verdict.usoMemoria === "ausente");
}

/** Embeddings em cache: o mesmo texto (seed, memórias, mensagens) é vetorizado uma única vez em todos os modos. */
function cached(embedder: Embedder): Embedder {
  const cache = new Map<string, number[]>();
  return {
    async embed(text) {
      const hit = cache.get(text);
      if (hit) return hit;
      const vector = await embedder.embed(text);
      cache.set(text, vector);
      return vector;
    },
  };
}

export async function runMode(
  mode: MemoryMode,
  deps: { llm: LlmClient; judgeLlm: LlmClient; embedder: Embedder; critique: boolean; log?: (text: string) => void },
): Promise<ModeRun> {
  const log = deps.log ?? ((text: string) => process.stdout.write(text));
  const db = openDatabase(":memory:");
  await seedDatabase(db, readSeed(), (text) => deps.embedder.embed(text));

  let clock = new Date();
  const assistant = new CrmAssistant({
    llm: deps.llm,
    embedder: deps.embedder,
    db,
    out: silent,
    mode,
    critique: deps.critique,
    now: () => clock,
  });

  const turnos: TurnRecord[] = [];
  for (const scenario of SCENARIOS) {
    for (const session of scenario.sessoes) {
      clock = new Date(session.data);
      assistant.startSession(scenario.clienteId);

      for (const turn of session.turnos) {
        clock = new Date(clock.getTime() + 2 * 60_000);
        log(`  [${mode}] ${turn.id}... `);
        const result = await assistant.handle(turn.mensagem);
        const answer = result.answer ?? "";
        const checks = evaluateChecks(turn, answer);

        let verdict: JudgeVerdict | null = null;
        if (result.status === "respondida") {
          try {
            verdict = await withRetry(() => judge(deps.judgeLlm, turn, answer), { ...SETTINGS.retry });
          } catch (error) {
            log(`(juiz indisponível: ${describeError(error)}) `);
          }
        }

        const aprovado = isApproved(turn, result.status, checks, verdict);
        log(`${aprovado ? "aprovado" : "reprovado"}${verdict ? ` (nota ${verdict.nota})` : ""}\n`);

        turnos.push({
          cenario: scenario.id,
          turno: turn.id,
          data: clock.toISOString(),
          mensagem: turn.mensagem,
          status: result.status,
          resposta: result.answer,
          checks,
          juiz: verdict,
          aprovado,
          tokensContexto: result.contextTokens,
          tokensMemoria: result.retrieval?.tokens ?? 0,
          memoriasUsadas: (result.retrieval?.selected ?? []).map((item) => ({
            id: item.memory.id,
            tipo: item.memory.type,
            conteudo: item.memory.content,
            score: Number(item.score.toFixed(3)),
            motivo: item.reason,
          })),
          memoriasDescartadas: result.retrieval?.discarded.length ?? 0,
          memoriasGravadas: (result.extraction?.applied ?? []).map((item) => ({
            acao: item.acao,
            id: item.memory.id,
            substituiu: item.replaced?.id ?? null,
            tipo: item.memory.type,
            conteudo: item.memory.content,
          })),
          autocritica: result.critique,
        });
      }

      clock = new Date(clock.getTime() + 60_000);
      await assistant.endSession();
    }
  }

  const memoriaFinal: ModeRun["memoriaFinal"] = {};
  for (const clientId of new Set(SCENARIOS.map((s) => s.clienteId))) {
    memoriaFinal[clientId] = assistant.memories
      .listAll(clientId)
      .map(({ id, type, content, source, status, supersedes, createdAt }) => ({ id, type, content, source, status, supersedes, createdAt }));
  }
  db.close();
  return { modo: mode, turnos, memoriaFinal };
}

async function main(): Promise<void> {
  const apiKey = readApiKey();
  if (!apiKey) {
    console.error("OPENAI_API_KEY não configurada. O experimento usa o modelo real (geração, embeddings e juiz).");
    process.exit(1);
  }

  const model = process.env.OPENAI_MODEL || SETTINGS.defaultModel;
  const judgeModel = process.env.OPENAI_JUDGE_MODEL || model;
  const modes = (arg("modos")?.split(",") ?? [...MEMORY_MODES]) as MemoryMode[];
  const critique = process.argv.includes("--autocritica");
  const outDir = arg("saida") ?? "results";

  const deps = {
    llm: createOpenAiClient(apiKey, model),
    judgeLlm: createOpenAiClient(apiKey, judgeModel),
    embedder: cached(createOpenAiEmbedder(apiKey)),
    critique,
  };

  console.log(`Experimento: modelo=${model}, juiz=${judgeModel}, modos=${modes.join(", ")}, autocrítica=${critique ? "ligada" : "desligada"}`);
  const runs: ModeRun[] = [];
  for (const mode of modes) {
    console.log(`\nModo ${mode}:`);
    runs.push(await runMode(mode, deps));
  }

  const results: ExperimentResults = {
    geradoEm: new Date().toISOString(),
    modelo: model,
    modeloJuiz: judgeModel,
    modeloEmbedding: SETTINGS.embeddingModel,
    autocritica: critique,
    configuracao: SETTINGS,
    modos: runs,
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/experimento.json`, `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync(`${outDir}/relatorio.md`, buildReport(results));
  console.log(`\nResultados em ${outDir}/experimento.json e ${outDir}/relatorio.md`);
}

if (import.meta.main) {
  await main();
}
