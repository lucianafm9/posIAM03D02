import type { MemoryMode } from "../types.ts";
import type { ExperimentResults, ModeRun, TurnRecord } from "./runExperiment.ts";
import { SCENARIOS } from "./scenarios.ts";

const MODE_LABEL: Record<MemoryMode, string> = {
  sem_memoria: "Sem memória (stateless)",
  curta: "Só memória curta (sessão)",
  completa: "Memória completa (proposta)",
  sem_filtro: "Memória sem filtro (excesso)",
};

const avg = (values: number[]) => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length);
const pct = (part: number, total: number) => `${total === 0 ? 0 : Math.round((part / total) * 100)}%`;
const oneLine = (text: string | null) => (text ?? "(sem resposta)").replace(/\s*\n\s*/g, " ").replace(/\|/g, "/");
const quote = (text: string | null) =>
  (text ?? "(sem resposta)")
    .trim()
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

function summaryRow(run: ModeRun): string {
  const t = run.turnos;
  const judged = t.filter((x) => x.juiz);
  const aprovados = t.filter((x) => x.aprovado).length;
  const usoCorreto = judged.filter((x) => x.juiz!.usoMemoria === "correto").length;
  const ausente = judged.filter((x) => x.juiz!.usoMemoria === "ausente").length;
  const irrelevante = judged.filter((x) => x.juiz!.usoIrrelevante).length;
  const inconsistente = judged.filter((x) => x.juiz!.inconsistente || x.juiz!.usoMemoria === "incorreto").length;
  const checksOk = t.filter((x) => x.checks.every((c) => c.ok)).length;
  return [
    MODE_LABEL[run.modo],
    `**${aprovados}/${t.length} (${pct(aprovados, t.length)})**`,
    avg(judged.map((x) => x.juiz!.nota)).toFixed(2),
    `${checksOk}/${t.length}`,
    `${usoCorreto}`,
    `${ausente}`,
    `${irrelevante}`,
    `${inconsistente}`,
    Math.round(avg(t.map((x) => x.tokensContexto))).toString(),
    avg(t.map((x) => x.memoriasUsadas.length)).toFixed(1),
  ].join(" | ");
}

function cell(record: TurnRecord | undefined): string {
  if (!record) return "-";
  const icon = record.aprovado ? "✅" : "❌";
  return `${icon} ${record.juiz ? record.juiz.nota : "-"}`;
}

function turnDetails(results: ExperimentResults, turnId: string): string {
  const byMode = new Map(results.modos.map((run) => [run.modo, run.turnos.find((t) => t.turno === turnId)]));
  const turn = SCENARIOS.flatMap((s) => s.sessoes.flatMap((ss) => ss.turnos)).find((t) => t.id === turnId)!;
  const lines: string[] = [`#### ${turnId}: ${turn.objetivo}`, "", `**Cliente:** ${turn.mensagem}`, ""];

  for (const run of results.modos) {
    const record = byMode.get(run.modo);
    if (!record) continue;
    const failed = record.checks.filter((c) => !c.ok).map((c) => (c.tipo === "deve" ? `faltou: ${c.desc}` : `violou: ${c.desc}`));
    lines.push(
      `**${MODE_LABEL[run.modo]}** — ${record.aprovado ? "✅ aprovado" : "❌ reprovado"}` +
        (record.juiz ? ` (nota ${record.juiz.nota}, memória: ${record.juiz.usoMemoria}${record.juiz.usoIrrelevante ? ", uso irrelevante" : ""}${record.juiz.inconsistente ? ", inconsistente" : ""})` : "") +
        ` · contexto ~${record.tokensContexto} tokens`,
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
        ...record.memoriasGravadas.map(
          (m) => `- ${m.acao} M${m.id}${m.substituiu ? ` (substitui M${m.substituiu})` : ""} (${m.tipo}): ${m.conteudo}`,
        ),
        "",
      );
    }
  }
  return lines.join("\n");
}

