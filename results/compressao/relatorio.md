# Relatório do experimento: com memória x sem memória

Gerado em 2026-10-13T02:41:16.892Z · modelo `gpt-4o-mini` · juiz `gpt-4o-mini` · embeddings `text-embedding-3-small` · 3 execução(ões) por modo · autocrítica desligada · orçamento da memória curta 500 tokens · cenários C.

Arquivo gerado por `npm run experiment` (dados completos em `experimento.json`). Cada execução roda os mesmos cenários,
com o mesmo banco inicial (CRM de exemplo) e as mesmas datas simuladas. Um turno é **aprovado** quando passa nas
checagens objetivas (regex) e o juiz dá nota >= 4, sem uso irrelevante, sem inconsistência e sem deixar de usar a memória quando deveria.

## Resumo por modo

| Modo | Aprovação (todas as execuções) | Aprovados por execução | Nota média (1-5) | Checagens ok | Memória usada corretamente | Memória ausente | Uso irrelevante | Inconsistência | Tokens de contexto (média) | Memórias injetadas (média) |
|---|---|---|---|---|---|---|---|---|---|---|
| Só memória curta (sessão) | **17/21 (81%)** | 5 · 7 · 5 | 4.38 | 21/21 | 5 | 2 | 0 | 2 | 831 | 0.0 |
| Memória completa (proposta) | **17/21 (81%)** | 6 · 5 · 6 | 4.29 | 21/21 | 6 | 0 | 0 | 3 | 1353 | 3.5 |

## Resultado por interação

Cada célula mostra em quantas execuções o turno foi aprovado e a nota média do juiz (✅ todas, ⚠️ algumas, ❌ nenhuma).

| Turno | Objetivo | Só memória curta (sessão) | Memória completa (proposta) |
|---|---|---|---|
| C1 | Abrir o assunto com os detalhes que serão cobrados no fim da conversa (40 pessoas, depois das 19h). | ⚠️ 1/3 · 4.3 | ⚠️ 1/3 · 4.0 |
| C2 | Acrescentar o local (galpão de Canoas). | ✅ 3/3 · 4.3 | ⚠️ 2/3 · 3.7 |
| C3 | Pergunta de conteúdo (não depende de memória). | ✅ 3/3 · 5.0 | ✅ 3/3 · 4.7 |
| C4 | Pergunta de conteúdo (não depende de memória). | ✅ 3/3 · 5.0 | ✅ 3/3 · 4.7 |
| C5 | Pergunta de conteúdo (não depende de memória). | ✅ 3/3 · 5.0 | ✅ 3/3 · 5.0 |
| C6 | Conversa longa: a esta altura a memória curta já passou do orçamento de tokens. | ⚠️ 1/3 · 3.0 | ⚠️ 2/3 · 3.7 |
| C7 | Lembrar detalhes do INÍCIO da conversa depois que eles foram comprimidos em resumo. | ✅ 3/3 · 4.0 | ✅ 3/3 · 4.3 |

## Compressão da memória curta (cenário C)

O cenário C é uma conversa longa de um único atendimento. Os detalhes pedidos no fim (C7) aparecem no início (C1 e C2).
A tabela mostra os tokens de contexto enviados ao modelo em cada mensagem (execução 1). ⚡ marca a mensagem antes da qual
a metade antiga da conversa foi resumida. Entre parênteses, em quantas execuções houve compressão naquele ponto.

| Modo | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C7 aprovado |
|---|---|---|---|---|---|---|---|---|
| Só memória curta (sessão) | 485 | 617 | 762 | 914 | ⚡ 1097 (3/3) | ⚡ 1111 (3/3) | ⚡ 996 (3/3) | ✅ 3/3 · 4.0 |
| Memória completa (proposta) | 923 | 1107 | 1202 | 1387 | ⚡ 1590 (3/3) | ⚡ 1593 (3/3) | ⚡ 1494 (3/3) | ✅ 3/3 · 4.3 |

Em média, cada compressão reduziu a memória curta para **75%** do tamanho anterior (18 compressões em todas as execuções; gatilhos: tokens).

## Variação entre execuções

Turnos com resultado diferente entre as execuções: C1 (Só memória curta (sessão): 1/3); C6 (Só memória curta (sessão): 1/3); C1 (Memória completa (proposta): 1/3); C2 (Memória completa (proposta): 2/3); C6 (Memória completa (proposta): 2/3).

## Evolução da memória (modo completa, execução 1)

Memórias criadas nas conversas e memórias substituídas ao longo do tempo:

**rotasul**

