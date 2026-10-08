# LifeOS Desktop (Windows · Tauri 2)

O LifeOS Desktop reaproveita **todo** o frontend de `apps/web` (React + Vite).
Não há telas duplicadas: o mesmo código é compilado em modo `desktop`
(`vite build --mode desktop`) e empacotado pelo Tauri em `apps/desktop`.
A Web continua igual na Vercel.

## Arquitetura

| Parte | Web (Vercel) | Desktop (Tauri) |
|---|---|---|
| Frontend | `apps/web` → `dist/` com PWA | mesmo código → `dist-desktop/`, sem Service Worker |
| API | `/api` no mesmo domínio (cookie httpOnly) | `https://…vercel.app/api` (URL pública, configurável) |
| Sessão | cookie `lifeos_session` | mesmo JWT recebido no cabeçalho `X-LifeOS-Session`, salvo no Gerenciador de Credenciais do Windows e enviado como `Authorization: Bearer` |
| Banco | Turso via API | Turso via API (o app não tem credenciais do banco) |

Peças principais:

- `apps/web/src/platform/`: camada de plataforma.
  - `IS_DESKTOP` é decidido em build. O bundle Web não contém código do Tauri.
  - `requestAuth.ts`: cabeçalhos de autenticação de todo fetch.
  - `desktopSession.ts`: sessão no cofre do Windows via comandos Rust.
- `apps/api/src/services/sessionService.ts`:
  - entrega o token por cabeçalho somente quando a requisição traz `X-LifeOS-Client: desktop`;
  - aceita Bearer somente com esse cabeçalho.
  - A revogação ("sair de todos os dispositivos") continua valendo.
- `apps/api/src/app.ts`: o CORS aceita `http(s)://tauri.localhost` e `tauri://localhost`.
- `apps/desktop/src-tauri/`:
  - `session.rs`: cofre (keyring).
  - `lib.rs`: instância única e estado da janela.
  - `capabilities/main.json`: permissões mínimas.
  - `tauri.conf.json`: CSP restrita e instalador NSIS por usuário.

Limitação atual: o login com Google (OAuth por redirecionamento) fica oculto no Desktop. Use e-mail e senha. Será tratado com deep link numa próxima etapa.

## Desenvolver no Windows

Pré-requisitos:

- Rust (rustup, toolchain MSVC);
- Visual Studio Build Tools com "Desenvolvimento para desktop com C++";
- Node 22;
- WebView2 (já vem no Windows 11).

```powershell
npm install                          # raiz (Web + API)
cd apps\desktop
npm install                          # CLI do Tauri
npm run dev                          # abre a janela com hot reload (Vite em modo desktop)
```

Por padrão o app usa a API de produção. Para usar a API local:

```powershell
$env:LIFEOS_DESKTOP_API_URL = "http://localhost:3333/api"; npm run dev
```

Gerar o instalador localmente: `npm run build` em `apps\desktop`. O `.exe` sai em `src-tauri\target\release\bundle\nsis\`.

## Publicar uma versão

1. Ajuste `version` em `apps/desktop/src-tauri/tauri.conf.json` (e, por consistência, em `Cargo.toml` e `apps/desktop/package.json`).
2. Faça o commit e depois rode `git tag desktop-vX.Y.Z` e `git push origin desktop-vX.Y.Z`.
3. O workflow `Desktop (Windows) — release`:
   - confere se a versão da tag bate com o `tauri.conf.json`;
   - compila na `windows-latest`;
   - anexa o instalador a uma release em **rascunho**;
   - roda os testes do Rust;
   - só então publica a release.

   Se qualquer passo falhar, nada é publicado como estável.

Commits comuns e pushes na branch de produção **não** geram versão Desktop.

## Configuração manual

- **GitHub → Settings → Actions → General → Workflow permissions:** "Read and write" (o workflow cria releases).
- **Opcional — GitHub → Settings → Variables:** `LIFEOS_DESKTOP_API_URL`, se a URL da API mudar.
- **Vercel:** nada muda. Opcionalmente, configure o "Ignored Build Step" para não fazer deploy quando só `apps/desktop/**` ou `.github/**` mudarem.

## Próximas etapas

- **Etapa 3 — Tauri Updater:**
  - gerar o par de chaves com `npx tauri signer generate -w ~/.tauri/lifeos.key`;
  - guardar a chave privada e a senha apenas em GitHub Secrets (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`);
  - pôr a chave pública no `tauri.conf.json`.

  Essa assinatura é diferente da assinatura de código do Windows (Authenticode).
- **Etapa 4:** bandeja, notificações nativas, atalhos globais e inicialização com o Windows.
- **Etapa 5:** SQLite local e fila de sincronização. O monitoramento de aplicativos será opcional, desligado por padrão, sem teclas digitadas, conteúdo ou capturas de tela.
