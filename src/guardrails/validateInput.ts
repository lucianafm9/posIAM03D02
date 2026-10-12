import { SETTINGS } from "../config/settings.ts";
import type { ValidationResult } from "../types.ts";
import { findSensitiveData } from "./sensitiveData.ts";

/** Tentativas de manipular o assistente ou de ler a memória de outro cliente. */
const INJECTION_SIGNALS = [
  /ignore (todas )?(as )?(suas )?instru[cç][oõ]es/i,
  /(mostre|revele|exiba) (o )?(seu )?(prompt|system prompt|instru[cç][oõ]es)/i,
  /(apague|esque[cç]a) (toda a|todas as) mem[oó]ria/i,
];

/**
 * Guardrail de entrada. Uma mensagem reprovada não é enviada ao modelo nem gravada
 * no histórico ou na memória (dado sensível nunca chega ao banco).
 */
export function validateInput(input: string, maxLength: number = SETTINGS.limits.maxMessageChars): ValidationResult {
  const errors: string[] = [];

  if (!input || input.trim() === "") {
    errors.push("A mensagem não pode ser vazia.");
  }

  if (input.length > maxLength) {
    errors.push(`A mensagem tem ${input.length} caracteres; o máximo é ${maxLength}.`);
  }

  const sensitive = findSensitiveData(input);
  if (sensitive.length > 0) {
    errors.push(
      `A mensagem parece conter dado sensível (${sensitive.join(", ")}). Por segurança, não envie esse tipo de informação por aqui.`,
    );
  }

  if (INJECTION_SIGNALS.some((re) => re.test(input))) {
    errors.push("A mensagem tenta alterar as regras do assistente e não pode ser processada.");
  }

  return { isValid: errors.length === 0, errors };
}