| Id | Tipo | Origem | Status | Substitui | Data | Conteúdo |
|---|---|---|---|---|---|---|
| M18 | pedido | conversa | substituida | - | 2026-10-07 | Agendou treinamento de conscientização sobre phishing para 40 motoristas no turno da noite, após as 19h. |
| M19 | preferencia | conversa | ativa | M18 | 2026-10-07 | Cliente prefere que o treinamento de conscientização sobre phishing seja realizado presencialmente no galpão de Canoas, que possui um refeitório grande. |
| M20 | pedido | conversa | ativa | - | 2026-10-07 | Cliente deseja realizar uma simulação de phishing após o treinamento de conscientização. |
| M21 | preferencia | conversa | ativa | - | 2026-10-07 | Cliente deseja receber os relatórios da simulação de phishing pessoalmente e explicar os resultados para a diretoria por telefone. |
| M22 | pedido | conversa | ativa | - | 2026-10-07 | Cliente deseja realizar o treinamento de conscientização sobre phishing para 40 motoristas no galpão de Canoas, preferencialmente no turno da noite. |


## Exemplos de interação multi-turno (execução 1)

### Cenário C: Logística Rota Sul: conversa longa que aciona a compressão da memória curta

_Atendimento 1 (2026-10-07)_

#### C1: Abrir o assunto com os detalhes que serão cobrados no fim da conversa (40 pessoas, depois das 19h).

**Cliente:** Oi, aqui é a Patrícia. Queremos agendar aquele treinamento de conscientização sobre phishing. Seriam 40 motoristas e precisa ser no turno da noite, depois das 19h.

**Só memória curta (sessão)** — ❌ reprovado (nota 4, memória: incorreto) · contexto ~485 tokens

> Olá, Patrícia! Agradeço pelo contato. Para agendar o treinamento de conscientização sobre phishing para os 40 motoristas no turno da noite, preciso encaminhar sua solicitação ao time responsável. 
> 
> Por favor, poderia me informar a data desejada para o treinamento? Assim, poderei facilitar o agendamento.

Juiz: _A resposta é boa, mas poderia ter mencionado o pedido de treinamento registrado anteriormente. A solicitação de data é adequada, mas a falta de referência ao histórico diminui a personalização._

**Memória completa (proposta)** — ❌ reprovado (nota 4, memória: incorreto) · contexto ~923 tokens

> Oi, Patrícia! Vamos agendar o treinamento de conscientização sobre phishing para os 40 motoristas no turno da noite, após as 19h. Vou encaminhar essa solicitação ao time responsável para verificar a disponibilidade e os detalhes. 
> 
> Assim que tiver uma resposta, entro em contato. Se precisar de mais alguma coisa, é só avisar!

Juiz: _A resposta é boa e confirma os detalhes do treinamento, mas não retoma o histórico do pedido registrado após o phishing de abril nem solicita informações adicionais como local e data._

Memórias injetadas (2 de 3 ativas, ~75 tokens):

- M16 (preferencia, essencial, score 0.28): Prefere ligações telefônicas, no período da tarde.
- M17 (problema, relevante, score 0.42): Em 2026-04-02 sofreu um ataque de phishing contido; pediu um treinamento de conscientização para a equipe.

Memória gravada após a resposta:

- ADICIONAR M18 (pedido): Agendou treinamento de conscientização sobre phishing para 40 motoristas no turno da noite, após as 19h.

#### C2: Acrescentar o local (galpão de Canoas).

**Cliente:** Vocês conseguem fazer presencial no nosso galpão de Canoas? Lá tem um refeitório grande.

**Só memória curta (sessão)** — ✅ aprovado (nota 5, memória: nao_aplicavel) · contexto ~617 tokens

> Entendi, Patrícia. Vou verificar a possibilidade de realizar o treinamento presencial no galpão de Canoas, considerando que há um refeitório grande disponível. 
> 
> Vou encaminhar essa informação junto com a solicitação de agendamento ao time responsável. Assim que tiver uma resposta, entrarei em contato. Se precisar de mais alguma coisa, é só avisar!

Juiz: _A resposta é ideal, pois confirma que o assistente irá verificar a viabilidade do treinamento presencial no galpão de Canoas, sem prometer resultados. Além disso, menciona a informação do refeitório de forma relevante._

**Memória completa (proposta)** — ✅ aprovado (nota 4, memória: nao_aplicavel) · contexto ~1107 tokens

> Não encontrei registro sobre a localização do treinamento. Vou verificar com o time se é possível realizar o treinamento presencial no galpão de Canoas, considerando o espaço do refeitório. 
> 
> Assim que tiver uma resposta, te informo. Se precisar de mais alguma coisa, estou à disposição!

