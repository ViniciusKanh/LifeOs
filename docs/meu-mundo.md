# Meu Mundo (LifeOS Living World)

Mundo isométrico em pixel art que mostra o LifeOS como um lugar vivo. É uma **visão sobre os dados reais**: nada é inventado e nada no mundo concede XP ou moedas.

## Arquitetura

| Camada | Arquivos |
|---|---|
| Rota/tela | `apps/web/src/pages/meu-mundo/MeuMundoPage.tsx` (`/meu-mundo`, menu "Planejar") |
| Motor (sem React, sem dependências novas) | `apps/web/src/components/living-world/engine/` |
| Painéis | `WorldPanels.tsx` (atividade, agentes, ações rápidas, linha do tempo, HUD), `WorldDrawers.tsx` (painéis contextuais) |
| Casca do canvas | `WorldCanvas.tsx` — cria o motor uma vez; dados e preferências são repassados sem reiniciar |
| Dados (web) | `services/livingWorldService.ts`, `hooks/useLivingWorld.ts` |
| API | `apps/api/src/routes/livingWorld.routes.ts` (`/api/world`), `services/livingWorldService.ts`, `config/livingWorld.ts` |
| Banco | migration `0104_meu_mundo.sql` |

Não foram adicionadas bibliotecas. O motor usa Canvas 2D puro: Phaser e PixiJS seriam dependências pesadas para 30×30 tiles e ~5 personagens.

## Motor (`engine/`)

- `worldMap.ts`: grade 30×30, ambientes (retângulos com paredes só no fundo), móveis, estações de trabalho, plantas do Jardim, conversão iso↔tela.
- `pathfinding.ts`: A* em 4 direções. Destino bloqueado → vizinho livre mais próximo.
- `characterMachine.ts`: estados `idle, walking, working, studying, exercising, resting, interacting, celebrating, thinking, error`.
  - As transições inválidas são ignoradas.
  - As intenções têm prioridade: **domínio** (dado real) > **manual** (duplo clique) > **ambiente** (Vida Autônoma).
- `sprites.ts`: personagens desenhados pixel a pixel em código (humano e robô), em 4 direções (frente/costas + espelho). Animações: parado, andar, sentar, digitar, ler, exercitar, comemorar, interagir, pensar e dormir (deitado).
- `draw.ts`: caixas isométricas, tiles, paredes, móveis, plantas e brilho.
- `WorldEngine.ts`: loop, câmera, personagens, entrada e seleção.
  - Câmera: arrastar, roda/pinça para zoom, centralizar, restaurar, seguir o avatar.
  - Ordenação por profundidade.
  - O loop pausa com a aba oculta ou o mapa fora da tela, e cai para 30 fps na qualidade baixa.

## Direção de arte (redesign RPG medieval)

Toda a arte é **pixel art procedural** em código: nenhuma imagem de terceiros, nenhum crédito necessário. Cada objeto continua sendo uma entidade independente; o cenário não é uma imagem de fundo.

- **Ilha flutuante**: penhascos nas bordas da frente, céu noturno com estrelas, lua e castelo distante (`drawSky`).
- **Plataformas**:
  - salas com paredes ficam 12 px acima do chão, a praça 6 px e o jardim 3 px (`tileZ`);
  - há laterais de pedra e degraus nas entradas;
  - personagens interpolam a altura ao subir (`zAtFloat`).
- **Pisos**: tábuas de madeira, lajes de pedra (Escritório/Academia), calçamento nos caminhos e grama com flores. A variação vem de ruído determinístico (`hash`).
- **Paredes**: pedra com tijolos, viga de madeira e friso dourado.
- **Decoração de parede** (`WALL_DECOR`): vitrais, janelas (acendem à noite), tochas, telas luminosas, estandartes, brasões, escudos, quadro e lareira.
- **Móveis por ambiente**:
  - Biblioteca: estantes altas, candelabro, globo e livros;
  - Escritório: monitores, servidores e cabos;
  - Guilda: quadro de missões, barris e armas;
  - Academia: boneco de treino, alvo e halteres;
  - Casa: cama, guarda-roupa, criado-mudo e sofá;
  - Jardim: lago com peixes, vitórias-régias e vagalumes;
  - Praça: fonte de três níveis, cristal flutuante com runas e estandartes;
  - em volta: floresta, pinheiros, sebes e pedras.
- **Personagens**: sprites 24×32 com contorno de 1 px, desenhados em escala 2,3×.
  - O avatar tem capa, botas e cinto.
  - Cada agente tem identidade própria: Planejador com ombreiras azuis, Mentor com capelo e óculos, Analista com visor de gráficos animado, Hábitos com coração pulsando.
- **Luz**: tochas e lareira tremulando, velas, monitores azuis, cristal roxo e janelas à noite. A noite escurece o cenário de leve.
- **Desempenho**: pisos, plataformas, paredes e tapetes vão para uma **camada estática em cache** (resolução conforme a qualidade). A cada quadro só se desenham água, chamas, telas, móveis, personagens e luz.
- **Interações**:
  - placas de madeira clicáveis (ocultáveis em "Placas"; compactas no celular);
  - marcador dourado no personagem selecionado;
  - "Acompanhar no mapa" (para quando o usuário arrasta o mapa);
  - "+XP" flutuante e partículas ao concluir uma missão;
  - faixa de recompensa com os valores reais da dificuldade.

## Dados e fontes de verdade

