import { SETTINGS } from "../config/settings.ts";
import type { Message } from "../types.ts";

/** Estimativa aproximada (sem tokenizer): 1 token ≈ 3 caracteres em português. */
export function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / SETTINGS.charsPerToken);
}

export function estimateTokens(messages: Message[]): number {
  return messages.reduce((total, message) => total + estimateTextTokens(message.content), 0);
}
