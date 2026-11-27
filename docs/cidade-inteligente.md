# Cidade Inteligente — São Paulo (LifeOS 0.5.41)

Categoria nova no menu lateral, com 12 APIs oficiais da Prefeitura de São Paulo publicadas no **APILIB** (WSO2 API Manager). A API Olho Vivo da SPTrans ficou fora deste escopo. A integração Hora de Sair / Estação das Carruagens continua como estava.

## 1. Telas e rotas

| Grupo (menu) | Tela | Rota | API(s) |
|---|---|---|---|
| — | Visão Geral da Cidade (Radar, Meus registros, Conexão APILIB) | `/cidade` | dom, fila + status de todas |
| Notícias e Oportunidades | Diário Oficial | `/cidade/diario-oficial` | Diario_Oficial `/Publicacao` |
| | Licitações | `/cidade/licitacoes` | Diario_Oficial `/Licitacao` + Licitacoes `/{ano}` |
| Saúde e Educação | De Olho na Fila | `/cidade/de-olho-na-fila` | DeOlhoNaFila-API |
| | Escola Aberta | `/cidade/escola-aberta` | EscolaAberta |
| | Prato Aberto | `/cidade/prato-aberto` | PratoAberto |
| Cidadania e Consumo | PROCON | `/cidade/procon` | PROCON |
| | SP156 (+ meus protocolos) | `/cidade/sp156` | SP156 |
| | e-SIC (+ meus protocolos) | `/cidade/e-sic` | eSIC |
| Inteligência Territorial | IDHM (com comparação) | `/cidade/idhm` | IDHM |
| | Censo | `/cidade/censo` | CensoDemografico |
| | Lentidão (histórico) | `/cidade/lentidao` | LentidaoTransito |
| Finanças Públicas | SOF | `/cidade/sof` | SOF v4 |

Todas as telas têm:

- filtros;
- estados de carregamento, erro (com o próximo passo certo) e vazio;
- faixa de transparência com fonte oficial, sincronização, referência, cobertura, metodologia e limitações;
- exportação CSV da amostra;
- favoritos;
- Oráculo da Cidade.

O layout é responsivo: tabela no desktop e cartões no celular. Os screenshots não mostraram overflow horizontal.

## 2. Matriz por API

O gateway é `https://gateway.apilib.prefeitura.sp.gov.br`. Todas as APIs exigem `Authorization: Bearer` (OAuth2 do WSO2) e todas são somente leitura (GET).

| API (Store) | Base | Recursos usados (só os documentados no Swagger) | Schema de resposta | Cache | Observações honestas na tela |
|---|---|---|---|---|---|
| Diario_Oficial v1 | `/sg/dom/v1` | `GET /Publicacao?dataPublicacao&caderno`, `GET /Licitacao?dataPublicacao&caderno` | documentado | 6 h | Só metadados e nomes de arquivos, sem texto integral. Canceladas e testes ficam ocultas por padrão. |
| Licitacoes v1 | `/sg/licitacoes/v1` | `GET /{ano}` (2005–2019), limite/offset | documentado (`{total, data}`) | 7 d | Contratos assinados, que não são oportunidades abertas. |
| DeOlhoNaFila-API v1 | `/api/ListaDeOlhoNaFila/v1` | `GET /api/ListaDeOlhoNaFila` | documentado | 5 min | Situação textual da fila. Nenhum tempo de espera é inventado. Postos com mais de 3 h sem atualização são sinalizados. |
| EscolaAberta v1 | `/sme/EscolaAberta/v1` | `/api/escolas/`, `/api/escolas/{codesc}/`, `/api/diretorias/`, `/api/tipo_escola/`, `/api/distritos/`, `/api/modalidades/{codesc}`, `/api/alunosserieturno/{codesc}`, `/api/totvagmatbyserie/{codesc}`, `/api/ambientesbyescola/{codesc}`, `/api/dtatualizacao/` | não publicado | 24 h | Sem notas nem ranking. |
| PratoAberto v1 | `/sme/prato-aberto/v1` | `GET /{ano}`, limite/offset | não publicado | 24 h | Sem estimativa de calorias ou nutrientes. |
| PROCON v1 | `/smj/proconsp/v1` | `GET /{ano}` (2016–2019) | não publicado | 7 d | Número absoluto de reclamações não prova que uma empresa é ruim. |
| SP156 v1 | `/smit/sp156/v1` | `/solicitacoes/{ano}/{semestre}`, `/ligacoes/DadosGerais/{ano}/{semestre}`, `/ligacoes/avaliacao/{ano}/{semestre}` | não publicado | 7 d | Não abre pedidos (não existe operação oficial de escrita). Os protocolos são acompanhados manualmente. |
| eSIC v1 | `/cgm/esic/v1` | `GET /{ano}` (2012–hoje) | não publicado | 24 h | Somente leitura. Pedidos novos são feitos no portal oficial. |
| IDHM v1 | `/smdhc/idhm/v1` | `GET /{ano}` (2000 ou 2010) | não publicado | 7 d | Retratos de 2000 e 2010. |
| CensoDemografico v1 | `/ibge/censo/v1` | `GET /{arquivo}/{ano}` (24 arquivos; 2000 ou 2010) | não publicado | 7 d | As colunas seguem o dicionário do IBGE. |
| LentidaoTransito v1 | `/cet/lentidao/v1` | `GET /{ano}` (2001–2018) | não publicado | 7 d | Histórico. Não alimenta a Hora de Sair. |
| SOF v4 | `/sf/sof/v4` | `/orgaos`, `/funcoes`, `/despesas`, `/empenhos`, `/contratos` (parâmetros obrigatórios do Swagger) | não publicado | 12–24 h | Separado das finanças pessoais e do Banco do Reino. |

