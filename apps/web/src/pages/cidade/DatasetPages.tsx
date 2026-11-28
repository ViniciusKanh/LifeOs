import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { RPGBadge } from "@/components/rpg";
import { useLocalToast } from "@/components/integrations/PublicApiKit";
import { useCityActions, useCityData } from "@/hooks/useCity";
import { CityBanner, R, Select, cellText } from "@/components/city/CityKit";
import { DatasetExplorer } from "@/components/city/DatasetExplorer";

/**
 * Telas dos conjuntos anuais/semestrais do APILIB: cada uma é o Explorador com o recorte, os
 * avisos e as colunas próprias do seu domínio. Panorama (rankings, somas, séries) vem do servidor.
 */

const YEAR = new Date().getFullYear();
const LAST_MONTH = new Date().getMonth() || 12;
const LAST_MONTH_YEAR = new Date().getMonth() === 0 ? YEAR - 1 : YEAR;

export function Notice({ children, tone = "amber" }: { children: ReactNode; tone?: "amber" | "cyan" }) {
  return (
    <p className={`flex items-start gap-2 border-2 p-2.5 text-sm ${tone === "amber" ? "border-amber-400/50 bg-amber-400/10 text-amber-200" : "border-cyan-400/50 bg-cyan-400/10 text-cyan-100"}`} style={R}>
      <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> <span>{children}</span>
    </p>
  );
}

/** Clique numa subprefeitura/corredor do panorama = território explorado (conquista Explorador Paulistano). */
function useTerritoryPick(apiId: "lentidao", dims: RegExp) {
  const a = useCityActions();
  const [notify, toast] = useLocalToast();
  const pick = (dim: string, value: string) => {
    if (!dims.test(dim.toLowerCase())) return;
    a.activity.mutate({ api: apiId, action: "territory", ref: value.slice(0, 120), label: value.slice(0, 150) }, { onSuccess: (r) => r.recorded && notify(`Território explorado: ${value}`) });
  };
  return { pick, toast };
}

/* ───────────── Prato Aberto ───────────── */
export function PratoAbertoPage() {
  return (
    <div className="space-y-3">
      <CityBanner domain="educacao" eyebrow="Educação" title="Prato Aberto" subtitle="Cardápios da alimentação escolar da rede municipal: o que é servido em cada refeição, por faixa etária e tipo de atendimento.">
        <RPGBadge tone="purple">Cardápios oficiais</RPGBadge>
      </CityBanner>
      <Notice>O LifeOS mostra só o que o cardápio informa. Não estimamos calorias nem nutrientes.</Notice>
      <DatasetExplorer
        apiId="prato"
        domain="educacao"
        resources={[{ id: "cardapios", label: "Cardápios" }]}
        initial={{ ano: String(YEAR) }}
        prefer={[/^data$/, /^refeicao$/, /^cardapio$/, /^idade$/, /^unidade$/, /^atendimento$/]}
        wrap={[/^cardapio$/]}
        titleField={/^cardapio$/}
        csvName="prato-aberto"
        totalLabel="Cardápios no ano"
        oracleSuggestions={["Quais alimentos aparecem com mais frequência?", "Como varia o lanche entre as faixas etárias?"]}
      />
    </div>
  );
}

/* ───────────── Lentidão ───────────── */
export function LentidaoPage() {
  const t = useTerritoryPick("lentidao", /corredor|regiao/);
  return (
    <div className="space-y-3">
      {t.toast}
      <CityBanner domain="mobilidade" eyebrow="Território" title="Lentidão no trânsito" subtitle="Onde e quando São Paulo travava: trechos lentos medidos pela CET a cada 30 minutos (2001–2018), por corredor, sentido, região e horário.">
        <RPGBadge tone="orange">Dados históricos</RPGBadge>
      </CityBanner>
      <Notice>Registros históricos (até 2018): não mostram o trânsito de agora e não alimentam a Hora de Sair nem a Estação das Carruagens.</Notice>
      <DatasetExplorer
        apiId="lentidao"
        domain="mobilidade"
        resources={[{ id: "registros", label: "Trechos lentos" }]}
        initial={{ ano: "2018" }}
        prefer={[/^corredor$/, /^trechos$/, /^sentido$/, /^tamanho$/, /regiao/, /data\/hora|^data/]}
        titleField={/^corredor$/}
        onDimPick={t.pick}
        csvName="lentidao"
        totalLabel="Registros no ano"
        oracleSuggestions={["Quais corredores aparecem mais lentos?", "Em que horário a lentidão é maior nesta amostra?"]}
      />
    </div>
  );
}

