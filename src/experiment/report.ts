import type { MemoryMode } from "../types.ts";
import type { ExperimentResults, ModeExecution, ModeRun, TurnRecord } from "./runExperiment.ts";
import { SCENARIOS, type ScenarioTurn } from "./scenarios.ts";

const MODE_LABEL: Record<MemoryMode, string> = {
  sem_memoria: "Sem memória (stateless)",
  curta: "Só memória curta (sessão)",
  completa: "Memória completa (proposta)",
  sem_filtro: "Memória sem filtro (excesso)",
};

let ACTIVE = SCENARIOS;
let ALL_TURNS: ScenarioTurn[] = SCENARIOS.flatMap((s) => s.sessoes.flatMap((ss) => ss.turnos));
const findTurn = (id: string) => ALL_TURNS.find((t) => t.id === id)!;

const avg = (values: number[]) => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length);
const pct = (part: number, total: number) => `${total === 0 ? 0 : Math.round((part / total) * 100)}%`;
const oneLine = (text: string | null) => (text ?? "(sem resposta)").replace(/\s*\n\s*/g, " ").replace(/\|/g, "/");
const quote = (text: string | null) =>
  (text ?? "(sem resposta)")
    .trim()
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

const allTurns = (run: ModeRun): TurnRecord[] => run.execucoes.flatMap((e) => e.turnos);
const turnRecords = (run: ModeRun, id: string): TurnRecord[] => allTurns(run).filter((t) => t.turno === id);

function summaryRow(run: ModeRun): string {
  const t = allTurns(run);
  const judged = t.filter((x) => x.juiz);
  const aprovados = t.filter((x) => x.aprovado).length;
  const porExecucao = run.execucoes.map((e) => e.turnos.filter((x) => x.aprovado).length);
  const count = (fn: (x: TurnRecord) => boolean) => judged.filter(fn).length;
  return [
    MODE_LABEL[run.modo],
    `**${aprovados}/${t.length} (${pct(aprovados, t.length)})**`,
    porExecucao.join(" · "),
    avg(judged.map((x) => x.juiz!.nota)).toFixed(2),
    `${t.filter((x) => x.checks.every((c) => c.ok)).length}/${t.length}`,
    `${count((x) => x.juiz!.usoMemoria === "correto")}`,
    `${count((x) => x.juiz!.usoMemoria === "ausente")}`,
    `${count((x) => x.juiz!.usoIrrelevante)}`,
    `${count((x) => x.juiz!.inconsistente || x.juiz!.usoMemoria === "incorreto")}`,
    Math.round(avg(t.map((x) => x.tokensContexto))).toString(),
    avg(t.map((x) => x.memoriasUsadas.length)).toFixed(1),
  ].join(" | ");
}

/** "✅ 3/3 · 4.7": quantas execuções aprovaram o turno e a nota média do juiz. */
function cell(records: TurnRecord[]): string {
  if (records.length === 0) return "-";
  const ok = records.filter((r) => r.aprovado).length;
  const notas = records.filter((r) => r.juiz).map((r) => r.juiz!.nota);
  const icon = ok === records.length ? "✅" : ok === 0 ? "❌" : "⚠️";
  return `${icon} ${ok}/${records.length}${notas.length > 0 ? ` · ${avg(notas).toFixed(1)}` : ""}`;
}

function turnDetails(results: ExperimentResults, turnId: string): string {
  const turn = findTurn(turnId);
  const lines: string[] = [`#### ${turnId}: ${turn.objetivo}`, "", `**Cliente:** ${turn.mensagem}`, ""];

  for (const run of results.modos) {
    const record = run.execucoes[0]?.turnos.find((t) => t.turno === turnId);
    if (!record) continue;
    const failed = record.checks.filter((c) => !c.ok).map((c) => (c.tipo === "deve" ? `faltou: ${c.desc}` : `violou: ${c.desc}`));
    const compression = record.compressao
      ? ` · ⚡ compressão antes desta mensagem (${record.compressao.summarizedMessages} mensagens resumidas, ~${record.compressao.tokensBefore} → ~${record.compressao.tokensAfter} tokens)`
      : "";
    lines.push(
      `**${MODE_LABEL[run.modo]}** — ${record.aprovado ? "✅ aprovado" : "❌ reprovado"}` +
        (record.juiz
          ? ` (nota ${record.juiz.nota}, memória: ${record.juiz.usoMemoria}${record.juiz.usoIrrelevante ? ", uso irrelevante" : ""}${record.juiz.inconsistente ? ", inconsistente" : ""})`
          : "") +
        ` · contexto ~${record.tokensContexto} tokens${compression}`,
      "",
      quote(record.resposta),
      "",
    );
    if (failed.length > 0) lines.push(`Checagens: ${failed.join("; ")}.`, "");
    if (record.juiz?.justificativa) lines.push(`Juiz: _${record.juiz.justificativa}_`, "");
    if (run.modo === "completa" && record.memoriasUsadas.length > 0) {
      lines.push(
        `Memórias injetadas (${record.memoriasUsadas.length} de ${record.memoriasUsadas.length + record.memoriasDescartadas} ativas, ~${record.tokensMemoria} tokens):`,
        "",
        ...record.memoriasUsadas.map((m) => `- M${m.id} (${m.tipo}, ${m.motivo}, score ${m.score.toFixed(2)}): ${m.conteudo}`),
        "",
      );
    }
    if (run.modo === "completa" && record.memoriasGravadas.length > 0) {
      lines.push(
        "Memória gravada após a resposta:",
        "",
        ...record.memoriasGravadas.map((m) => `- ${m.acao} M${m.id}${m.substituiu ? ` (substitui M${m.substituiu})` : ""} (${m.tipo}): ${m.conteudo}`),
        "",
      );
    }
  }
  return lines.join("\n");
}

