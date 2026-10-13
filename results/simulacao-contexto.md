# Avaliação de contexto (simulação, sem modelo real)

Gerado por `npm run simulate`. O código real do assistente roda em cada modo e o contexto exato que seria enviado
ao modelo é verificado em cada mensagem. **Respostas, resumos, extração de memória e embeddings são simulados**
(ver `src/experiment/simulateContext.ts`), então esta avaliação mede a ARQUITETURA DE MEMÓRIA (o que chega ao modelo),
não a qualidade das respostas. A comparação com respostas reais e juiz é feita por `npm run experiment`.

## Resumo por modo

| Modo | Fatos necessários no contexto | Mensagens com ruído | Tokens de contexto (média) | Memórias injetadas (média) | Compressões |
|---|---|---|---|---|---|
| Sem memória | **0/15 (0%)** | 0 | 458 | 0.0 | 0 |
| Só memória curta | **3/15 (20%)** | 0 | 867 | 0.0 | 2 |
| Memória completa | **12/15 (80%)** | 0 | 1354 | 2.3 | 2 |
| Sem filtro | **15/15 (100%)** | 6 (A1, A2, A3, A4, B2, B4) | 1530 | 6.1 | 2 |

## Por mensagem

✅/⚠️/❌ = fatos necessários presentes no contexto · 🔸 = ruído no contexto · ⚡ = compressão antes da mensagem · tk = tokens de contexto.

| Turno | Sem memória | Só memória curta | Memória completa | Sem filtro |
|---|---|---|---|---|
| A1 | ❌ 0/3 · 476 tk | ❌ 0/3 · 476 tk | ⚠️ 1/3 · 871 tk | ✅ 3/3 · 🔸 ruído: memória irrelevante (evento de 2025), chamado de VPN (sem relação) · 1215 tk |
| A2 | ❌ 0/1 · 439 tk | ❌ 0/1 · 768 tk | ❌ 0/1 · 1212 tk | ✅ 1/1 · 🔸 ruído: memória irrelevante (evento de 2025) · 1556 tk |
| A3 | ❌ 0/2 · 451 tk | ❌ 0/2 · 451 tk | ✅ 2/2 · 1026 tk | ✅ 2/2 · 🔸 ruído: memória irrelevante (evento de 2025) · 1328 tk |
| A4 | ❌ 0/1 · 451 tk | ❌ 0/1 · 755 tk | ✅ 1/1 · 1349 tk | ✅ 1/1 · 🔸 ruído: memória irrelevante (evento de 2025), licenças (sem relação) · 1632 tk |
| A5 | 452 tk | 1060 tk | 1598 tk | 1937 tk |
| B1 | 464 tk | 464 tk | 858 tk | 1091 tk |
| B2 | 449 tk | 765 tk | 1220 tk | 🔸 ruído: cobrança duplicada (sem relação), segunda unidade (sem relação), desktops (sem relação) · 1409 tk |
| B3 | ❌ 0/2 · 447 tk | ❌ 0/2 · 447 tk | ✅ 2/2 · 980 tk | ✅ 2/2 · 1169 tk |
| B4 | ❌ 0/1 · 441 tk | ❌ 0/1 · 740 tk | ✅ 1/1 · 1378 tk | ✅ 1/1 · 🔸 ruído: segunda unidade (sem relação) · 1462 tk |
| B5 | 457 tk | 1049 tk | 1538 tk | 1771 tk |
| C1 | ❌ 0/1 · 485 tk | ❌ 0/1 · 485 tk | ✅ 1/1 · 923 tk | ✅ 1/1 · 953 tk |
| C2 | 460 tk | 793 tk | 1231 tk | 1308 tk |
| C3 | 458 tk | 1099 tk | 1545 tk | 1622 tk |
| C4 | 464 tk | 1411 tk | 1903 tk | 1934 tk |
| C5 | 454 tk | ⚡ · 1191 tk | ⚡ · 1665 tk | ⚡ · 1742 tk |
| C6 | ❌ 0/1 · 471 tk | ❌ 0/1 · 1510 tk | ✅ 1/1 · 1930 tk | ✅ 1/1 · 2061 tk |
| C7 | ❌ 0/3 · 465 tk | ✅ 3/3 · ⚡ · 1269 tk | ✅ 3/3 · ⚡ · 1789 tk | ✅ 3/3 · ⚡ · 1820 tk |

## Fatos que faltaram no modo completa

- A1: preferência: prazo de entrega em destaque
- A1: última compra: Dell Latitude 5450
- A2: modelo da última compra: Dell Latitude 5450
