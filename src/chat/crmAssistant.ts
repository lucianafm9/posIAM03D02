import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { SETTINGS } from "../config/settings.ts";
import { validateInput } from "../guardrails/validateInput.ts";
import { validateOutput } from "../guardrails/validateOutput.ts";
import { ClientRepository } from "../memory/clientRepository.ts";
import { ContextWindow } from "../memory/contextWindow.ts";
import { estimateTextTokens, estimateTokens } from "../memory/estimateTokens.ts";
import { extractMemories, type ExtractionResult } from "../memory/extractMemories.ts";
import { maybeCompress, type CompressionResult } from "../memory/maybeCompress.ts";
import { MemoryRepository } from "../memory/memoryRepository.ts";
import { retrieveMemories, type RetrievalResult } from "../memory/retrieveMemories.ts";
import { SessionRepository, type Session } from "../memory/sessionRepository.ts";
import { buildMemoryBlock, formatMemoryLine, stitchContext } from "../memory/stitchContext.ts";
import { summarizeHistory } from "../memory/summarizeHistory.ts";
import type { Client, Embedder, LlmClient, Memory, MemoryMode, Message, Output } from "../types.ts";
import { describeError } from "../utils/errors.ts";
import { retryPolicy, type Sleep } from "../utils/retryPolicy.ts";
import { withRetry } from "../utils/withRetry.ts";
import { buildSystemPrompt } from "./buildPrompt.ts";
import { generateAnswer, type CritiqueOutcome } from "./generateAnswer.ts";

export type AssistantDeps = {
  llm: LlmClient;
  embedder: Embedder;
  db: DatabaseSync;
  out: Output;
  mode: MemoryMode;
  /** Autocrítica antes de entregar a resposta (padrão: ligada). */
  critique?: boolean;
  /** Mostra as memórias recuperadas, os scores e o tamanho do contexto a cada mensagem. */
  debug?: boolean;
  /** Relógio injetável (o experimento simula atendimentos em datas diferentes). */
  now?: () => Date;
  sleep?: Sleep;
  newId?: () => string;
  /** Texto escrito antes da resposta em streaming (ex.: "Assistente: " no CLI). */
  answerPrefix?: string;
  /** Sobrescreve o orçamento da memória curta (SETTINGS.shortTerm.maxTokens), usado no experimento de compressão. */
  shortTermMaxTokens?: number;
};

export type CompressionInfo = Pick<CompressionResult, "trigger" | "summarizedMessages" | "tokensBefore" | "tokensAfter">;

export type TurnStatus = "respondida" | "entrada_bloqueada" | "saida_bloqueada" | "erro";

export type TurnResult = {
  status: TurnStatus;
  answer: string | null;
  errors: string[];
  /** Memórias de longo prazo consideradas (null nos modos sem memória de longo prazo). */
  retrieval: RetrievalResult | null;
  memoryBlock: string | null;
  /** Tokens estimados de tudo o que foi enviado ao modelo na geração (sistema + contexto + mensagem). */
  contextTokens: number;
  /** Compressão da memória curta feita nesta mensagem (null se não houve). */
  compression: CompressionInfo | null;
  critique: CritiqueOutcome | null;
  extraction: ExtractionResult | null;
  extractionError: string | null;
};

/**
 * Orquestra um atendimento com memória. Por mensagem:
 *  1. guardrail de entrada;
 *  2. recupera a memória de longo prazo relevante do cliente (e os resumos de atendimentos anteriores);
 *  3. comprime a memória de curto prazo se passar do orçamento de tokens ou se a janela estiver cheia;
 *  4. costura o contexto e gera a resposta (streaming + autocrítica + retentativas);
 *  5. guardrail de saída;
 *  6. grava a interação (pergunta + resposta juntas) e extrai/atualiza memórias de longo prazo.
 * Qualquer falha antes do passo 6 deixa histórico e memória intactos.
 */
export class CrmAssistant {
  readonly mode: MemoryMode;
  readonly clients: ClientRepository;
  readonly sessions: SessionRepository;
  readonly memories: MemoryRepository;
  debug: boolean;

  private readonly deps: AssistantDeps;
  private readonly window = new ContextWindow(SETTINGS.shortTerm.maxTurns);
  private client: Client | null = null;
  private session: Session | null = null;
  private compressedSummary: string | null = null;
  private sessionMessages = 0;

