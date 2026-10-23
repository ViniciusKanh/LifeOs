import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Compass, Crown, Map as MapIcon, Route, Sparkles, TrendingUp } from "lucide-react";
import { RPGButton, RPGPageHeader, RPGPanel, RPGStatCard } from "@/components/rpg";
import { RPGHowItWorks } from "@/components/rpg/RPGHowItWorks";
import { WorldMapCanvas } from "@/components/mapa/WorldMapCanvas";
import { RegionCard } from "@/components/mapa/RegionCard";
import { RegionDetail } from "@/components/mapa/RegionDetail";
import { REGION_ORDER } from "@/components/mapa/regionUi";
import { useWorldMap } from "@/hooks/useWorldMap";
import type { RegionKey, WorldRegion } from "@/services/worldmapService";

/** Resumo do mapa a partir das regiões já calculadas pela API (sem números novos). */
function summarize(regions: WorldRegion[]) {
  const explored = regions.filter((r) => !r.fogged).length;
  const withXp = regions.filter((r) => r.xp > 0);
  const strongest = [...withXp].sort((a, b) => b.xp - a.xp)[0] ?? null;
  const rising = [...withXp].filter((r) => (r.trendPct ?? 0) > 0).sort((a, b) => (b.trendPct ?? 0) - (a.trendPct ?? 0))[0] ?? null;
  return { explored, strongest, rising };
}

/** 🗺️ Mapa do Mundo — cada área da vida é uma região com nível próprio, pelo XP real. */
export function MapaMundoPage() {
  const { data, isLoading, isError, refetch } = useWorldMap();
  const [open, setOpen] = useState<RegionKey | null>(null);
  const ordered = useMemo(() => (data ? REGION_ORDER.map((k) => data.regions.find((r) => r.key === k)).filter((r): r is WorldRegion => !!r) : []), [data]);
  const sum = useMemo(() => summarize(ordered), [ordered]);
  const selected = ordered.find((r) => r.key === open) ?? null;

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 space-y-3">
      <RPGPageHeader
        banner="reino"
        size="md"
        eyebrow="Atlas da Jornada"
        title="Mapa do Mundo"
        subtitle="Cada área da vida é uma região. O nível de cada uma vem do XP que você já conquistou nela."
      />

      {isLoading && (
        <div className="space-y-3" aria-busy aria-label="Carregando o Mapa do Mundo">
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rpg-panel h-20 animate-pulse" />
            ))}
          </div>
          <div className="rpg-panel h-[420px] animate-pulse" />
        </div>
      )}

      {isError && (
        <RPGPanel variant="danger">
          <p className="text-sm text-rpg-text" role="alert">
            Não foi possível carregar o Mapa do Mundo.
          </p>
          <RPGButton variant="secondary" className="mt-2" onClick={() => void refetch()}>
            Tentar novamente
          </RPGButton>
        </RPGPanel>
      )}

      {data && (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <RPGStatCard
              layout="wide"
              dense
              tone="gold"
              icon={<MapIcon size={20} />}
              label="Regiões exploradas"
              value={`${sum.explored}/${ordered.length}`}
              caption="Com XP ou atividade real"
            />
            <RPGStatCard layout="wide" dense tone="purple" icon={<Sparkles size={20} />} label="XP no mapa" value={`${data.totalXp}`} caption="Soma de todas as regiões" />
            <RPGStatCard
              layout="wide"
              dense
              tone="green"
              icon={<Crown size={20} />}
              label="Região mais forte"
              value={sum.strongest ? `Nv. ${sum.strongest.level}` : "—"}
              caption={sum.strongest?.name ?? "Nenhuma região com XP"}
            />
            <RPGStatCard
              layout="wide"
              dense
              tone="cyan"
              icon={<TrendingUp size={20} />}
              label="Em alta (30 dias)"
              value={sum.rising ? `+${sum.rising.trendPct}%` : "—"}
              caption={sum.rising?.name ?? "Sem crescimento comparável"}
            />
          </div>

          {!data.hasData && (
            <RPGPanel variant="parchment">
              <div className="py-3 text-center">
                <Compass size={30} className="mx-auto text-rpg-ink" aria-hidden />
                <p className="mt-2 font-rpg text-lg font-bold text-rpg-ink">O mapa ainda está coberto de névoa</p>
                <p className="text-sm text-rpg-ink/80">Cada missão, hábito ou registro revela a região correspondente. Comece por qualquer uma.</p>
                <div className="mt-3 flex flex-wrap justify-center gap-2 text-sm">
                  <Link to="/tarefas" className="rpg-btn rpg-btn-primary">
                    Concluir uma missão
                  </Link>
                  <Link to="/habitos" className="rpg-btn rpg-btn-secondary">
                    Cumprir um hábito
                  </Link>
                </div>
              </div>
            </RPGPanel>
          )}

          {/* Telas largas (xl): mapa visual. Notebook pequeno, tablet e celular: lista de territórios. */}
          <div className="hidden xl:block">
            <WorldMapCanvas regions={ordered} onOpen={setOpen} />
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 xl:hidden" aria-label="Territórios do mapa">
            {ordered.map((r) => (
              <li key={r.key}>
                <RegionCard region={r} onOpen={() => setOpen(r.key)} />
              </li>
            ))}
          </ul>

          <RPGHowItWorks
            storageKey="lifeos-mapa-how"
            steps={[
              {
                icon: Route,
                title: "Cada XP tem um lugar",
                text: "Todo XP do seu histórico vai inteiro para uma região: pelo projeto (acadêmico, profissional), pela área da meta, pelo tipo do hábito ou pela origem (Diário, Administração…). O que não tem área fica na Encruzilhada.",
                tone: "gold",
              },
              {
                icon: Crown,
                title: "Nível por região",
                text: `${data.rules.levelCurve} (Nv. 2 = 100, Nv. 3 = 400, Nv. 4 = 900). A tendência compara os últimos ${data.rules.trendWindowDays} dias com os ${data.rules.trendWindowDays} anteriores.`,
                tone: "purple",
              },
              {
                icon: Compass,
                title: "Névoa e próximo passo",
                text: "Regiões sem XP nem atividade ficam em névoa. Ao abrir uma região, o próximo passo vem das suas metas, tarefas e registros reais.",
                tone: "green",
              },
            ]}
          />
        </>
      )}

      <RegionDetail region={selected} onClose={() => setOpen(null)} />
    </div>
  );
}
