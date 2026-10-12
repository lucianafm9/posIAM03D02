import type { ValidationResult } from "../types.ts";
import { findSensitiveData } from "./sensitiveData.ts";

/** Promessas que o assistente não tem autoridade para fazer (sinal de resposta inventada). */
const RISKY_PROMISES = [/garanto que/i, /garantimos 100%/i, /desconto (já )?(está )?aprovado/i, /sem nenhum custo adicional, garantido/i];

/**
 * Guardrail de saída. Uma resposta reprovada não entra no histórico nem gera memórias,
 * para que um erro pontual não contamine os atendimentos seguintes.
 */
export function validateOutput(response: string, otherClientNames: string[] = []): ValidationResult {
  const errors: string[] = [];

  if (response.trim() === "") {
    errors.push("A resposta veio vazia.");
  }

  const leaked = otherClientNames.filter((name) => response.toLowerCase().includes(name.toLowerCase()));
  if (leaked.length > 0) {
    errors.push(`A resposta cita outro cliente (${leaked.join(", ")}).`);
  }

  const sensitive = findSensitiveData(response);
  if (sensitive.length > 0) {
    errors.push(`A resposta contém dado sensível (${sensitive.join(", ")}).`);
  }

  if (RISKY_PROMISES.some((re) => re.test(response))) {
    errors.push("A resposta faz uma promessa que o assistente não pode garantir.");
  }

  return { isValid: errors.length === 0, errors };
}