`GET /api/world` agrega, sem cópias:

- **Perfil**: nível, XP e moedas (`getPlayerProfile`).
- **Atividade atual**: a missão com status "Em Andamento" mais recente. Projeto acadêmico → Biblioteca; demais → Escritório. Sem missão, não há atividade.
  - O Pomodoro foi removido do LifeOS a pedido do usuário; por isso não há cronômetro.
- **Guilda**: missões abertas e as concluídas hoje, com a recompensa pela dificuldade configurada.
- **Jardim**: hábitos ativos. Regra das plantas:
  - estágio pela sequência: 0 broto, 1–2 muda, 3–6 planta, 7–20 arbusto, 21+ árvore;
  - flores quando o hábito foi concluído hoje;
  - "!" só para hábito diário ou do dia marcado ainda não feito (semanal/mensal nunca fica pendente).
- **Biblioteca / Academia / Casa**: estudo, leitura, treinos, diário, água, sono e humor do dia (fuso do usuário).
- **Linha do tempo**: `xp_events` (missões, hábitos, diário, conquistas…) + `workouts` + `world_events` (agentes e decoração). Paginação por `before`.

Persistido no próprio mundo (tabelas `world_*`):

- `world_profiles`: preferências e avatar (aparência e posição após movimento manual).
- `world_objects`: decoração. Item do inventário num slot validado no servidor, com posse e quantidade conferidas.
- `world_events`: eventos de domínio do mundo (`agent.started/completed/failed`, `decor.placed`, `avatar.updated`). Movimentos e animações **não** são gravados.
- `world_agent_runs`: execuções reais dos agentes. Uma execução "running" com mais de 3 min é tratada como interrompida.

## Agentes

| Agente | Conselheiro usado | Estação |
|---|---|---|
| Planejador | `council` | Escritório |
| Mentor de Estudos | `education` | Biblioteca |
| Analista de Produtividade | `missions` | Escritório |
| Assistente de Hábitos | `habits` | Jardim |

`POST /api/world/agents/:key/run` grava `running`, chama `askAdvisor` (dados reais; Gemini só se configurado, senão leitura por regras marcada como tal) e grava `done` ou `failed`.

- No mapa, o agente caminha até a estação e digita enquanto o pedido está em curso. Ao concluir, comemora; na falha, mostra "!".
- A animação nunca é simulada com temporizador.
- Os agentes só leem dados; não existem chamadas de IA automáticas.

## Interações

- Clique em ambiente → painel do ambiente.
- Clique em personagem → painel do avatar ou do agente.
- Clique em planta → hábito.
- Modo Decorar → slots brilhantes.
- Duplo clique no chão → move o avatar. Uma missão em andamento tem prioridade.
- Teclado (com foco no mapa): setas, `+`/`−` e `C`. Há também botões de ambientes abaixo do mapa.
- Ações rápidas:
  - Iniciar Missão → Guilda;
  - Planejar Semana → `/conselho`;
  - Nova Missão → modal de tarefa;
  - Registrar Hábito → Jardim;
  - Revisão Rápida → `/revisoes`;
  - Conversar com Agente.

Concluir uma missão usa `PATCH /api/tasks/:id/move` e registrar um hábito usa `POST /api/habits/:id/check-in`. O XP é pago por esses fluxos, uma única vez.

## Sincronização

O LifeOS não tem tempo real. O mundo consulta `/api/world` ao abrir, ao voltar para a aba e a cada 60 s com a tela visível.

## Como estender

- **Novo ambiente**:
  1. inclua-o em `ROOMS` (`worldMap.ts`);
  2. coloque os móveis em `FURNITURE`;
  3. crie uma estação `avatar-<sala>` se houver atividade;
  4. inclua a sala em `WORLD_ROOMS`/`DECOR_SLOTS` (`config/livingWorld.ts`).
  - Os slots e as estações precisam ser tiles livres; o teste `engine.test.ts` confere o alcance.
- **Novo agente**:
  1. inclua-o em `WORLD_AGENTS` (escolha um conselheiro existente);
  2. defina a estação `agent-<key>` e a espera em `AGENT_IDLE`.
- **Nova animação**: crie um valor em `Pose` e desenhe-o em `drawHuman`/`drawRobot` (`sprites.ts`); depois mapeie o estado em `WorldEngine.poseFor`.
- **Sprites de arquivo**: troque `getSprite` por recortes de spritesheet mantendo a mesma assinatura. Hoje toda a arte é gerada por código, sem recursos de terceiros nem créditos necessários.

## Testes

- API: `apps/api/tests/livingWorld.test.ts`.
  - Atividade real e ambiente certo.
  - Plantas e pendência.
  - Preferências e isolamento entre usuários.
  - Decoração: posse, quantidade e slot.
  - Agentes: concluído e falha sem resultado inventado.
  - Eventos.
- Web: `components/living-world/engine/engine.test.ts`.
  - A* e obstáculos.
  - Alcance de todas as estações.
  - Transições e prioridade de intenções.

## Limitações conhecidas

- Sem Pomodoro (removido do LifeOS).
- A decoração guarda nome e arte no momento da colocação. Se o item for consumido depois, a peça continua no mundo até ser retirada.
- A execução de um agente é curta e síncrona, por isso não há botão de interromper.
- A árvore de habilidades ainda não desbloqueia elementos do mundo. Para isso falta uma regra de economia definida.
