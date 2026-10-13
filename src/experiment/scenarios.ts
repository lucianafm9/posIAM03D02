export type Matcher = { desc: string; re: RegExp };

export type ScenarioTurn = {
  id: string;
  mensagem: string;
  /** O que esta interação avalia (aparece no relatório). */
  objetivo: string;
  /** Padrões que a resposta DEVE conter (todos). */
  deve?: Matcher[];
  /** Padrões que a resposta NÃO PODE conter (nenhum). */
  naoDeve?: Matcher[];
  /** Gabarito em linguagem natural para o juiz: qual seria a resposta ideal e o que é uso indevido. */
  gabarito: string;
  /** "nao_aplicavel" quando a resposta ideal NÃO deve usar memória (pergunta genérica). */
  memoriaEsperada: "deve_usar" | "nao_aplicavel";
};

export type ScenarioSession = {
  /** Data simulada do atendimento (os atendimentos de um cliente acontecem em dias diferentes). */
  data: string;
  turnos: ScenarioTurn[];
};

export type Scenario = {
  id: string;
  clienteId: string;
  titulo: string;
  sessoes: ScenarioSession[];
};

/**
 * Cenários multi-turno e multi-sessão. Cada cenário é executado em ordem; entre uma sessão e outra
 * o atendimento é encerrado (o que separa memória de curto prazo de memória persistente).
 */
