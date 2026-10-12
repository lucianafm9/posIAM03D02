import OpenAI from "openai";
import { SETTINGS } from "../config/settings.ts";
import type { Embedder, LlmClient } from "../types.ts";

const DEFAULT_TEMPERATURE = 0.2;

function createSdk(apiKey: string): OpenAI {
  // maxRetries: 0 — as retentativas são controladas por withRetry (backoff visível ao usuário).
  return new OpenAI({ apiKey, maxRetries: 0, timeout: SETTINGS.requestTimeoutMs });
}

export function createOpenAiClient(apiKey: string, model: string): LlmClient {
  const client = createSdk(apiKey);

  return {
    async complete(messages, options = {}) {
      const response = await client.chat.completions.create({
        model,
        messages,
        temperature: options.temperature ?? DEFAULT_TEMPERATURE,
        ...(options.json ? { response_format: { type: "json_object" as const } } : {}),
      });
      return response.choices[0]?.message?.content ?? "";
    },

    async stream(messages, onToken) {
      const stream = await client.chat.completions.create({
        model,
        messages,
        temperature: DEFAULT_TEMPERATURE,
        stream: true,
      });

      let full = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          onToken(delta);
          full += delta;
        }
      }
      return full;
    },
  };
}

export function createOpenAiEmbedder(apiKey: string, model: string = SETTINGS.embeddingModel): Embedder {
  const client = createSdk(apiKey);

  return {
    async embed(text) {
      const response = await client.embeddings.create({ model, input: text });
      const embedding = response.data[0]?.embedding;
      if (!embedding) throw new Error("A API não retornou o embedding.");
      return embedding;
    },
  };
}

/** Lê a chave do ambiente; o placeholder do .env.example conta como ausente. */
export function readApiKey(): string | undefined {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  return apiKey && apiKey !== "OPENAI_API_KEY" ? apiKey : undefined;
}
