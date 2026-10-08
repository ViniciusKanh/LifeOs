# LifeOS Desktop (Windows · Tauri 2)

O LifeOS Desktop é um **aplicativo nativo instalado**: tem instalador `.exe`, janela própria, ícone e instância única, e lembra a posição da janela. Ele exibe o LifeOS **publicado na Vercel**.

Resultado: todo push na branch de produção → deploy da Vercel → a Web **e** o Desktop ficam atualizados juntos. O instalador só muda quando a parte nativa muda — e essa atualização também é automática, pelo Tauri Updater (com sua confirmação).

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

## Atualização automática da parte nativa (Tauri Updater)

O app verifica `https://github.com/ViniciusKanh/LifeOs/releases/latest/download/latest.json`:

- 8 segundos depois de abrir e a cada 6 horas;
- também em Perfil → LifeOS Desktop → "Verificar atualizações".

Havendo versão nova, o aviso mostra a versão e as notas. A instalação só acontece com "Atualizar agora": baixa com barra de progresso, verifica a **assinatura**, instala (modo passivo no Windows) e reabre o app. "Mais tarde" não pergunta de novo por aquela versão.

Pacotes sem assinatura válida são recusados, e nada é alterado no app. Isso foi testado com um pacote falso.

Chaves:

- A pública está em `tauri.conf.json` (`plugins.updater.pubkey`).
- A privada e a senha ficam **somente** nos GitHub Secrets `TAURI_SIGNING_PRIVATE_KEY` e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, e num backup seu fora do repositório.
- Se a chave privada for perdida, as versões instaladas não aceitam mais atualizações: será preciso gerar outra chave e reinstalar manualmente uma vez.
- Essa assinatura não é a assinatura de código do Windows (Authenticode). Sem Authenticode, o SmartScreen pode avisar na primeira instalação.

O workflow falha antes de compilar se o secret da chave não existir. Uma release só fica "latest" (visível ao updater) depois de compilar, assinar e passar nos testes.

## Instalador

O instalador NSIS tem a identidade do LifeOS:

- ícone próprio;
- arte lateral e cabeçalho em pixel art (`src-tauri/installer/sidebar.bmp` e `header.bmp`);
- página de **Termos de Uso e Política de Privacidade**;
- metadados de editor, copyright e site.

A página de termos usa `src-tauri/installer/license.rtf`, gerado pelo `npm run docs:legal` a partir de `apps/web/src/content/legal.ts`. Rode o comando sempre que o texto jurídico mudar.

Nas atualizações automáticas (modo passivo), a página de termos é pulada.

## Login com Google no Desktop

O Google bloqueia OAuth dentro de webviews, então o login funciona assim:

1. "Continuar com Google" gera um verificador PKCE e chama o comando nativo `open_google_login`. O comando só aceita a URL `/api/auth/google/start` do próprio LifeOS.
2. O login acontece no navegador padrão. O callback não cria sessão nesse navegador: grava um código de uso único (só o hash, válido por 3 minutos, tabela `desktop_auth_codes`) e abre `/auth/desktop-handoff`.
3. Essa página chama `lifeos://auth?code=...`. O instalador registra o esquema `lifeos`.
4. O app leva a janela para `/auth/desktop`, que envia código + verificador para `POST /api/auth/desktop/exchange`. A sessão é criada com o mesmo cookie httpOnly do login normal. Com MFA ativo, segue para a 2ª etapa.

Um código interceptado não serve sem o verificador, que nunca sai do app, e não pode ser usado duas vezes.

Vincular o Google pelo Perfil continua disponível só na Web.

## Assinatura de código (aviso "Fornecedor desconhecido")

O SmartScreen avisa porque o `.exe` não tem assinatura **Authenticode**. A assinatura do updater (minisign) não resolve isso. Opções:

- **Azure Trusted/Artifact Signing:** serviço da Microsoft, de baixo custo e integrável ao GitHub Actions. Verifique antes se a sua conta e o seu país são elegíveis.
- **Certificado OV:** por exemplo, de uma CA como Certum, Sectigo ou DigiCert. Mostra "Vinicius Santos" como editor. A reputação no SmartScreen cresce com os downloads.
- **Certificado EV:** confiança imediata no SmartScreen, mas é o mais caro.

Para ativar, configure `bundle.windows.signCommand` (ou `certificateThumbprint`) no `tauri.conf.json` e guarde as credenciais **apenas** em GitHub Secrets. O workflow assina o instalador e o executável antes de publicar a release.

Até lá, a pessoa usuária precisa clicar em **Mais informações → Executar assim mesmo**.

## Próximas etapas

- **Etapa 4:** bandeja, notificações nativas, atalhos globais e inicialização com o Windows. Os comandos novos entram em `remote_capability()` com o mínimo necessário.
- **Etapa 5:** SQLite local e sincronização. O monitoramento de apps será opcional, desligado por padrão, sem teclas digitadas, conteúdo ou capturas de tela.