  constructor(deps: AssistantDeps) {
    this.deps = deps;
    this.mode = deps.mode;
    this.debug = deps.debug ?? false;
    this.clients = new ClientRepository(deps.db);
    this.sessions = new SessionRepository(deps.db);
    this.memories = new MemoryRepository(deps.db);
  }

  get usesLongTerm(): boolean {
    return this.mode === "completa" || this.mode === "sem_filtro";
  }

  get usesShortTerm(): boolean {
    return this.mode !== "sem_memoria";
  }

  get currentClient(): Client | null {
    return this.client;
  }

  get currentSession(): Session | null {
    return this.session;
  }

  /**
   * Abre um atendimento novo ou retoma um anterior (restaurando o histórico de mensagens da sessão).
   * Retorna quantas mensagens foram restauradas na janela.
   */
  startSession(clientId: string, resumeSessionId?: string): number {
    const client = this.clients.find(clientId);
    if (!client) throw new Error(`Cliente não encontrado: ${clientId}`);
    this.client = client;
    this.window.clear();
    this.compressedSummary = null;
    this.sessionMessages = 0;

    if (resumeSessionId) {
      const session = this.sessions.find(resumeSessionId);
      if (!session || session.clientId !== clientId) throw new Error(`Atendimento não encontrado: ${resumeSessionId}`);
      this.session = session;
      const messages = this.sessions.loadMessages(session.id);
      this.sessionMessages = messages.length;
      this.compressedSummary = session.compressedSummary;
      const pending = messages.slice(session.compressedUpto);
      pending.forEach((message) => this.window.restore(message));
      return this.window.size;
    }

    this.session = this.sessions.create(this.newId(), clientId, this.nowIso());
    return 0;
  }

  async handle(message: string): Promise<TurnResult> {
    const { client, session } = this.requireSession();
    const out = this.deps.out;
    const result: TurnResult = {
      status: "respondida",
      answer: null,
      errors: [],
      retrieval: null,
      memoryBlock: null,
      contextTokens: 0,
      compression: null,
      critique: null,
      extraction: null,
      extractionError: null,
    };

    // 1. Guardrail de entrada: nada é enviado ao modelo nem gravado.
    const input = validateInput(message);
    if (!input.isValid) {
      out.write(`[Entrada bloqueada] ${input.errors.join(" ")}\n`);
      return { ...result, status: "entrada_bloqueada", errors: input.errors };
    }

    // 2. Memória de longo prazo (só do cliente atual).
    if (this.usesLongTerm) {
      result.retrieval = await this.retrieve(client, message);
      const pastSessions = this.sessions.recentSummaries(client.id, SETTINGS.episodic.lastSessions, session.id);
      result.memoryBlock = buildMemoryBlock({
        client,
        memories: result.retrieval.selected.map((item) => item.memory),
        pastSessions,
      });
    }

    // 3. Memória de curto prazo (com compressão por resumo).
    let recent: Message[] = [];
    if (this.usesShortTerm) {
      result.compression = await this.compressIfNeeded();
      recent = this.window.getMessages();
    }

    // 4. Contexto costurado + geração.
    const today = this.nowIso().slice(0, 10);
    const systemPrompt = buildSystemPrompt({ client, withMemory: this.usesLongTerm, today });
    const context = stitchContext({
      memoryBlock: result.memoryBlock,
      sessionSummary: this.usesShortTerm ? this.compressedSummary : null,
      recentMessages: recent,
    });
    result.contextTokens = estimateTokens([{ role: "system", content: systemPrompt }, ...context, { role: "user", content: message }]);
    if (this.debug) this.printDebug(result, recent.length);

    let answer: string;
    out.write(this.deps.answerPrefix ?? "");
    try {
      const generated = await generateAnswer({
        llm: this.deps.llm,
        systemPrompt,
        context,
        question: message,
        memoryForReview: result.memoryBlock,
        out,
        critique: this.deps.critique ?? true,
        ...(this.deps.sleep ? { sleep: this.deps.sleep } : {}),
      });
      answer = generated.text;
      result.critique = generated.critique;
    } catch (error) {
      const reason = describeError(error);
      out.write(`\n[Erro] ${reason}\nA mensagem não foi registrada no histórico nem na memória. Tente novamente.\n`);
      return { ...result, status: "erro", errors: [reason] };
    }

    // 5. Guardrail de saída: resposta reprovada não entra no histórico nem vira memória.
    // Nomes de outros clientes que o próprio usuário citou podem aparecer (ex.: numa recusa educada);
    // os demais indicariam vazamento. A proteção principal é a recuperação filtrada por cliente.
    const otherClients = this.clients
      .list()
      .filter((c) => c.id !== client.id && !message.toLowerCase().includes(c.name.toLowerCase()))
      .map((c) => c.name);
    const output = validateOutput(answer, otherClients);
    if (!output.isValid) {
      out.write(
        `[Guardrail de saída] Resposta descartada: ${output.errors.join(" ")} ` +
          "Ela não foi registrada no histórico nem na memória. Reformule a pergunta ou fale com o time de Customer Success.\n",
      );
      return { ...result, status: "saida_bloqueada", answer, errors: output.errors };
    }
    result.answer = answer;

    // 6. Persistência da interação + atualização da memória de longo prazo.
    this.sessions.saveTurn(session.id, message, answer, this.nowIso());
    this.window.addUserMessage(message);
    this.window.addAssistantMessage(answer);
    this.sessionMessages += 2;

    if (this.usesLongTerm) {
      try {
        result.extraction = await this.extract(client, session, message, answer);
      } catch (error) {
        result.extractionError = describeError(error);
        out.write(`[Memória não atualizada nesta interação (${result.extractionError}). O atendimento segue normalmente.]\n`);
      }
    }

    return result;
  }

