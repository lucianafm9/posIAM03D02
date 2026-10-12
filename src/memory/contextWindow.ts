import type { Message } from "../types.ts";

/**
 * Memória de curto prazo: a conversa do atendimento atual.
 * Mensagens do usuário e do assistente entram por métodos separados (papéis distintos no contexto)
 * e a janela deslizante mantém só as últimas `maxTurns` interações (pergunta + resposta).
 */
export class ContextWindow {
  private history: Message[] = [];
  private readonly maxTurns: number;

  constructor(maxTurns: number) {
    this.maxTurns = maxTurns;
  }

  addUserMessage(content: string): Message {
    return this.push({ role: "user", content });
  }

  addAssistantMessage(content: string): Message {
    return this.push({ role: "assistant", content });
  }

  /** Recoloca na janela uma mensagem já persistida (retomada de um atendimento). */
  restore(message: Message): void {
    this.push(message);
  }

  getMessages(): Message[] {
    return [...this.history];
  }

  get size(): number {
    return this.history.length;
  }

  clear(): void {
    this.history = [];
  }

  private push(message: Message): Message {
    this.history.push(message);
    const limit = this.maxTurns * 2;
    if (this.history.length > limit) {
      this.history = this.history.slice(-limit);
    }
    return message;
  }
}
