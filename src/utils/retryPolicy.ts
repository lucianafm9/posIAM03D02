import { SETTINGS } from "../config/settings.ts";
import type { Output } from "../types.ts";
import { describeError } from "./errors.ts";
import type { RetryInfo, RetryOptions } from "./withRetry.ts";

export type Sleep = (ms: number) => Promise<void>;

/**
 * Política de retentativa padrão (SETTINGS.retry) que avisa o usuário a cada nova tentativa, ex.:
 * [Falha na geração: Limite de requisições ... Nova tentativa 2/3 em 1.1s...]
 */
export function retryPolicy(out: Output, label: string, sleep?: Sleep, beforeNotice?: () => string): RetryOptions {
  const { maxAttempts, baseDelayMs, maxDelayMs } = SETTINGS.retry;
  return {
    maxAttempts,
    baseDelayMs,
    maxDelayMs,
    ...(sleep ? { sleep } : {}),
    onRetry: ({ attempt, maxAttempts: max, delayMs, error }: RetryInfo) => {
      out.write(
        `${beforeNotice?.() ?? ""}[${label}: ${describeError(error)} Nova tentativa ${attempt + 1}/${max} em ${(delayMs / 1000).toFixed(1)}s...]\n`,
      );
    },
  };
}
