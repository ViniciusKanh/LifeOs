/**
 * Fontes públicas (sem credencial) usadas pela Cidade Inteligente para trazer os dados mais atuais.
 *
 * - Portal de Dados Abertos da Prefeitura (CKAN): PROCON, e-SIC e SP156 são publicados aqui até
 *   2023–2025, enquanto as mesmas bases no APILIB pararam em 2016–2020.
 * - Escola Aberta (SME): o mesmo backend que o APILIB repassa, com atualização mensal.
 *
 * O servidor só consulta estes dois hosts, só pelos caminhos fixos abaixo e só com recursos
 * descobertos dentro dos conjuntos listados — nenhuma URL vem do usuário.
 */

export const CKAN_HOST = "dados.prefeitura.sp.gov.br";
export const CKAN_BASE = `https://${CKAN_HOST}/api/3/action`;

export const ESCOLA_HOST = "escolaaberta.sme.prefeitura.sp.gov.br";
export const ESCOLA_BASE = `https://${ESCOLA_HOST}/api`;

export const PUBLIC_HOSTS = [CKAN_HOST, ESCOLA_HOST] as const;

export type CkanDataset = "procon" | "esic" | "sp156" | "ligacoes";

export interface CkanDatasetDef {
  /** Identificador do conjunto no portal (package_show). */
  pkg: string;
  /** Recursos aceitos: o nome precisa casar com `match` e não casar com `exclude`. */
  match: RegExp;
  exclude?: RegExp;
  /** Colunas que provam que o recurso é a base registro a registro (e não um resumo). */
  requires: RegExp[];
  label: string;
}

export const CKAN_DATASETS: Record<CkanDataset, CkanDatasetDef> = {
  procon: {
    pkg: "dados-de-reclamacoes-procon-paulistano",
    match: /reclama/i,
    exclude: /den[uú]ncia/i,
    requires: [/razao social/, /regiao/],
    label: "PROCON Paulistano — reclamações",
  },
  esic: {
    pkg: "pedidos-de-informacao-protocolados-a-prefeitura-via-e-sic1",
    match: /pedidos de informa/i,
    requires: [/^cd_pedido$/, /status/],
    label: "e-SIC — pedidos de informação",
  },
  sp156: {
    pkg: "dados-do-sp156",
    match: /dados do sp156/i,
    requires: [/^tema$/],
    label: "SP156 — solicitações",
  },
  ligacoes: {
    pkg: "dados-do-sp156-ligacoes",
    match: /dados gerais/i,
    requires: [/entrantes/],
    label: "SP156 — ligações da central",
  },
};

/** Validade do cache: listas de recursos mudam pouco; bases publicadas não mudam depois de sair. */
export const PUBLIC_TTL = {
  packages: 12 * 3600,
  fields: 24 * 3600,
  aggregates: 3 * 24 * 3600,
  search: 24 * 3600,
  escola: 24 * 3600,
} as const;

/**
 * Caminhos da Escola Aberta aceitos pelo servidor ({codesc} = 6 dígitos, {dre} = sigla da DRE).
 * Verificados no backend público da SME em 2026-11.
 */
export const ESCOLA_PATHS = {
  escolas: "/escolas/",
  escola: "/escolas/{codesc}/",
  diretorias: "/diretorias/",
  tipos: "/tipo_escola/",
  atualizacao: "/dtatualizacao/",
  vagasSerie: "/totvagmatbyserie/{codesc}",
  alunos: "/alunosserieturno/{codesc}",
  ambientes: "/ambientesbyescola/{codesc}",
  servidores: "/totservatuacao/{codesc}",
  modalidades: "/modalidades/{codesc}",
  smeVagas: "/smevagasmat/",
  smeVagasDre: "/smevagasmat/{dre}",
  smeEscolas: "/smeescolas/",
  smeEscolasDre: "/smeescolas/{dre}",
  smeProfissionais: "/smeprofissionais/",
  smeProfissionaisDre: "/smeprofissionais/{dre}",
  smeAmbientes: "/smeambientes/",
  smeAmbientesDre: "/smeambientes/{dre}",
} as const;
export type EscolaPath = keyof typeof ESCOLA_PATHS;
