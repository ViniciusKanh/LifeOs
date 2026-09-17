# Deploy do LifeOS na Vercel

O LifeOS é um monorepo (`apps/web` + `apps/api`) publicado como **um único
projeto na Vercel**, na raiz do repositório: o front (Vite) vira o site
estático e a API (Express) vira uma função serverless dentro do mesmo
projeto. Uma URL só, um lugar só pra variáveis de ambiente, sem CORS e
sem proxy entre domínios diferentes — o `vercel.json` na raiz do repo já
faz essa configuração.

```
lifeos (repositório) → 1 projeto Vercel (Root Directory = raiz do repo)
├── apps/web/dist          → servido como site estático
└── apps/api/api/index.ts  → função serverless, chamada via /api/*
```

## 0. Pré-requisitos

- Conta na [Vercel](https://vercel.com) com o repositório do LifeOS conectado
  (GitHub).
- Um banco [Turso](https://turso.tech) já criado, com `DATABASE_URL` e
  `DATABASE_AUTH_TOKEN` em mãos (o arquivo `.env` local usa um SQLite em
  arquivo, que não funciona em serverless — precisa ser um banco Turso
  remoto de verdade em produção).
- As migrations já aplicadas nesse banco: rode, localmente,
  ```
  cd apps/api
  $env:DATABASE_URL="libsql://..."; $env:DATABASE_AUTH_TOKEN="..."; npm run migrate
  ```
  (ou exporte as variáveis no `.env` antes de rodar `npm run migrate`).
- Uma chave de 32 bytes para `CREDENTIALS_ENCRYPTION_KEY`: gere com
  `openssl rand -hex 32` (no PowerShell, sem `openssl`, pode gerar em
  https://generate-secret.vercel.app/32 ou com
  `[Convert]::ToHexString((1..32|%{Get-Random -Max 256}))`).

## 1. Criar o projeto pelo terminal

Na raiz do repositório (`C:\dev\LifeOS`), **não** dentro de `apps/api` nem
`apps/web`:

```powershell
cd C:\dev\LifeOS
vercel project add lifeos
vercel link
```

No `vercel link`, responda:
- `Set up "C:\dev\LifeOS"?` → `y`
- `Which scope?` → sua equipe
- `Link to existing project?` → `y`
- `What's the name of your existing project?` → `lifeos`

## 2. Variáveis de ambiente (tudo num lugar só)

Pelo dashboard (Project → Settings → Environment Variables) ou pelo
terminal com `vercel env add NOME production`:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | URL `libsql://...` do Turso |
| `DATABASE_AUTH_TOKEN` | token do Turso |
| `JWT_SECRET` | string aleatória longa |
| `JWT_EXPIRES_IN` | ex.: `7d` |
| `CREDENTIALS_ENCRYPTION_KEY` | 32 bytes em hex |
| `ADMIN_EMAIL` | e-mail que deve virar admin automaticamente no cadastro |
| `WEB_ORIGIN` | a própria URL do projeto (ex.: `https://lifeos.vercel.app`) |
| `APP_URL` | a mesma URL acima |
| `AUTH_RATE_LIMIT_WINDOW_MS` | ex.: `900000` |
| `AUTH_RATE_LIMIT_MAX` | ex.: `10` |
| `NODE_ENV` | `production` |
| `VITE_API_URL` | `/api` |

Como front e back são o mesmo domínio, não precisa de `COOKIE_SAMESITE`
nem nada especial de CORS — o padrão (`lax`) já funciona.

## 3. Deploy

```powershell
vercel --prod
```

Teste `https://SEU-PROJETO.vercel.app/api/health` (deve responder
`{"status":"ok"}`) e depois abra o site normalmente — front e back já
saem do mesmo domínio.

## 4. E-mail (Gmail/SMTP) em produção

Não vai em variável de ambiente — configure direto dentro do LifeOS já
publicado, em **Configurações → E-mail (Gmail)**: servidor `smtp.gmail.com`,
porta `587`, o e-mail e o app password (Conta Google → Segurança →
Verificação em duas etapas → Senhas de app). Fica salvo criptografado no
banco, então dá pra trocar sem redeployar. Use o botão "Testar conexão"
pra confirmar.

Sem essas credenciais configuradas, o LifeOS continua funcionando: o link
de redefinição de senha só deixa de ser enviado por e-mail (fica
registrado no servidor, visível apenas em ambiente de desenvolvimento).

## 5. CI/CD

Cada `git push` no branch conectado já dispara um novo deploy automático
(front + back juntos, mesmo projeto). As migrations em
`apps/api/src/db/migrations/` são aplicadas automaticamente: a function
da API roda `runMigrations()` (idempotente, cada arquivo só aplica uma
vez) no primeiro request de cada cold start, então não é mais preciso
rodar `npm run migrate` manualmente contra produção depois de um deploy.
Continue usando `npm run migrate` normalmente em desenvolvimento local.

## 6. Alternativa: dois projetos separados

Se um dia preferir separar front e back em dois projetos Vercel distintos
(por exemplo, pra escalar/monitorar cada um de forma independente), os
arquivos `apps/web/vercel.json` e `apps/api/vercel.json` já ficam prontos
pra isso — é só criar dois projetos na Vercel com **Root Directory**
`apps/web` e `apps/api` respectivamente, em vez de um projeto na raiz.
Nesse caso o front reescreve `/api/*` para o domínio do projeto da API
(edite a URL de exemplo em `apps/web/vercel.json`), e a API pode precisar
de `COOKIE_SAMESITE=none` caso os dois domínios fiquem realmente
separados sem esse proxy.
