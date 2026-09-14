# LifeOS: como deixar o app mais inteligente

> **Status (14/09/2026): itens 1–6 implementados.** Só ficaram para depois, como já estava marcado abaixo, as conquistas adaptativas e a recomendação de livros (item 7/8) — polimento, não bloqueiam nada. Resumo do que foi feito:
> - **Copilot com ações reais**: painel de chat (ícone flutuante, ⌘ canto inferior direito) — o Copilot propõe criar/concluir/mover tarefa, marcar hábito ou criar evento via function calling do Gemini, mas **nunca grava nada sem confirmação explícita do usuário** (ver `apps/api/src/services/copilotActionsService.ts` e `apps/web/src/components/layout/CopilotAssistant.tsx`).
> - **Busca semântica**: `apps/api/src/services/embeddingsService.ts` gera embeddings (Gemini `text-embedding-004`) sob demanda e rankeia por similaridade de cosseno; a busca textual continua sempre disponível mesmo sem Gemini configurado, e os resultados "por significado" aparecem com uma etiqueta própria na busca do topo.
> - **Priorização automática de tarefas**: `apps/api/src/services/priorityService.ts` + widget "Foque nisso agora" na tela Hoje.
> - **Correlações reais de saúde/produtividade**: já existiam (`computeInsights`/Pearson) — confirmado, sem mudanças necessárias.
> - **Weekly Review pré-preenchida**: botão "Gerar rascunho com IA" na Weekly Review, preenchendo os campos de reflexão com base nas métricas reais da semana (o usuário sempre revisa antes de salvar).
> - **Previsão de conclusão**: `GET /api/goals/:id/forecast` e `GET /api/projects/:id/forecast` — projeção linear simples a partir do ritmo real de progresso, exibida como chip nas telas de Metas e Projetos.


Esta é uma segunda passada, mais profunda, focada especificamente em **inteligência** — coisas que usam os dados reais que o app já coleta (ou o Gemini, que já está integrado) para fazer o LifeOS raciocinar sobre a rotina do usuário, e não só exibir números. Complementa o documento anterior (`docs/sugestoes-novas-telas-lifeos.md`), que cobria telas/ferramentas novas de forma mais geral.

## Achado concreto: a busca do topo não funciona

Antes das sugestões — um problema real que encontrei revisando o app: o campo "Buscar algo no LifeOS..." no topo de toda tela (`AppShell.tsx`) é só um `<input>` decorativo. Não tem `onChange`, não dispara nenhuma busca, não vai a lugar nenhum. Hoje ele é uma promessa que o app não cumpre. Isso é o item de maior prioridade desta lista — não porque seja "inteligente", mas porque é uma funcionalidade anunciada visualmente e ausente de verdade, o tipo de coisa que mina a confiança em tudo o mais. E dá pra aproveitar o mesmo trabalho para o item de busca semântica abaixo.

## Onde o app já é "inteligente" hoje (pra não sugerir o que já existe)

- **Copilot (Gemini)**: gera texto — insight do dia (Dashboard), e insights específicos de Saúde, Educação, Analytics e Hábitos. Sempre unidirecional: lê dados, escreve um parágrafo. Nunca age.
- **LifeScore e métricas de período**: `computeLifeScore` e `computeRangeMetrics` calculam agregados e variação percentual (`changePct`) entre períodos — é comparação numérica, não correlação.
- **Conquistas**: motor real (métricas → threshold → desbloqueio), mas os 10 critérios são fixos e definidos por mim, não adaptativos ao comportamento do usuário.
- **Notificações "live"**: calculadas na hora a partir de regras simples (tarefa atrasada, hábito pendente, weekly review em aberto) — é lógica condicional, não inferência.

Ou seja: hoje "inteligência" = **Gemini gerando texto solto** + **regras fixas**. As sugestões abaixo miram no que ainda não existe: raciocínio sobre os dados (correlação, priorização, recomendação) e ação (o Copilot fazer algo, não só descrever).

## 1. Copilot com ações reais (function calling)

Já estava na lista de prioridades anteriores, repito aqui porque é o item de maior alavancagem. Hoje se o Copilot "percebe" que você tem 5 tarefas atrasadas, ele só escreve um parágrafo sobre isso. O próximo passo é ele conseguir *fazer* algo — usando as APIs do Gemini com function calling (schemas já descrevendo `criar_tarefa`, `mover_tarefa`, `marcar_habito`, `criar_evento` etc.) contra os endpoints que já existem. Sempre com confirmação explícita antes de qualquer escrita (nunca agir silenciosamente). Isso transforma o Copilot de "narrador da sua rotina" em "assistente que ajuda a rodar ela".

## 2. Busca semântica global (resolve o item 0 acima com inteligência de verdade)