function memoryEvolution(execution: ModeExecution | undefined): string {
  if (!execution) return "_Modo completa não executado._";
  const lines: string[] = [];
  for (const [clientId, memories] of Object.entries(execution.memoriaFinal)) {
    const relevant = memories.filter((m) => m.source === "conversa" || m.status !== "ativa");
    if (relevant.length === 0) continue;
    lines.push(`**${clientId}**`, "", "| Id | Tipo | Origem | Status | Substitui | Data | Conteúdo |", "|---|---|---|---|---|---|---|");
    for (const m of relevant) {
      lines.push(`| M${m.id} | ${m.type} | ${m.source} | ${m.status} | ${m.supersedes ? `M${m.supersedes}` : "-"} | ${m.createdAt.slice(0, 10)} | ${oneLine(m.content)} |`);
    }
    lines.push("");
  }
  return lines.join("\n") || "_Nenhuma memória nova ou substituída._";
}

/** Tokens de contexto por turno do cenário de conversa longa, marcando onde a compressão aconteceu. */
function compressionSection(results: ExperimentResults): string[] {
  const scenario = ACTIVE.find((s) => s.id === "C");
  if (!scenario) return [];
  const ids = scenario.sessoes.flatMap((s) => s.turnos.map((t) => t.id));
  const runs = results.modos.filter((r) => r.modo !== "sem_memoria");
  if (runs.length === 0) return [];

  const lines = [
    "## Compressão da memória curta (cenário C)",
    "",
    "O cenário C é uma conversa longa de um único atendimento. Os detalhes pedidos no fim (C7) aparecem no início (C1 e C2).",
    "A tabela mostra os tokens de contexto enviados ao modelo em cada mensagem (execução 1). ⚡ marca a mensagem antes da qual",
    "a metade antiga da conversa foi resumida. Entre parênteses, em quantas execuções houve compressão naquele ponto.",
    "",
    `| Modo | ${ids.join(" | ")} | C7 aprovado |`,
    `|---|${ids.map(() => "---").join("|")}|---|`,
  ];
  for (const run of runs) {
    const first = run.execucoes[0]?.turnos ?? [];
    const cells = ids.map((id) => {
      const record = first.find((t) => t.turno === id);
      const times = turnRecords(run, id).filter((t) => t.compressao).length;
      if (!record) return "-";
      return `${record.compressao ? "⚡ " : ""}${record.tokensContexto}${times > 0 ? ` (${times}/${run.execucoes.length})` : ""}`;
    });
    lines.push(`| ${MODE_LABEL[run.modo]} | ${cells.join(" | ")} | ${cell(turnRecords(run, "C7"))} |`);
  }

  const compressions = runs.flatMap((r) => allTurns(r)).filter((t) => t.compressao);
  if (compressions.length > 0) {
    const ratio = avg(compressions.map((t) => t.compressao!.tokensAfter / t.compressao!.tokensBefore));
    lines.push(
      "",
      `Em média, cada compressão reduziu a memória curta para **${Math.round(ratio * 100)}%** do tamanho anterior ` +
        `(${compressions.length} compressões em todas as execuções; gatilhos: ${[...new Set(compressions.map((t) => t.compressao!.trigger))].join(", ")}).`,
    );
  } else {
    lines.push("", "_Nenhuma compressão foi acionada nesta execução._");
  }
  lines.push("");
  return lines;
}

