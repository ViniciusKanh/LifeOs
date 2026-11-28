/**
 * Cidade Inteligente — catálogo das APIs da Prefeitura de São Paulo publicadas no APILIB
 * (WSO2 API Manager, gateway https://gateway.apilib.prefeitura.sp.gov.br).
 *
 * Regra do módulo: o servidor só consulta caminhos declarados aqui. Cada recurso tem um template
 * de caminho e parâmetros tipados — nenhum valor do usuário vira host, caminho livre ou query
 * arbitrária (proteção contra SSRF e endpoints inventados). Caminhos e parâmetros conferidos no
 * Swagger de cada API no Store; nomes de campos conferidos nas bases do Portal de Dados Abertos.
 *
 * Fora do catálogo (27/11/2026): Diário Oficial e De Olho na Fila (o APILIB suspendeu o sistema da
 * Prefeitura — erro 303001 SUSPENDED) e IDHM/Censo (o Portal de Dados Abertos recusa o acesso aos
 * conjuntos — 403 Authorization Error). Voltam ao catálogo se a Prefeitura reativar.
 */

export const APILIB_GATEWAY = "https://gateway.apilib.prefeitura.sp.gov.br";
export const APILIB_STORE = "https://apilib.prefeitura.sp.gov.br/store/";
/** Token de client_credentials (confirmado no Store: POST /token). Só o servidor muda, e só no domínio do APILIB. */
export const APILIB_DEFAULT_TOKEN_URL = `${APILIB_GATEWAY}/token`;
export const APILIB_ALLOWED_HOST = /(^|\.)apilib\.prefeitura\.sp\.gov\.br$/i;

export const CITY_APIS = ["licitacoes", "escolas", "prato", "procon", "sp156", "esic", "lentidao", "sof"] as const;
export type CityApi = (typeof CITY_APIS)[number];

export type CityDomain = "oportunidades" | "educacao" | "consumo" | "cidadania" | "mobilidade" | "financas";
export type CityGroup = "oportunidades" | "educacao" | "cidadania" | "territorio" | "financas";

export type ParamType = "int" | "day" | "text" | "enum";
export interface ParamDef {
  in: "path" | "query";
  type: ParamType;
  required?: boolean;
  min?: number;
  /** Teto numérico; "ano" usa o ano corrente quando a API não documenta fim. */
  max?: number | "currentYear";
  values?: readonly string[];
  maxLength?: number;
  label: string;
}

/* Agregações por recurso: os nomes de campo mudam entre anos da mesma base, por isso regex. */
export interface InsightDim {
  label: string;
  fields: RegExp;
  top?: number;
}
export interface InsightMeasure {
  label: string;
  fields: RegExp;
  agg: "sum" | "avg" | "max";
}
export interface InsightSpec {
  dims: InsightDim[];
  measures?: InsightMeasure[];
  series?: { fields: RegExp; by: "day" | "month" | "hour" | "weekday"; measure?: RegExp; label: string };
  rankBy?: { label: string; dim: RegExp; measure: RegExp; top?: number };
}

export interface ResourceDef {
  path: string;
  label: string;
  params: Record<string, ParamDef>;
  /** Paginação documentada (limite/offset do Portal de Dados Abertos, page do DRF, numPagina do SOF). */
  paging?: "limit_offset" | "page" | "numPagina";
  /** Validade do cache, em segundos. Séries históricas não mudam: cache longo. */
  ttl: number;
  /** Leituras da tela (calculadas pelo LifeOS sobre a amostra). */
  insights?: InsightSpec;
}

export interface CityApiDef {
  id: CityApi;
  name: string;
  /** Nome/versão como aparecem no Store do APILIB — usados no guia de assinatura. */
  apilibName: string;
  apilibProvider: string;
  version: string;
  base: string;
  domain: CityDomain;
  group: CityGroup;
  route: string;
  source: string;
  coverage: string;
  methodology: string;
  limitations: string[];
  /** Recurso barato usado no teste de conexão ("Conectada" só depois de uma resposta real). */
  probe: { resource: string; params: Record<string, string | number> };
  resources: Record<string, ResourceDef>;
  /** O schema de resposta está publicado no Swagger? (senão: normalização genérica) */
  schemaDocumented: boolean;
}