Juiz: _A resposta é boa e demonstra a intenção de verificar a viabilidade do treinamento, mas menciona a falta de registro sobre a localização, o que não é necessário. A menção ao refeitório é irrelevante para a resposta._

Memórias injetadas (3 de 4 ativas, ~120 tokens):

- M16 (preferencia, essencial, score 0.26): Prefere ligações telefônicas, no período da tarde.
- M18 (pedido, relevante, score 0.62): Agendou treinamento de conscientização sobre phishing para 40 motoristas no turno da noite, após as 19h.
- M17 (problema, relevante, score 0.38): Em 2026-04-02 sofreu um ataque de phishing contido; pediu um treinamento de conscientização para a equipe.

Memória gravada após a resposta:

- ATUALIZAR M19 (substitui M18) (preferencia): Cliente prefere que o treinamento de conscientização sobre phishing seja realizado presencialmente no galpão de Canoas, que possui um refeitório grande.

#### C3: Pergunta de conteúdo (não depende de memória).

**Cliente:** Qual seria a duração ideal desse treinamento para quem não é da área de tecnologia?

**Só memória curta (sessão)** — ✅ aprovado (nota 5, memória: nao_aplicavel) · contexto ~762 tokens

> Para um treinamento de conscientização sobre phishing voltado para pessoas que não são da área de tecnologia, a duração ideal costuma ser de 1 a 2 horas. Isso permite cobrir os conceitos básicos, apresentar exemplos práticos e realizar uma sessão de perguntas e respostas.
> 
> Se precisar de mais informações ou quiser ajustar a duração, estou à disposição!

Juiz: _A resposta sugere uma duração razoável e utiliza linguagem simples, adequada para o público não técnico. Além disso, oferece disponibilidade para mais informações, o que é positivo._

**Memória completa (proposta)** — ✅ aprovado (nota 5, memória: nao_aplicavel) · contexto ~1202 tokens

> Para um público que não é da área de tecnologia, a duração ideal do treinamento de conscientização sobre phishing costuma ser de 1 a 2 horas. Isso permite cobrir os conceitos básicos, exemplos práticos e interações sem ser cansativo. 
> 
> Se precisar de mais informações ou quiser ajustar a duração, é só me avisar!

Juiz: _A resposta sugere uma duração razoável e utiliza linguagem simples, atendendo perfeitamente à solicitação do cliente._

Memórias injetadas (2 de 4 ativas, ~92 tokens):

- M16 (preferencia, essencial, score 0.22): Prefere ligações telefônicas, no período da tarde.
- M19 (preferencia, relevante, score 0.58): Cliente prefere que o treinamento de conscientização sobre phishing seja realizado presencialmente no galpão de Canoas, que possui um refeitório grande.

#### C4: Pergunta de conteúdo (não depende de memória).

**Cliente:** Também queremos fazer uma simulação de phishing depois do treinamento. Como funciona isso na prática?

**Só memória curta (sessão)** — ✅ aprovado (nota 5, memória: nao_aplicavel) · contexto ~914 tokens

> A simulação de phishing geralmente envolve o envio de e-mails fictícios que imitam tentativas de phishing, com o objetivo de avaliar a capacidade dos colaboradores de identificar essas ameaças. Após o treinamento, a simulação pode ser realizada da seguinte forma:
> 
> 1. **Criação do e-mail simulado**: Um e-mail é elaborado com características comuns de phishing.
> 2. **Envio aos participantes**: O e-mail é enviado aos motoristas, sem aviso prévio.
> 3. **Monitoramento das respostas**: É possível acompanhar quantos clicaram no link ou forneceram informações.
> 4. **Feedback**: Após a simulação, é importante fornecer feedback aos participantes, destacando os erros e reforçando as boas práticas.
> 
> Se precisar de mais detalhes ou quiser incluir isso no agendamento, posso encaminhar ao time responsável.

Juiz: _A resposta explica de forma clara e detalhada como funciona uma simulação de phishing, abordando todos os pontos relevantes. Além disso, oferece suporte adicional ao cliente, o que demonstra um bom atendimento._

**Memória completa (proposta)** — ✅ aprovado (nota 5, memória: nao_aplicavel) · contexto ~1387 tokens

> A simulação de phishing geralmente envolve o envio de e-mails ou mensagens que imitam tentativas reais de phishing, com o objetivo de avaliar a capacidade da equipe de identificar essas ameaças. Após o treinamento, a simulação pode incluir:
> 
> 1. **Envio de e-mails simulados**: Mensagens que parecem legítimas, mas que contêm links ou solicitações suspeitas.
> 2. **Avaliação de respostas**: Monitoramento de quantos colaboradores clicaram nos links ou forneceram informações.
> 3. **Feedback e aprendizado**: Após a simulação, é importante discutir os resultados com a equipe, reforçando os pontos aprendidos no treinamento.
> 
> Se precisar de mais detalhes ou quiser incluir isso no agendamento, me avise!

