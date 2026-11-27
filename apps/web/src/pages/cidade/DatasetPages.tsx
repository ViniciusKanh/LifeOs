import type { ReactNode } from "react";
import { AlertTriangle, BarChart3, Landmark, Scale } from "lucide-react";
import { RPGBadge } from "@/components/rpg";
import { IndicatorCard } from "@/components/rpg-modules/ModuleKit";
import { useLocalToast } from "@/components/integrations/PublicApiKit";
import { useCityActions } from "@/hooks/useCity";
import type { Row } from "@/services/cityService";
import { CityBanner, R, cellText, money, useCityActivity } from "@/components/city/CityKit";
import { DatasetExplorer } from "@/components/city/DatasetExplorer";
import { ProtocolsPanel } from "@/components/city/PersonalPanels";

/**
 * Telas dos datasets anuais do APILIB (sem schema de resposta publicado): cada uma é o
 * Explorador com o recorte, os avisos e as leituras próprias do seu domínio.
 */

const YEAR = new Date().getFullYear();
const LAST_MONTH = new Date().getMonth() || 12;
const LAST_MONTH_YEAR = new Date().getMonth() === 0 ? YEAR - 1 : YEAR;

function Notice({ children, tone = "amber" }: { children: ReactNode; tone?: "amber" | "cyan" }) {
  return (
    <p className={`flex items-start gap-2 border-2 p-2.5 text-sm ${tone === "amber" ? "border-amber-400/50 bg-amber-400/10 text-amber-200" : "border-cyan-400/50 bg-cyan-400/10 text-cyan-100"}`} style={R}>
      <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> <span>{children}</span>
    </p>
  );
}

/** Soma colunas monetárias da amostra (rótulo deixa claro que é cálculo do LifeOS sobre o que foi carregado). */
function sumColumn(rows: Row[], pattern: RegExp): { column: string; sum: number; n: number } | null {
  const col = Object.keys(rows[0] ?? {}).find((k) => pattern.test(k) && rows.some((r) => typeof r[k] === "number" || /^-?\d+([.,]\d+)?$/.test(String(r[k] ?? ""))));
  if (!col) return null;
  let sum = 0;
  let n = 0;
  for (const r of rows) {
    const v = typeof r[col] === "number" ? (r[col] as number) : Number(String(r[col] ?? "").replace(",", "."));
    if (Number.isFinite(v)) {
      sum += v;
      n += 1;
    }
  }
  return { column: col, sum, n };
}

/* ───────────── Prato Aberto ───────────── */
export function PratoAbertoPage() {
  return (
    <div className="space-y-3">
      <CityBanner domain="educacao" eyebrow="Saúde e Educação" title="Prato Aberto" subtitle="Cardápios da alimentação escolar publicados pela Secretaria de Educação.">
        <RPGBadge tone="purple">Sem estimativa nutricional</RPGBadge>
      </CityBanner>
      <Notice>O LifeOS mostra só o que o cardápio informa. Não estimamos calorias nem nutrientes sem dados oficiais suficientes.</Notice>
      <DatasetExplorer apiId="prato" domain="educacao" resources={[{ id: "cardapios", label: "Cardápios" }]} initial={{ ano: String(YEAR) }} prefer={["data", "tipo_escola", "tipo_atendimento", "idade", "refeicao", "cardapio"]} csvName="prato-aberto" oracleSuggestions={["Quais refeições aparecem nesta amostra?"]} />
    </div>
  );
}

/* ───────────── PROCON ───────────── */
export function ProconPage() {
  return (
    <div className="space-y-3">
      <CityBanner domain="consumo" eyebrow="Cidadania e Consumo" title="PROCON Paulistano" subtitle="Atendimentos registrados pelo PROCON municipal (2016–2019). Útil para pesquisar um fornecedor antes de comprar.">
        <RPGBadge tone="purple">Série histórica</RPGBadge>
      </CityBanner>
      <Notice>Quantidade absoluta de reclamações não prova que uma empresa é ruim: empresas maiores atendem mais pessoas. Compare sempre com o porte e com o desfecho dos atendimentos.</Notice>
      <DatasetExplorer apiId="procon" domain="consumo" resources={[{ id: "atendimentos", label: "Atendimentos" }]} initial={{ ano: "2019" }} prefer={["empresa", "fornecedor", "razao_social", "assunto", "problema", "area", "desfecho"]} csvName="procon" oracleSuggestions={["Quais assuntos aparecem mais?", "Como se distribuem os desfechos?"]} />
    </div>
  );
}