Quando o schema não é publicado, a normalização é genérica e aplicada nesta ordem:

1. array direto;
2. `{total, data}`;
3. `{count, results}` (DRF);
4. maior array de objetos encontrado.

Objetos aninhados são achatados em `pai.filho`. Os agrupamentos são feitos **pelo LifeOS sobre a amostra carregada**, e a tela informa isso.

## 3. Arquitetura

**API**

| Arquivo | Papel |
|---|---|
| `config/apilib.ts` | Catálogo: recursos, parâmetros tipados, faixas de ano, TTL, fonte, cobertura, limitações e XP. |
| `services/apilibClient.ts` | Cliente central. Detalhes abaixo. |
| `services/cityService.ts` | Regras de negócio. Detalhes abaixo. |
| `routes/city.routes.ts` | Rotas `/api/city/*`. Detalhes abaixo. |
| `db/migrations/0117_cidade_inteligente.sql` | Tabelas `city_credentials`, `city_api_status`, `city_cache` (global, dado público), `city_favorites`, `city_alerts`, `city_alert_seen`, `city_history`, `city_protocols` e `city_prefs`, mais as 7 conquistas. |

O que o cliente central (`apilibClient.ts`) faz:

- **Credencial** por usuário, criptografada, com fallback do servidor em `APILIB_*`. Aceita dois modos: token ou client_credentials, com deduplicação do pedido de token.
- **URLs** montadas apenas a partir do catálogo. Parâmetros desconhecidos são rejeitados, o host é validado e o endpoint de token só é aceito dentro do domínio do APILIB.
- **Rede e resiliência:**
  - timeout de 12 s;
  - retry com backoff exponencial e jitter, respeitando `Retry-After` com teto de 8 s;
  - circuit breaker por API (4 falhas abrem o circuito por 60 s);
  - deduplicação de chamadas simultâneas;
  - cache com TTL e fallback para cache vencido, marcado como "Dados desatualizados".
- **Estados por usuário:** Não configurada, Configurada, Conectada (só depois de uma resposta real), Credencial inválida (401), Sem autorização (403), Serviço indisponível, Limite atingido (429), Dados desatualizados e Desativada.
- **Privacidade:** campos pessoais são removidos (CPF, e-mail, telefone, RG, nome de consumidor, solicitante ou requerente). Um CNPJ, que é público, é mantido.

O que fica em `cityService.ts`:

- classificação das publicações;
- fase das licitações (processos encerrados nunca aparecem como abertos);
- valores separados em estimado, homologado e contratado;
- nível da fila;
- Radar;
- favoritos, com conversão em missão ou compromisso na Agenda, sempre por ação explícita do usuário;
- alertas idempotentes, rodados pelo cron diário;
- protocolos, preferências e histórico;
- XP;
- Oráculo.

As rotas de `/api/city/*` têm:

- validação zod;
- rate limits;
- `requireAuth`, com filtro por `owner_id` em tudo o que é pessoal.

A credencial nunca volta ao frontend: a tela só recebe a origem e os 4 últimos caracteres.

**Web**

| Arquivo | Conteúdo |
|---|---|
| `services/cityService.ts` | Cliente das rotas da API. |
| `hooks/useCity.ts` | Hooks de consulta e de ações. |
| `components/city/CityKit.tsx` | Banner com skyline, cores por domínio, faixa de transparência, estados, tabela automática, agrupamentos, favorito, CSV, controles e Oráculo. |
| `components/city/DatasetExplorer.tsx` | Explorador dos datasets anuais. |
| `components/city/CityConfigPanel.tsx` | Painel da credencial e do estado das 12 APIs. |
| `components/city/PersonalPanels.tsx` | Favoritos, alertas, protocolos e histórico. |
| `pages/cidade/*` | As 13 telas. |
| `navConfig` | Categoria "Cidade Inteligente" com 5 grupos em abas. |
| `App.tsx` | 13 rotas com lazy loading. |

## 4. Gamificação (sem farm)

