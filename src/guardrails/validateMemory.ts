import { SETTINGS } from "../config/settings.ts";
import { MEMORY_TYPES, type ValidationResult } from "../types.ts";
import { findSensitiveData } from "./sensitiveData.ts";

/** Guardrail da memória: só fatos curtos, de tipo conhecido e sem dado sensível são gravados. */
export function validateMemory(candidate: { type: unknown; content: unknown; importance: unknown }): ValidationResult {
  const errors: string[] = [];
  const content = typeof candidate.content === "string" ? candidate.content.trim() : "";

  if (!MEMORY_TYPES.includes(candidate.type as (typeof MEMORY_TYPES)[number])) {
    errors.push(`Tipo de memória inválido: ${String(candidate.type)}.`);
  }
  if (content === "") {
    errors.push("Memória vazia.");
  }
  if (content.length > SETTINGS.limits.maxMemoryChars) {
    errors.push(`Memória longa demais (${content.length} caracteres).`);
  }
  if (![1, 2, 3].includes(candidate.importance as number)) {
    errors.push(`Importância inválida: ${String(candidate.importance)}.`);
  }
  const sensitive = findSensitiveData(content);
  if (sensitive.length > 0) {
    errors.push(`Memória com dado sensível (${sensitive.join(", ")}).`);
  }

  return { isValid: errors.length === 0, errors };
}
