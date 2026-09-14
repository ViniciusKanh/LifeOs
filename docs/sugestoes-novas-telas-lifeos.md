# Sugestões de novas telas e ferramentas para o LifeOS

> **Status (14/09/2026):** itens "Notas rápidas / Inbox", "Área Profissional dedicada" e "Modo Semana" implementados. Inbox: botão de captura flutuante em qualquer tela + tela `/inbox` pra processar cada item (vira tarefa ou é descartado). Área Profissional: tela `/profissional` com Priority Score (impacto/urgência/esforço agora editáveis na tarefa quando vinculada a um projeto Profissional), metas ativas da categoria "Carreira" e log de reuniões 1:1/anotações. Modo Semana: tela `/semana`, os 7 dias como colunas com prazos (mesma fonte do Calendário) e check-in de hábitos direto na grade. Próximos da fila seguem em aberto (recorrência de tarefas, CI...).

Depois de fechar o escopo original (Calendário, Gantt, push notifications) e as ideias de evolução da rodada anterior (Copilot proativo, conquistas reais, onboarding, exportação de dados, code-splitting e testes automatizados), aqui vão sugestões de telas e ferramentas novas — coisas que ainda não existem no app e que fariam sentido dado o que já está construído. Agrupei por tema e marquei uma prioridade sugerida (Alta/Média/Baixa) pensando em esforço vs. valor.

## Produtividade e organização

**Área Profissional dedicada** (Alta, ✅ implementado) — o briefing original menciona uma "área profissional" como módulo próprio, mas hoje ela só existe implicitamente via `projects.kind = 'professional'` e o campo `impact/urgency/effort` (priority score) nas tarefas, sem nenhuma tela que os exponha. Uma tela própria poderia reunir: reuniões 1:1 e anotações recorrentes, OKRs/metas do trimestre vinculadas às Metas já existentes, e um painel de "priority score" (impacto × urgência ÷ esforço) ordenando as tarefas profissionais — os campos já existem no banco, só falta a tela.

**Notas rápidas / Inbox** (Alta, ✅ implementado) — um campo de captura única (atalho de teclado, sempre acessível) para jogar uma ideia, lembrete ou tarefa solta sem precisar escolher projeto/status/prioridade na hora. Um "GTD inbox" simples: entra tudo ali, depois se processa (vira tarefa, nota, ou é descartado). Reduz atrito de captura, que é onde a maioria dos apps de produtividade perde o usuário.

**Recorrência de tarefas de verdade** (Média) — o campo `recurrence_rule` já existe na tabela `tasks` mas não está implementado em lugar nenhum (nem geração automática da próxima ocorrência, nem edição de regra pela UI). Hoje se o usuário quer uma tarefa "todo dia" ele recria manualmente. Vale entrar na fila.

**Modo "Semana"** (Média, ✅ implementado) — hoje existe Hoje (diário) e Calendário (mensal). Uma visão semanal — os 7 dias como colunas, tarefas/eventos/hábitos empilhados — é o meio-termo que muita gente usa para planejar a semana inteira de uma vez, e complementaria bem o Weekly Review que já existe.

## Biblioteca e leitura

**Metas de leitura anual** (Média) — a Biblioteca já tem progresso por livro, sessões, notas; falta uma meta agregada tipo "ler 24 livros em 2026" com progresso visual (queima de páginas/livros por mês vs. ritmo necessário) — parecido com o que Goodreads/StoryGraph oferecem, mas com dados que já são seus.

**Citações e destaques** (Baixa/Média) — hoje `book_notes` existe para anotações gerais; uma variação "citação" (com número de página) que alimenta uma tela separada de "citações favoritas" seria um bom complemento de baixo esforço, reaproveitando a tabela existente.

## Saúde e hábitos

**Correlações automáticas** (Média) — com água, sono, humor, energia, exercício e foco todos já registrados diariamente, dá para computar correlações reais (ex.: "nos dias em que você dorme menos de 6h, seu foco médio cai 30%") e mostrar isso como um card de insight — dado real, não estimativa do Copilot. Isso é diferente do Copilot atual porque é estatística sobre os próprios dados, não texto gerado por IA.

