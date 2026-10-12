import type { CrmAssistant } from "../chat/crmAssistant.ts";
import { SETTINGS } from "../config/settings.ts";
import { formatMemoryLine } from "../memory/stitchContext.ts";
import type { Client, Output } from "../types.ts";
import type { LineReader } from "./lineReader.ts";

export type CliDeps = {
  assistant: CrmAssistant;
  reader: LineReader;
  out: Output;
};

const HELP = [
  "Comandos:",
  "  /memoria          mostra o que o assistente lembra deste cliente",
  "  /esquecer <id>    esquece uma memória (ex.: /esquecer 12)",
  "  /debug            liga/desliga o detalhe da recuperação (memórias, scores e tokens)",
  "  /ajuda            mostra esta ajuda",
  `  ${SETTINGS.exitWords[0]}              encerra o atendimento (e salva o resumo dele na memória)`,
].join("\n");

function isExitWord(value: string): boolean {
  return (SETTINGS.exitWords as readonly string[]).includes(value.trim().toLowerCase());
}

async function chooseClient({ assistant, reader, out }: CliDeps): Promise<Client | null> {
  const clients = assistant.clients.list();
  out.write("\nClientes:\n");
  clients.forEach((client, index) => out.write(`  ${index + 1} - ${client.name} (${client.contactName}, ${client.contactRole})\n`));

  while (true) {
    const answer = await reader.ask("Escolha o cliente (número): ");
    if (answer === null || isExitWord(answer)) return null;
    const client = clients[Number.parseInt(answer, 10) - 1];
    if (client) return client;
    out.write(`  Opção inválida. Digite um número de 1 a ${clients.length}.\n`);
  }
}

/** Oferece retomar o último atendimento (restaura o histórico de mensagens da sessão). */
async function chooseSession({ assistant, reader, out }: CliDeps, client: Client): Promise<string | undefined | null> {
  const last = assistant.sessions.findLast(client.id);
  if (!last) return undefined;

  const state = last.endedAt ? "encerrado" : "em aberto";
  const answer = await reader.ask(
    `Último atendimento: ${last.startedAt.slice(0, 10)} (${last.messageCount} mensagens, ${state}). ` +
      "Retomar esse atendimento? (s = retomar | Enter = novo atendimento): ",
  );
  if (answer === null || isExitWord(answer)) return null;
  return answer.toLowerCase().startsWith("s") ? last.id : undefined;
}

function handleCommand({ assistant, out }: CliDeps, command: string): void {
  const [name, arg] = command.split(/\s+/, 2);

  if (name === "/memoria") {
    const memories = assistant.listMemories();
    out.write(memories.length === 0 ? "Nenhuma memória ativa.\n" : `${memories.map(formatMemoryLine).join("\n")}\n`);
  } else if (name === "/esquecer") {
    const id = Number.parseInt((arg ?? "").replace(/^M/i, ""), 10);
    if (Number.isNaN(id)) out.write("Informe o número da memória, ex.: /esquecer 12\n");
    else out.write(assistant.forgetMemory(id) ? `Memória M${id} esquecida.\n` : `Memória M${id} não encontrada para este cliente.\n`);
  } else if (name === "/debug") {
    assistant.debug = !assistant.debug;
    out.write(`Detalhe da recuperação ${assistant.debug ? "ligado" : "desligado"}.\n`);
  } else {
    out.write(`${HELP}\n`);
  }
}

export async function runCli(deps: CliDeps): Promise<void> {
  const { assistant, reader, out } = deps;
  out.write("=== NexoTech | Assistente de CRM com memória de cliente ===\n");
  out.write(`Modo de memória: ${assistant.mode}. Digite "${SETTINGS.exitWords[0]}" a qualquer momento para encerrar.\n`);

  const client = await chooseClient(deps);
  if (!client) return void out.write("\nAté logo!\n");
  const resumeId = await chooseSession(deps, client);
  if (resumeId === null) return void out.write("\nAté logo!\n");

  const restored = assistant.startSession(client.id, resumeId);
  out.write(
    restored > 0
      ? `\nAtendimento retomado com ${client.name}: ${restored} mensagens restauradas no contexto.\n`
      : `\nNovo atendimento com ${client.name} (${client.contactName}).\n`,
  );
  out.write(`${HELP}\n`);

  while (true) {
    const message = await reader.ask("\nVocê: ");
    if (message === null || isExitWord(message)) break;
    if (message.startsWith("/")) {
      handleCommand(deps, message);
      continue;
    }
    await assistant.handle(message);
  }

  out.write("\nEncerrando o atendimento...\n");
  await assistant.endSession();
  out.write("Até logo!\n");
}
