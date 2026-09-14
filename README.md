# LifeOS

[![CI](https://github.com/ViniciusKanh/LifeOs/actions/workflows/ci.yml/badge.svg)](https://github.com/ViniciusKanh/LifeOs/actions/workflows/ci.yml)

**Transforme sua rotina em progresso.**

LifeOS é um sistema operacional pessoal para produtividade, estudos, saúde e
autoconhecimento: reúne em um único produto o que hoje fica espalhado entre um
app de tarefas, uma planilha de hábitos, um caderno de metas e um app de
saúde separado — com todos os módulos conversando entre si através de um
único indicador central, o **Life Score**.

O conceito por trás de cada módulo é sempre o mesmo ciclo:

**Planejar → Executar → Registrar → Medir → Melhorar.**

> Todas as métricas, gráficos e insights do produto são calculados a partir
> de dados reais gravados pelo próprio usuário — nunca há números
> estimados ou fictícios. Sem dado suficiente, o indicador mostra 0 (ou
> "sem dados ainda"), nunca um valor inventado.

---

## Visão geral do produto (o que o LifeOS entrega)

| Módulo | O que resolve |
|---|---|
| **Dashboard + Life Score** | Visão executiva da rotina: radar de 7 dimensões (Produtividade, Profissional, Saúde, Educação, Leitura, Hábitos, Metas) calculado em tempo real. |
| **Hoje** (Daily Command Center) | Resumo do dia: prioridades, tarefas vencendo, hábitos pendentes e um atalho para Focus Mode — a primeira tela que o usuário vê. |
| **Tarefas + Kanban** | Kanban reutilizável com modal completo (descrição, prioridade, data de início/término) e **cronômetro de tempo dedicado** por tarefa. |
| **Área Profissional** | Projetos e workspaces com o mesmo motor de tarefas/Kanban acima. |
| **Educação** | Hierarquia Formação → Curso/Período → Disciplina, mais TCC/Dissertação/Tese como **projetos acadêmicos com Kanban próprio**. O sistema identifica sozinho se o usuário está *cursando disciplinas* ou já em *fase de projeto/TCC*, a partir do estado real dos dados — nunca de uma escolha manual. |
| **Biblioteca** | Cadastro de livros por ISBN (Google Books / Open Library), status de leitura, sessões de leitura e anotações. |
| **Saúde e Bem-estar** | Água, sono, exercícios e humor/energia — tratado explicitamente como bem-estar pessoal, nunca como diagnóstico médico. |
| **Hábitos** | Streaks e consistência, com cuidado para não pressionar o usuário com sequências quebradas. |
| **Metas** | Metas numéricas, percentuais, binárias ou baseadas em tarefas, com progresso real calculado a partir dos dados que as alimentam. |
| **Focus Mode / Pomodoro** | Sessões de foco cronometradas, vinculáveis a uma tarefa ou projeto. |
| **Analytics** | Métricas do período, radar de equilíbrio da rotina e **insights reais** (correlação sono × produtividade do dia seguinte, humor × minutos de foco, melhor dia da semana, melhor horário de foco) — sempre com amostra mínima antes de exibir qualquer correlação. |
| **Timeline** | Linha do tempo cronológica agregando tarefas concluídas, hábitos, treinos, leituras, sessões de foco e disciplinas concluídas. |
| **Weekly Review** | Revisão semanal com métricas computadas automaticamente + reflexão do usuário. |
| **Perfil** | Foto (aceita qualquer tamanho de imagem — o recorte/compressão acontece no navegador), nome e troca de senha. |
| **Configurações (admin)** | Gemini API, Turso e SMTP configurados com segurança, mais gestão de usuários — restrito ao administrador. |
| **Notificações** | Sino no cabeçalho com alertas em tempo real: tarefas atrasadas, tarefas vencendo hoje, hábitos não marcados e Weekly Review pendente. |

### Diferenciais de UX

- Cabeçalho fixo com notificações e menu de perfil; navegação lateral
  reorganizada por prioridade de uso; tema claro/escuro completo.
- Upload de foto de perfil com recorte no navegador (`ImageCropModal`):
  aceita qualquer imagem, por maior que seja, e sempre envia ao servidor uma
  versão comprimida (512×512, JPEG) — sem depender de o usuário redimensionar
  a imagem antes.
- Kanban genérico (`KanbanBoard<T>`) reaproveitado por Tarefas, Área
  Profissional e pelos projetos acadêmicos de Educação — mesma UX de
  arrastar-e-soltar em todo o produto, sem duplicar código.
- Modal de tarefa único, com cronômetro embutido, usado em qualquer lugar do
  produto que tenha um Kanban.

---

## Arquitetura

Monorepo com npm workspaces:

```
LifeOS/
├── apps/
│   ├── web/     React + TypeScript + Vite + Tailwind (frontend)
│   └── api/     Node + Express + TypeScript (backend)
├── .env.example
└── package.json
```

### apps/web

```
src/
├── pages/          páginas por módulo (auth, dashboard, hoje, tarefas,
│                    educacao, saude, habitos, metas, foco, analytics,
│                    timeline, weekly-review, perfil, configuracoes...)
├── components/
│   ├── ui/         design system (Button, Card, Field, EmptyState, ImageCropModal)
│   ├── layout/     AppShell, NotificationsBell, ProfileMenu
│   ├── kanban/      KanbanBoard genérico
│   └── tasks/       TaskCard, TaskModal
├── hooks/          um hook por domínio (useTasks, useHabits, useGoals,
│                    useFocus, useAnalytics, useReviews, useEducations...)
├── services/       clientes de API, um por domínio
├── types/          tipos compartilhados do frontend
└── lib/            validação (zod) e utilidades
```

### apps/api

```
src/
├── db/
│   ├── client.ts        cliente libSQL (Turso ou arquivo local)
│   ├── migrate.ts        runner de migrations (aditivas, nunca destrutivas)
│   ├── seed.ts           dados de demonstração (nunca em produção)
│   └── migrations/       0001...0010, uma por domínio
├── middleware/
│   ├── auth.ts           extrai/valida a sessão (cookie httpOnly)
│   ├── requireAdmin.ts   restringe rotas administrativas
│   └── rateLimit.ts      limitação de tentativas em endpoints sensíveis
├── routes/         um router por domínio (ver referência de API abaixo)
├── services/       metricsService (Life Score/Analytics), authService,
│                    cryptoService (AES-256-GCM)
├── validators/     schemas zod de entrada, um por domínio
└── types/          tipos compartilhados do backend
```

---

## Segurança — regras que não podem ser quebradas

1. **Isolamento por usuário.** Toda tabela de dados do usuário tem uma
   coluna `owner_id`, e toda query de leitura/escrita nessas tabelas passa
   por `WHERE owner_id = req.user.id`. `req.user` só existe depois do
   middleware `requireAuth`, que decodifica o JWT do cookie — nunca se
   aceita um id de usuário vindo do corpo da requisição.
2. **Senhas** são hasheadas com bcrypt (12 rounds), nunca armazenadas em
   texto puro.
3. **Sessão** vive em cookie `httpOnly`, nunca em `localStorage` — reduz
   superfície de XSS.
4. **Credenciais administrativas** (Gemini API Key, Turso Auth Token, senha
   SMTP) são criptografadas com AES-256-GCM antes de ir para o banco
   (`services/cryptoService.ts`) e a API nunca devolve o valor bruto de
   volta — apenas um preview mascarado (`••••••••••••AB23`).
5. **Papel de administrador** vem de uma coluna `role` no banco, verificada
   no backend (`requireAdmin`) — nunca por comparação de e-mail no frontend.
6. **Auditoria.** Toda alteração em `admin_settings` grava uma linha em
   `audit_logs` (quem, o quê, quando, IP) — nunca a credencial em si.
7. **Golden rule dos números.** Life Score, Analytics, Insights e progresso
   de metas nunca são estimados — toda dimensão vem de uma consulta real
   contra o banco; sem dado suficiente, o valor é 0/`null`, nunca um
   placeholder.

---

## Configuração

### 1. Variáveis de ambiente

```bash
cp .env.example apps/api/.env
cp .env.example apps/web/.env   # apenas VITE_API_URL é usada aqui
```

Gere segredos fortes para `JWT_SECRET` e `CREDENTIALS_ENCRYPTION_KEY`
(32 bytes em hex):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Em desenvolvimento, `DATABASE_URL=file:./data/lifeos.db` já funciona sem
precisar de conta Turso. Para produção, troque por
`DATABASE_URL=libsql://seu-banco.turso.io` e preencha `DATABASE_AUTH_TOKEN`
(ou configure ambos direto na tela **Configurações** do admin, já
criptografados).

### 2. Instalação

```bash
npm install
```

### 3. Banco de dados

```bash
npm run migrate          # cria/atualiza todas as tabelas
npm run seed             # (opcional) usuário demo: demo@lifeos.app / Demo1234
```

### 4. Rodar em desenvolvimento

```bash
npm run dev               # API (porta 3333) + Web (porta 5173) juntos
# ou separadamente:
npm run dev:api
npm run dev:web
```

Acesse http://localhost:5173.

### 5. Build de produção

```bash
npm run build
```

---

## Referência da API

Todas as rotas exigem sessão autenticada (cookie httpOnly), exceto onde
indicado. Rotas de admin exigem, além da sessão, `role = 'admin'`.

### Autenticação — `/api/auth`

| Método | Rota | Descrição |
|---|---|---|
| POST | `/register` | Cria conta (com limite de tentativas) |
| POST | `/login` | Autentica e define o cookie de sessão |
| POST | `/logout` | Encerra a sessão |
| GET | `/me` | Dados do usuário autenticado |
| PATCH | `/me` | Atualiza nome/avatar do próprio perfil |
| POST | `/change-password` | Troca de senha autenticada |
| POST | `/forgot-password` | Solicita recuperação de senha |
| POST | `/reset-password` | Efetiva a nova senha a partir do token |

### Tarefas — `/api/tasks`

| Método | Rota | Descrição |
|---|---|---|
| GET | `/` | Lista tarefas do usuário (`?status=`, `?projectId=`) |
| GET | `/:id` | Detalhe de uma tarefa |
| POST | `/` | Cria tarefa (título, descrição, status, prioridade, datas, estimativa) |
| PATCH | `/:id` | Atualiza campos da tarefa |
| PATCH | `/:id/move` | Move a tarefa entre colunas do Kanban |
| GET | `/:id/time/active` | Retorna a sessão de cronômetro em aberto, se houver |
| POST | `/:id/time/start` | Inicia o cronômetro de tempo dedicado à tarefa |
| PATCH | `/:id/time/stop` | Para o cronômetro e soma o tempo a `time_spent_minutes` |
| DELETE | `/:id` | Remove a tarefa |

### Hábitos — `/api/habits`

| Método | Rota | Descrição |
|---|---|---|
| GET | `/` | Lista hábitos ativos |
| POST | `/` | Cria hábito |
| POST | `/:id/check-in` | Registra o cumprimento do hábito no dia |
| PATCH | `/:id` | Atualiza hábito |
| DELETE | `/:id` | Arquiva o hábito (soft delete) |
| GET | `/summary` | Streak atual, recorde e status de hoje por hábito |
| GET | `/:id/entries` | Histórico de check-ins do hábito |

### Educação — `/api` (montado na raiz)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/educations` | Lista formações, cada uma com a **fase calculada** (`cursando_disciplinas`, `fase_projeto`, `concluida`, `sem_atividade`) |
| GET | `/educations/:id` | Detalhe da formação + `academicProjects` vinculados |
| POST | `/educations` | Cria formação |
| PATCH \| DELETE | `/educations/:id` | Atualiza/remove |
| GET \| POST | `/educations/:educationId/courses` | Cursos/períodos da formação |
| PATCH \| DELETE | `/courses/:id` | Atualiza/remove curso |
| GET \| POST | `/courses/:courseId/subjects` | Disciplinas do curso |
| PATCH \| DELETE | `/subjects/:id` | Atualiza/remove disciplina |
| GET | `/academic-projects` | Lista projetos acadêmicos (`?educationId=`) |
| POST | `/academic-projects` | Cria TCC/dissertação/tese — cria automaticamente um projeto (`projects`, `kind='academic'`) quando nenhum `projectId` é informado, dando a ele um Kanban real |
| PATCH \| DELETE | `/academic-projects/:id` | Atualiza/remove |

### Saúde e Bem-estar — `/api/health`

| Método | Rota | Descrição |
|---|---|---|
| GET \| POST | `/water` | Registros de hidratação |
| DELETE | `/water/:id` | Remove registro |
| GET \| POST | `/sleep` | Registros de sono |
| DELETE | `/sleep/:id` | Remove registro |
| GET \| POST | `/workouts` | Exercícios |
| DELETE | `/workouts/:id` | Remove exercício |
| GET \| POST | `/mood` | Humor e energia |
| GET \| POST | `/metrics` | Métricas gerais de bem-estar |
| GET | `/summary` | Resumo consolidado do período |

### Metas — `/api/goals`

| Método | Rota | Descrição |
|---|---|---|
| GET | `/` | Lista metas (hierarquia anual → objetivos → projetos → tarefas) |
| GET | `/:id` | Detalhe da meta |
| POST | `/` | Cria meta (`numeric`, `percentage`, `binary` ou `task_based`) |
| PATCH \| DELETE | `/:id` | Atualiza/remove |
| POST | `/:id/progress` | Registra progresso real |

### Focus Mode — `/api/focus`

| Método | Rota | Descrição |
|---|---|---|
| GET | `/sessions` | Histórico de sessões |
| GET | `/sessions/active` | Sessão em andamento, se houver |
| POST | `/sessions/start` | Inicia sessão (Pomodoro ou timer livre) |
| PATCH | `/sessions/:id/stop` | Encerra sessão |
| DELETE | `/sessions/:id` | Remove sessão |
| GET | `/summary` | Minutos de foco e produtividade percebida no período |

### Revisões — `/api/reviews`

| Método | Rota | Descrição |
|---|---|---|
| GET \| PUT | `/daily` | Revisão diária |
| GET | `/weekly/compute` | Calcula as métricas da semana a partir dos dados reais |
| GET \| PUT | `/weekly` | Lê/salva a Weekly Review |
| GET | `/weekly/history` | Histórico de revisões semanais |

### Analytics — `/api/analytics`

| Método | Rota | Descrição |
|---|---|---|
| GET | `/life-score` | Radar de 7 dimensões para uma data (`?date=`) |
| GET | `/overview` | Totais do período + série diária de tarefas concluídas (`?days=`) |
| GET | `/insights` | Correlações reais (sono × produtividade, humor × foco), melhor dia da semana e melhor horário de foco — só retorna valor com amostra mínima |
| GET | `/timeline` | Feed cronológico agregando tarefas, hábitos, treinos, leituras, foco e disciplinas concluídas |

### Notificações — `/api/notifications`

| Método | Rota | Descrição |
|---|---|---|
| GET | `/live` | Notificações calculadas em tempo real: tarefas atrasadas, tarefas vencendo hoje, hábitos pendentes, Weekly Review em aberto |

### Biblioteca — `/api` (montado na raiz)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/books` | Lista livros do usuário |
| GET | `/books/lookup/:isbn` | Busca metadados por ISBN (Google Books, com fallback Open Library) |
| GET \| POST | `/books/:id` \| `/books` | Detalhe / cadastro de livro |
| PATCH \| DELETE | `/books/:id` | Atualiza/remove |
| GET \| POST | `/books/:id/notes` | Anotações de leitura |
| DELETE | `/books/:id/notes/:noteId` | Remove anotação |
| GET \| POST | `/books/:id/sessions` | Sessões de leitura |

### Administração — `/api/admin` (exige `role = 'admin'`)

| Método | Rota | Descrição |
|---|---|---|
| GET \| PUT | `/settings` | Lê/grava credenciais (Gemini, Turso, SMTP) — sempre criptografadas |
| DELETE | `/settings/:integration/:keyName` | Remove uma credencial |
| POST | `/settings/:integration/test` | Testa a conexão de uma integração |
| GET | `/audit-logs` | Histórico de alterações administrativas |
| GET \| POST | `/users` | Lista/cria usuários |
| PATCH | `/users/:id/role` | Promove/rebaixa um usuário |
| DELETE | `/users/:id` | Remove usuário |

---

## Modelagem do banco (visão geral)

| Domínio | Tabelas |
|---|---|
| Usuários e admin | `users`, `user_settings`, `admin_settings`, `password_reset_tokens`, `audit_logs` |
| Metas e hábitos | `goals`, `goal_progress`, `habits`, `habit_entries` |
| Projetos e tarefas | `projects`, `project_members`, `task_statuses`, `tasks`, `subtasks`, `tags`, `task_tags`, `task_dependencies`, `time_entries` |
| Biblioteca | `books`, `book_notes`, `reading_sessions` |
| Educação | `educations`, `courses`, `subjects`, `academic_projects` (com `education_id` ligando o projeto acadêmico à formação) |
| Saúde | `health_entries`, `water_entries`, `sleep_entries`, `workouts`, `mood_entries` |
| Foco e revisões | `focus_sessions`, `daily_reviews`, `weekly_reviews` |
| Calendário | `events`, `notifications` |
| Gamificação/Analytics | `achievements`, `user_achievements`, `life_scores`, `analytics_snapshots`, `ai_interactions` |

Todas as migrations estão em `apps/api/src/db/migrations`, numeradas na
ordem correta de dependência, e são sempre **aditivas** (nunca alteram ou
apagam dados existentes de uma migration anterior).

---

## Roteiro (próximos passos)

- IA/LifeOS Copilot com Gemini (replanejamento do dia, diagnóstico de
  produtividade a partir do Life Score e dos Insights).
- Integrações externas: Google Calendar/Outlook, Google Fit/Apple Health,
  GitHub, Notion/Todoist/ClickUp, Strava.
- Gantt para projetos/Educação, além do Kanban já existente.
- `services/emailService.ts` com SMTP real para recuperação de senha (hoje
  o token é logado em desenvolvimento).
- PWA final (estratégia de cache mais completa) e empacotamento para a
  Microsoft Store.

## Testes

```bash
npm run test --workspace apps/api
```

Estrutura de testes com Vitest já configurada no backend; priorize
autenticação, isolamento entre usuários, cálculo do Life Score/Insights e
permissões administrativas.
