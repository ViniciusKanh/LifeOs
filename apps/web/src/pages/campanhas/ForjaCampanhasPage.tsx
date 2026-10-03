import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowDownUp, ChevronRight, Coins, Flag, Hammer, LayoutGrid, Map as MapIcon, ScrollText, Search, Swords } from "lucide-react";
import { RPGButton, RPGPanel, RPGStatCard, RPGToast } from "@/components/rpg";
import { CampaignForgeHero } from "@/components/campaigns/CampaignForgeHero";
import { CampaignCard } from "@/components/campaigns/CampaignCard";
import { CampaignTrail } from "@/components/campaigns/CampaignTrail";
import { CampaignMilestoneList } from "@/components/campaigns/CampaignMilestoneList";
import { CampaignRewardCard } from "@/components/campaigns/CampaignRewardCard";
import { CampaignStreakCard } from "@/components/campaigns/CampaignStreakCard";
import { CampaignForgeWizard } from "@/components/campaigns/CampaignForgeWizard";
import { useCampaignActions, useCampaigns } from "@/hooks/useCampaigns";
import type { CampaignMilestone, CampaignStatus } from "@/services/campaignsService";
import { forgeKpis, pickFeatured, sortCampaigns, type CampaignSort } from "@/utils/campaignDisplay";

type Filter = "all" | "active" | "planned" | "completed";
const FILTERS: Array<{ id: Filter; label: string; icon: JSX.Element }> = [
  { id: "all", label: "Todas", icon: <LayoutGrid size={14} aria-hidden /> },
  { id: "active", label: "Em andamento", icon: <Swords size={14} aria-hidden /> },
  { id: "planned", label: "Planejadas", icon: <ScrollText size={14} aria-hidden /> },
  { id: "completed", label: "Concluídas", icon: <Flag size={14} aria-hidden /> },
];
const SORTS: Array<{ id: CampaignSort; label: string }> = [
  { id: "recent", label: "Mais recentes" },
  { id: "oldest", label: "Mais antigas" },
  { id: "progress_desc", label: "Maior progresso" },
  { id: "progress_asc", label: "Menor progresso" },
  { id: "deadline", label: "Prazo mais próximo" },
];
const field = "w-full px-3 py-2 text-sm bg-rpg-bg-2 text-rpg-text border border-rpg-border focus:border-rpg-gold outline-none placeholder:text-rpg-muted/70";

/**
 * ⚒️ Forja de Campanhas — campanhas são a camada de orquestração acima
 * dos projetos. KPIs, cards, trilha, marcos, recompensa e sequência vêm
 * do backend (calculados em lote, com dados reais).
 */