  /** Encerra o atendimento; nos modos com memória de longo prazo, salva o resumo (memória episódica). */
  async endSession(): Promise<string | null> {
    if (!this.session) return null;
    const session = this.session;
    let summary: string | null = null;

    if (this.usesLongTerm && this.sessionMessages > 0) {
      try {
        const messages = this.sessions.loadMessages(session.id);
        summary = await withRetry(
          () => summarizeHistory(this.deps.llm, messages),
          retryPolicy(this.deps.out, "Falha no resumo do atendimento", this.deps.sleep),
        );
        this.deps.out.write("[Memória: resumo do atendimento salvo para os próximos contatos.]\n");
      } catch (error) {
        this.deps.out.write(
          `[Resumo do atendimento indisponível (${describeError(error)}). As memórias extraídas a cada mensagem continuam salvas.]\n`,
        );
      }
    }

    this.sessions.close(session.id, this.nowIso(), summary);
    this.session = null;
    return summary;
  }

  listMemories(): Memory[] {
    const { client } = this.requireSession();
    return this.memories.listActive(client.id);
  }

  forgetMemory(id: number): boolean {
    const { client } = this.requireSession();
    return this.memories.forget(client.id, id, this.nowIso());
  }

  private async retrieve(client: Client, message: string): Promise<RetrievalResult> {
    const active = this.memories.listActive(client.id);

    if (this.mode === "sem_filtro") {
      // Uso excessivo (para comparação): todas as memórias ativas, sem corte de relevância nem orçamento.
      const selected = active.map((memory) => ({ memory, score: 1, semantic: 0, keyword: 0, reason: "relevante" as const }));
      const tokens = active.reduce((sum, memory) => sum + estimateTextTokens(formatMemoryLine(memory)), 0);
      return { selected, discarded: [], tokens, degraded: false };
    }

    // Consulta contextual: mensagens curtas de continuidade ("pode ser o mesmo modelo") dependem da
    // mensagem anterior do cliente para achar as memórias certas.
    const previousUser = this.window.getMessages().filter((m) => m.role === "user").at(-1)?.content;
    const query = previousUser ? `${previousUser}\n${message}` : message;

    return retrieveMemories({
      memories: active,
      query,
      currentMessage: message,
      embed: (text) => withRetry(() => this.deps.embedder.embed(text), retryPolicy(this.deps.out, "Falha na busca semântica", this.deps.sleep)),
      onDegraded: (error) =>
        this.deps.out.write(`[Memória: busca semântica indisponível (${describeError(error)}). Usando só palavras-chave.]\n`),
    });
  }