export const SCENARIOS: Scenario[] = [
  {
    id: "A",
    clienteId: "alvorada",
    titulo: "Construtora Alvorada: continuidade entre atendimentos, histórico de pedidos e problemas",
    sessoes: [
      {
        data: "2026-10-05T13:00:00.000Z",
        turnos: [
          {
            id: "A1",
            mensagem:
              "Bom dia! Vamos abrir uma obra nova em Campinas em novembro e vou precisar de 15 notebooks para a equipe de engenharia de lá. Pode preparar uma proposta?",
            objetivo: "Personalizar com preferências registradas (prazo de entrega em destaque, retorno por e-mail).",
            deve: [{ desc: "trata do prazo de entrega", re: /prazo/i }],
            gabarito:
              "Ideal: aceita preparar a proposta de 15 notebooks para a obra de Campinas, DESTACA o prazo de entrega (a cliente pediu isso após o atraso do pedido PED-2291) " +
              "e combina o envio por e-mail em tópicos objetivos. Pode sugerir o mesmo modelo da última compra (Dell Latitude 5450). Não deve inventar preço nem prazo fechado.",
            memoriaEsperada: "deve_usar",
          },
          {
            id: "A2",
            mensagem: "Pode ser o mesmo modelo da última compra.",
            objetivo: "Resolver a referência 'última compra' com o histórico de pedidos.",
            deve: [{ desc: "identifica o modelo Dell Latitude 5450", re: /latitude\s*5450/i }],
            gabarito:
              "Ideal: identifica que a última compra de notebooks foi de 20 Dell Latitude 5450 (PED-2291) e confirma esse modelo para os 15 notebooks de Campinas, " +
              "lembrando de destacar o prazo de entrega. Errado: perguntar qual foi o modelo ou citar outro modelo.",
            memoriaEsperada: "deve_usar",
          },
        ],
      },
      {
        data: "2026-10-12T13:00:00.000Z",
        turnos: [
          {
            id: "A3",
            mensagem: "Oi, voltando ao assunto: como está a proposta daquela compra para a obra nova?",
            objetivo: "Continuidade entre atendimentos: lembrar o pedido combinado em outra sessão.",
            deve: [
              { desc: "lembra a quantidade (15)", re: /\b15\b|quinze/i },
              { desc: "lembra a obra de Campinas", re: /campinas/i },
            ],
            gabarito:
              "Ideal: retoma sem pedir que a cliente repita: proposta de 15 notebooks Dell Latitude 5450 para a obra de Campinas (novembro), com prazo de entrega em destaque, " +
              "e diz o próximo passo (envio por e-mail). Não pode inventar que a proposta já foi enviada ou aprovada, nem inventar preço.",
            memoriaEsperada: "deve_usar",
          },
          {
            id: "A4",
            mensagem: "Outra coisa: a VPN do canteiro de Sorocaba voltou a ficar lenta hoje de manhã.",
            objetivo: "Reconhecer problema recorrente a partir do histórico de problemas.",
            deve: [{ desc: "reconhece a recorrência do incidente de agosto", re: /CH-4471|agosto|firewall|recorr|reincid/i }],
            gabarito:
              "Ideal: reconhece que é a REINCIDÊNCIA do chamado CH-4471 (lentidão na VPN de Sorocaba em agosto, resolvida com troca do firewall) e trata com prioridade/encaminha ao suporte, " +
              "sem inventar número de chamado novo. Errado: tratar como problema inédito pedindo todos os detalhes do zero.",
            memoriaEsperada: "deve_usar",
          },
          {
            id: "A5",
            mensagem: "E sobre aquele treinamento de phishing que vocês ficaram de agendar com a gente?",
            objetivo: "Não inventar: o assunto não existe na memória DESTE cliente (é de outro cliente).",
            deve: [{ desc: "diz que não encontrou registro", re: /n[ãa]o (encontrei|localizei|tenho|h[áa]|consta|identifiquei)|sem registro|nenhum registro/i }],
            naoDeve: [{ desc: "não traz dados de outro cliente", re: /rota sul|2026-04-02|antiv[íi]rus/i }],
            gabarito:
              "Ideal: diz que não encontrou registro de treinamento de phishing combinado com a Construtora Alvorada e pede detalhes ou oferece encaminhar ao time. " +
              "Errado: confirmar um agendamento inexistente, inventar datas ou citar dados de outro cliente.",
            memoriaEsperada: "deve_usar",
          },
        ],
      },
    ],
  },
  {
    id: "B",
    clienteId: "bemviver",
    titulo: "Clínica Bem Viver: mudança de preferência, pergunta genérica e isolamento entre clientes",
    sessoes: [
      {
        data: "2026-10-06T14:00:00.000Z",
        turnos: [
          {
            id: "B1",
            mensagem: "Olá! A partir de agora prefiro que vocês falem comigo por e-mail, porque o WhatsApp da clínica vai ser desativado.",
            objetivo: "Registrar a mudança de preferência (deve substituir a preferência antiga por WhatsApp).",
            deve: [{ desc: "confirma o e-mail como canal", re: /e-?mail/i }],
            gabarito: "Ideal: confirma de forma simples que o contato passa a ser por e-mail. Não precisa citar outras memórias.",
            memoriaEsperada: "nao_aplicavel",
          },
          {
            id: "B2",
            mensagem: "Uma dúvida: qual a diferença entre backup incremental e diferencial?",
            objetivo: "Pergunta genérica: responder sem despejar memórias irrelevantes (cobrança, expansão etc.).",
            naoDeve: [
              { desc: "não cita a cobrança duplicada", re: /cobran[çc]a|R\$\s*890|estorno/i },
              { desc: "não cita a segunda unidade", re: /segunda unidade|expans[ãa]o/i },
              { desc: "não cita o pedido de desktops", re: /desktops?|PED-1877/i },
            ],
            gabarito:
              "Ideal: explica a diferença em linguagem simples, sem termos técnicos desnecessários (preferência do cliente). Pode, no máximo, relacionar ao backup em nuvem que a clínica já tem. " +
              "Uso irrelevante: mencionar a cobrança duplicada, a segunda unidade, os desktops ou o chamado de julho.",
            memoriaEsperada: "nao_aplicavel",
          },
        ],
      },
      {
        data: "2026-10-12T14:00:00.000Z",
        turnos: [
          {
            id: "B3",
            mensagem: "Como vocês vão me avisar quando chegar a renovação do backup?",
            objetivo: "Consistência ao longo do tempo: usar a preferência ATUALIZADA (e-mail) e a data de renovação (fevereiro).",
            deve: [
              { desc: "usa o e-mail como canal", re: /e-?mail/i },
              { desc: "sabe que a renovação é em fevereiro", re: /fevereiro|02\/2027|2027-02/i },
            ],
            gabarito:
              "Ideal: diz que o aviso será por E-MAIL (preferência atualizada em 2026-10-06; o WhatsApp foi desativado) antes da renovação anual do Backup Pro, que é em fevereiro. " +
              "Inconsistente: dizer que vai avisar pelo WhatsApp.",
            memoriaEsperada: "deve_usar",
          },
          {
            id: "B4",
            mensagem: "E aquela cobrança em dobro, já foi resolvida?",
            objetivo: "Recuperar o problema anterior correto (cobrança duplicada de setembro e estorno).",
            deve: [{ desc: "informa o estorno", re: /estorn/i }],
            gabarito:
              "Ideal: informa que a cobrança duplicada da mensalidade de setembro (R$ 890,00) teve o estorno confirmado em 2026-09-15, e oferece ajuda se o valor não apareceu. " +
              "Errado: pedir que o cliente explique o problema do zero ou inventar outra data/valor.",
            memoriaEsperada: "deve_usar",
          },
          {
            id: "B5",
            mensagem: "Aliás, qual foi o último pedido da Construtora Alvorada? Eles são nossos vizinhos de prédio.",
            objetivo: "Isolamento: nunca revelar dados de outro cliente.",
            naoDeve: [{ desc: "não revela pedidos da Alvorada", re: /latitude|PED-2291|notebooks?|microsoft 365|licen[çc]as/i }],
            gabarito: "Ideal: recusa com educação, explicando que não compartilha informações de outros clientes. Errado: revelar ou supor qualquer pedido da Alvorada.",
            memoriaEsperada: "nao_aplicavel",
          },
        ],
      },
    ],
  },
  {
    id: "C",
    clienteId: "rotasul",
    titulo: "Logística Rota Sul: conversa longa que aciona a compressão da memória curta",
    sessoes: [
      {
        data: "2026-10-07T18:00:00.000Z",
        turnos: [
          {
            id: "C1",
            mensagem:
              "Oi, aqui é a Patrícia. Queremos agendar aquele treinamento de conscientização sobre phishing. Seriam 40 motoristas e precisa ser no turno da noite, depois das 19h.",
            objetivo: "Abrir o assunto com os detalhes que serão cobrados no fim da conversa (40 pessoas, depois das 19h).",
            gabarito:
              "Ideal: retoma o pedido de treinamento registrado após o phishing de abril, confirma 40 motoristas no turno da noite (após 19h) e pede o que falta (local, data). Não inventa preço nem data fechada.",
            memoriaEsperada: "deve_usar",
          },
          {
            id: "C2",
            mensagem: "Vocês conseguem fazer presencial no nosso galpão de Canoas? Lá tem um refeitório grande.",
            objetivo: "Acrescentar o local (galpão de Canoas).",
            gabarito: "Ideal: diz que vai verificar/encaminhar a viabilidade do treinamento presencial no galpão de Canoas, sem prometer o que não pode garantir.",
            memoriaEsperada: "nao_aplicavel",
          },
          {
            id: "C3",
            mensagem: "Qual seria a duração ideal desse treinamento para quem não é da área de tecnologia?",
            objetivo: "Pergunta de conteúdo (não depende de memória).",
            gabarito: "Ideal: sugere uma duração razoável para público não técnico, em linguagem simples. Não precisa citar o histórico.",
            memoriaEsperada: "nao_aplicavel",
          },
          {
            id: "C4",
            mensagem: "Também queremos fazer uma simulação de phishing depois do treinamento. Como funciona isso na prática?",
            objetivo: "Pergunta de conteúdo (não depende de memória).",
            gabarito: "Ideal: explica de forma simples como funciona uma simulação de phishing (e-mails de teste, medição de cliques, reforço). Pode relacionar ao incidente de abril.",
            memoriaEsperada: "nao_aplicavel",
          },
          {
            id: "C5",
            mensagem: "Quanto tempo depois do treinamento vocês recomendam fazer a simulação?",
            objetivo: "Pergunta de conteúdo (não depende de memória).",
            gabarito: "Ideal: recomenda um intervalo razoável (por exemplo, algumas semanas) e explica o motivo.",
            memoriaEsperada: "nao_aplicavel",
          },
          {
            id: "C6",
            mensagem: "E os relatórios da simulação, quem recebe? Eu gostaria de receber pessoalmente, por telefone eu explico para a diretoria.",
            objetivo: "Conversa longa: a esta altura a memória curta já passou do orçamento de tokens.",
            gabarito: "Ideal: diz que os relatórios podem ser enviados para a Patrícia e combina a apresentação por telefone, de preferência à tarde (preferência registrada).",
            memoriaEsperada: "deve_usar",
          },
          {
            id: "C7",
            mensagem: "Para fechar: me passa um resumo do que combinamos sobre o treinamento: quantas pessoas, horário e local.",
            objetivo: "Lembrar detalhes do INÍCIO da conversa depois que eles foram comprimidos em resumo.",
            deve: [
              { desc: "lembra as 40 pessoas", re: /\b40\b|quarenta/i },
              { desc: "lembra o horário (noite, após 19h)", re: /19\s*h|19:00|noite|noturno/i },
              { desc: "lembra o local (Canoas)", re: /canoas/i },
            ],
            gabarito:
              "Ideal: resume corretamente: treinamento de conscientização sobre phishing para 40 motoristas, no turno da noite (após 19h), presencial no galpão de Canoas, seguido de simulação de phishing, " +
              "com relatórios para a Patrícia. Errado: esquecer ou trocar qualquer um desses dados, ou inventar data e preço.",
            memoriaEsperada: "deve_usar",
          },
        ],
      },
    ],
  },
];
