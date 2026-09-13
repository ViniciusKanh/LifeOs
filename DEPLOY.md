# Deploy do LifeOS na Vercel

O LifeOS é um monorepo com dois apps (`apps/web` e `apps/api`) e é publicado
como **dois projetos separados na Vercel**, um para cada app. Essa é a forma
mais simples e confiável de rodar um front estático (Vite) e uma API Express
no mesmo monorepo na Vercel, e é o que este guia documenta.

```
lifeos (repositório)
├── apps/web   → Projeto Vercel #1 (site estático + PWA)
└── apps/api   → Projeto Vercel #2 (função serverless Node/Express)
```

As duas partes conversam por HTTP: o projeto do front reescreve toda
chamada `/api/*` para o domínio do projeto da API (via `rewrites` no
`vercel.json` do front), então do ponto de vista do navegador tudo é
"same-origin" — cookies de sessão continuam funcionando normalmente,
sem precisar mexer em CORS ou em `SameSite`.

## 0. Pré-requisitos

- Conta na [Vercel](https://vercel.com) com o repositório do LifeOS conectado
  (GitHub/GitLab/Bitbucket).
- Um banco [Turso](https://turso.tech) já criado, com `DATABASE_URL` e
  `DATABASE_AUTH_TOKEN` em mãos.
- As migrations já aplicadas nesse banco (rode `npm run migrate --workspace apps/api`
  localmente, apontando `DATABASE_URL`/`DATABASE_AUTH_TOKEN` do `.env` para o
  banco de produção, antes do primeiro deploy — a Vercel não roda migrations
  sozinha).
- Uma chave de 32 bytes para `CREDENTIALS_ENCRYPTION_KEY`: gere com
  `openssl rand -hex 32`.

## 1. Deploy da API (`apps/api`)

1. Na Vercel, **Add New → Project**, escolha o repositório e defina o
   **Root Directory** como `apps/api`.
2. Framework preset: **Other** (é uma função serverless simples, sem
   framework detectável).
3. Build & Output: pode deixar em branco — o `vercel.json` do próprio
   `apps/api` já diz à Vercel para publicar `api/index.ts` como função e
   reescrever qualquer rota para ela.
4. Variáveis de ambiente (Project Settings → Environment Variables):

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | URL `libsql://...` do Turso |
   | `DATABASE_AUTH_TOKEN` | token do Turso |
   | `JWT_SECRET` | string aleatória longa (`openssl rand -hex 32`) |
   | `JWT_EXPIRES_IN` | ex.: `7d` |
   | `CREDENTIALS_ENCRYPTION_KEY` | 32 bytes em hex (`openssl rand -hex 32`) |
   | `ADMIN_EMAIL` | e-mail que deve virar admin automaticamente no cadastro |
   | `WEB_ORIGIN` | URL pública do projeto do front (ex.: `https://lifeos.vercel.app`) |
   | `APP_URL` | mesma URL do front — usada para montar o link de redefinição de senha |
   | `AUTH_RATE_LIMIT_WINDOW_MS` | ex.: `900000` |
   | `AUTH_RATE_LIMIT_MAX` | ex.: `10` |
   | `NODE_ENV` | `production` |

5. Deploy. Anote a URL gerada (ex.: `https://lifeos-api.vercel.app`) — ela
   entra no passo 2.
6. Teste rápido: `https://lifeos-api.vercel.app/api/health` deve responder
   `{"status":"ok"}`.

## 2. Deploy do front (`apps/web`)

1. **Add New → Project** de novo, mesmo repositório, **Root Directory**
   `apps/web`.
2. Framework preset: **Vite** (detectado automaticamente).
3. Edite `apps/web/vercel.json` **antes de fazer o deploy** e troque
   `https://SEU-PROJETO-API.vercel.app` pela URL real da API do passo 1:

   ```json
   { "source": "/api/(.*)", "destination": "https://lifeos-api.vercel.app/api/$1" }
   ```

4. Variáveis de ambiente:

   | Variável | Valor |
   |---|---|
   | `VITE_API_URL` | `/api` (relativo — o rewrite acima cuida do resto) |

5. Deploy. O site fica em algo como `https://lifeos.vercel.app`.
6. Volte no projeto da API e confirme que `WEB_ORIGIN`/`APP_URL` apontam
   para essa URL final (redeploy da API se precisar corrigir).

## 3. Domínio próprio (opcional)

Configure o domínio customizado só no projeto do **front** (Vercel →
Domains). A API pode continuar no domínio `*.vercel.app` — como o front
faz o proxy de `/api/*`, o visitante nunca precisa saber a URL da API
diretamente.

## 4. E-mail (SMTP/Gmail) em produção

O envio de e-mails (boas-vindas no cadastro, redefinição de senha, aviso
de troca de senha) usa as credenciais cadastradas em **Configurações**
dentro do próprio LifeOS (menu do admin), não variáveis de ambiente — isso
permite trocar a conta de e-mail sem precisar redeployar. Configure lá,
com um app password do Gmail:

1. Conta Google → Segurança → Verificação em duas etapas → Senhas de app.
2. Em LifeOS → Configurações → "E-mail (Gmail)": servidor `smtp.gmail.com`,
   porta `587`, o e-mail e o app password gerado.
3. Use o botão "Testar conexão" para confirmar antes de depender dele.

Sem essas credenciais configuradas, o LifeOS continua funcionando: o link
de redefinição de senha só deixa de ser enviado por e-mail (fica registrado
no servidor, visível apenas em ambiente de desenvolvimento).

## 5. Alternativa sem o proxy (domínios totalmente separados)

Se preferir não usar o rewrite do passo 2 e apontar o front direto para a
URL pública da API (`VITE_API_URL=https://lifeos-api.vercel.app/api`), é
preciso também configurar, no projeto da **API**:

- `COOKIE_SAMESITE=none` (cookies cross-site exigem `SameSite=None` +
  `Secure`, que a Vercel já atende via HTTPS).

Essa rota funciona, mas o proxy do passo 2 é a opção recomendada por ser
mais simples e não depender de configuração extra de cookies no navegador.

## 6. CI/CD

Cada push nos branches conectados dispara um novo deploy automático em
cada um dos dois projetos Vercel — não é preciso nenhum pipeline adicional.
Rode migrations manualmente (`npm run migrate --workspace apps/api` local,
apontando para o Turso de produção) sempre que adicionar uma nova migration
em `apps/api/src/db/migrations/`, antes ou logo depois do deploy que a usa.