Juiz: _A resposta explica de forma clara e simples como funciona uma simulação de phishing, abordando os pontos relevantes e seguindo a estrutura ideal. Não há uso de informações irrelevantes ou inconsistentes._

Memórias injetadas (3 de 4 ativas, ~138 tokens):

- M16 (preferencia, essencial, score 0.20): Prefere ligações telefônicas, no período da tarde.
- M19 (preferencia, relevante, score 0.52): Cliente prefere que o treinamento de conscientização sobre phishing seja realizado presencialmente no galpão de Canoas, que possui um refeitório grande.
- M17 (problema, relevante, score 0.50): Em 2026-04-02 sofreu um ataque de phishing contido; pediu um treinamento de conscientização para a equipe.

Memória gravada após a resposta:

- ADICIONAR M20 (pedido): Cliente deseja realizar uma simulação de phishing após o treinamento de conscientização.

#### C5: Pergunta de conteúdo (não depende de memória).

**Cliente:** Quanto tempo depois do treinamento vocês recomendam fazer a simulação?

**Só memória curta (sessão)** — ✅ aprovado (nota 5, memória: nao_aplicavel) · contexto ~1097 tokens · ⚡ compressão antes desta mensagem (4 mensagens resumidas, ~751 → ~609 tokens)

> Recomenda-se realizar a simulação de phishing entre 1 a 2 semanas após o treinamento. Esse intervalo permite que os participantes absorvam o conteúdo aprendido e estejam mais atentos às práticas de segurança. Além disso, isso ajuda a avaliar a eficácia do treinamento.
> 
> Se precisar de mais informações ou quiser discutir isso com o time responsável, estou à disposição!

Juiz: _A resposta é ideal, pois recomenda um intervalo razoável e explica claramente o motivo para essa recomendação. Além disso, oferece disponibilidade para mais informações, o que demonstra atenção ao cliente._

**Memória completa (proposta)** — ✅ aprovado (nota 5, memória: nao_aplicavel) · contexto ~1590 tokens · ⚡ compressão antes desta mensagem (4 mensagens resumidas, ~689 → ~561 tokens)

> Recomendamos realizar a simulação de phishing entre 1 a 2 semanas após o treinamento. Esse intervalo permite que os colaboradores absorvam o conteúdo e apliquem o que aprenderam, aumentando a eficácia da simulação e a identificação de possíveis vulnerabilidades. 
> 
> Se precisar de mais informações ou quiser agendar, é só avisar!

Juiz: _A resposta é ideal, pois recomenda um intervalo razoável e explica claramente o motivo para essa recomendação._

Memórias injetadas (4 de 5 ativas, ~178 tokens):

- M16 (preferencia, essencial, score 0.21): Prefere ligações telefônicas, no período da tarde.
- M20 (pedido, relevante, score 0.68): Cliente deseja realizar uma simulação de phishing após o treinamento de conscientização.
- M19 (preferencia, relevante, score 0.47): Cliente prefere que o treinamento de conscientização sobre phishing seja realizado presencialmente no galpão de Canoas, que possui um refeitório grande.
- M17 (problema, relevante, score 0.45): Em 2026-04-02 sofreu um ataque de phishing contido; pediu um treinamento de conscientização para a equipe.

#### C6: Conversa longa: a esta altura a memória curta já passou do orçamento de tokens.

**Cliente:** E os relatórios da simulação, quem recebe? Eu gostaria de receber pessoalmente, por telefone eu explico para a diretoria.

**Só memória curta (sessão)** — ❌ reprovado (nota 2, memória: ausente) · contexto ~1111 tokens · ⚡ compressão antes desta mensagem (2 mensagens resumidas, ~756 → ~606 tokens)

> Os relatórios da simulação de phishing geralmente são enviados para a pessoa que solicitou a simulação, que neste caso seria você. Assim, você poderá revisar as informações e, em seguida, explicar para a diretoria por telefone.
> 
> Posso anotar essa solicitação e garantir que você receba o relatório assim que a simulação for concluída. Se precisar de mais alguma coisa, é só avisar!

Juiz: _A resposta não menciona que os relatórios podem ser enviados para a Patrícia, que é a pessoa correta. Além disso, não combina a apresentação por telefone, ignorando a preferência registrada do cliente._