export function ForjaCampanhasPage() {
  const navigate = useNavigate();
  const { campaigns, isLoading, isError, refetch } = useCampaigns();
  const actions = useCampaignActions();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<CampaignSort>("recent");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wizard, setWizard] = useState(false);
  const [busyMs, setBusyMs] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);
  const showError = useCallback((err: unknown) => setToast({ msg: err instanceof Error ? err.message : "Não foi possível concluir a ação.", tone: "error" }), []);

  const kpis = useMemo(() => forgeKpis(campaigns), [campaigns]);
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const byFilter = campaigns.filter((c) =>
      filter === "all" ? c.status !== "archived" : filter === "active" ? c.status === "active" || c.status === "paused" : c.status === filter,
    );
    return sortCampaigns(term ? byFilter.filter((c) => `${c.title} ${c.description ?? ""}`.toLowerCase().includes(term)) : byFilter, sort);
  }, [campaigns, filter, q, sort]);
  const selected = campaigns.find((c) => c.id === selectedId) ?? pickFeatured(campaigns);

  const onStatus = async (id: string, status: Exclude<CampaignStatus, "completed">) => {
    try {
      await actions.setStatus.mutateAsync({ id, status });
      setToast({ msg: status === "archived" ? "Campanha arquivada." : status === "paused" ? "Campanha pausada." : "Campanha em andamento.", tone: "success" });
    } catch (err) {
      showError(err);
    }
  };
  const onToggleMs = async (m: CampaignMilestone) => {
    if (!selected) return;
    setBusyMs(m.id);
    try {
      const r = await actions.milestoneDone.mutateAsync({ id: selected.id, mid: m.id, done: m.status !== "completed" });
      if (m.status !== "completed") setToast({ msg: r.rewarded ? `Marco concluído: ${m.title}` : `Marco concluído: ${m.title} (sem recompensa nesta conclusão)`, tone: "success" });
    } catch (err) {
      showError(err);
    } finally {
      setBusyMs(null);
    }
  };

  const empty = !isLoading && !isError && campaigns.length === 0;

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 space-y-4">
      <CampaignForgeHero onCreate={() => setWizard(true)} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <RPGStatCard layout="wide" icon={<Flag size={26} />} tone="purple" value={String(kpis.active)} label="Campanhas ativas" caption={`de ${kpis.created} criadas`} />
        <RPGStatCard layout="wide" icon={<ScrollText size={26} />} tone="gold" value={String(kpis.openMissions)} label="Missões ligadas" caption="em andamento" />
        <RPGStatCard
          layout="wide"
          icon={<Coins size={26} />}
          tone="gold"
          value={(kpis.earnedXp + kpis.earnedCoins).toLocaleString("pt-BR")}
          label="Recompensas conquistadas"
          caption={`${kpis.earnedXp.toLocaleString("pt-BR")} XP + ${kpis.earnedCoins.toLocaleString("pt-BR")} 🪙`}
        />
        <RPGStatCard
          layout="wide"
          icon={<Swords size={26} />}
          tone="purple"
          value={kpis.avgProgress == null ? "—" : `${kpis.avgProgress}%`}
          label="Progresso geral"
          caption="Média das campanhas ativas"
          action={
            selected && (
              <Link to={`/forja-campanhas/${selected.id}`} className="flex w-9 h-9 items-center justify-center rounded-full border border-rpg-border text-rpg-text hover:border-rpg-gold" aria-label="Abrir campanha em destaque">
                <ChevronRight size={18} />
              </Link>
            )
          }
        />
      </div>

      {empty ? (
        <RPGPanel variant="gold">
          <div className="py-8 text-center">
            <Hammer size={40} className="mx-auto text-rpg-gold-light" aria-hidden />
            <p className="mt-3 rpg-title text-xl sm:text-2xl font-bold">Sua primeira grande jornada ainda não foi forjada</p>
            <p className="mt-1 text-sm text-rpg-muted max-w-md mx-auto">Transforme uma meta importante em uma campanha com projetos, missões, contratos e marcos.</p>
            <RPGButton variant="primary" className="mt-4" onClick={() => setWizard(true)}>⚒️ Forjar primeira campanha</RPGButton>
          </div>
        </RPGPanel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,30%)] items-start">
          <div className="space-y-3 min-w-0">
            <RPGPanel bodyClassName="p-2.5">
              <div className="flex flex-col lg:flex-row lg:items-center gap-2">
                <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Filtrar campanhas">
                  {FILTERS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      role="tab"
                      aria-selected={filter === f.id}
                      onClick={() => setFilter(f.id)}
                      className={`shrink-0 inline-flex items-center gap-1.5 border px-3 py-1.5 text-sm ${filter === f.id ? "border-rpg-gold bg-rpg-gold/10 text-rpg-gold-light" : "border-rpg-border bg-rpg-bg-2 text-rpg-text hover:border-rpg-gold/50"}`}
                      style={{ borderRadius: 3 }}
                    >
                      {f.icon} {f.label}
                    </button>
                  ))}
                </div>
                <label className="relative flex-1 min-w-0">
                  <span className="sr-only">Buscar campanhas</span>
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-rpg-muted" aria-hidden />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar campanhas…" className={`${field} pl-8`} style={{ borderRadius: 3 }} />
                </label>
                <label className="relative lg:w-48">
                  <span className="sr-only">Ordenar</span>
                  <ArrowDownUp size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-rpg-muted" aria-hidden />
                  <select value={sort} onChange={(e) => setSort(e.target.value as CampaignSort)} className={`${field} pl-8`} style={{ borderRadius: 3 }}>
                    {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </label>
              </div>
            </RPGPanel>

            {isLoading && (
              <div className="grid gap-3 lg:grid-cols-2" aria-busy aria-label="Carregando campanhas">
                {[0, 1, 2, 3].map((i) => <div key={i} className="rpg-panel h-48 animate-pulse" />)}
              </div>
            )}
            {isError && (
              <RPGPanel variant="danger">
                <p className="text-sm text-rpg-text">Não foi possível carregar suas campanhas.</p>
                <RPGButton variant="secondary" className="mt-2" onClick={() => void refetch()}>Tentar novamente</RPGButton>
              </RPGPanel>
            )}
            {!isLoading && !isError && list.length === 0 && <RPGPanel><p className="py-6 text-center text-sm text-rpg-muted">Nenhuma campanha com esses filtros.</p></RPGPanel>}
            <div className="grid gap-3 lg:grid-cols-2">
              {list.map((c) => (
                <CampaignCard key={c.id} campaign={c} selected={selected?.id === c.id} onSelect={() => setSelectedId(c.id)} onStatus={(s) => void onStatus(c.id, s)} />
              ))}
            </div>
          </div>

          {/* Painel da campanha selecionada (no celular vem depois dos cards). */}
          <aside className="space-y-3 min-w-0" aria-label={selected ? `Painel da campanha ${selected.title}` : "Painel da campanha"}>
            {selected && <p className="font-pixel text-[11px] uppercase tracking-wider text-rpg-muted">Campanha em foco: <span className="text-rpg-gold-light">{selected.title}</span></p>}
            <CampaignTrail campaign={selected} />
            <CampaignMilestoneList campaign={selected} onToggle={onToggleMs} busyId={busyMs} />
            <div className="grid sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2 gap-3">
              <CampaignRewardCard campaign={selected} />
              <CampaignStreakCard campaign={selected} />
            </div>
          </aside>
        </div>
      )}

      <section className="rpg-panel rpg-panel-gold flex flex-col sm:flex-row sm:items-center gap-3 p-4">
        <Hammer size={34} className="shrink-0 text-rpg-gold-light" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-pixel text-sm uppercase tracking-wider text-rpg-gold-light">Pronto para forjar uma nova jornada?</p>
          <p className="text-xs text-rpg-muted">Combine projetos, missões e hábitos em uma campanha épica.</p>
        </div>
        <RPGButton variant="primary" onClick={() => setWizard(true)}>⚒️ Forjar campanha</RPGButton>
        <Link to="/life-map" className="rpg-btn rpg-btn-secondary inline-flex items-center gap-2"><MapIcon size={14} aria-hidden /> Ver mapa do reino</Link>
      </section>

      {wizard && (
        <CampaignForgeWizard
          onClose={() => setWizard(false)}
          onCreated={(id) => {
            setWizard(false);
            setSelectedId(id);
            setToast({ msg: "Campanha forjada!", tone: "success" });
            navigate(`/forja-campanhas/${id}`);
          }}
        />
      )}
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}

export default ForjaCampanhasPage;