  private async compressIfNeeded(): Promise<CompressionInfo | null> {
    const session = this.session!;
    try {
      const compression = await maybeCompress({
        window: this.window,
        previousSummary: this.compressedSummary,
        maxTokens: this.deps.shortTermMaxTokens ?? SETTINGS.shortTerm.maxTokens,
        maxMessages: SETTINGS.shortTerm.maxTurns * 2,
        summarize: (messages) =>
          withRetry(() => summarizeHistory(this.deps.llm, messages), retryPolicy(this.deps.out, "Falha na compressão", this.deps.sleep)),
      });
      if (!compression.compressed) return null;

      this.compressedSummary = compression.summary;
      // Quantas mensagens do atendimento (desde o início) já estão cobertas pelo resumo: na retomada,
      // só as posteriores voltam para a janela.
      this.sessions.saveCompression(session.id, compression.summary!, this.sessionMessages - this.window.size);
      if (this.debug) {
        const reason = compression.trigger === "tokens" ? "passou do orçamento de tokens" : "janela cheia";
        this.deps.out.write(
          `[Memória curta comprimida (${reason}): ${compression.summarizedMessages} mensagens resumidas, ` +
            `~${compression.tokensBefore} -> ~${compression.tokensAfter} tokens]
`,
        );
      }
      const { trigger, summarizedMessages, tokensBefore, tokensAfter } = compression;
      return { trigger, summarizedMessages, tokensBefore, tokensAfter };
    } catch (error) {
      this.deps.out.write(`[Compressão indisponível (${describeError(error)}). Seguindo só com a janela deslizante.]
`);
      return null;
    }
  }

  private async extract(client: Client, session: Session, question: string, answer: string): Promise<ExtractionResult> {
    const out = this.deps.out;
    const extraction = await extractMemories({
      complete: (messages) =>
        withRetry(
          () => this.deps.llm.complete(messages, { json: true, temperature: 0 }),
          retryPolicy(out, "Falha na extração de memória", this.deps.sleep),
        ),
      repo: this.memories,
      clientId: client.id,
      clientName: client.name,
      sessionId: session.id,
      now: this.nowIso(),
      question,
      answer,
      maxExisting: SETTINGS.longTerm.maxExistingForExtraction,
      embed: async (text) => {
        try {
          return await withRetry(() => this.deps.embedder.embed(text), retryPolicy(out, "Falha no embedding", this.deps.sleep));
        } catch {
          return null; // gravada sem embedding; completada depois (ensureEmbeddings)
        }
      },
    });

    for (const item of extraction.applied) {
      if (item.replaced) {
        out.write(`[Memória atualizada] M${item.replaced.id} -> M${item.memory.id} (${item.memory.type}): ${item.memory.content}\n`);
      } else {
        out.write(`[Memória registrada] M${item.memory.id} (${item.memory.type}): ${item.memory.content}\n`);
      }
    }
    for (const item of extraction.rejected) {
      out.write(`[Memória rejeitada pelo guardrail] ${item.errors.join(" ")}\n`);
    }
    return extraction;
  }

  private printDebug(result: TurnResult, recentCount: number): void {
    const out = this.deps.out;
    out.write(`[debug] modo=${this.mode} | contexto ~${result.contextTokens} tokens | mensagens recentes: ${recentCount}`);
    out.write(this.compressedSummary ? " | com resumo do atendimento\n" : "\n");
    if (!result.retrieval) return;
    const { selected, discarded, tokens, degraded } = result.retrieval;
    out.write(`[debug] memória de longo prazo: ${selected.length} selecionada(s), ~${tokens} tokens${degraded ? " (só palavras-chave)" : ""}\n`);
    for (const item of selected) {
      out.write(`[debug]   + M${item.memory.id} ${item.reason} score=${item.score.toFixed(2)} ${item.memory.content.slice(0, 70)}\n`);
    }
    for (const item of discarded.slice(0, 3)) {
      out.write(`[debug]   - M${item.memory.id} descartada score=${item.score.toFixed(2)} ${item.memory.content.slice(0, 70)}\n`);
    }
  }

  private requireSession(): { client: Client; session: Session } {
    if (!this.client || !this.session) throw new Error("Nenhum atendimento aberto. Chame startSession() antes.");
    return { client: this.client, session: this.session };
  }

  private nowIso(): string {
    return (this.deps.now?.() ?? new Date()).toISOString();
  }

  private newId(): string {
    return this.deps.newId?.() ?? randomUUID();
  }
}