| Ação | XP | Limite |
|---|---|---|
| Ler uma publicação | +5 | 1× por dia |
| Explorar uma API | +5 | 1× por dia por API |
| Comparar territórios | +10 | 1× por dia |
| Guardar uma oportunidade (Diário ou licitação) | +10 XP, +1 moeda | 1× por item, no máximo 3 por dia |

- Protocolos **não** dão XP, para não incentivar pedidos ou reclamações desnecessários.
- O histórico (`city_history`) registra uma linha por dia + API + ação + referência. Recarregar a página não gera nada novo.
- Conquistas: Cronista da Cidade, Explorador Paulistano, Guardião da Transparência, Mestre dos Indicadores, Estrategista Urbano, Diplomata Municipal e Investigador Público.
- **Life Score inalterado:** mesma fórmula e as mesmas 6 dimensões.

## 5. Oráculo da Cidade (Gemini)

- Usa a configuração do Gemini que o admin já cadastrou.
- Lê no máximo 40 registros do cache do servidor, já sem dados pessoais.
- O conteúdo externo vai delimitado e marcado como **não confiável**.
- As regras de cada domínio entram no prompt (sem ranking de escolas, sem tempo de espera, histórico é histórico etc.).
- A saída é estruturada em Dado real, Inferência e Sugestão.
- Não executa ações.
- Não envia credenciais nem dados do usuário.

## 6. Como configurar a credencial

1. Acesse `https://apilib.prefeitura.sp.gov.br/store/` e crie uma conta.
2. Em **Applications → Add**, crie uma aplicação (ex.: "LifeOS").
3. Em **APIs**, assine (Subscribe) cada uma das 12 APIs com essa aplicação. Sem assinatura, a API responde 403, que aparece como "Sem autorização".
4. Em **Applications → LifeOS → Production Keys**, gere as chaves.
5. No LifeOS, abra **Cidade Inteligente → Visão Geral → Conexão APILIB** e cole:
   - o **Access Token**, mais simples, mas expira e precisa ser regenerado no Store; ou
   - a **Consumer Key + Consumer Secret**, para que o servidor renove o token sozinho via `client_credentials`.
6. **Salvar e testar** faz uma consulta real e barata em cada API e mostra o estado de cada uma.

A credencial do servidor é opcional e funciona como fallback. Ela fica só nas variáveis de ambiente da Vercel:

- `APILIB_ACCESS_TOKEN`, ou o par `APILIB_CONSUMER_KEY` + `APILIB_CONSUMER_SECRET`;
- `APILIB_TOKEN_URL`, se o endpoint de token não for o padrão `/token`.

Nunca versione esses valores. O `.env.example` só tem os nomes.

## 7. Relatório de validação

| Verificação | Resultado |
|---|---|
| `tsc` API | ✅ 0 erros |
| `tsc` Web (= `npm run lint`) | ✅ 0 erros |
| `vite build` | ✅ |
| `tests/city.test.ts` (fetch simulado, nenhuma chamada real) | ✅ 23/23 |
| Regressão: achievements, gamification, aventuras, records-hud, heroHub, worldmap, treasure, personalSkills, estação, life-score, missionsReviews3 | ✅ 104/104 |
| Testes web (vitest) | ✅ 53/53 |
| Prévias 1400 px e 390 px | ✅ sem overflow horizontal (scrollWidth = viewport) |

O que `city.test.ts` cobre:

- validação de parâmetros e host;
- remoção de dados pessoais;
- backoff e `Retry-After`;
- status sem credencial;
- "Conectada" só após uma resposta real, sem o segredo aparecer em nenhuma resposta;
- `client_credentials` com um único token;
- 401, 403 e 429;
- retry seguido de cache;
- fallback para cache vencido;
- deduplicação;
- API desativada;
- isolamento entre usuários;
- XP anti-farm;
- alertas idempotentes;
- protocolos;
- Radar com uma API falhando.

## 8. Bloqueios e limitações conhecidas

- **Nenhuma chamada real ao APILIB foi feita no desenvolvimento.** O ambiente não tem a credencial do usuário, e a sonda do endpoint de token foi bloqueada. Portanto:
  - o caminho do token (`/token`) segue o padrão do WSO2 e é configurável;
  - o formato real das respostas sem schema publicado será confirmado na primeira consulta.

  A normalização genérica foi feita para aguentar essas variações.
- O código do caderno do Diário só tem um valor documentado (11 = "Cidade de SP", o exemplo oficial). Os outros cadernos podem ser digitados, mas a API não lista os nomes.
- Nas APIs sem schema, os nomes das colunas na tela são os que a API devolver. As colunas "preferidas" de cada tela só são usadas se existirem.
- Atlas: as telas oferecem "Ver no mapa" (OpenStreetMap) para postos com endereço. Não há geocodificação automática para o Atlas pessoal.
