import type { LlmClient } from "../types.ts";
import type { ScenarioTurn } from "./scenarios.ts";

export type JudgeVerdict = {
  /** 1 a 5: qualidade e personalização da resposta em relação ao gabarito. */
  nota: number;
  usoMemoria: "correto" | "ausente" | "incorreto" | "nao_aplicavel";
  usoIrrelevante: boolean;
  inconsistente: boolean;
  justificativa: string;
};

export const JUDGE_PROMPT = [
  "Você é um avaliador imparcial de um assistente de relacionamento com clientes B2B.",
  "Recebe o GABARITO (o que a empresa sabe sobre o cliente e qual seria a resposta ideal), a MENSAGEM do cliente e a RESPOSTA do assistente.",
  "Avalie apenas a RESPOSTA, comparando com o gabarito:",
  "- nota (1 a 5): 5 = ideal e personalizada; 4 = boa, com falha menor; 3 = genérica ou incompleta; 2 = pede ao cliente informação que a empresa já tinha ou erra o contexto; 1 = errada, inventada ou indevida.",
  "- uso_memoria: correto (usa o histórico relevante corretamente), ausente (deveria usar e não usou), incorreto (usa fato errado, inventado ou desatualizado), nao_aplicavel (a resposta ideal não depende do histórico).",
  "- uso_irrelevante: true se a resposta cita fatos do cliente sem relação com a mensagem.",
  "- inconsistente: true se contradiz o histórico vigente (ex.: usa uma preferência que já foi substituída) ou dados de outro cliente.",
  'Responda SOMENTE com JSON: {"nota": number, "uso_memoria": string, "uso_irrelevante": boolean, "inconsistente": boolean, "justificativa": string (até 2 frases)}.',
].join("\n");

export async function judge(llm: LlmClient, turn: ScenarioTurn, answer: string): Promise<JudgeVerdict> {
  const raw = await llm.complete(
    [
      { role: "system", content: JUDGE_PROMPT },
      {
        role: "user",
        content:
          `<gabarito>\n${turn.gabarito}\nUso de memória esperado: ${turn.memoriaEsperada}\n</gabarito>\n\n` +
          `<mensagem>\n${turn.mensagem}\n</mensagem>\n\n<resposta>\n${answer}\n</resposta>`,
      },
    ],
    { json: true, temperature: 0 },
  );

  const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim()) as Record<string, unknown>;
  const usos = ["correto", "ausente", "incorreto", "nao_aplicavel"] as const;
  const usoMemoria = usos.find((u) => u === parsed.uso_memoria) ?? "incorreto";
  return {
    nota: Math.min(5, Math.max(1, Number(parsed.nota) || 1)),
    usoMemoria,
    usoIrrelevante: parsed.uso_irrelevante === true,
    inconsistente: parsed.inconsistente === true,
    justificativa: String(parsed.justificativa ?? ""),
  };
}
