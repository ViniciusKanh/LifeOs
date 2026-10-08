# LifeOS Desktop (Windows · Tauri 2)

O LifeOS Desktop é um **aplicativo nativo instalado**: tem instalador `.exe`, janela própria, ícone e instância única, e lembra a posição da janela. Ele exibe o LifeOS **publicado na Vercel**.

Resultado: todo push na branch de produção → deploy da Vercel → a Web **e** o Desktop ficam atualizados juntos. O instalador só muda quando a parte nativa muda.

```
GitHub (push) ──► Vercel (deploy Web + API) ──► LifeOS Web
                                           └──► LifeOS Desktop (abre a mesma publicação)
GitHub (tag desktop-vX.Y.Z) ──► Actions (Windows) ──► GitHub Releases (.exe da parte nativa)
```

## Como funciona

1. **Tela local de abertura** (`apps/desktop/boot/`). Confere a conexão com o LifeOS e então abre `https://lifeos-sigma-five.vercel.app/dashboard`. Sem internet, mostra "Sem conexão" e tenta de novo sozinha.
2. **Login.** É o mesmo da Web: cookie httpOnly, na mesma origem. O app não guarda senhas nem tokens.
3. **Segurança** (`apps/desktop/src-tauri/src/lib.rs`):
   - O site remoto recebe só as permissões nativas de `remote_capability()`, e somente no domínio publicado. Hoje é só `core:app:allow-version`.
   - A navegação fica presa ao LifeOS. Links externos abrem no navegador padrão do Windows.
   - Nenhum segredo (Turso, Gemini, SMTP) existe no app.
4. **Na Web** (`apps/web/src/platform/`). `IS_DESKTOP` detecta a janela nativa em tempo de execução. Dentro do Desktop:
   - o login com Google fica oculto, porque o Google recusa OAuth em webviews embutidas;
   - o Web Push fica oculto (as notificações serão nativas);
   - o Perfil mostra o card "LifeOS Desktop" com a versão instalada.

Para trocar o endereço publicado: variável `LIFEOS_REMOTE_URL` no build (no GitHub: Settings → Variables). A fonte única é `REMOTE_URL` em `lib.rs`.

## Desenvolver no Windows

Pré-requisitos:

- Rust (rustup, toolchain MSVC);
- Visual Studio Build Tools com "Desenvolvimento para desktop com C++";
- Node 22;
- WebView2 (já vem no Windows 11).

```powershell
cd apps\desktop
npm install
npm run dev                                   # abre a janela apontando para a produção
$env:LIFEOS_REMOTE_URL="http://localhost:5173"; npm run dev   # contra o Vite local
```

Instalador local: `npm run build`. O `.exe` sai em `src-tauri\target\release\bundle\nsis\`.

## Publicar uma nova versão nativa

Só é necessário quando muda algo em `apps/desktop`: janela, bandeja, atalhos, permissões.

1. Ajuste a versão em `apps/desktop/src-tauri/tauri.conf.json`, `Cargo.toml` e `apps/desktop/package.json`.
2. Faça o commit e depois `git tag desktop-vX.Y.Z` e `git push origin desktop-vX.Y.Z`.
3. O workflow `Desktop (Windows) — release`:
   - confere a versão;
   - compila no Windows;
   - anexa o `.exe` a uma release em rascunho;
   - roda os testes do Rust;
   - só então publica a release.

## Configuração manual

- **GitHub → Settings → Actions → General → Workflow permissions:** "Read and write".
- **Vercel:** nada muda.

## Próximas etapas

- **Etapa 3 — Tauri Updater (para a parte nativa):**
  - gerar as chaves com `npx tauri signer generate -w ~/.tauri/lifeos.key`;
  - guardar a chave privada e a senha apenas em GitHub Secrets;
  - pôr a chave pública no `tauri.conf.json`.

  Se o repositório for privado, os downloads precisarão de uma rota autenticada.
- **Etapa 4:** bandeja, notificações nativas, atalhos globais e inicialização com o Windows. Os comandos novos entram em `remote_capability()` com o mínimo necessário.
- **Etapa 5:** SQLite local e sincronização. O monitoramento de apps será opcional, desligado por padrão, sem teclas digitadas, conteúdo ou capturas de tela.
