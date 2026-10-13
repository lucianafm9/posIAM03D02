import type { Importance, MemoryType } from "../types.ts";
import type { Matcher } from "./scenarios.ts";

/** Operação de memória que um extrator correto produziria nesta interação (gabarito da simulação). */
export type SimulatedOperation =
  | { acao: "ADICIONAR"; tipo: MemoryType; conteudo: string; importancia: Importance }
  | { acao: "ATUALIZAR"; substitui: RegExp; tipo: MemoryType; conteudo: string; importancia: Importance };

export type ContextSpec = {
  /** Fatos que PRECISAM chegar ao contexto do modelo para ele conseguir responder bem. */
  necessario?: Matcher[];
  /** Fatos que NÃO deveriam estar no contexto (memória irrelevante, desatualizada ou de outro cliente). */
  ruido?: Matcher[];
  /** O que o extrator de memória registraria depois desta interação. */
  extracao?: SimulatedOperation[];
};

const IRRELEVANTE_ALVORADA: Matcher = { desc: "memória irrelevante (evento de 2025)", re: /palestra sobre backup/i };

/**
 * Gabarito da avaliação de contexto (npm run simulate). Para cada turno dos cenários:
 * o que precisa estar no contexto, o que seria ruído e o que deveria virar memória.
 */
export const CONTEXT_SPEC: Record<string, ContextSpec> = {
  A1: {
    necessario: [
      { desc: "preferência: prazo de entrega em destaque", re: /destaque o prazo de entrega/i },
      { desc: "preferência: retorno por e-mail", re: /propostas e retornos por e-mail/i },
      { desc: "última compra: Dell Latitude 5450", re: /Latitude 5450/i },
    ],
    ruido: [IRRELEVANTE_ALVORADA, { desc: "chamado de VPN (sem relação)", re: /CH-4471/ }],
    extracao: [
      {
        acao: "ADICIONAR",
        tipo: "pedido",
        conteudo: "Pediu proposta de 15 notebooks para a equipe de engenharia da obra nova de Campinas, com início em novembro de 2026.",
        importancia: 2,
      },
    ],
  },
  A2: {
    necessario: [{ desc: "modelo da última compra: Dell Latitude 5450", re: /Latitude 5450/i }],
    ruido: [IRRELEVANTE_ALVORADA],
    extracao: [
      {
        acao: "ATUALIZAR",
        substitui: /15 notebooks/i,
        tipo: "pedido",
        conteudo: "Pediu proposta de 15 notebooks Dell Latitude 5450 (mesmo modelo do PED-2291) para a obra nova de Campinas, com início em novembro de 2026.",
        importancia: 2,
      },
    ],
  },
  A3: {
    necessario: [
      { desc: "pedido combinado na sessão anterior: 15 notebooks", re: /15 notebooks/i },
      { desc: "obra de Campinas", re: /Campinas/i },
    ],
    ruido: [IRRELEVANTE_ALVORADA],
  },
  A4: {
    necessario: [{ desc: "incidente anterior: chamado CH-4471", re: /CH-4471/ }],
    ruido: [IRRELEVANTE_ALVORADA, { desc: "licenças (sem relação)", re: /Microsoft 365/i }],
  },
  A5: {
    ruido: [{ desc: "dados de outro cliente (Rota Sul)", re: /Rota Sul|phishing contido|antiv[íi]rus/i }],
  },
  B1: {
    extracao: [
      {
        acao: "ATUALIZAR",
        substitui: /WhatsApp/i,
        tipo: "preferencia",
        conteudo: "Prefere contato por e-mail e linguagem simples, sem termos técnicos; o WhatsApp da clínica foi desativado em 2026-10-06.",
        importancia: 3,
      },
    ],
  },
  B2: {
    ruido: [
      { desc: "cobrança duplicada (sem relação)", re: /cobran[çc]a duplicada|R\$\s*890/i },
      { desc: "segunda unidade (sem relação)", re: /segunda unidade/i },
      { desc: "desktops (sem relação)", re: /PED-1877/ },
    ],
  },
  B3: {
    necessario: [
      { desc: "preferência atualizada: e-mail", re: /Prefere contato por e-mail/i },
      { desc: "renovação em fevereiro", re: /renova[çc][ãa]o anual em fevereiro/i },
    ],
    ruido: [{ desc: "preferência desatualizada (WhatsApp)", re: /Prefere contato por WhatsApp/i }],
  },
  B4: {
    necessario: [{ desc: "cobrança duplicada e estorno", re: /estorno/i }],
    ruido: [{ desc: "segunda unidade (sem relação)", re: /segunda unidade/i }],
  },
  B5: {
    ruido: [{ desc: "dados da Construtora Alvorada", re: /Latitude|PED-2291|Microsoft 365/i }],
  },
  C1: {
    necessario: [{ desc: "pedido de treinamento após o phishing de abril", re: /treinamento de conscientiza/i }],
    extracao: [
      {
        acao: "ADICIONAR",
        tipo: "pedido",
        conteudo: "Quer agendar treinamento de conscientização sobre phishing para 40 motoristas, no turno da noite (após 19h).",
        importancia: 2,
      },
    ],
  },
  C2: {
    extracao: [
      {
        acao: "ATUALIZAR",
        substitui: /40 motoristas/i,
        tipo: "pedido",
        conteudo: "Quer treinamento de conscientização sobre phishing para 40 motoristas, no turno da noite (após 19h), presencial no galpão de Canoas.",
        importancia: 2,
      },
    ],
  },
  C4: {
    extracao: [
      { acao: "ADICIONAR", tipo: "pedido", conteudo: "Quer uma simulação de phishing depois do treinamento.", importancia: 2 },
    ],
  },
  C6: {
    necessario: [{ desc: "preferência: telefone à tarde", re: /ligações telefônicas/i }],
  },
  C7: {
    necessario: [
      { desc: "40 pessoas (dito no início)", re: /\b40\b/ },
      { desc: "turno da noite, após 19h (dito no início)", re: /19h/i },
      { desc: "galpão de Canoas (dito no início)", re: /Canoas/i },
    ],
  },
};
