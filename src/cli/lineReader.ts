import * as readline from "node:readline";
import type { Output } from "../types.ts";

/**
 * Leitor de linhas assíncrono baseado em fila.
 * Diferente de rl.question(), não perde linhas quando o usuário cola um texto de várias linhas
 * de uma só vez (necessário para colar documentos), e também funciona com stdin via pipe.
 */
export class LineReader {
  private readonly output: Output;
  private readonly rl: readline.Interface;
  private readonly queue: string[] = [];
  private readonly waiters: Array<(line: string | null) => void> = [];
  private closed = false;

  constructor(input: NodeJS.ReadableStream, output: Output) {
    this.output = output;
    this.rl = readline.createInterface({ input, terminal: false, crlfDelay: Infinity });

    this.rl.on("line", (line) => {
      const waiter = this.waiters.shift();
      if (waiter) waiter(line);
      else this.queue.push(line);
    });

    this.rl.on("close", () => {
      this.closed = true;
      for (const waiter of this.waiters.splice(0)) waiter(null);
    });
  }

  /** Próxima linha, ou null se a entrada terminou. */
  next(): Promise<string | null> {
    const queued = this.queue.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    if (this.closed) return Promise.resolve(null);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  async ask(prompt: string): Promise<string | null> {
    this.output.write(prompt);
    const line = await this.next();
    return line === null ? null : line.trim();
  }

  /** Lê várias linhas até uma linha contendo somente `terminator` (ou fim da entrada). */
  async readBlock(terminator: string): Promise<string> {
    const lines: string[] = [];
    while (true) {
      const line = await this.next();
      if (line === null || line.trim().toUpperCase() === terminator.toUpperCase()) break;
      lines.push(line);
    }
    return lines.join("\n");
  }

  close(): void {
    this.rl.close();
  }
}