/* ───────────── SP156 ───────────── */
export function Sp156Page() {
  const [notify, toast] = useLocalToast();
  return (
    <div className="space-y-3">
      {toast}
      <CityBanner domain="cidadania" eyebrow="Cidadania e Consumo" title="SP156" subtitle="Solicitações, ligações e avaliação do atendimento da Central 156 — e os seus protocolos, acompanhados aqui.">
        <RPGBadge tone="cyan">Somente leitura</RPGBadge>
      </CityBanner>
      <DatasetExplorer
        apiId="sp156"
        domain="cidadania"
        resources={[
          { id: "solicitacoes", label: "Solicitações" },
          { id: "ligacoes", label: "Ligações" },
          { id: "avaliacao", label: "Avaliação do atendimento" },
        ]}
        initial={{ ano: "2019", semestre: "1" }}
        prefer={["assunto", "servico", "tema", "subprefeitura", "status", "canal"]}
        csvName="sp156"
        oracleSuggestions={["Quais serviços são mais pedidos nesta amostra?"]}
      />
      <ProtocolsPanel kind="sp156" notify={notify} officialUrl="https://sp156.prefeitura.sp.gov.br/" />
    </div>
  );
}

/* ───────────── e-SIC ───────────── */
export function EsicPage() {
  const [notify, toast] = useLocalToast();
  return (
    <div className="space-y-3">
      {toast}
      <CityBanner domain="cidadania" eyebrow="Cidadania e Consumo" title="e-SIC — Acesso à Informação" subtitle="Pedidos de informação feitos à Prefeitura desde 2012. Veja o que já foi perguntado antes de abrir um pedido novo.">
        <RPGBadge tone="cyan">Lei de Acesso à Informação</RPGBadge>
      </CityBanner>
      <DatasetExplorer apiId="esic" domain="cidadania" resources={[{ id: "pedidos", label: "Pedidos" }]} initial={{ ano: String(YEAR - 1) }} prefer={["orgao", "assunto", "situacao", "tipo_resposta", "data_pedido"]} csvName="esic" oracleSuggestions={["Quais órgãos recebem mais pedidos?", "Quais assuntos são mais frequentes?"]} />
      <ProtocolsPanel kind="esic" notify={notify} officialUrl="https://esic.prefeitura.sp.gov.br/" />
    </div>
  );
}

