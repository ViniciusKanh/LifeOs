import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { RPGBadge } from "@/components/rpg";
import { useLocalToast } from "@/components/integrations/PublicApiKit";
import { useCityActions } from "@/hooks/useCity";
import { CityBanner, R } from "@/components/city/CityKit";
import { DatasetExplorer } from "@/components/city/DatasetExplorer";

/**
 * Telas dos conjuntos anuais/semestrais do APILIB: cada uma é o Explorador com o recorte, os
 * avisos e as colunas próprias do seu domínio. Panorama (rankings, somas, séries) vem do servidor.
 */

const YEAR = new Date().getFullYear();

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
