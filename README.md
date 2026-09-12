# LifeOS

**Transforme sua rotina em progresso.**

Sistema operacional pessoal: produtividade, tarefas, projetos, educação,
leitura, saúde, hábitos, metas e análise da rotina em um único lugar.

> Este repositório contém a **Fase 1** completa (arquitetura, autenticação,
> layout responsivo, banco de dados) e o início da **Fase 2**
> (Dashboard, Hoje, Tarefas/Kanban) descritas no roadmap abaixo.
> As demais fases (Educação, Biblioteca, Saúde, Focus, Metas, Analytics,
> Gantt, IA Gemini, PWA final) têm a estrutura de banco e de pastas
> pronta, mas as rotas/telas ainda precisam ser implementadas.

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
├── app/            (reservado para providers/roteador adicionais)
├── pages/          páginas por módulo (auth, dashboard, hoje, tarefas...)
├── components/
│   ├── ui/         design system (Button, Card, Field, EmptyState)
│   ├── layout/     AppShell (sidebar desktop, bottom nav mobile)
│   └── charts/      LifeScoreRadar e demais gráficos
├── hooks/          useAuth, useTasks, useTheme
├── services/       clientes de API (api.ts, authService.ts, taskService.ts)
├── types/          tipos compartilhados do frontend
└── lib/            validação (zod) e utilidades
```

### apps/api

```
src/
├── db/
│   ├── client.ts        cliente libSQL (Turso ou arquivo local)
│   ├── migrate.ts        runner de migrations
│   ├── seed.ts           dados de demonstração (nunca em produção)
│   └── migrations/       0001...0009, uma por domínio
├── middleware/
│   ├── auth.ts           extrai/valida a sessão (cookie httpOnly)
│   ├── requireAdmin.ts   restringe rotas administrativas
│   └── rateLimit.ts      limitação de tentativas em endpoints sensíveis
├── routes/         auth, tasks, habits, admin
├── services/       authService (hash/JWT), cryptoService (AES-256-GCM)
├── validators/     schemas zod de entrada
└── types/          tipos compartilhados do backend
```

---

## Segurança — regras que não podem ser quebradas

1. **Isolamento por usuário.** Toda tabela de dados do usuário tem uma
   coluna `owner_id`/`user_id`, e toda query de leitura/escrita nessas
   tabelas passa por `WHERE owner_id = req.user.id`. `req.user` só existe
   depois do middleware `requireAuth`, que decodifica o JWT do cookie —
   nunca aceite um id de usuário vindo do corpo da requisição.
2. **Senhas** são hasheadas com bcrypt (12 rounds), nunca armazenadas em
   texto puro.
3. **Sessão** vive em cookie `httpOnly`, nunca em `localStorage` — reduz
   superfície de XSS.
4. **Credenciais administrativas** (Gemini API Key, Turso Auth Token,
   senha SMTP) são criptografadas com AES-256-GCM antes de ir para o
   banco (`services/cryptoService.ts`) e a API nunca devolve o valor
   bruto de volta — apenas um preview mascarado (`••••••••••••AB23`).
5. **Papel de administrador** vem de uma coluna `role` no banco,
   verificada no backend (`requireAdmin`) — nunca por comparação de
   e-mail no frontend.
6. **Auditoria.** Toda alteração em `admin_settings` grava uma linha em
   `audit_logs` (quem, o quê, quando, IP) — nunca a credencial em si.

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
`DATABASE_URL=libsql://seu-banco.turso.io` e preencha
`DATABASE_AUTH_TOKEN`.

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

## Modelagem do banco (visão geral)

| Domínio | Tabelas |
|---|---|
| Usuários e admin | `users`, `user_settings`, `admin_settings`, `password_reset_tokens`, `audit_logs` |
| Metas e hábitos | `goals`, `goal_progress`, `habits`, `habit_entries` |
| Projetos e tarefas | `projects`, `project_members`, `task_statuses`, `tasks`, `subtasks`, `tags`, `task_tags`, `task_dependencies`, `time_entries` |
| Biblioteca | `books`, `book_notes`, `reading_sessions` |
| Educação | `educations`, `courses`, `subjects`, `academic_projects` |
| Saúde | `health_entries`, `water_entries`, `sleep_entries`, `workouts`, `mood_entries` |
| Foco e revisões | `focus_sessions`, `daily_reviews`, `weekly_reviews` |
| Calendário | `events`, `notifications` |
| Gamificação/Analytics | `achievements`, `user_achievements`, `life_scores`, `analytics_snapshots`, `ai_interactions` |

Todas as migrations estão em `apps/api/src/db/migrations`, numeradas na
ordem correta de dependência (ex: `goals` existe antes de `tasks`,
porque `tasks.goal_id` referencia `goals.id`).

---

## Roteiro (fases restantes)

- **Fase 3** — Educação, Biblioteca (rotas de API para as tabelas já
  existentes + integração com Google Books/Open Library por ISBN).
- **Fase 4** — Saúde, Água, Exercícios, Sono, Hábitos (UI completa;
  as rotas de hábitos já existem, faltam as demais).
- **Fase 5** — Focus Mode, Metas, Analytics, Timeline, Weekly Review.
- **Fase 6** — Gantt, `services/geminiService.ts` (IA), `services/emailService.ts`
  (SMTP real para recuperação de senha — hoje o token é apenas logado
  em desenvolvimento), implementação real dos testes de conexão do
  painel admin.
- **Fase 7** — PWA final (ícones reais, estratégia de cache mais
  completa), testes automatizados, otimizações de performance,
  preparação para empacotamento na Microsoft Store.

## Testes

```bash
npm run test --workspace apps/api
```

Estrutura de testes com Vitest já configurada no backend; siga
priorizando autenticação, isolamento entre usuários, Priority Score e
permissões administrativas, conforme o briefing original do produto.