/** Turnos em que as execuções discordaram (indicador de instabilidade do modelo). */
function variability(results: ExperimentResults): string[] {
  if (results.repeticoes < 2) return [];
  const unstable: string[] = [];
  for (const run of results.modos) {
    for (const turn of ALL_TURNS) {
      const records = turnRecords(run, turn.id);
      const ok = records.filter((r) => r.aprovado).length;
      if (ok > 0 && ok < records.length) unstable.push(`${turn.id} (${MODE_LABEL[run.modo]}: ${ok}/${records.length})`);
    }
  }
  return [
    "## Variação entre execuções",
    "",
    unstable.length === 0
      ? "Todos os turnos tiveram o mesmo resultado em todas as execuções."
      : `Turnos com resultado diferente entre as execuções: ${unstable.join("; ")}.`,
    "",
  ];
}

export function buildReport(results: ExperimentResults): string {
  ACTIVE = SCENARIOS.filter((s) => !results.cenarios || results.cenarios.includes(s.id));
  ALL_TURNS = ACTIVE.flatMap((s) => s.sessoes.flatMap((ss) => ss.turnos));
  const completa = results.modos.find((r) => r.modo === "completa");
  const semFiltro = results.modos.find((r) => r.modo === "sem_filtro");

  const lines: string[] = [
    "# Relatório do experimento: com memória x sem memória",
    "",
    `Gerado em ${results.geradoEm} · modelo \`${results.modelo}\` · juiz \`${results.modeloJuiz}\` · embeddings \`${results.modeloEmbedding}\` · ` +
      `${results.repeticoes} execução(ões) por modo · autocrítica ${results.autocritica ? "ligada" : "desligada"}` +
      (results.orcamentoMemoriaCurta ? ` · orçamento da memória curta ${results.orcamentoMemoriaCurta} tokens` : "") +
      (results.cenarios && results.cenarios.length < SCENARIOS.length ? ` · cenários ${results.cenarios.join(", ")}` : "") +
      (results.retentativasDeCredito ? ` · ${results.retentativasDeCredito} chamada(s) repetida(s) por erro intermitente de crédito da OpenAI` : "") +
      ".",
    "",
    "Arquivo gerado por `npm run experiment` (dados completos em `experimento.json`). Cada execução roda os mesmos cenários,",
    "com o mesmo banco inicial (CRM de exemplo) e as mesmas datas simuladas. Um turno é **aprovado** quando passa nas",
    "checagens objetivas (regex) e o juiz dá nota >= 4, sem uso irrelevante, sem inconsistência e sem deixar de usar a memória quando deveria.",
    "",
    "## Resumo por modo",
    "",
    "| Modo | Aprovação (todas as execuções) | Aprovados por execução | Nota média (1-5) | Checagens ok | Memória usada corretamente | Memória ausente | Uso irrelevante | Inconsistência | Tokens de contexto (média) | Memórias injetadas (média) |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...results.modos.map((run) => `| ${summaryRow(run)} |`),
    "",
    "## Resultado por interação",
    "",
    "Cada célula mostra em quantas execuções o turno foi aprovado e a nota média do juiz (✅ todas, ⚠️ algumas, ❌ nenhuma).",
    "",
    `| Turno | Objetivo | ${results.modos.map((r) => MODE_LABEL[r.modo]).join(" | ")} |`,
    `|---|---|${results.modos.map(() => "---").join("|")}|`,
    ...ALL_TURNS.map((turn) => `| ${turn.id} | ${turn.objetivo} | ${results.modos.map((r) => cell(turnRecords(r, turn.id))).join(" | ")} |`),
    "",
  ];

  if (completa && semFiltro) {
    const tokens = (run: ModeRun) => Math.round(avg(allTurns(run).map((t) => t.tokensMemoria)));
    const count = (run: ModeRun) => avg(allTurns(run).map((t) => t.memoriasUsadas.length)).toFixed(1);
    lines.push(
      "## Uso eficiente de contexto",
      "",
      `- Memória completa (com recuperação): em média **${count(completa)} memórias** e **~${tokens(completa)} tokens** de memória por mensagem.`,
      `- Memória sem filtro: em média **${count(semFiltro)} memórias** e **~${tokens(semFiltro)} tokens** de memória por mensagem.`,
      "",
    );
  }

  lines.push(...compressionSection(results));
  lines.push(...variability(results));
  lines.push(
    "## Evolução da memória (modo completa, execução 1)",
    "",
    "Memórias criadas nas conversas e memórias substituídas ao longo do tempo:",
    "",
    memoryEvolution(completa?.execucoes[0]),
    "",
  );

  lines.push("## Exemplos de interação multi-turno (execução 1)", "");
  for (const scenario of ACTIVE) {
    lines.push(`### Cenário ${scenario.id}: ${scenario.titulo}`, "");
    scenario.sessoes.forEach((session, index) => {
      lines.push(`_Atendimento ${index + 1} (${session.data.slice(0, 10)})_`, "");
      for (const turn of session.turnos) lines.push(turnDetails(results, turn.id));
    });
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
