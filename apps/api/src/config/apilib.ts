/**
 * Cidade Inteligente — catálogo das 12 APIs da Prefeitura de São Paulo publicadas
 * no APILIB (WSO2 API Manager, gateway https://gateway.apilib.prefeitura.sp.gov.br).
 *
 * Regra do módulo: o servidor só consulta caminhos declarados aqui. Cada recurso tem
 * um template de caminho e parâmetros tipados — nenhum valor do usuário vira host,
 * caminho livre ou query arbitrária (proteção contra SSRF e endpoints inventados).
 * Os caminhos e parâmetros abaixo foram conferidos no Swagger de cada API no Store
 * (apilib.prefeitura.sp.gov.br/store/api-docs/…). Respostas sem schema publicado são
 * normalizadas de forma genérica e a tela avisa isso na faixa de transparência.
 */

export const APILIB_GATEWAY = "https://gateway.apilib.prefeitura.sp.gov.br";
export const APILIB_STORE = "https://apilib.prefeitura.sp.gov.br/store/";
/** Token de client_credentials: padrão do WSO2. Só o servidor muda (variável de ambiente), e só dentro do domínio do APILIB. */
export const APILIB_DEFAULT_TOKEN_URL = `${APILIB_GATEWAY}/token`;
export const APILIB_ALLOWED_HOST = /(^|\.)apilib\.prefeitura\.sp\.gov\.br$/i;

export const CITY_APIS = ["dom", "licitacoes", "fila", "escolas", "prato", "procon", "sp156", "esic", "idhm", "censo", "lentidao", "sof"] as const;
export type CityApi = (typeof CITY_APIS)[number];

export type CityDomain = "oportunidades" | "saude" | "educacao" | "consumo" | "cidadania" | "territorial" | "mobilidade" | "financas";
export type CityGroup = "noticias" | "saude_educacao" | "cidadania" | "territorial" | "financas";

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

export interface ResourceDef {
  path: string;
  label: string;
  params: Record<string, ParamDef>;
  /** Paginação documentada (limite/offset dos datasets do Portal de Dados Abertos ou page do DRF). */
  paging?: "limit_offset" | "page";
  /** Validade do cache, em segundos. Séries históricas não mudam: cache longo. */
  ttl: number;
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
  /** O schema de resposta não está publicado no Swagger: normalização genérica. */
  schemaDocumented: boolean;
}

const LIMIT = { in: "query", type: "int", min: 1, max: 500, label: "Limite" } as const;
const OFFSET = { in: "query", type: "int", min: 0, max: 10_000_000, label: "Deslocamento" } as const;
const DAY_H = 3600;
const HIST = 7 * 24 * DAY_H;

const year = (min: number, max: number | "currentYear"): ParamDef => ({ in: "path", type: "int", required: true, min, max, label: "Ano" });