const LIMIT = { in: "query", type: "int", min: 1, max: 500, label: "Limite" } as const;
const OFFSET = { in: "query", type: "int", min: 0, max: 10_000_000, label: "Deslocamento" } as const;
const DAY_H = 3600;
const HIST = 7 * 24 * DAY_H;

const year = (min: number, max: number | "currentYear"): ParamDef => ({ in: "path", type: "int", required: true, min, max, label: "Ano" });
const semester: ParamDef = { in: "path", type: "int", required: true, min: 1, max: 2, label: "Semestre" };
const codesc: ParamDef = { in: "path", type: "text", required: true, maxLength: 12, label: "Código da escola" };
const sofYear = (label = "Exercício", required = true): ParamDef => ({ in: "query", type: "int", required, min: 2003, max: "currentYear", label });
const month: ParamDef = { in: "query", type: "int", required: true, min: 1, max: 12, label: "Mês" };
const orgao: ParamDef = { in: "query", type: "text", maxLength: 6, label: "Órgão" };
const page: ParamDef = { in: "query", type: "int", min: 1, max: 100_000, label: "Página" };

export const CITY_API_DEFS: Record<CityApi, CityApiDef> = {
  licitacoes: {
    id: "licitacoes",
    name: "Licitações e contratos",
    apilibName: "Licitacoes",
    apilibProvider: "admin",
    version: "v1",
    base: "/sg/licitacoes/v1",
    domain: "oportunidades",
    group: "oportunidades",
    route: "/cidade/licitacoes",
    source: "Secretaria de Gestão — Base de Compras e Licitações (extratos de contrato publicados no Diário Oficial)",
    coverage: "Extratos de contrato de 2005 a 2019.",
    methodology: "Um registro por extrato (contrato, aditamento, termo de colaboração…). Somas e rankings são calculados pelo LifeOS sobre a amostra carregada.",
    limitations: [
      "São contratos já assinados — não são oportunidades abertas.",
      "O valor é o do extrato publicado (contratado); aditamentos aparecem como registros próprios.",
      "Fornecedores pessoa física têm o documento ocultado.",
    ],
    probe: { resource: "contratos", params: { ano: 2019, limite: 1 } },
    resources: {
      contratos: {
        path: "/{ano}",
        label: "Extratos de contratos",
        params: { ano: year(2005, 2019), limite: LIMIT, offset: OFFSET },
        paging: "limit_offset",
        ttl: HIST,
        insights: {
          dims: [
            { label: "Órgãos com mais extratos", fields: /^org[aã]o$/ },
            { label: "Modalidades", fields: /modalidade/ },
            { label: "Eventos", fields: /^evento$/ },
            { label: "Tipo de fornecedor", fields: /fornecedor ?tipo|fornecedortipo/ },
          ],
          measures: [
            { label: "Valor contratado (soma)", fields: /valor ?contrato|valorcontrato/, agg: "sum" },
            { label: "Maior contrato", fields: /valor ?contrato|valorcontrato/, agg: "max" },
            { label: "Valor médio", fields: /valor ?contrato|valorcontrato/, agg: "avg" },
          ],
          series: { fields: /assinatura/, by: "month", label: "Extratos assinados por mês" },
          rankBy: { label: "Órgãos por valor contratado", dim: /^org[aã]o$/, measure: /valor ?contrato|valorcontrato/ },
        },
      },
    },
    schemaDocumented: true,
  },
  escolas: {
    id: "escolas",
    name: "Escola Aberta",
    apilibName: "EscolaAberta",
    apilibProvider: "admin_sme",
    version: "v1",
    base: "/sme/EscolaAberta/v1",
    domain: "educacao",
    group: "educacao",
    route: "/cidade/escola-aberta",
    source: "Secretaria Municipal de Educação — Escola Aberta",
    coverage: "Unidades da rede municipal com turmas, vagas, matrículas, ambientes e servidores.",
    methodology: "Busca de escolas por nome, Diretoria Regional, tipo e distrito; detalhes por código da escola.",
    limitations: ["A API não publica avaliações nem notas das escolas — o LifeOS não cria ranking."],
    probe: { resource: "tipos", params: {} },
    resources: {
      escolas: {
        path: "/api/escolas/",
        label: "Escolas",
        params: {
          page,
          search: { in: "query", type: "text", maxLength: 80, label: "Busca" },
          dre: { in: "query", type: "text", maxLength: 20, label: "DRE" },
          tipoesc: { in: "query", type: "text", maxLength: 20, label: "Tipo de escola" },
          distrito: { in: "query", type: "text", maxLength: 60, label: "Distrito" },
          bairro: { in: "query", type: "text", maxLength: 60, label: "Bairro" },
          subpref: { in: "query", type: "text", maxLength: 60, label: "Subprefeitura" },
        },
        paging: "page",
        ttl: 24 * DAY_H,
      },
      escola: { path: "/api/escolas/{codesc}/", label: "Escola", params: { codesc }, ttl: 24 * DAY_H },
      diretorias: { path: "/api/diretorias/", label: "Diretorias Regionais", params: {}, ttl: HIST },
      tipos: { path: "/api/tipo_escola/", label: "Tipos de escola", params: {}, ttl: HIST },
      modalidades: { path: "/api/modalidades/{codesc}", label: "Modalidades", params: { codesc }, ttl: 24 * DAY_H },
      alunos: { path: "/api/alunosserieturno/{codesc}", label: "Alunos por série e turno", params: { codesc }, ttl: 24 * DAY_H },
      vagas: { path: "/api/totvagmatbyserie/{codesc}", label: "Vagas e matrículas por série", params: { codesc }, ttl: 24 * DAY_H },
      turmas: { path: "/api/turmaserieturno/{codesc}", label: "Turmas por série e turno", params: { codesc }, ttl: 24 * DAY_H },
      ambientes: { path: "/api/ambientesbyescola/{codesc}", label: "Ambientes", params: { codesc }, ttl: 24 * DAY_H },
      servidores: { path: "/api/totservatuacao/{codesc}", label: "Servidores por atuação", params: { codesc }, ttl: 24 * DAY_H },
      atualizacao: { path: "/api/dtatualizacao/", label: "Data de atualização", params: {}, ttl: 6 * DAY_H },
    },
    schemaDocumented: false,
  },
  prato: {
    id: "prato",
    name: "Prato Aberto",
    apilibName: "PratoAberto",
    apilibProvider: "admin",
    version: "v1",
    base: "/sme/prato-aberto/v1",
    domain: "educacao",
    group: "educacao",
    route: "/cidade/prato-aberto",
    source: "Secretaria Municipal de Educação — Prato Aberto (cardápios da alimentação escolar)",
    coverage: "Cardápios publicados por ano, por tipo de atendimento, faixa etária e refeição.",
    methodology: "Um registro por cardápio publicado (data, unidade/agrupamento, faixa etária e refeição).",
    limitations: ["O LifeOS não estima calorias ou nutrientes — mostra só o que o cardápio informa."],
    probe: { resource: "cardapios", params: { ano: "CURRENT_YEAR", limite: 1 } },
    resources: {
      cardapios: {
        path: "/{ano}",
        label: "Cardápios",
        params: { ano: year(2015, "currentYear"), limite: LIMIT, offset: OFFSET },
        paging: "limit_offset",
        ttl: 24 * DAY_H,
        insights: {
          dims: [
            { label: "Refeições", fields: /^refeicao$/ },
            { label: "Faixas etárias", fields: /^idade$/ },
            { label: "Tipo de atendimento", fields: /^atendimento$|^agrupamento$/ },
          ],
          series: { fields: /^data$/, by: "weekday", label: "Cardápios por dia da semana" },
        },
      },
    },
    schemaDocumented: false,
  },
  procon: {
    id: "procon",
    name: "PROCON — reclamações",
    apilibName: "PROCON",
    apilibProvider: "admin",
    version: "v1",
    base: "/smj/proconsp/v1",
    domain: "consumo",
    group: "cidadania",
    route: "/cidade/procon",
    source: "Secretaria Municipal de Justiça — PROCON Paulistano",
    coverage: "Reclamações de 2016 a 2019 (data de entrada, região, empresa, área e desfecho).",
    methodology: "Um registro por reclamação. Contagens e desfechos são calculados pelo LifeOS sobre a amostra carregada.",
    limitations: [
      "Número absoluto de reclamações não prova sozinho que uma empresa é ruim: empresas maiores atendem mais pessoas.",
      "Série histórica encerrada em 2019 nesta API.",
    ],
    probe: { resource: "reclamacoes", params: { ano: 2019, limite: 1 } },
    resources: {
      reclamacoes: {
        path: "/{ano}",
        label: "Reclamações",
        params: { ano: year(2016, 2019), limite: LIMIT, offset: OFFSET },
        paging: "limit_offset",
        ttl: HIST,
        insights: {
          dims: [
            { label: "Áreas", fields: /^(area|area de atuacao)$/ },
            { label: "Desfechos", fields: /motivo de baixa|status da reclamacao/ },
            { label: "Regiões", fields: /^regiao$/ },
            { label: "Empresas mais citadas na amostra", fields: /razao social/, top: 10 },
          ],
          series: { fields: /entrada/, by: "month", label: "Reclamações por mês" },
        },
      },
    },
    schemaDocumented: false,
  },
  sp156: {
    id: "sp156",
    name: "SP156",
    apilibName: "SP156",
    apilibProvider: "admin",
    version: "v1",
    base: "/smit/sp156/v1",
    domain: "cidadania",
    group: "cidadania",
    route: "/cidade/sp156",
    source: "Secretaria de Inovação e Tecnologia — Central SP156",
    coverage: "Solicitações, ligações e avaliações por ano e semestre (dados tratados sem informações pessoais).",
    methodology: "Bases semestrais. Rankings por tema, serviço e território são calculados pelo LifeOS sobre a amostra carregada.",
    limitations: [
      "A API é somente leitura: não abre solicitações nem consulta protocolos individuais.",
      "O intervalo de anos disponível depende da Prefeitura; semestres sem base respondem vazio.",
    ],
    probe: { resource: "solicitacoes", params: { ano: 2019, semestre: 1, limite: 1 } },
    resources: {
      solicitacoes: {
        path: "/solicitacoes/{ano}/{semestre}",
        label: "Solicitações",
        params: { ano: year(2012, "currentYear"), semestre: semester, limite: LIMIT, offset: OFFSET },
        paging: "limit_offset",
        ttl: HIST,
        insights: {
          dims: [
            { label: "Temas", fields: /^tema$/ },
            { label: "Serviços mais pedidos", fields: /^servico$/, top: 10 },
            { label: "Subprefeituras", fields: /^subprefeitura$/ },
            { label: "Situação", fields: /status/ },
            { label: "Canais", fields: /^canal$/ },
          ],
          series: { fields: /data de abertura/, by: "month", label: "Solicitações por mês" },
        },
      },
      ligacoes: {
        path: "/ligacoes/DadosGerais/{ano}/{semestre}",
        label: "Ligações (dados gerais)",
        params: { ano: year(2012, "currentYear"), semestre: semester, limite: LIMIT, offset: OFFSET },
        paging: "limit_offset",
        ttl: HIST,
        insights: {
          dims: [],
          measures: [
            { label: "Ligações recebidas", fields: /entrantes/, agg: "sum" },
            { label: "Ligações atendidas", fields: /ligacoes atendidas$/, agg: "sum" },
            { label: "Abandonadas", fields: /ligacoes abandonadas$/, agg: "sum" },
            { label: "Nível de serviço médio (%)", fields: /nivel de servico/, agg: "avg" },
            { label: "Tempo médio de espera", fields: /tempo medio de espera/, agg: "avg" },
            { label: "Tempo médio de atendimento", fields: /tempo medio de atendimento/, agg: "avg" },
          ],
          series: { fields: /^data$/, by: "day", measure: /entrantes/, label: "Ligações recebidas por dia" },
        },
      },
      avaliacao: {
        path: "/ligacoes/avaliacao/{ano}/{semestre}",
        label: "Avaliação do atendimento",
        params: { ano: year(2012, "currentYear"), semestre: semester, limite: LIMIT, offset: OFFSET },
        paging: "limit_offset",
        ttl: HIST,
      },
    },
    schemaDocumented: false,
  },
  esic: {
    id: "esic",
    name: "e-SIC — pedidos de informação",
    apilibName: "eSIC",
    apilibProvider: "admin",
    version: "v1",
    base: "/cgm/esic/v1",
    domain: "cidadania",
    group: "cidadania",
    route: "/cidade/e-sic",
    source: "Controladoria Geral do Município — e-SIC (Lei de Acesso à Informação)",
    coverage: "Pedidos de informação e respostas desde 2012.",
    methodology: "Um registro por atendimento de pedido, com a pergunta e a resposta publicadas (anonimizadas pela Prefeitura).",
    limitations: ["A API é somente leitura: novos pedidos são feitos no portal oficial do e-SIC."],
    probe: { resource: "pedidos", params: { ano: 2019, limite: 1 } },
    resources: {
      pedidos: {
        path: "/{ano}",
        label: "Pedidos",
        params: { ano: year(2012, "currentYear"), limite: LIMIT, offset: OFFSET },
        paging: "limit_offset",
        ttl: 24 * DAY_H,
        insights: {
          dims: [
            { label: "Órgãos mais acionados", fields: /^(nm_orgao|orgao_nome)$/, top: 10 },
            { label: "Situação", fields: /status/ },
          ],
          series: { fields: /^dt_resposta/, by: "month", label: "Respostas por mês" },
        },
      },
    },
    schemaDocumented: true,
  },
  lentidao: {
    id: "lentidao",
    name: "Lentidão no trânsito",
    apilibName: "LentidaoTransito",
    apilibProvider: "admin",
    version: "v1",
    base: "/cet/lentidao/v1",
    domain: "mobilidade",
    group: "territorio",
    route: "/cidade/lentidao",
    source: "CET — Companhia de Engenharia de Tráfego (lentidão por trechos)",
    coverage: "Série histórica de 2001 a 2018, medições a cada 30 minutos por corredor e trecho.",
    methodology: "Cada registro é um trecho lento numa medição. Extensões são somadas pelo LifeOS na amostra carregada.",
    limitations: ["Dados históricos — não representam o trânsito de agora.", "Não alimenta a Hora de Sair nem a Estação das Carruagens."],
    probe: { resource: "registros", params: { ano: 2018, limite: 1 } },
    resources: {
      registros: {
        path: "/{ano}",
        label: "Registros de lentidão",
        params: { ano: year(2001, 2018), limite: LIMIT, offset: OFFSET },
        paging: "limit_offset",
        ttl: HIST,
        insights: {
          dims: [
            { label: "Corredores mais registrados", fields: /^corredor$/, top: 10 },
            { label: "Regiões", fields: /regiao/ },
            { label: "Sentidos", fields: /^sentido$/ },
          ],
          measures: [
            { label: "Extensão lenta somada", fields: /^tamanho$/, agg: "sum" },
            { label: "Maior trecho", fields: /^tamanho$/, agg: "max" },
          ],
          series: { fields: /data\/hora|^data/, by: "hour", measure: /^tamanho$/, label: "Extensão lenta por horário (m)" },
          rankBy: { label: "Corredores por extensão lenta (m)", dim: /^corredor$/, measure: /^tamanho$/ },
        },
      },
    },
    schemaDocumented: false,
  },
  sof: {
    id: "sof",
    name: "Orçamento e Finanças (SOF)",
    apilibName: "SOF",
    apilibProvider: "admin",
    version: "v4",
    base: "/sf/sof/v4",
    domain: "financas",
    group: "financas",
    route: "/cidade/sof",
    source: "Secretaria da Fazenda — Sistema de Orçamento e Finanças (SOF)",
    coverage: "Órgãos, funções, programas, despesas por dotação, empenhos e contratos por exercício.",
    methodology: "Consultas oficiais por exercício e mês. Execução (empenhado, liquidado, pago) é comparada ao orçado atualizado pelo LifeOS.",
    limitations: ["Finanças públicas — totalmente separadas das finanças pessoais do LifeOS.", "Despesas são acumuladas até o mês consultado."],
    probe: { resource: "orgaos", params: { anoExercicio: "CURRENT_YEAR" } },
    resources: {
      orgaos: { path: "/orgaos", label: "Órgãos", params: { anoExercicio: sofYear() }, ttl: 24 * DAY_H },
      funcoes: { path: "/funcoes", label: "Funções", params: { anoExercicio: sofYear() }, ttl: 24 * DAY_H },
      programas: { path: "/programas", label: "Programas", params: { anoExercicio: sofYear() }, ttl: 24 * DAY_H },
      despesas: {
        path: "/despesas",
        label: "Despesas (dotação)",
        params: { anoDotacao: sofYear("Ano"), mesDotacao: month, codOrgao: orgao, codFuncao: { in: "query", type: "text", maxLength: 6, label: "Função" } },
        ttl: 12 * DAY_H,
        insights: {
          dims: [],
          measures: [
            { label: "Orçado atualizado", fields: /orcadoatualizado/, agg: "sum" },
            { label: "Empenhado líquido", fields: /empenhadoliquido/, agg: "sum" },
            { label: "Liquidado", fields: /^valliquidado$/, agg: "sum" },
            { label: "Pago no exercício", fields: /pagoexercicio/, agg: "sum" },
          ],
          rankBy: { label: "Maiores dotações (orçado atualizado)", dim: /descricaoorgao|descricaofuncao|descricaoprograma|descricaoprojetoatividade/, measure: /orcadoatualizado/, top: 10 },
        },
      },
      empenhos: {
        path: "/empenhos",
        label: "Empenhos",
        params: { anoEmpenho: sofYear("Ano"), mesEmpenho: month, codOrgao: orgao, numPagina: page },
        paging: "numPagina",
        ttl: 12 * DAY_H,
        insights: {
          dims: [{ label: "Órgãos", fields: /descricaoorgao/ }],
          measures: [{ label: "Empenhado (soma)", fields: /empenhadoliquido|valempenho|valtotalempenhado/, agg: "sum" }],
          rankBy: { label: "Credores por valor empenhado", dim: /razaosocial|credor/, measure: /empenhadoliquido|valempenho|valtotalempenhado/, top: 10 },
        },
      },
      contratos: {
        path: "/contratos",
        label: "Contratos",
        params: { anoContrato: sofYear("Ano"), codOrgao: orgao, numPagina: page },
        paging: "numPagina",
        ttl: 12 * DAY_H,
        insights: {
          dims: [
            { label: "Modalidades", fields: /descricaomodalidade/ },
            { label: "Tipo de contratação", fields: /tipocontratacao/ },
          ],
          measures: [
            { label: "Valor principal (soma)", fields: /^valprincipal$/, agg: "sum" },
            { label: "Pago (soma)", fields: /^valpago$/, agg: "sum" },
          ],
          rankBy: { label: "Fornecedores por valor principal", dim: /razaosocial/, measure: /^valprincipal$/, top: 10 },
        },
      },
    },
    schemaDocumented: false,
  },
};

/** Estados de cada API para o usuário — "conectada" só depois de uma resposta real com sucesso. */
export const CITY_API_STATES = [
  "nao_configurada",
  "configurada",
  "conectada",
  "credencial_invalida",
  "sem_autorizacao",
  "indisponivel",
  "limite",
  "desatualizada",
  "desativada",
] as const;
export type CityApiState = (typeof CITY_API_STATES)[number];

/** XP pequeno e diário — idempotente por dia/referência (gamificação nunca premia recarregar a página). */
export const CITY_XP = {
  read: { xp: 5, coins: 0 },
  saveOpportunity: { xp: 10, coins: 1, maxPerDay: 3 },
  compare: { xp: 10, coins: 0 },
  explore: { xp: 5, coins: 0 },
} as const;
// Protocolos (SP156/e-SIC) não dão XP: o módulo não incentiva abrir pedidos ou reclamações para pontuar.

/** Tamanho da amostra usada nas leituras (Insights): o maior "limite" aceito pelas bases. */
export const CITY_INSIGHT_SAMPLE = 500;
