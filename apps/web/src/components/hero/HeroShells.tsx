import { useMemo, useState } from "react";
import { Bot, CalendarRange, Crown, GitCommitHorizontal, Image as ImageIcon, LayoutList, ScrollText, Star, Trophy, Wand2, Zap } from "lucide-react";
import { RPGButton, RPGProgressBar, RPGToast } from "@/components/rpg";
import { AdvisorPanel, ModuleBanner, ModuleTabs } from "@/components/rpg-modules/ModuleKit";
import { AutomationsPanel } from "@/components/automations/AutomationsPanel";
import { useAchievementsHub, useHeroActions, useJourney, localDayKey, shiftLocalDay } from "@/hooks/useHero";
import type { TimelineEvent } from "@/types";
import { ChainsPanel, MasteryPanel, TitlesSeasonPanel, TrophyHall } from "./AchievementsHub";
import { EMPTY_FILTERS, JourneyFilterBar, JourneyIndicators, JourneyTimeline, MarksPanel, MomentsPanel, NarratorPanel, SummariesPanel, eventKey, filterEvents } from "./JourneyHub";
import { HERO_ART, nf } from "./HeroShared";

export const ACH_TABS = ["salao", "cadeias", "titulos", "trofeus", "automacoes", "ia"] as const;
export type AchTab = (typeof ACH_TABS)[number];

/** Conquistas 3.0 — Hall de Troféus (tema RPG). Os "Meus troféus" seguem na própria página. */
export function AchievementsShell({ tab, onTab }: { tab: AchTab; onTab: (t: AchTab) => void }) {
  const q = useAchievementsHub();
  const hub = q.data;
  const equipped = hub?.titles.find((t) => t.equipped);
  return (
    <div className="space-y-3">
      <ModuleBanner
        eyebrow="Hall de Troféus"
        title="Conquistas"
        subtitle="Cada conquista é um capítulo real da sua história — verificada pelos seus registros, paga uma única vez."
        mage={HERO_ART.achievements.mage}
        scene={HERO_ART.achievements.scene}
        actions={
          <RPGButton variant="primary" onClick={() => onTab("ia")}>
            <Wand2 size={15} aria-hidden /> Mestre da Evolução
          </RPGButton>
        }
        aside={
          hub ? (
            <section className="rpg-panel rpg-panel-gold flex flex-col justify-center gap-2 p-3" aria-label="Maestria">
              <p className="font-pixel text-[10px] uppercase tracking-widest text-rpg-gold">Maestria</p>
              <p className="flex items-center gap-2 font-rpg text-lg font-bold text-rpg-text">
                <Crown size={18} className="text-rpg-gold" aria-hidden /> {equipped?.name ?? "Sem título equipado"}
              </p>
              <RPGProgressBar label="Conquistas" value={hub.mastery.unlocked} max={Math.max(1, hub.mastery.total)} valueLabel={`${hub.mastery.unlocked}/${hub.mastery.total} · ${hub.mastery.pct}%`} tone="gold" />
              <p className="text-[11px] text-rpg-muted">
                +{nf(hub.mastery.xp)} XP e +{nf(hub.mastery.coins)} moedas recebidos de conquistas.
              </p>
            </section>
          ) : (
            <div className="rpg-panel h-40 animate-pulse" aria-busy aria-label="Carregando maestria" />
          )
        }
      />
      {q.isError && (
        <div className="rpg-panel p-4 text-center">
          <p className="text-sm text-rpg-red">Não foi possível carregar o Hall de Troféus.</p>
          <RPGButton variant="secondary" className="mt-2" onClick={() => void q.refetch()}>
            Tentar novamente
          </RPGButton>
        </div>
      )}
      <ModuleTabs
        label="Seções das Conquistas"
        value={tab}
        onChange={onTab}
        tabs={[
          { value: "salao", label: "Hall de Troféus", icon: <Trophy size={15} /> },
          { value: "cadeias", label: "Cadeias", icon: <GitCommitHorizontal size={15} /> },
          { value: "titulos", label: "Títulos e Temporada", icon: <CalendarRange size={15} /> },
          { value: "trofeus", label: "Meus troféus", icon: <Star size={15} /> },
          { value: "automacoes", label: "Automações", icon: <Zap size={15} /> },
          { value: "ia", label: "Mestre da Evolução", icon: <Bot size={15} /> },
        ]}
      />
      {!hub && !q.isError && tab !== "trofeus" && tab !== "automacoes" && tab !== "ia" && <div className="rpg-panel h-64 animate-pulse" aria-busy />}
      {hub && tab === "salao" && (
        <>
          <MasteryPanel hub={hub} />
          <TrophyHall hub={hub} />
        </>
      )}
      {hub && tab === "cadeias" && <ChainsPanel hub={hub} />}
      {hub && tab === "titulos" && <TitlesSeasonPanel hub={hub} />}
      {tab === "automacoes" && (
        <AutomationsPanel module="hero" keys={["unlock_pipeline", "near_achievements"]} title="Automações das Conquistas" intro="Detectar → progredir → desbloquear → pagar uma única vez → registrar na Crônica → avisar." />
      )}
      {tab === "ia" && <AdvisorPanel module="hero" title="Mestre da Evolução" avatar={HERO_ART.advisor} />}
    </div>
  );
}

const JOURNEY_TABS = ["cronica", "marcos", "momentos", "resumos", "narrador", "automacoes"] as const;
export type JourneyTab = (typeof JOURNEY_TABS)[number];
export { JOURNEY_TABS };

