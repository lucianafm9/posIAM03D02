import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeError, EmptyResponseError, isRetryableError } from "../src/utils/errors.ts";
import { withRetry } from "../src/utils/withRetry.ts";
import { HttpError, noSleep } from "./helpers.ts";

const options = { maxAttempts: 3, baseDelayMs: 1_000, maxDelayMs: 8_000, sleep: noSleep };

describe("withRetry", () => {
  it("repete erros temporários e devolve o primeiro sucesso", async () => {
    let calls = 0;
    const delays: number[] = [];
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new HttpError(429);
        return "ok";
      },
      { ...options, onRetry: ({ delayMs }) => delays.push(delayMs) },
    );
    assert.equal(result, "ok");
    assert.equal(calls, 3);
    assert.ok(delays[0]! >= 1_000 && delays[0]! <= 1_200, "1ª espera ~1s (+ jitter de até 20%)");
    assert.ok(delays[1]! >= 2_000 && delays[1]! <= 2_400, "2ª espera ~2s");
  });

  it("não repete erro permanente (401)", async () => {
    let calls = 0;
    await assert.rejects(
      withRetry(async () => {
        calls++;
        throw new HttpError(401);
      }, options),
    );
    assert.equal(calls, 1);
  });

  it("desiste após o máximo de tentativas", async () => {
    let calls = 0;
    await assert.rejects(
      withRetry(async () => {
        calls++;
        throw new HttpError(503);
      }, options),
    );
    assert.equal(calls, 3);
  });
});

describe("classificação e mensagens de erro", () => {
  it("separa erros retentáveis dos permanentes", () => {
    for (const status of [408, 409, 429, 500, 503]) assert.equal(isRetryableError(new HttpError(status)), true);
    for (const status of [400, 401, 403, 404]) assert.equal(isRetryableError(new HttpError(status)), false);
    assert.equal(isRetryableError(new EmptyResponseError()), true);
    assert.equal(isRetryableError(Object.assign(new Error("x"), { code: "ECONNRESET" })), true);
  });

  it("traduz o erro para o usuário", () => {
    assert.match(describeError(new HttpError(401)), /OPENAI_API_KEY/);
    assert.match(describeError(new HttpError(429)), /Limite/);
    assert.match(describeError(new HttpError(503)), /instável/);
  });
});
