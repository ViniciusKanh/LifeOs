# LifeOS — Análise geral e sugestões de evolução

Levantamento feito direto no código (rotas da API, páginas do front, serviços) em 13/09/2026, depois da repaginação visual v4.

## O que já existe

**Módulos com tela própria:** Dashboard, Hoje, Tarefas (+ Kanban), Foco (Pomodoro), Biblioteca (+ detalhe de livro), Educação (+ dashboard de formação + detalhe), Saúde, Hábitos, Metas, Analytics, Timeline, Weekly Review, Perfil, Configurações (admin) e Usuários (admin). Autenticação completa: login, cadastro, verificação de e-mail, esqueci/redefinir senha.

**Serviços de backend:** autenticação (JWT + bcrypt), criptografia de credenciais (`cryptoService`), e-mail transacional (SMTP), busca de livro por ISBN (Google Books/Open Library), Gemini (LifeOS Copilot), métricas (para o Dashboard/Analytics) e teste de conexão do Turso.

**Infra:** PWA configurado (`vite-plugin-pwa`), tema claro/escuro, React Query pra cache de dados, Zod pra validação de formulário.

Ou seja: o esqueleto do briefing original está todo de pé. As lacunas abaixo são sobre profundidade e polimento, não módulos faltando do zero.

## Coisas que dá pra implementar

### 1. Fechar o que o próprio briefing prometeu e ainda não apareceu
- **Calendário e Gantt de verdade.** O briefing cita os dois explicitamente, mas hoje só existe o Kanban de tarefas — não achei uma view de calendário (mês/semana) nem um Gantt pra projetos com dependência entre tarefas. Dá pra reaproveitar o `recharts` já instalado pro Gantt, ou uma lib leve tipo `react-big-calendar`.
- **Notificações push de verdade.** Existe uma central de notificações in-app (`NotificationsBell`) e o PWA já registra service worker, mas não achei Web Push implementado (nem no backend nem uma chave VAPID). Isso fecha o ciclo do PWA: lembrete de hábito, prazo de tarefa ou sessão de foco batendo mesmo com o app fechado.

### 2. LifeOS Copilot — hoje é só texto, dá pra virar assistente de verdade
O Copilot já gera insight sob demanda em vários módulos (Dashboard, Saúde, Educação, Hábitos, Analytics). Próximo passo natural:
- **Function calling / ações**: em vez de só descrever ("você bebeu pouca água hoje"), deixar o Copilot criar a tarefa, marcar o hábito ou ajustar a meta diretamente — vira assistente, não só narrador.
- **Copilot proativo**: hoje ele espera o usuário clicar em "gerar insight". Um job diário (ex.: 8h) que já deixa um insight pronto no Dashboard ao abrir o app muda a percepção de "ferramenta passiva" pra "parceiro ativo".
- **Memória de contexto entre chamadas**: cada chamada ao Gemini hoje parte do zero. Guardar o histórico recente de insights (o que já foi sugerido, o que o usuário seguiu ou ignorou) evita repetir a mesma dica e permite um Copilot que "lembra" do que já disse.

### 3. Gamificação — o briefing pede "conquistas reais", ainda não vi um motor de conquistas
Não encontrei uma tabela/rota de achievements. Sugestão de escopo mínimo:
- Conquistas de streak (hábitos consecutivos), de volume (livros lidos, horas de foco, tarefas concluídas) e de consistência (semanas seguidas com Weekly Review em dia).
- Um "nível" ou "trilha de progresso" ligado ao Life Score, pra dar sensação de progressão além do número cru.
- Notificação (in-app + push, se implementado) na hora que uma conquista é destravada — é o momento de maior emoção do gamification loop, não pode passar batido.

### 4. Onboarding — primeira experiência de quem acabou de se cadastrar
Hoje o cadastro provavelmente joga o usuário direto num Dashboard vazio (sem tarefa, sem hábito, sem livro). Um fluxo de onboarding de 3-4 passos (definir 1-2 metas, criar os primeiros hábitos, importar ou cadastrar o primeiro livro) evita a sensação de "tela em branco" que mata retenção em apps de produtividade pessoal.

### 5. Import/export de dados
Nenhum endpoint de exportação encontrado. Pra um app que promete "dados reais persistidos" e roda no Turso (SQLite-like), exportar tudo em JSON/CSV (ou pelo menos um backup manual) dá segurança pro usuário e é baixo esforço de implementação.

### 6. Performance de build
O `vite build` já está alertando: o bundle principal está em **1.05 MB minificado** (277 KB gzip), tudo em um chunk só. Isso não trava nada hoje, mas com Gantt/calendário/gamificação entrando a tendência é só crescer. Vale já configurar `manualChunks` (separar recharts, hook-form/zod, e cada módulo de página via `React.lazy` nas rotas) antes que o carregamento inicial comece a doer, especialmente em conexões mobile mais lentas — que é um público que o próprio briefing prioriza (PWA, Microsoft Store, boa experiência mobile).

### 7. Testes automatizados
Não vi nenhum arquivo de teste (`*.test.ts`, `*.spec.ts`, pasta `__tests__`) em nenhum dos dois workspaces. Com CRUDs reais em 12+ módulos, um teste de integração cobrindo as rotas críticas (auth, tarefas, hábitos) e um smoke test E2E do fluxo principal (login → criar tarefa → completar hábito → ver Life Score mudar) protegem contra regressão sem exigir suíte completa de cara.

### 8. Observabilidade
Não encontrei logging estruturado nem tratamento de erro centralizado nas rotas da API (os catches são pontuais, por rota). Um middleware de erro único + log estruturado (nível mínimo: request, erro, usuário) ajuda muito a depurar problemas em produção sem precisar reproduzir localmente — principalmente com Gemini/Turso/SMTP como dependências externas que podem falhar de formas variadas (como já aconteceu com o modelo do Gemini).

## Prioridade sugerida

Se for escolher por onde começar, essa é a ordem que traz mais retorno por esforço:

1. **Onboarding** (retenção de novos usuários é o gargalo mais caro de ignorar)
2. **Copilot proativo** (usa o que já existe, só muda o gatilho — baixo esforço, alto impacto percebido)
3. **Calendário** (é o módulo do briefing original com maior lacuna hoje)
4. **Gamificação/conquistas** (alto valor percebido, mas precisa de modelo de dados novo)
5. **Code-splitting do bundle** (baixo esforço, evita dívida técnica crescer)
6. Export de dados, push notifications, testes e observabilidade (importantes, mas menos urgentes que os itens acima)