**Hábitos com regras condicionais** (Baixa) — hábitos que só "contam" em certos dias da semana, ou hábitos com meta variável (ex.: "beber água: 2L em dias normais, 3L em dias de treino"). Hoje todo hábito tem uma meta fixa.

## Financeiro (módulo novo)

**Controle financeiro pessoal simples** (Média/Alta, mas grande escopo) — não estava no briefing original, mas "produtividade e organização da rotina" costuma andar junto de finanças pessoais em apps desse tipo. Um módulo simples de despesas/receitas recorrentes, orçamento mensal por categoria e um gráfico de saldo — sem se aprofundar em investimentos, só o essencial de "quanto entra, quanto sai, quanto sobra". Vale como uma iniciativa separada, mais para o médio prazo, dado o tamanho.

## Copilot e automação

**Copilot com ações reais** (Alta) — hoje o Copilot só gera texto (insight do dia). O próximo passo natural é ele conseguir *agir*: "criar as 3 tarefas que você mencionou", "mover a reunião de amanhã", "marcar o hábito de hoje como feito" — um chat com function calling contra os endpoints que já existem (tasks, habits, events), sempre pedindo confirmação antes de qualquer escrita. Isso é o item que já estava cotado como ideia de evolução; reforçando aqui porque é o que mais eleva o produto de "dashboard bonito" para "assistente de verdade".

**Resumo semanal por e-mail** (Média) — já existe SMTP configurado (para verificação de e-mail e reset de senha); um cron semanal reaproveitando essa mesma infraestrutura para mandar um resumo (tarefas concluídas, hábitos, progresso das metas) é baixo esforço adicional e aumenta o engajamento de quem não abre o app todo dia.

## Colaboração

**Compartilhamento de projetos** (Baixa, mas a base já existe) — a tabela `project_members` já existe no schema (papéis owner/member/viewer) mas não tem nenhuma rota ou UI. Um projeto profissional compartilhado com outro usuário do LifeOS (ex.: casal dividindo tarefas domésticas, ou uma micro-equipe) é um passo grande de produto, mas tecnicamente a fundação já está posta.

## Infraestrutura e qualidade (não são telas, mas valem menção)

- **CI (GitHub Actions)** rodando `npm test` e `tsc --noEmit` a cada push/PR — a suíte de testes que acabamos de criar só tem valor contínuo se rodar sozinha, sem depender de alguém lembrar de rodar `npm test` localmente.
- **Testes de frontend** (Vitest + Testing Library) — hoje só o backend tem testes automatizados; componentes críticos (TaskModal, KanbanBoard, o novo GanttChart) se beneficiariam de alguns testes de comportamento.
- **Rate limiting mais amplo** — hoje só login/registro/troca de senha têm `rateLimit()`; rotas de escrita em geral (criar tarefa, hábito, etc.) não têm limite, o que é aceitável para uso pessoal mas vale revisar antes de qualquer uso mais público.

---

### Ordem de prioridade sugerida

1. Copilot com ações reais (function calling) — o maior salto de valor percebido.
2. Área Profissional dedicada — fecha uma lacuna do escopo original.
3. Notas rápidas / Inbox — baixo esforço, alto uso diário.
4. Modo "Semana" — complementa Hoje + Calendário + Weekly Review.
5. Recorrência de tarefas — campo já existe, só falta implementar.
6. CI automatizado — protege tudo que já foi construído.
7. Correlações de saúde automáticas — diferencial real de dado, baixo custo dado que os dados já existem.
8. Resumo semanal por e-mail — reaproveita infraestrutura de SMTP já pronta.
9. Metas de leitura anual e citações — polimento da Biblioteca.
10. Financeiro pessoal e compartilhamento de projetos — maiores em escopo, ficam para uma fase mais madura do produto.