**Memória completa (proposta)** — ✅ aprovado (nota 4, memória: correto) · contexto ~1593 tokens · ⚡ compressão antes desta mensagem (2 mensagens resumidas, ~695 → ~547 tokens)

> Os relatórios da simulação de phishing podem ser enviados diretamente para você, Patrícia. Assim, você poderá revisar as informações e, em seguida, explicar os resultados para a diretoria por telefone. 
> 
> Se precisar de mais alguma coisa ou quiser confirmar o agendamento do treinamento e da simulação, é só me avisar!

Juiz: _A resposta menciona que os relatórios podem ser enviados para Patrícia, mas não combina a apresentação por telefone, que é uma preferência registrada. A resposta é boa, mas falta um detalhe importante._

Memórias injetadas (4 de 5 ativas, ~178 tokens):

- M16 (preferencia, essencial, score 0.28): Prefere ligações telefônicas, no período da tarde.
- M20 (pedido, relevante, score 0.42): Cliente deseja realizar uma simulação de phishing após o treinamento de conscientização.
- M19 (preferencia, relevante, score 0.34): Cliente prefere que o treinamento de conscientização sobre phishing seja realizado presencialmente no galpão de Canoas, que possui um refeitório grande.
- M17 (problema, relevante, score 0.28): Em 2026-04-02 sofreu um ataque de phishing contido; pediu um treinamento de conscientização para a equipe.

Memória gravada após a resposta:

- ADICIONAR M21 (preferencia): Cliente deseja receber os relatórios da simulação de phishing pessoalmente e explicar os resultados para a diretoria por telefone.

#### C7: Lembrar detalhes do INÍCIO da conversa depois que eles foram comprimidos em resumo.

**Cliente:** Para fechar: me passa um resumo do que combinamos sobre o treinamento: quantas pessoas, horário e local.

**Só memória curta (sessão)** — ✅ aprovado (nota 4, memória: correto) · contexto ~996 tokens · ⚡ compressão antes desta mensagem (2 mensagens resumidas, ~774 → ~496 tokens)

> Claro! Aqui está o resumo do que combinamos sobre o treinamento:
> 
> - **Número de participantes:** 40 motoristas
> - **Horário preferencial:** Turno da noite
> - **Local:** Galpão de Canoas
> - **Duração:** 1 a 2 horas
> 
> Além disso, discutimos a possibilidade de realizar uma simulação de phishing após o treinamento, mas ainda não houve decisão sobre isso. 
> 
> Se precisar de mais alguma informação ou ajuste, estou à disposição!

Juiz: _A resposta resume corretamente a maioria dos detalhes do treinamento, mas inclui uma duração que não foi mencionada no gabarito. A menção à simulação de phishing é relevante, mas a falta de confirmação sobre isso poderia ser melhor abordada._

**Memória completa (proposta)** — ✅ aprovado (nota 4, memória: correto) · contexto ~1494 tokens · ⚡ compressão antes desta mensagem (2 mensagens resumidas, ~694 → ~445 tokens)

> Claro! Aqui está o resumo do que combinamos sobre o treinamento de conscientização sobre phishing:
> 
> - **Público**: 40 motoristas
> - **Local**: Galpão de Canoas
> - **Horário**: Preferencialmente no turno da noite
> - **Duração**: 1 a 2 horas
> 
> A confirmação da disponibilidade do local ainda está pendente. Se precisar de mais alguma informação ou quiser seguir com o agendamento, estou à disposição!

Juiz: _A resposta resume corretamente a quantidade de motoristas e o local, mas não menciona que o treinamento deve ocorrer após 19h e inclui uma duração que não foi especificada no gabarito. A confirmação da disponibilidade do local não é relevante para o resumo solicitado._

Memórias injetadas (4 de 6 ativas, ~187 tokens):

- M16 (preferencia, essencial, score 0.24): Prefere ligações telefônicas, no período da tarde.
- M21 (preferencia, relevante, score 0.63): Cliente deseja receber os relatórios da simulação de phishing pessoalmente e explicar os resultados para a diretoria por telefone.
- M20 (pedido, relevante, score 0.38): Cliente deseja realizar uma simulação de phishing após o treinamento de conscientização.
- M19 (preferencia, relevante, score 0.36): Cliente prefere que o treinamento de conscientização sobre phishing seja realizado presencialmente no galpão de Canoas, que possui um refeitório grande.

Memória gravada após a resposta:

- ADICIONAR M22 (pedido): Cliente deseja realizar o treinamento de conscientização sobre phishing para 40 motoristas no galpão de Canoas, preferencialmente no turno da noite.