/* ───────────── SOF ───────────── */
function OrgaoSelect({ year, value, onChange }: { year: string; value: string; onChange: (v: string) => void }) {
  const q = useCityData("sof", "orgaos", { anoExercicio: year }, !!year);
  const rows = q.data?.rows ?? [];
  const code = q.data?.columns.find((c) => /^codorgao$/i.test(c.key))?.key;
  const name = q.data?.columns.find((c) => /descricaoorgao/i.test(c.key))?.key;
  const options = code && name ? rows.map((r) => ({ value: cellText(r[code]), label: cellText(r[name]) })).sort((a, b) => a.label.localeCompare(b.label)) : [];
  return <Select label="Órgão" value={value} onChange={onChange} options={[{ value: "", label: q.isLoading ? "Carregando…" : "Todos" }, ...options]} />;
}

export function SofPage() {
  return (
    <div className="space-y-3">
      <CityBanner domain="financas" eyebrow="Finanças Públicas" title="Orçamento e Finanças (SOF)" subtitle="Quanto a Prefeitura planejou e quanto gastou: dotações por órgão, função e programa, empenhos, contratos e fornecedores, direto do Sistema de Orçamento e Finanças.">
        <RPGBadge tone="gold">Dinheiro público</RPGBadge>
      </CityBanner>
      <Notice tone="cyan">Números do orçamento da Prefeitura, acumulados até o mês consultado. Eles não se misturam com o Banco do Reino nem com as suas finanças pessoais no LifeOS.</Notice>
      <DatasetExplorer
        apiId="sof"
        domain="financas"
        resources={[
          { id: "despesas", label: "Despesas (dotação)" },
          { id: "empenhos", label: "Empenhos" },
          { id: "contratos", label: "Contratos" },
          { id: "orgaos", label: "Órgãos" },
          { id: "funcoes", label: "Funções" },
          { id: "programas", label: "Programas" },
        ]}
        initial={{ anoExercicio: String(YEAR), anoDotacao: String(LAST_MONTH_YEAR), mesDotacao: String(LAST_MONTH), anoEmpenho: String(LAST_MONTH_YEAR), mesEmpenho: String(LAST_MONTH), anoContrato: String(YEAR) }}
        prefer={[/descricaoorgao/, /descricaofuncao/, /descricaoprograma/, /descricaoprojetoatividade/, /razaosocial/, /objetocontrato/, /orcadoatualizado/, /empenhadoliquido/, /^valliquidado$/, /pagoexercicio|^valpago$/, /^valprincipal$/]}
        wrap={[/objetocontrato/]}
        titleField={/descricaoprojetoatividade|objetocontrato|razaosocial|descricaoprograma|descricaoorgao|descricaofuncao/}
        compareBy={/descricaoorgao|descricaoprojetoatividade|razaosocial/}
        extraControls={(p, set) => <OrgaoSelect key="orgao" year={p.anoDotacao ?? p.anoEmpenho ?? p.anoContrato ?? p.anoExercicio ?? String(YEAR)} value={p.codOrgao ?? ""} onChange={(v) => set("codOrgao", v)} />}
        csvName="sof"
        totalLabel="Registros"
        oracleSuggestions={["Quais órgãos têm maior orçamento atualizado?", "Qual a execução (pago × orçado) nesta amostra?"]}
      />
    </div>
  );
}