Em vez de só implementar uma busca textual simples (SQL `LIKE`) para o campo do topo, dá pra ir um passo além: Turso/libSQL tem suporte a **busca vetorial nativa** (`vector_distance_cos`, índice `libsql_vector_idx`). Gerar embeddings (via API do Gemini, `text-embedding-004` ou equivalente) para tarefas, notas de livro, entradas de weekly review e itens da timeline permite buscar por **significado**, não só por palavra exata — "aquela ideia sobre performance que anotei" encontra a nota certa mesmo sem repetir as palavras exatas. Sem essa camada, a busca ainda seria útil (resolve o bug), mas essa é a versão que justifica chamar de "inteligente".

## 3. Priorização automática de tarefas ("o que fazer agora?")

As tarefas já têm `impact`, `urgency`, `effort` e `priority_score` no schema (usados hoje só na área profissional implícita, sem UI). Um algoritmo simples — nem precisa de IA generativa, é matemática — que combine esse score com prazo, dependências (agora que o Gantt existe) e o padrão histórico de quando o usuário costuma concluir tarefas parecidas, pode alimentar um widget "Foque nisso agora" na tela Hoje, diferente da lista de prioridades atual (que é só filtro + ordenação manual por prioridade/data).

## 4. Detecção de padrões e correlações reais (não texto do Gemini — estatística sobre os próprios dados)

Com água, sono, humor, energia, exercício e foco registrados diariamente, dá pra calcular correlações reais entre séries (ex.: correlação de Pearson entre horas de sono da noite anterior e minutos de foco do dia seguinte) e mostrar isso como um card de insight factual: "Nos últimos 30 dias, dias com mais de 7h de sono tiveram foco médio 34% maior". Isso é diferente do Copilot atual porque é número calculado, não texto gerado — mais confiável e mais barato (não gasta chamada de API).

## 5. Previsão de conclusão de metas e projetos

Dado o ritmo histórico de progresso de uma meta (quantidade de progresso registrado por semana) ou de um projeto no Gantt (tarefas concluídas por semana), é possível projetar uma data provável de conclusão e comparar com o prazo definido — "no ritmo atual, esta meta deve ser concluída em 3 semanas, 5 dias depois do prazo". Novamente, matemática simples (regressão linear básica sobre os pontos de progresso), não IA generativa, mas information genuinamente nova que o usuário não tem hoje.

## 6. Weekly Review semi-preenchido pelo Copilot

O Weekly Review hoje é um formulário em branco toda semana. Como todos os dados da semana já existem (tarefas concluídas, hábitos, saúde, foco, leitura), o Copilot poderia **pré-preencher um rascunho** ("Esta semana você completou 18 tarefas, manteve 5/7 dias de hábito de exercício, dormiu em média 6h40...") que o usuário edita e confirma, em vez de escrever do zero. Reduz a fricção que normalmente faz weekly reviews pararem de ser preenchidas depois de algumas semanas.

## 7. Conquistas adaptativas (além do catálogo fixo)

As 10 conquistas atuais são marcos fixos e iguais para todo mundo. Uma segunda camada — "recordes pessoais" calculados por usuário (maior sequência de hábito já feita, semana com mais tarefas concluídas, mês com mais minutos de foco) — cria reconhecimento que se adapta ao padrão de cada pessoa, em vez de mirar sempre nos mesmos números para todo mundo.

## 8. Recomendação de livros dentro da Biblioteca

Hoje a Biblioteca só faz lookup por ISBN (Google Books/Open Library) quando o usuário já sabe o que quer cadastrar. Com o histórico de livros lidos (gênero, autor, nota, tempo de leitura), a mesma API de lookup pode alimentar sugestões — "livros parecidos com os que você mais bem avaliou" — usando os metadados que a API de livros já devolve (categoria, autor), sem precisar de nenhuma infraestrutura nova além do que já existe.

---

### Ordem de prioridade sugerida (foco em inteligência)

1. **Corrigir a busca do topo** (nem que seja textual simples no primeiro momento) — é a única coisa desta lista que é uma correção, não uma feature nova.
2. **Copilot com ações reais** — maior salto de valor percebido.
3. **Busca semântica** (embeddings + Turso vector search) — evolui o item 1 para algo realmente inteligente.
4. **Priorização automática de tarefas** — baixo custo (é matemática sobre campos que já existem), alto valor no dia a dia.
5. **Correlações de saúde/produtividade** — diferencial de dado real, sem custo de API de IA.
6. **Weekly Review semi-preenchido** — reduz a fricção que mata o hábito de revisar a semana.
7. **Previsão de conclusão de metas/projetos** — informação nova a partir de dado que já existe.
8. **Conquistas adaptativas** e **recomendação de livros** — polimento, ficam para depois dos itens acima.