/**
 * Crônica da Jornada 2.0. Os eventos vêm do histórico canônico
 * (/analytics/timeline); os indicadores, do ledger de XP/moedas. Esta tela
 * não grava nenhum evento — só favoritos e fotos autorizadas.
 */
export function JourneyShell({ tab, onTab }: { tab: JourneyTab; onTab: (t: JourneyTab) => void }) {
  const [days, setDays] = useState(30);
  const to = localDayKey();
  const from = shiftLocalDay(to, -(days - 1));
  const { hub: hubQ, timeline } = useJourney(from, to);
  const { toggleMark } = useHeroActions();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);
  const notify = (msg: string, tone: "success" | "error" = "success") => setToast({ msg, tone });
  const hub = hubQ.data;
  const events = useMemo(() => timeline.data?.events ?? [], [timeline.data?.events]);
  const favs = useMemo(() => new Set((hub?.marks ?? []).map((m) => m.eventKey)), [hub?.marks]);
  const visible = useMemo(() => filterEvents(events, filters, favs), [events, filters, favs]);
  const onFav = (e: TimelineEvent) =>
    toggleMark.mutate(
      { eventKey: eventKey(e), label: e.label, at: String(e.at) },
      { onSuccess: (r) => notify(r.favorite ? "Guardado nos marcos favoritos." : "Removido dos favoritos."), onError: (err) => notify(err instanceof Error ? err.message : "Não foi possível favoritar.", "error") },
    );

  return (
    <div className="space-y-3">
      <ModuleBanner
        eyebrow="O livro vivo do herói"
        title="Crônica da Jornada"
        subtitle="Tudo que você viveu de verdade, em ordem: missões, hábitos, leituras, conquistas e marcos — direto dos registros originais."
        mage={HERO_ART.journey.mage}
        scene={HERO_ART.journey.scene}
        actions={
          <RPGButton variant="primary" onClick={() => onTab("narrador")}>
            <Wand2 size={15} aria-hidden /> Narrador da Jornada
          </RPGButton>
        }
        aside={
          hub ? (
            <section className="rpg-panel rpg-panel-gold flex flex-col justify-center gap-1.5 p-3" aria-label="Resumo do período">
              <p className="font-pixel text-[10px] uppercase tracking-widest text-rpg-gold">Últimos {days} dias</p>
              <p className="font-rpg text-2xl font-bold text-rpg-text tabular-nums">{nf(hub.indicators.xp)} XP</p>
              <RPGProgressBar label="Consistência" value={hub.indicators.consistencyPct} max={100} valueLabel={`${hub.indicators.consistencyPct}% dos dias com registro`} tone="green" />
              <p className="text-[11px] text-rpg-muted">Nível {hub.indicators.level} · saldo {nf(hub.indicators.balance)} moedas</p>
            </section>
          ) : (
            <div className="rpg-panel h-40 animate-pulse" aria-busy aria-label="Carregando resumo" />
          )
        }
      />
      {hub ? <JourneyIndicators hub={hub} /> : <div className="rpg-panel h-24 animate-pulse" aria-busy />}
      <ModuleTabs
        label="Seções da Crônica"
        value={tab}
        onChange={onTab}
        tabs={[
          { value: "cronica", label: "Crônica", icon: <LayoutList size={15} /> },
          { value: "marcos", label: "Marcos", icon: <Star size={15} />, badge: hub?.marks.length || undefined },
          { value: "momentos", label: "Momentos", icon: <ImageIcon size={15} /> },
          { value: "resumos", label: "Resumos", icon: <CalendarRange size={15} /> },
          { value: "narrador", label: "Narrador", icon: <ScrollText size={15} /> },
          { value: "automacoes", label: "Automações", icon: <Zap size={15} /> },
        ]}
      />
      {(hubQ.isError || timeline.isError) && (
        <div className="rpg-panel p-4 text-center">
          <p className="text-sm text-rpg-red">Não foi possível carregar a Crônica.</p>
          <RPGButton variant="secondary" className="mt-2" onClick={() => (void hubQ.refetch(), void timeline.refetch())}>
            Tentar novamente
          </RPGButton>
        </div>
      )}
      {tab === "cronica" && (
        <>
          <JourneyFilterBar filters={filters} onChange={setFilters} events={events} days={days} onDays={setDays} />
          {timeline.isLoading ? (
            <div className="space-y-2" aria-busy aria-label="Carregando eventos">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rpg-panel h-28 animate-pulse" />
              ))}
            </div>
          ) : (
            <JourneyTimeline events={visible} xpByDay={timeline.data?.xpByDay ?? {}} favs={favs} onFav={onFav} onMore={days < 90 ? () => setDays(days < 30 ? 30 : 90) : undefined} loadingMore={timeline.isFetching} />
          )}
        </>
      )}
      {hub && tab === "marcos" && <MarksPanel hub={hub} events={events} onFav={onFav} />}
      {hub && tab === "momentos" && <MomentsPanel hub={hub} onToast={notify} />}
      {hub && tab === "resumos" && <SummariesPanel hub={hub} />}
      {tab === "narrador" && <NarratorPanel from={from} to={to} onToast={notify} />}
      {tab === "automacoes" && <AutomationsPanel module="journey" title="Automações da Crônica" intro="A Crônica lê o histórico oficial: nenhum evento é duplicado, inventado ou gravado em uma segunda fonte." />}
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}
