<div align="center">

<img src="apps/web/public/logo/horizontal.png" alt="LifeOS" width="320" />

### Transforme sua rotina em progresso.

Sistema operacional pessoal para produtividade, estudos, saúde, hábitos, leitura e Personal Analytics.

[**Acessar o app**](https://lifeos-sigma-five.vercel.app) ·
[**Download para Windows**](#download) ·
[Política de Privacidade](docs/PRIVACY.md) ·
[Termo de Uso](docs/TERMS.md) ·
[Deploy](DEPLOY.md)

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![Turso](https://img.shields.io/badge/Turso-libSQL-4FF8D2?logo=turso&logoColor=black)
![Gemini](https://img.shields.io/badge/IA-Gemini-8E75B2?logo=googlegemini&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-ready-5A0FC8?logo=pwa&logoColor=white)

</div>

---

## Sumário

- [Download](#download)
- [Code signing policy](#code-signing-policy)
- [O que é o LifeOS](#o-que-é-o-lifeos)
- [Módulos](#módulos)
- [Stack](#stack)
- [Arquitetura](#arquitetura)
- [Começando](#começando)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Scripts](#scripts)
- [Banco de dados e migrations](#banco-de-dados-e-migrations)
- [Segurança](#segurança)
- [Administração](#administração)
- [Privacidade e Termos](#privacidade-e-termos)
- [Deploy](#deploy)
- [Referência da API](#referência-da-api)
- [Testes](#testes)
- [Roteiro](#roteiro)
- [Licença](#licença)

---

## Download

**Windows (LifeOS Desktop):** baixe o instalador `LifeOS_x.y.z_x64-setup.exe` na
[página de Releases](https://github.com/ViniciusKanh/LifeOs/releases/latest).
O app atualiza sozinho a cada nova versão (atualizações assinadas e verificadas).

**Web / celular:** use direto em [lifeos-sigma-five.vercel.app](https://lifeos-sigma-five.vercel.app)
(pode ser instalado como PWA pelo navegador).

> Code signing for Windows releases: free code signing provided by
> [SignPath.io](https://about.signpath.io/), certificate by
> [SignPath Foundation](https://signpath.org/). See the [code signing policy](#code-signing-policy).

---

## Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by
[SignPath Foundation](https://signpath.org/).

**Team roles**

- Committers and reviewers: [Vinicius Santos](https://github.com/ViniciusKanh)
- Approvers: [Vinicius Santos](https://github.com/ViniciusKanh)

**What is signed**

Only the Windows installer and executable of LifeOS Desktop, built from this
repository's source code by the GitHub Actions workflow
[`desktop-release.yml`](.github/workflows/desktop-release.yml). Every signing
request is manually approved by the approver. Third-party binaries are not
signed with this certificate.

**Privacy policy**

This program will not transfer any information to other networked systems
unless specifically requested by the user or the person installing or
operating it. LifeOS Desktop opens the LifeOS web application
(`lifeos-sigma-five.vercel.app`) and checks GitHub Releases for signed
updates; the data you enter is sent only to your own LifeOS account. It does
not collect keystrokes, documents or screenshots. Full policy (Portuguese):
[Política de Privacidade](https://lifeos-sigma-five.vercel.app/privacidade) ·
[Termo de Uso](https://lifeos-sigma-five.vercel.app/termos).

---

## O que é o LifeOS

O LifeOS reúne em um só produto o que normalmente fica espalhado entre um app
de tarefas, uma planilha de hábitos, um caderno de metas, um app de leitura e
um app de saúde — e faz esses módulos **conversarem entre si**. Cada registro
alimenta métricas, histórico (Timeline) e insights.

O ciclo por trás de cada módulo é sempre o mesmo:

**Planejar → Executar → Registrar → Medir → Melhorar.**

> **Regra de ouro dos números:** todas as métricas, gráficos e insights são
> calculados a partir de dados reais gravados pelo próprio usuário. Sem dado
> suficiente, o indicador mostra "sem dados ainda" — nunca um valor inventado.

---

## Módulos

| Área | Módulos |
|---|---|
| **Visão geral** | Dashboard com **Life Score** (radar de 7 dimensões), **Hoje** (centro de comando do dia), Contexto do Dia, Semana, Inbox |
| **Execução** | Tarefas + Kanban (anexos, cronômetro por tarefa), Projetos (página de detalhe), Calendário, Área Profissional, Capacity Planner, Deadline Radar |
| **Foco** | Focus Mode / Pomodoro vinculado a tarefas e projetos |
| **Educação** | Formação → Curso → Disciplina, trabalhos, TCC/dissertação/tese com Kanban próprio |
| **Biblioteca** | Cadastro por ISBN (Google Books / Open Library), sessões de leitura, notas e insights |
| **Saúde e bem-estar** | Água, sono, exercícios, humor e energia (bem-estar pessoal, nunca diagnóstico) |
| **Hábitos e metas** | Streaks e consistência, metas numéricas/percentuais/por etapas, Goal Forecast |
| **Reflexão** | Diário (texto rico, mídia e IA), Weekly Review, Experimentos Pessoais, Gatilhos |
| **Medir e melhorar** | Analytics, Signals, Data Health, Timeline automática, Life Map, Conquistas (gamificação baseada em conquistas reais) |
| **IA** | **LifeOS Copilot** (Gemini) — separa *dado real*, *inferência* e *sugestão*; qualquer ação que altere dados pede confirmação |
| **Conta** | Perfil, vínculo com Google, **verificação em duas etapas (MFA)**, exportação e exclusão de dados |
| **Admin** | Integrações (Gemini, Turso, SMTP, Google OAuth), **gestão de usuários** e auditoria |

Interface responsiva (desktop, notebook, tablet e celular), tema claro/escuro,
navegação inferior no mobile e PWA instalável.

---

## Stack

| Camada | Tecnologias |
|---|---|
| **Frontend** (`apps/web`) | React 18, TypeScript estrito, Vite, Tailwind CSS, TanStack Query, React Router, React Hook Form + Zod, Motion, Lucide, TipTap |
| **Backend** (`apps/api`) | Node.js, Express, TypeScript, Zod, JSON Web Token (cookie httpOnly), bcryptjs, Nodemailer, web-push, qrcode |
| **Banco** | Turso / libSQL (SQLite em arquivo no desenvolvimento) |
| **IA** | Google Gemini (chave configurada pelo admin, criptografada no banco) |
| **Hospedagem** | Vercel — site estático + API como função serverless no mesmo projeto |
| **Testes** | Vitest + Supertest |

---

## Arquitetura

Monorepo com npm workspaces:

```
LifeOS/
├── api/index.ts            entrada da função serverless na Vercel
├── apps/
│   ├── web/                frontend React
│   │   └── src/
│   │       ├── pages/        uma pasta por módulo (hoje, tarefas, saude, legal, admin…)
│   │       ├── components/   ui/ (design system), layout/, auth/, profile/, legal/, admin/…
│   │       ├── hooks/        um hook por domínio (useTasks, useAuth, useAdmin…)
│   │       ├── services/     clientes da API, um por domínio
│   │       ├── content/      textos fixos (ex.: legal.ts — Termos e Privacidade)
│   │       └── types/        tipos compartilhados do frontend
│   └── api/                backend Express
│       ├── src/
│       │   ├── db/           cliente libSQL, runner e migrations (aditivas)
│       │   ├── middleware/   requireAuth, requireAdmin, rateLimit
│       │   ├── routes/       um router por domínio
│       │   ├── services/     regras de negócio (métricas, sessão, MFA/TOTP, cripto…)
│       │   ├── validators/   schemas Zod de entrada
│       │   └── config/       constantes (versão dos termos etc.)
│       └── tests/            Vitest + Supertest
├── docs/                   PRIVACY.md, TERMS.md e documentos de produto
├── scripts/                utilitários (ex.: gerar docs legais)
├── vercel.json
└── .env.example
```

Princípios: regras de negócio ficam em `services/` (nunca nos componentes),
toda query filtra por `owner_id`, componentes do design system são reaproveitados
em todas as telas e os comentários de código são em português.

---

## Começando

**Pré-requisitos:** Node.js 20+ e npm 10+.

```bash
git clone https://github.com/ViniciusKanh/LifeOs.git
cd LifeOs
npm install

cp .env.example apps/api/.env      # configure os segredos (ver abaixo)
cp .env.example apps/web/.env      # só VITE_API_URL é usada no frontend

npm run migrate                    # cria/atualiza as tabelas
npm run seed                       # (opcional) usuário demo: demo@lifeos.app / Demo1234
npm run dev                        # API na porta 3333 + Web na 5173
```

Acesse http://localhost:5173. Cadastre-se com o e-mail definido em
`ADMIN_EMAIL` para receber automaticamente o papel de administrador.

> No Windows (PowerShell), se `npm run dev` não iniciar os dois processos,
> use dois terminais: `npm run dev:api` e `npm run dev:web`.

---

## Variáveis de ambiente

Todas ficam em `apps/api/.env` (local) ou nas *Environment Variables* do
projeto na Vercel (produção). **Nunca faça commit do `.env`.**

| Variável | Obrigatória | Descrição |
|---|---|---|
| `JWT_SECRET` | ✅ | Segredo que assina as sessões. Gere com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CREDENTIALS_ENCRYPTION_KEY` | ✅ | 32 bytes em hex. Criptografa credenciais das integrações **e os segredos de MFA** (AES-256-GCM). Não troque depois de ter usuários com MFA ativo. |
| `DATABASE_URL` | ✅ | `file:./data/lifeos.db` no desenvolvimento; `libsql://seu-banco.turso.io` em produção |
| `DATABASE_AUTH_TOKEN` | produção | Token do Turso |
| `ADMIN_EMAIL` | ✅ | E-mail promovido automaticamente a `role = 'admin'` |
| `APP_URL` | produção | URL pública do app (links de e-mail, redefinição de senha, redirect do Google). Ex.: `https://lifeos-sigma-five.vercel.app` |
| `WEB_ORIGIN` | dev | Origem permitida no CORS (`http://localhost:5173`) |
| `GOOGLE_REDIRECT_BASE_URL` | opcional | Base fixa do redirect do Google OAuth (por padrão usa o host da requisição) |
| `CRON_SECRET` | produção | Protege os endpoints de cron (e-mail semanal e gatilhos) |
| `COOKIE_SAMESITE` | opcional | `lax` (padrão) ou `none` se API e web estiverem em domínios diferentes |
| `AUTH_RATE_LIMIT_WINDOW_MS` / `AUTH_RATE_LIMIT_MAX` | opcional | Limite de tentativas nos endpoints de autenticação |
| `JWT_EXPIRES_IN` | legado | Não controla mais a duração da sessão (ver [Sessões](#sessões-e-permanecer-conectado)) |
| `PORT` | opcional | Porta da API (padrão 3333) |
| `VITE_API_URL` | web/dev | URL da API usada pelo frontend (`http://localhost:3333/api`). Em produção é `/api`. |

Gemini, SMTP e Google OAuth **não** vão no `.env`: são configurados pelo admin
em **Configurações** e ficam criptografados no banco.

---

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | API + Web em modo desenvolvimento |
| `npm run dev:api` / `npm run dev:web` | Apenas um dos lados |
| `npm run build` | Build de produção do frontend e da API |
| `npm run migrate` | Aplica migrations pendentes |
| `npm run seed` | Dados de demonstração (nunca em produção) |
| `npm run test --workspace apps/api` | Testes do backend |
| `npm run lint --workspace apps/web` | Checagem de tipos do frontend |
| `npm run docs:legal` | Regenera `docs/PRIVACY.md` e `docs/TERMS.md` a partir de `apps/web/src/content/legal.ts` |

---

## Banco de dados e migrations

- Migrations em `apps/api/src/db/migrations`, numeradas (`0001_…` até a mais
  recente) e sempre **aditivas**: nunca apagam tabelas nem dados.
- O runner guarda o que já foi aplicado; rodar `npm run migrate` de novo é seguro.
- Em produção, a função serverless inclui as migrations (`vercel.json → includeFiles`).
- Todas as tabelas de dados do usuário têm `owner_id` com `ON DELETE CASCADE`
  para `users` — excluir uma conta apaga todos os dados dela.

| Domínio | Tabelas principais |
|---|---|
| Contas e segurança | `users`, `user_settings`, `mfa_recovery_codes`, `password_reset_tokens`, `admin_settings`, `audit_logs` |
| Execução | `projects`, `tasks`, `subtasks`, `tags`, `task_dependencies`, `time_entries`, `events` |
| Hábitos e metas | `habits`, `habit_entries`, `goals`, `goal_progress` |
| Biblioteca | `books`, `book_notes`, `reading_sessions` |
| Educação | `educations`, `courses`, `subjects`, `academic_projects` |
| Saúde | `water_entries`, `sleep_entries`, `workouts`, `mood_entries` |
| Foco e reflexão | `focus_sessions`, `daily_reviews`, `weekly_reviews`, diário e experimentos |
| Medição | `achievements`, `user_achievements`, `life_scores`, `analytics_snapshots`, `ai_interactions`, `notifications` |

---

## Segurança

1. **Isolamento por usuário** — toda query filtra por `owner_id = req.user.id`;
   o id do usuário nunca vem do corpo da requisição.
2. **Senhas** com bcrypt (12 rounds). Nunca em texto puro.
3. **Sessão em cookie `httpOnly` + `Secure` + `SameSite`** — nada de tokens em
   `localStorage`.
4. **Credenciais administrativas** (Gemini, Turso, SMTP, Google) criptografadas
   com AES-256-GCM; a API só devolve um preview mascarado.
5. **Papel de admin** vem da coluna `role`, verificada no backend
   (`requireAdmin`) e relida do banco a cada requisição — nunca por e-mail no frontend.
6. **Queries parametrizadas**, validação Zod em todas as entradas, rate limit
   nos endpoints de autenticação e logs sem segredos.
7. **Auditoria** — ações administrativas gravam `audit_logs` (quem, o quê, quando, IP).

### Verificação em duas etapas (MFA)

- TOTP (RFC 6238) compatível com Google Authenticator, Microsoft Authenticator,
  Authy, 1Password etc. Ativação em **Perfil → Verificação em duas etapas** (QR code
  ou chave manual).
- O segredo é criptografado no banco; o mesmo código não pode ser reutilizado
  (proteção contra replay).
- **8 códigos de recuperação** de uso único (armazenados como hash).
- Vale também para o login com Google: com MFA ativo, o código é pedido depois do Google.
- Desativar exige senha + código. Se a pessoa perder o celular e os códigos,
  o admin pode remover o MFA pela tela de Usuários.

### Sessões e "Permanecer conectado"

- Marcado (padrão): sessão de **30 dias**, renovada automaticamente enquanto o app é usado.
- Desmarcado: sessão de **12 horas**.
- Trocar/redefinir a senha, remover MFA ou usar **"Sair de todos os
  dispositivos"** invalida imediatamente todas as outras sessões (`session_version`).

---

## Administração

Disponível apenas para `role = 'admin'` (validado no backend), em
**Configurações → Usuários** (`/admin/usuarios`):

- Lista com status de cada conta: MFA, Google, e-mail verificado, termos e último acesso.
- Painel de detalhes com **o que a pessoa usa no app** — somente **contagens por
  módulo** e espaço de mídia. O conteúdo dos registros nunca é exibido.
- Ações: **remover MFA**, **enviar e-mail de redefinição de senha**, **gerar senha
  provisória** (exibida uma única vez), **encerrar sessões**, alterar perfil e
  **excluir conta** (com confirmação digitando o e-mail).
- O admin não pode executar essas ações sobre a própria conta, e o último
  administrador não pode ser removido.
- Tudo fica registrado no histórico administrativo.

---

## Privacidade e Termos

- **Política de Privacidade:** [`docs/PRIVACY.md`](docs/PRIVACY.md) · no app em
  [`/privacidade`](https://lifeos-sigma-five.vercel.app/privacidade)
- **Termo de Uso:** [`docs/TERMS.md`](docs/TERMS.md) · no app em
  [`/termos`](https://lifeos-sigma-five.vercel.app/termos)

Os textos seguem a LGPD (Lei nº 13.709/2018) e servem como URL de privacidade
na publicação da Microsoft Store. A fonte única é
`apps/web/src/content/legal.ts`; a versão precisa bater com
`CURRENT_TERMS_VERSION` em `apps/api/src/config/legal.ts`. Ao mudar a versão,
todos os usuários precisam aceitar de novo no próximo acesso. Depois de editar,
rode `npm run docs:legal`.

O aceite é obrigatório no cadastro e fica registrado (versão + data). O usuário
pode exportar os dados e excluir a conta a qualquer momento em **Perfil**.

---

## Deploy

O projeto é publicado como **um único projeto na Vercel** (site estático + API
serverless). O passo a passo completo — variáveis, Turso, migrations, Google
OAuth e cron — está em [`DEPLOY.md`](DEPLOY.md).

Checklist rápido:

1. Criar o banco no Turso e rodar `npm run migrate` apontando para ele.
2. Configurar as variáveis de ambiente na Vercel (tabela acima), incluindo `APP_URL`.
3. Fazer push para `main` — a Vercel faz o build automaticamente.
4. Entrar com o `ADMIN_EMAIL` e configurar Gemini, SMTP e Google em **Configurações**.

---

## Referência da API

Todas as rotas exigem sessão autenticada, exceto onde indicado. Rotas de admin
exigem também `role = 'admin'`.

### Autenticação e conta — `/api/auth`

| Método | Rota | Descrição |
|---|---|---|
| POST | `/register` | Cria conta (exige `acceptTerms: true`) — público, com rate limit |
| POST | `/login` | Autentica; com MFA ativo devolve `{ mfaRequired, mfaToken }` — público |
| POST | `/login/mfa` | Conclui o login com código TOTP ou de recuperação — público |
| POST | `/logout` | Encerra a sessão atual |
| POST | `/logout-all` | Encerra a sessão em todos os dispositivos |
| GET \| PATCH | `/me` | Dados do usuário / atualiza nome e avatar |
| DELETE | `/me` | Exclui a própria conta (e-mail + senha + código MFA, se ativo) |
| POST | `/accept-terms` | Registra o aceite da versão atual dos termos |
| POST | `/change-password` | Troca a senha e encerra as outras sessões |
| POST | `/forgot-password` \| `/reset-password` | Recuperação de senha por e-mail — público |
| GET | `/mfa/status` | Status do MFA e códigos restantes |
| POST | `/mfa/setup` \| `/mfa/enable` | Gera o QR code / confirma a ativação (devolve códigos de recuperação) |
| POST | `/mfa/disable` | Desativa (senha + código) |
| POST | `/mfa/recovery-codes` | Gera novos códigos de recuperação |
| GET | `/google/start` \| `/google/callback` | Login com Google — público |
| GET \| POST | `/google/link/start` \| `/google/unlink` | Vincula/desvincula a conta Google (desvincular exige senha) |

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
| GET \| PUT | `/settings` | Lê/grava credenciais (Gemini, Turso, SMTP, Google) — sempre criptografadas |
| DELETE | `/settings/:integration/:keyName` | Remove uma credencial |
| POST | `/settings/:integration/test` | Testa a conexão de uma integração |
| GET | `/audit-logs` | Histórico de ações administrativas |
| GET \| POST | `/users` | Lista/cria usuários |
| GET | `/users/:id/overview` | Status + contagens de uso por módulo (sem conteúdo) |
| PATCH | `/users/:id/role` | Promove/rebaixa |
| POST | `/users/:id/mfa/reset` | Remove o MFA e encerra as sessões |
| POST | `/users/:id/password-reset` | Envia e-mail de redefinição |
| POST | `/users/:id/temp-password` | Gera senha provisória (exibida uma vez) |
| POST | `/users/:id/revoke-sessions` | Encerra todas as sessões |
| DELETE | `/users/:id` | Exclui a conta e todos os dados |

---

## Testes

```bash
npm run test --workspace apps/api          # backend (Vitest + Supertest)
npm run lint --workspace apps/web          # tipos do frontend
```

Os testes cobrem autenticação, MFA (ativação, login, replay, códigos de
recuperação), ações administrativas, aceite de termos, isolamento entre
usuários e cálculos de métricas.

---

## Roteiro

- Empacotamento PWA para a **Microsoft Store** (PWABuilder).
- Integrações externas: Google Calendar/Outlook, Google Fit, Strava, GitHub.
- Notificações push mais ricas e modo offline.

---

## Licença

Distribuído sob a licença [MIT](LICENSE). © 2026 Vinicius Santos.

---

<div align="center">

Feito por **Vinicius Santos** · <a href="mailto:viniciussouza742@gmail.com">viniciussouza742@gmail.com</a>

</div>