function memoryEvolution(run: ModeRun | undefined): string {
  if (!run) return "_Modo completa não executado._";
  const lines: string[] = [];
  for (const [clientId, memories] of Object.entries(run.memoriaFinal)) {
    const relevant = memories.filter((m) => m.source === "conversa" || m.status !== "ativa");
    if (relevant.length === 0) continue;
    lines.push(`**${clientId}**`, "", "| Id | Tipo | Origem | Status | Substitui | Data | Conteúdo |", "|---|---|---|---|---|---|---|");
    for (const m of relevant) {
      lines.push(
        `| M${m.id} | ${m.type} | ${m.source} | ${m.status} | ${m.supersedes ? `M${m.supersedes}` : "-"} | ${m.createdAt.slice(0, 10)} | ${oneLine(m.content)} |`,
      );
    }
    lines.push("");
  }
  return lines.join("\n") || "_Nenhuma memória nova ou substituída._";
}

export function buildReport(results: ExperimentResults): string {
  const turnIds = SCENARIOS.flatMap((s) => s.sessoes.flatMap((ss) => ss.turnos.map((t) => t.id)));
  const completa = results.modos.find((r) => r.modo === "completa");
  const semFiltro = results.modos.find((r) => r.modo === "sem_filtro");

  const lines: string[] = [
    "# Relatório do experimento: com memória x sem memória",
    "",
    `Gerado em ${results.geradoEm} · modelo \`${results.modelo}\` · juiz \`${results.modeloJuiz}\` · embeddings \`${results.modeloEmbedding}\` · autocrítica ${results.autocritica ? "ligada" : "desligada"}.`,
    "",
    "Arquivo gerado por `npm run experiment` (dados completos em `experimento.json`). Cada modo roda os mesmos cenários,",
    "com o mesmo banco inicial (CRM de exemplo) e as mesmas datas simuladas. Um turno é **aprovado** quando passa nas",
    "checagens objetivas (regex) e o juiz dá nota >= 4, sem uso irrelevante, sem inconsistência e sem deixar de usar a memória quando deveria.",
    "",
    "## Resumo por modo",
    "",
    "| Modo | Aprovação | Nota média (1-5) | Checagens ok | Memória usada corretamente | Memória ausente | Uso irrelevante | Inconsistência | Tokens de contexto (média) | Memórias injetadas (média) |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...results.modos.map((run) => `| ${summaryRow(run)} |`),
    "",
    "## Resultado por interação",
    "",
    `| Turno | Objetivo | ${results.modos.map((r) => MODE_LABEL[r.modo]).join(" | ")} |`,
    `|---|---|${results.modos.map(() => "---").join("|")}|`,
    ...turnIds.map((id) => {
      const turn = SCENARIOS.flatMap((s) => s.sessoes.flatMap((ss) => ss.turnos)).find((t) => t.id === id)!;
      return `| ${id} | ${turn.objetivo} | ${results.modos.map((r) => cell(r.turnos.find((t) => t.turno === id))).join(" | ")} |`;
    }),
    "",
  ];

  if (completa && semFiltro) {
    const tokens = (run: ModeRun) => Math.round(avg(run.turnos.map((t) => t.tokensMemoria)));
    lines.push(
      "## Uso eficiente de contexto",
      "",
      `- Memória completa (com recuperação): em média **${avg(completa.turnos.map((t) => t.memoriasUsadas.length)).toFixed(1)} memórias** e **~${tokens(completa)} tokens** de memória por mensagem.`,
      `- Memória sem filtro: em média **${avg(semFiltro.turnos.map((t) => t.memoriasUsadas.length)).toFixed(1)} memórias** e **~${tokens(semFiltro)} tokens** de memória por mensagem.`,
      "",
    );
  }

  lines.push("## Evolução da memória (modo completa)", "", "Memórias criadas nas conversas e memórias substituídas ao longo do tempo:", "", memoryEvolution(completa), "");

  lines.push("## Exemplos de interação multi-turno", "");
  for (const scenario of SCENARIOS) {
    lines.push(`### Cenário ${scenario.id}: ${scenario.titulo}`, "");
    scenario.sessoes.forEach((session, index) => {
      lines.push(`_Atendimento ${index + 1} (${session.data.slice(0, 10)})_`, "");
      for (const turn of session.turnos) lines.push(turnDetails(results, turn.id));
    });
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