/* ───────────── IDHM ───────────── */
function Compare({ rows }: { rows: Row[] }) {
  const label = (r: Row) => cellText(Object.values(r).find((v) => typeof v === "string") ?? "Registro");
  const ref = rows.map(label).sort().join(" × ").slice(0, 120);
  useCityActivity("idhm", "compare", ref, "Comparação de territórios");
  const numeric = Object.keys(rows[0] ?? {}).filter((k) => rows.every((r) => typeof r[k] === "number" || /^-?\d+([.,]\d+)?$/.test(String(r[k] ?? "")))).slice(0, 12);
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 font-pixel text-[10px] uppercase text-rpg-gold">
        <Scale size={13} aria-hidden /> Comparação lado a lado
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="px-1 py-1 text-left text-rpg-muted">Indicador</th>
              {rows.map((r, i) => (
                <th key={i} className="max-w-[120px] truncate px-1 py-1 text-right text-rpg-text" title={label(r)}>
                  {label(r)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {numeric.map((k) => (
              <tr key={k} className="border-t border-rpg-border/60">
                <td className="truncate px-1 py-1 text-rpg-muted">{k}</td>
                {rows.map((r, i) => (
                  <td key={i} className="px-1 py-1 text-right tabular-nums text-rpg-text">
                    {cellText(r[k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11px] text-rpg-muted">Valores exatamente como publicados. Diferenças não indicam causa.</p>
    </div>
  );
}

function useTerritory(apiId: "idhm" | "censo") {
  const a = useCityActions();
  return (r: Row) => {
    const name = Object.entries(r).find(([k, v]) => /udh|nome|regiao|distrito|bairro|territ/i.test(k) && typeof v === "string")?.[1];
    if (name) a.activity.mutate({ api: apiId, action: "territory", ref: String(name).slice(0, 120), label: String(name).slice(0, 150) });
  };
}

export function IdhmPage() {
  const onOpen = useTerritory("idhm");
  return (
    <div className="space-y-3">
      <CityBanner domain="territorial" eyebrow="Inteligência Territorial" title="IDHM por território" subtitle="Índice de Desenvolvimento Humano por Unidade de Desenvolvimento Humano (UDH) nos censos de 2000 e 2010. Marque até 4 territórios para comparar.">
        <RPGBadge tone="blue">2000 · 2010</RPGBadge>
      </CityBanner>
      <Notice tone="cyan">Retratos de 2000 e 2010 — a cidade mudou desde então. Use para entender trajetórias, não a situação de hoje.</Notice>
      <DatasetExplorer
        apiId="idhm"
        domain="territorial"
        resources={[{ id: "udh", label: "IDHM por UDH" }]}
        initial={{ ano: "2010" }}
        prefer={["udh", "nome_udh", "idhm", "idhm_e", "idhm_l", "idhm_r"]}
        csvName="idhm"
        compare={{ label: "Comparar", render: (rows) => <Compare rows={rows} />, refOf: (r) => cellText(Object.values(r)[0] ?? null) }}
        onRowOpened={onOpen}
        oracleSuggestions={["Qual a faixa de IDHM nesta amostra?"]}
      />
    </div>
  );
}

/* ───────────── Censo ───────────── */
export function CensoPage() {
  const onOpen = useTerritory("censo");
  return (
    <div className="space-y-3">
      <CityBanner domain="territorial" eyebrow="Inteligência Territorial" title="Censo Demográfico" subtitle="Arquivos do resultado do Censo do IBGE (2000 e 2010) para o município. As colunas seguem o dicionário de variáveis do IBGE (V001, V002…).">
        <RPGBadge tone="blue">IBGE</RPGBadge>
      </CityBanner>
      <DatasetExplorer apiId="censo" domain="territorial" resources={[{ id: "arquivo", label: "Arquivo do Censo" }]} initial={{ arquivo: "basico", ano: "2010" }} prefer={["Cod_setor", "Nome_do_distrito", "Nome_do_subdistrito", "Nome_do_bairro"]} csvName="censo" onRowOpened={onOpen} oracleSuggestions={["Quais distritos aparecem nesta amostra?"]} />
    </div>
  );
}

/* ───────────── Lentidão ───────────── */
export function LentidaoPage() {
  return (
    <div className="space-y-3">
      <CityBanner domain="mobilidade" eyebrow="Inteligência Territorial" title="Lentidão no trânsito" subtitle="Série histórica de lentidão da CET (2001–2018), para estudar padrões por via, horário e dia.">
        <RPGBadge tone="orange">Dados históricos</RPGBadge>
      </CityBanner>
      <Notice>Estes registros são históricos (até 2018): não mostram o trânsito de agora e não alimentam a Hora de Sair nem a Estação das Carruagens.</Notice>
      <DatasetExplorer apiId="lentidao" domain="mobilidade" resources={[{ id: "registros", label: "Registros de lentidão" }]} initial={{ ano: "2018" }} prefer={["data", "hora", "via", "corredor", "sentido", "regiao", "tamanho"]} csvName="lentidao" oracleSuggestions={["Quais vias aparecem mais nesta amostra?", "Em quais horários há mais registros?"]} />
    </div>
  );
}

/* ───────────── SOF ───────────── */
function SofInsights({ rows }: { rows: Row[] }) {
  const s = sumColumn(rows, /val|empenh|liquid|pago|dota/i);
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
      <IndicatorCard icon={<BarChart3 size={22} />} label="Registros carregados" value={rows.length} tone="gold" />
      <IndicatorCard icon={<Landmark size={22} />} label={s ? `Soma de ${s.column}` : "Soma"} value={s ? money(s.sum) : "—"} tone="gold" hint={s ? `${s.n} registro(s) · só a amostra` : "sem coluna de valor"} />
      <IndicatorCard icon={<Scale size={22} />} label="Natureza" value="Finanças públicas" tone="orange" hint="separadas das suas finanças" />
    </div>
  );
}

export function SofPage() {
  return (
    <div className="space-y-3">
      <CityBanner domain="financas" eyebrow="Finanças Públicas" title="Orçamento e Finanças (SOF)" subtitle="Órgãos, funções, despesas, empenhos e contratos do orçamento municipal, direto do Sistema de Orçamento e Finanças.">
        <RPGBadge tone="gold">Dinheiro público</RPGBadge>
      </CityBanner>
      <Notice tone="cyan">Estes números são do orçamento da Prefeitura. Eles não se misturam com o Banco do Reino nem com as suas finanças pessoais no LifeOS.</Notice>
      <DatasetExplorer
        apiId="sof"
        domain="financas"
        resources={[
          { id: "despesas", label: "Despesas (dotação)" },
          { id: "empenhos", label: "Empenhos" },
          { id: "contratos", label: "Contratos" },
          { id: "orgaos", label: "Órgãos" },
          { id: "funcoes", label: "Funções" },
        ]}
        initial={{ anoExercicio: String(YEAR), anoDotacao: String(LAST_MONTH_YEAR), mesDotacao: String(LAST_MONTH), anoEmpenho: String(LAST_MONTH_YEAR), mesEmpenho: String(LAST_MONTH), anoContrato: String(YEAR) }}
        prefer={["txDescricaoOrgao", "txDescricaoFuncao", "txDescricaoPrograma", "valOrcadoInicial", "valOrcadoAtualizado", "valEmpenhadoLiquido", "valLiquidado", "valPagoExercicio"]}
        csvName="sof"
        insights={(rows) => <SofInsights rows={rows} />}
        oracleSuggestions={["Quais órgãos concentram os maiores valores nesta amostra?"]}
      />
    </div>
  );
}