export const CITY_API_DEFS: Record<CityApi, CityApiDef> = {
  dom: {
    id: "dom",
    name: "Diário Oficial da Cidade",
    apilibName: "Diario_Oficial",
    apilibProvider: "admin",
    version: "v1",
    base: "/sg/dom/v1",
    domain: "oportunidades",
    group: "noticias",
    route: "/cidade/diario-oficial",
    source: "Secretaria de Governo / Imprensa Oficial — Diário Oficial da Cidade de São Paulo",
    coverage: "Publicações por dia e caderno.",
    methodology: "Consulta por data de publicação e caderno. Filtros e classificação usam apenas os metadados (retranca, tipo de matéria, anunciante e seção).",
    limitations: [
      "A API devolve metadados e nomes de arquivos — não o texto integral da publicação.",
      "A busca por palavra-chave procura só nos metadados disponíveis.",
      "Publicações com status cancelado ou teste são sinalizadas e não contam como oportunidade.",
    ],
    probe: { resource: "publicacoes", params: { dataPublicacao: "TODAY", caderno: 11 } },
    resources: {
      publicacoes: {
        path: "/Publicacao",
        label: "Publicações do dia",
        params: {
          dataPublicacao: { in: "query", type: "day", required: true, label: "Data de publicação" },
          caderno: { in: "query", type: "int", required: true, min: 1, max: 999, label: "Caderno" },
        },
        ttl: 6 * DAY_H,
      },
      licitacoes: {
        path: "/Licitacao",
        label: "Eventos de licitação publicados no dia",
        params: {
          dataPublicacao: { in: "query", type: "day", required: true, label: "Data de publicação" },
          caderno: { in: "query", type: "int", required: true, min: 1, max: 999, label: "Caderno" },
        },
        ttl: 6 * DAY_H,
      },
    },
    schemaDocumented: true,
  },
  licitacoes: {
    id: "licitacoes",
    name: "Licitações e contratos",
    apilibName: "Licitacoes",
    apilibProvider: "admin",
    version: "v1",
    base: "/sg/licitacoes/v1",
    domain: "oportunidades",
    group: "noticias",
    route: "/cidade/licitacoes",
    source: "Secretaria de Governo — extratos de contratos publicados (Portal de Dados Abertos)",
    coverage: "Extratos de 2005 a 2019.",
    methodology: "Série histórica de extratos de contratos por ano. Os eventos atuais vêm do Diário Oficial (recurso Licitação).",
    limitations: [
      "A série histórica traz contratos já assinados — não são oportunidades abertas.",
      "Valores são os do extrato publicado (contratado); estimados e homologados só aparecem nos eventos do Diário Oficial quando informados.",
    ],
    probe: { resource: "contratos", params: { ano: 2019, limite: 1 } },
    resources: {
      contratos: { path: "/{ano}", label: "Extratos de contratos", params: { ano: year(2005, 2019), limite: LIMIT, offset: OFFSET }, paging: "limit_offset", ttl: HIST },
    },
    schemaDocumented: true,
  },
  fila: {
    id: "fila",
    name: "De Olho na Fila",
    apilibName: "DeOlhoNaFila-API",
    apilibProvider: "admin_SMS",
    version: "v1",
    base: "/api/ListaDeOlhoNaFila/v1",
    domain: "saude",
    group: "saude_educacao",
    route: "/cidade/de-olho-na-fila",
    source: "Secretaria Municipal da Saúde — De Olho na Fila",
    coverage: "Postos de vacinação listados pela Secretaria, com a situação da fila informada por eles.",
    methodology: "Lista os postos e a situação de fila publicada (texto da própria Secretaria) e as vacinas disponíveis em cada um.",
    limitations: [
      "A API informa uma situação de fila textual — não um tempo de espera em minutos.",
      "O horário de atualização é o informado por cada posto; postos sem atualização recente são sinalizados.",
    ],
    probe: { resource: "postos", params: {} },
    resources: { postos: { path: "/api/ListaDeOlhoNaFila", label: "Postos e situação da fila", params: {}, ttl: 5 * 60 } },
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
    group: "saude_educacao",
    route: "/cidade/escola-aberta",
    source: "Secretaria Municipal de Educação — Escola Aberta",
    coverage: "Unidades da rede municipal com dados de turmas, vagas, ambientes e servidores.",
    methodology: "Busca de escolas por nome, DRE, tipo, distrito, bairro e subprefeitura; detalhes por código da escola.",
    limitations: ["A API não publica avaliações nem notas das escolas — o LifeOS não cria ranking.", "O schema das respostas não está documentado no Swagger."],
    probe: { resource: "tipos", params: {} },
    resources: {
      escolas: {
        path: "/api/escolas/",
        label: "Escolas",
        params: {
          page: { in: "query", type: "int", min: 1, max: 10_000, label: "Página" },
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
      escola: { path: "/api/escolas/{codesc}/", label: "Escola", params: { codesc: { in: "path", type: "text", required: true, maxLength: 12, label: "Código da escola" } }, ttl: 24 * DAY_H },
      diretorias: { path: "/api/diretorias/", label: "Diretorias Regionais", params: {}, ttl: HIST },
      tipos: { path: "/api/tipo_escola/", label: "Tipos de escola", params: {}, ttl: HIST },
      distritos: { path: "/api/distritos/", label: "Distritos", params: { page: { in: "query", type: "int", min: 1, max: 1000, label: "Página" } }, paging: "page", ttl: HIST },
      modalidades: { path: "/api/modalidades/{codesc}", label: "Modalidades", params: { codesc: { in: "path", type: "text", required: true, maxLength: 12, label: "Código da escola" } }, ttl: 24 * DAY_H },
      alunos: { path: "/api/alunosserieturno/{codesc}", label: "Alunos por série e turno", params: { codesc: { in: "path", type: "text", required: true, maxLength: 12, label: "Código da escola" } }, ttl: 24 * DAY_H },
      vagas: { path: "/api/totvagmatbyserie/{codesc}", label: "Vagas e matrículas por série", params: { codesc: { in: "path", type: "text", required: true, maxLength: 12, label: "Código da escola" } }, ttl: 24 * DAY_H },
      ambientes: { path: "/api/ambientesbyescola/{codesc}", label: "Ambientes", params: { codesc: { in: "path", type: "text", required: true, maxLength: 12, label: "Código da escola" } }, ttl: 24 * DAY_H },
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
    group: "saude_educacao",
    route: "/cidade/prato-aberto",
    source: "Secretaria Municipal de Educação — Prato Aberto (cardápios da alimentação escolar)",
    coverage: "Cardápios publicados por ano.",
    methodology: "Dataset anual paginado do Portal de Dados Abertos.",
    limitations: ["A API não documenta o intervalo de anos nem o schema.", "O LifeOS não estima calorias ou nutrientes — só mostra o que o cardápio informa."],
    probe: { resource: "cardapios", params: { ano: "CURRENT_YEAR", limite: 1 } },
    resources: { cardapios: { path: "/{ano}", label: "Cardápios", params: { ano: year(2015, "currentYear"), limite: LIMIT, offset: OFFSET }, paging: "limit_offset", ttl: 24 * DAY_H } },
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
    coverage: "Atendimentos de 2016 a 2019.",
    methodology: "Dataset anual paginado. Contagens são calculadas pelo LifeOS sobre a amostra carregada.",
    limitations: [
      "Número absoluto de reclamações não prova sozinho que uma empresa é ruim: empresas maiores atendem mais pessoas.",
      "Série histórica encerrada em 2019.",
      "O schema das respostas não está documentado no Swagger.",
    ],
    probe: { resource: "atendimentos", params: { ano: 2019, limite: 1 } },
    resources: { atendimentos: { path: "/{ano}", label: "Atendimentos", params: { ano: year(2016, 2019), limite: LIMIT, offset: OFFSET }, paging: "limit_offset", ttl: HIST } },
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
    coverage: "Solicitações, ligações e avaliações por ano e semestre.",
    methodology: "Datasets semestrais paginados. Os protocolos pessoais são acompanhados manualmente no LifeOS.",
    limitations: [
      "A API é somente leitura: não abre solicitações nem consulta protocolos individuais.",
      "O intervalo de anos e o schema não estão documentados.",
    ],
    probe: { resource: "solicitacoes", params: { ano: 2019, semestre: 1, limite: 1 } },
    resources: {
      solicitacoes: { path: "/solicitacoes/{ano}/{semestre}", label: "Solicitações", params: { ano: year(2012, "currentYear"), semestre: { in: "path", type: "int", required: true, min: 1, max: 2, label: "Semestre" }, limite: LIMIT, offset: OFFSET }, paging: "limit_offset", ttl: HIST },
      ligacoes: { path: "/ligacoes/DadosGerais/{ano}/{semestre}", label: "Ligações", params: { ano: year(2012, "currentYear"), semestre: { in: "path", type: "int", required: true, min: 1, max: 2, label: "Semestre" }, limite: LIMIT, offset: OFFSET }, paging: "limit_offset", ttl: HIST },
      avaliacao: { path: "/ligacoes/avaliacao/{ano}/{semestre}", label: "Avaliação do atendimento", params: { ano: year(2012, "currentYear"), semestre: { in: "path", type: "int", required: true, min: 1, max: 2, label: "Semestre" }, limite: LIMIT, offset: OFFSET }, paging: "limit_offset", ttl: HIST },
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
    source: "Controladoria Geral do Município — e-SIC",
    coverage: "Pedidos de acesso à informação desde 2012.",
    methodology: "Dataset anual paginado. Os seus pedidos são acompanhados manualmente no LifeOS.",
    limitations: ["A API é somente leitura: novos pedidos são feitos no portal oficial do e-SIC.", "O schema das respostas não está documentado no Swagger."],
    probe: { resource: "pedidos", params: { ano: 2019, limite: 1 } },
    resources: { pedidos: { path: "/{ano}", label: "Pedidos", params: { ano: year(2012, "currentYear"), limite: LIMIT, offset: OFFSET }, paging: "limit_offset", ttl: 24 * DAY_H } },
    schemaDocumented: false,
  },
  idhm: {
    id: "idhm",
    name: "IDHM por território",
    apilibName: "IDHM",
    apilibProvider: "admin",
    version: "v1",
    base: "/smdhc/idhm/v1",
    domain: "territorial",
    group: "territorial",
    route: "/cidade/idhm",
    source: "Secretaria de Direitos Humanos e Cidadania — IDHM por Unidade de Desenvolvimento Humano (UDH)",
    coverage: "Censos de 2000 e 2010.",
    methodology: "Índice por UDH do Atlas do Desenvolvimento Humano. Comparações são feitas pelo LifeOS entre registros carregados.",
    limitations: ["Dados de 2000 e 2010 — retratam a cidade naquela época.", "O schema das respostas não está documentado no Swagger."],
    probe: { resource: "udh", params: { ano: 2010, limite: 1 } },
    resources: { udh: { path: "/{ano}", label: "IDHM por UDH", params: { ano: { in: "path", type: "enum", required: true, values: ["2000", "2010"], label: "Ano" }, limite: LIMIT, offset: OFFSET }, paging: "limit_offset", ttl: HIST } },
    schemaDocumented: false,
  },
  censo: {
    id: "censo",
    name: "Censo Demográfico",
    apilibName: "CensoDemografico",
    apilibProvider: "admin",
    version: "v1",
    base: "/ibge/censo/v1",
    domain: "territorial",
    group: "territorial",
    route: "/cidade/censo",
    source: "IBGE — Censo Demográfico (recorte do município, via Prefeitura)",
    coverage: "Censos de 2000 e 2010, por arquivo do resultado do universo e da amostra.",
    methodology: "Cada arquivo do IBGE é um dataset próprio; as variáveis seguem o dicionário do IBGE.",
    limitations: ["Os nomes das colunas seguem os códigos do IBGE (ex.: V001).", "Dados de 2000 e 2010."],
    probe: { resource: "arquivo", params: { arquivo: "basico", ano: 2010, limite: 1 } },
    resources: {
      arquivo: {
        path: "/{arquivo}/{ano}",
        label: "Arquivo do Censo",
        params: {
          arquivo: {
            in: "path",
            type: "enum",
            required: true,
            values: ["regiao", "amostra-pessoa", "amostra-domicilio", "domicilio1", "domicilio2", "instrucao", "responsavel", "responsavel1", "responsavel2", "basico", "pessoa", "pessoa1", "pessoa2", "pessoa3", "pessoa4", "pessoa5", "pessoa6", "pessoa7", "pessoa8", "pessoa9", "pessoa10", "pessoa11", "pessoa12", "pessoa13"],
            label: "Arquivo",
          },
          ano: { in: "path", type: "enum", required: true, values: ["2000", "2010"], label: "Ano" },
          limite: LIMIT,
          offset: OFFSET,
        },
        paging: "limit_offset",
        ttl: HIST,
      },
    },
    schemaDocumented: false,
  },
  lentidao: {
    id: "lentidao",
    name: "Lentidão no trânsito",
    apilibName: "LentidaoTransito",
    apilibProvider: "admin",
    version: "v1",
    base: "/cet/lentidao/v1",
    domain: "mobilidade",
    group: "territorial",
    route: "/cidade/lentidao",
    source: "CET — Companhia de Engenharia de Tráfego",
    coverage: "Série histórica de 2001 a 2018.",
    methodology: "Registros históricos de lentidão. Padrões por horário/dia são calculados pelo LifeOS na amostra carregada.",
    limitations: ["Dados históricos — não representam o trânsito de agora.", "Não alimenta a Hora de Sair nem a Estação das Carruagens."],
    probe: { resource: "registros", params: { ano: 2018, limite: 1 } },
    resources: { registros: { path: "/{ano}", label: "Registros de lentidão", params: { ano: year(2001, 2018), limite: LIMIT, offset: OFFSET }, paging: "limit_offset", ttl: HIST } },
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
    coverage: "Órgãos, funções, despesas, empenhos e contratos por ano/mês de exercício.",
    methodology: "Consultas oficiais por exercício. Totais são somados pelo LifeOS só sobre os registros carregados e sinalizados como tal.",
    limitations: [
      "Finanças públicas — totalmente separadas das finanças pessoais do LifeOS.",
      "O schema das respostas não está documentado no Swagger.",
    ],
    probe: { resource: "orgaos", params: { anoExercicio: "CURRENT_YEAR" } },
    resources: {
      orgaos: { path: "/orgaos", label: "Órgãos", params: { anoExercicio: { in: "query", type: "int", required: true, min: 2003, max: "currentYear", label: "Exercício" } }, ttl: 24 * DAY_H },
      funcoes: { path: "/funcoes", label: "Funções", params: { anoExercicio: { in: "query", type: "int", min: 2003, max: "currentYear", label: "Exercício" } }, ttl: 24 * DAY_H },
      despesas: {
        path: "/despesas",
        label: "Despesas (dotação)",
        params: {
          anoDotacao: { in: "query", type: "int", required: true, min: 2003, max: "currentYear", label: "Ano" },
          mesDotacao: { in: "query", type: "int", required: true, min: 1, max: 12, label: "Mês" },
          codOrgao: { in: "query", type: "text", maxLength: 6, label: "Órgão" },
          codFuncao: { in: "query", type: "text", maxLength: 6, label: "Função" },
        },
        ttl: 12 * DAY_H,
      },
      empenhos: {
        path: "/empenhos",
        label: "Empenhos",
        params: {
          anoEmpenho: { in: "query", type: "int", required: true, min: 2003, max: "currentYear", label: "Ano" },
          mesEmpenho: { in: "query", type: "int", required: true, min: 1, max: 12, label: "Mês" },
          codOrgao: { in: "query", type: "text", maxLength: 6, label: "Órgão" },
        },
        ttl: 12 * DAY_H,
      },
      contratos: {
        path: "/contratos",
        label: "Contratos",
        params: {
          anoContrato: { in: "query", type: "int", required: true, min: 2003, max: "currentYear", label: "Ano" },
          codOrgao: { in: "query", type: "text", maxLength: 6, label: "Órgão" },
        },
        ttl: 12 * DAY_H,
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
  readPublication: { xp: 5, coins: 0 },
  saveOpportunity: { xp: 10, coins: 1, maxPerDay: 3 },
  compare: { xp: 10, coins: 0 },
  explore: { xp: 5, coins: 0 },
} as const;
// Protocolos (SP156/e-SIC) não dão XP: o módulo não incentiva abrir pedidos ou reclamações para pontuar.
