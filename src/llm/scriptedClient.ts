import type { Embedder, LlmClient, Message } from "../types.ts";
import { normalizeTerms } from "../memory/scoring.ts";

/** Resposta roteirizada: texto fixo, erro a lançar, ou função que decide a partir das mensagens. */
export type ScriptedReply = string | Error | ((messages: Message[]) => string);

export type ScriptedLlm = LlmClient & {
  streamCalls: Message[][];
  completeCalls: Message[][];
};

/** Classifica a chamada pelo prompt de sistema, para roteirizar cada etapa separadamente. */
export type CallKind = "critica" | "extracao" | "resumo" | "outro";

export function callKind(messages: Message[]): CallKind {
  const system = messages[0]?.content ?? "";
  if (system.includes("revisor rigoroso")) return "critica";
  if (system.includes("extrator de memórias")) return "extracao";
  if (system.includes("resumir atendimentos")) return "resumo";
  return "outro";
}

/**
 * LLM falso usado nos testes e na demo (sem chave de API).
 * - `streams`: respostas de geração, consumidas em ordem;
 * - `completes`: respostas por tipo de chamada (crítica, extração, resumo), consumidas em ordem.
 * Quando a fila acaba, devolve uma resposta neutra (crítica aprovada, nenhuma memória nova).
 */
export function createScriptedLlm(script: {
  streams?: ScriptedReply[];
  completes?: Partial<Record<CallKind, ScriptedReply[]>>;
}): ScriptedLlm {
  const streams = [...(script.streams ?? [])];
  const completes: Record<CallKind, ScriptedReply[]> = {
    critica: [...(script.completes?.critica ?? [])],
    extracao: [...(script.completes?.extracao ?? [])],
    resumo: [...(script.completes?.resumo ?? [])],
    outro: [...(script.completes?.outro ?? [])],
  };
  const defaults: Record<CallKind, string> = {
    critica: '{"approved": true, "issues": []}',
    extracao: '{"operacoes": []}',
    resumo: "Resumo do atendimento.",
    outro: "ok",
  };
  const streamCalls: Message[][] = [];
  const completeCalls: Message[][] = [];

  const resolve = (reply: ScriptedReply | undefined, messages: Message[], fallback: string): string => {
    if (reply === undefined) return fallback;
    if (reply instanceof Error) throw reply;
    return typeof reply === "function" ? reply(messages) : reply;
  };

  return {
    streamCalls,
    completeCalls,
    async stream(messages, onToken) {
      streamCalls.push(messages);
      const text = resolve(streams.shift(), messages, "resposta padrão");
      for (const piece of text.match(/.{1,8}/gs) ?? []) onToken(piece);
      return text;
    },
    async complete(messages) {
      completeCalls.push(messages);
      const kind = callKind(messages);
      return resolve(completes[kind].shift(), messages, defaults[kind]);
    },
  };
}

/**
 * Embedder local e determinístico (bag-of-words com hashing), sem chamadas externas.
 * Serve apenas para testes e demo: aproxima "textos com as mesmas palavras ficam próximos".
 */
export function createLocalEmbedder(dimensions = 256): Embedder {
  return {
    async embed(text) {
      const vector = new Array<number>(dimensions).fill(0);
      for (const term of normalizeTerms(text)) {
        let hash = 0;
        for (const char of term) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
        vector[hash % dimensions]! += 1;
      }
      return vector;
    },
  };
}

/** Embedder que sempre falha (simula a API de embeddings indisponível). */
export function createFailingEmbedder(error: Error): Embedder {
  return {
    async embed() {
      throw error;
    },
  };
}
