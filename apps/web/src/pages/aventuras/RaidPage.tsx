import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { BookOpen, CalendarDays, Code2, Dumbbell, Footprints, Gem, Hourglass, Leaf, ListChecks, Repeat, Settings2, Shield, Sparkles, Swords, Trophy, Coins, Moon, GraduationCap } from "lucide-react";
import { RPGButton, RPGSwitch, RPGToast } from "@/components/rpg";
import { Modal } from "@/components/ui/Modal";
import { PixelScene } from "@/components/living-world/PixelScene";
import { CharacterPortrait } from "@/components/living-world/AgentPortrait";
import { drawRaidScene, type PetLook } from "@/components/living-world/engine/adventureScenes";
import { DEFAULT_AVATAR_LOOK, normalizeLook } from "@/components/living-world/engine/looks";
import { useLivingWorld } from "@/hooks/useLivingWorld";
import { useAdventureWorld, useRaid, useRaidActions } from "@/hooks/useAdventures";
import type { RaidDifficulty, RaidFamily, RaidOverview } from "@/services/adventuresService";
import { AdventureHeader, BackToWorld, EmptyNote, PageError, PageSkeleton, Panel, R, ago, errMsg, fmtDay, nf } from "@/components/adventures/AdventureKit";

const FAMILY: Record<RaidFamily, { label: string; icon: typeof ListChecks; tone: string; border: string }> = {
  tarefas: { label: "Tarefas", icon: ListChecks, tone: "text-rpg-blue", border: "border-rpg-blue/60" },
  treinos: { label: "Treinos", icon: Dumbbell, tone: "text-rpg-pink", border: "border-rpg-pink/60" },
  leitura: { label: "Leituras", icon: BookOpen, tone: "text-rpg-gold-light", border: "border-rpg-gold/60" },
  estudo: { label: "Estudo", icon: GraduationCap, tone: "text-rpg-purple", border: "border-rpg-purple/60" },
  codigo: { label: "Commits", icon: Code2, tone: "text-rpg-green", border: "border-rpg-green/60" },
  habitos: { label: "Hábitos", icon: Repeat, tone: "text-rpg-orange", border: "border-rpg-orange/60" },
  exploracao: { label: "Explorações", icon: Footprints, tone: "text-rpg-cyan", border: "border-rpg-cyan/60" },
};
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const DIFF_LABEL: Record<RaidDifficulty, string> = { leve: "Leve", normal: "Normal", desafiador: "Desafiador" };

function useCountdown(endsAt: string | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!endsAt) return "—";
  const ms = Math.max(0, Date.parse(endsAt) - now);
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return ms === 0 ? "Encerrada" : `${d > 0 ? `${d}d ` : ""}${h}h ${String(m).padStart(2, "0")}min`;
}

/** Fala do Mestre da Vila: sempre derivada do estado real da Raid. */
function masterLine(o: RaidOverview) {
  if (o.state === "derrotado") return `O ${o.boss.name} caiu! O troféu já está na Arena dos Chefes. Na segunda-feira, um novo desafio surge.`;
  if (o.state === "encerrada") return `A semana terminou e o ${o.boss.name} resistiu. Sem castigo: na segunda-feira ele volta, ajustado ao seu ritmo.`;
  if (o.state === "nao_iniciada") return `O ${o.boss.name} acabou de despertar. Conclua uma tarefa, treine, leia ou faça um commit para desferir o primeiro golpe.`;
  const pending = o.objectives.find((x) => !x.complete);
  const pct = Math.round((o.raid.hp / o.raid.maxHp) * 100);
  return `${o.boss.lore.split(".")[0]}. Restam ${pct}% de vida.${pending ? ` Falta: ${pending.label.toLowerCase()} (${pending.done}/${pending.target}).` : " Todos os objetivos da semana cumpridos!"}`;
}

export function RaidPage() {
  const q = useRaid();
  const a = useRaidActions();
  const world = useLivingWorld();
  const adv = useAdventureWorld();
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const notify = (msg: string, tone: "success" | "error" = "success") => setToast({ msg, tone });
  const o = q.data;
  const countdown = useCountdown(o?.raid.endsAt);
  const hero = useMemo(() => normalizeLook({ ...(world.data?.avatar ?? {}), prop: "espada" }, DEFAULT_AVATAR_LOOK), [world.data?.avatar]);
  const pet: PetLook | null = adv.data?.companion ? { color: adv.data.companion.color, mood: adv.data.companion.mood, stage: adv.data.companion.stage, appearance: adv.data.companion.appearance } : null;
  const hpPct = o ? Math.round((o.raid.hp / o.raid.maxHp) * 100) : 100;
  const draw = useMemo(() => (ctx: CanvasRenderingContext2D, t: number, still: boolean) => drawRaidScene(ctx, t, { hpPct, state: o?.state ?? "nao_iniciada", hero, pet, still }), [hpPct, o?.state, hero, pet]);

  if (q.isError) return <PageError what="o Chefe da Semana" onRetry={() => void q.refetch()} />;
  if (!o) return <PageSkeleton />;

  const ws = new Date(`${o.raid.weekStart}T12:00:00Z`);
  const we = new Date(`${o.raid.weekEnd}T12:00:00Z`);
  const weekLabel = `${ws.getUTCDate()} – ${we.getUTCDate()} de ${MONTHS[we.getUTCMonth()]}.`;
  const families = (Object.keys(FAMILY) as RaidFamily[]).filter((f) => (o.damage.byFamily[f] ?? 0) > 0 || ["tarefas", "treinos", "leitura", "codigo", "habitos"].includes(f));
  const contributionPct = Math.min(100, Math.round((o.damage.total / o.raid.maxHp) * 1000) / 10);

  return (
    <div className="space-y-4 px-3 py-4 sm:px-4 md:px-6">
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
      <BackToWorld />
      <AdventureHeader icon={<Swords size={40} />} title="Chefe da Semana (Raid)" subtitle="Una suas rotinas, estudos e projetos para derrotar o Chefe da Semana e conquistar recompensas únicas.">
        <div className="flex items-center gap-2 border-2 border-rpg-border bg-rpg-bg-2/80 px-3 py-2" style={R}>
          <CalendarDays size={18} className="text-rpg-muted" aria-hidden />
          <span>
            <span className="block text-[11px] text-rpg-muted">Semana atual</span>
            <span className="block text-sm font-semibold text-rpg-text">{weekLabel}</span>
          </span>
        </div>
        <div className="flex items-center gap-2 border-2 border-rpg-green/70 bg-rpg-bg-2/80 px-3 py-2" style={R}>
          <Hourglass size={18} className="text-rpg-green" aria-hidden />
          <span>
            <span className="block text-[11px] text-rpg-muted">Tempo restante da Raid</span>
            <span className="block font-rpg text-lg font-bold text-rpg-green">{countdown}</span>
          </span>
        </div>
        <RPGButton variant="ghost" aria-label="Configurações da Raid" onClick={() => setSettingsOpen(true)}>
          <Settings2 size={16} aria-hidden />
        </RPGButton>
      </AdventureHeader>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(300px,1fr)]">
        <div className="min-w-0 space-y-4">
          {/* Arena */}
          <section className="rpg-panel relative overflow-hidden p-0" aria-label="Arena dos Chefes">
            <div className="aspect-[16/9] w-full">
              <PixelScene draw={draw} label={`Arena: ${o.boss.name}, ${hpPct}% de vida`} />
            </div>
            <div className="absolute left-3 top-3 border-2 border-rpg-red/70 bg-rpg-bg/85 px-3 py-1.5" style={R}>
              <p className="text-[11px] font-semibold uppercase text-rpg-red">Chefe da Semana</p>
              <p className="font-rpg text-xl font-bold leading-tight text-rpg-text">{o.boss.name}</p>
              <p className="text-[11px] text-rpg-muted">
                Nível {o.boss.level} · {DIFF_LABEL[o.raid.difficulty]}
              </p>
            </div>
            <div className="absolute right-3 top-3 w-[min(360px,55%)] border-2 border-rpg-border bg-rpg-bg/85 px-3 py-2" style={R}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-semibold text-rpg-text">Vida do Chefe</span>
                <span className="tabular-nums text-rpg-muted">
                  {nf(o.raid.hp)} / {nf(o.raid.maxHp)} ({hpPct}%)
                </span>
              </div>
              <div className="h-3 overflow-hidden bg-rpg-bg-2" style={R} role="meter" aria-label="Vida do chefe" aria-valuemin={0} aria-valuemax={o.raid.maxHp} aria-valuenow={o.raid.hp}>
                <div className="h-full bg-gradient-to-r from-rose-500 to-pink-400 transition-[width] duration-1000" style={{ width: `${hpPct}%` }} />
              </div>
            </div>
            {o.state === "derrotado" && (
              <div className="absolute inset-x-0 bottom-3 mx-auto w-fit border-2 border-rpg-gold bg-rpg-bg/90 px-4 py-2 text-center motion-safe:animate-bounce" style={R} role="status">
                <p className="font-rpg text-lg font-bold text-rpg-gold-light">Vitória! {o.boss.name} derrotado</p>
                <p className="text-xs text-rpg-text">
                  +{nf(o.rewards.xp)} XP · +{nf(o.rewards.coins)} moedas · troféu na Coleção
                </p>
              </div>
            )}
            {o.state === "nao_iniciada" && (
              <div className="absolute inset-x-0 bottom-3 mx-auto w-fit border-2 border-rpg-purple/70 bg-rpg-bg/90 px-4 py-2 text-center text-sm text-rpg-text" style={R}>
                O chefe despertou. Seu primeiro registro real será o primeiro golpe.
              </div>
            )}
          </section>

          {/* Fontes de dano */}
          <section aria-label="Fontes de dano">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-rpg-text">
              <Sparkles size={15} className="text-rpg-green" aria-hidden /> Fontes de dano (suas atividades)
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {families.slice(0, 5).map((f) => {
                const F = FAMILY[f];
                const dmg = o.damage.byFamily[f] ?? 0;
                return (
                  <div key={f} className={clsx("flex items-center gap-2 border-2 bg-rpg-bg-2/70 p-2.5", F.border)} style={R}>
                    <F.icon size={22} className={F.tone} aria-hidden />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-rpg-text">{F.label}</p>
                      <p className="text-[11px] text-rpg-muted">
                        {nf(dmg)} dano ({o.damage.total ? Math.round((dmg / o.damage.total) * 100) : 0}%)
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Últimos golpes na Raid" icon={<Swords size={17} className="text-rpg-green" aria-hidden />}>
              {o.recentStrikes.length === 0 ? (
                <EmptyNote>Nenhum golpe ainda nesta semana. Tarefas, treinos, leituras, estudos e commits contam.</EmptyNote>
              ) : (
                <ol className="relative space-y-2 border-l-2 border-rpg-green/40 pl-4">
                  {o.recentStrikes.slice(0, 6).map((s) => {
                    const F = FAMILY[s.family];
                    return (
                      <li key={s.id} className="relative">
                        <span className="absolute -left-[23px] top-2 h-3 w-3 rounded-full border-2 border-rpg-green bg-rpg-bg" aria-hidden />
                        <div className="rpg-tile flex items-center gap-2 p-2">
                          <F.icon size={16} className={clsx("shrink-0", F.tone)} aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-rpg-text">{s.label}</p>
                            <p className="text-[10px] text-rpg-muted">
                              {F.label} · {ago(s.at)}
                              {s.afterDefeat ? " · depois da vitória" : ""}
                            </p>
                          </div>
                          <span className={clsx("shrink-0 text-xs font-bold tabular-nums", s.afterDefeat ? "text-rpg-muted" : "text-rpg-green")}>+{nf(s.damage)} dano</span>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Panel>

            <div className="space-y-4">
              <Panel title="Cura da Inatividade" icon={<Leaf size={17} className="text-rpg-green" aria-hidden />}>
                {!o.healing.enabled ? (
                  <p className="text-sm text-rpg-muted">Cura desativada nas configurações: dias parados não recuperam a vida do chefe.</p>
                ) : (
                  <>
                    <p className={clsx("font-rpg text-2xl font-bold", o.healing.total ? "text-rpg-green" : "text-rpg-muted")}>
                      {o.healing.total ? `+${nf(o.healing.total)} de vida recuperada` : "Nenhuma cura"}
                    </p>
                    <p className="text-xs text-rpg-muted">
                      {o.healing.days.length} dia(s) sem registro nesta semana. Cada dia parado cura {o.healing.perDayPct}% (teto de {o.healing.capPct}% na semana). Dias de descanso não contam.
                    </p>
                  </>
                )}
                <div className="mt-3 grid grid-cols-7 gap-1">
                  {o.weekDays.map((d) => {
                    const wd = new Date(`${d.day}T12:00:00Z`).getUTCDay();
                    const canRest = d.day >= o.today && !o.settings.restWeekdays.includes(wd);
                    return (
                      <button
                        key={d.day}
                        type="button"
                        disabled={!canRest || a.restDay.isPending}
                        onClick={() => a.restDay.mutate({ day: d.day, rest: !d.rest }, { onError: (e) => notify(errMsg(e, "Não foi possível marcar o descanso."), "error") })}
                        title={canRest ? (d.rest ? "Desmarcar descanso" : "Marcar como dia de descanso") : d.rest ? "Descanso" : undefined}
                        aria-pressed={d.rest}
                        className={clsx(
                          "flex flex-col items-center border px-0.5 py-1 text-[10px] disabled:cursor-default",
                          d.day === o.today ? "border-rpg-gold" : "border-rpg-border/60",
                          d.rest ? "bg-rpg-blue/15" : d.damage ? "bg-rpg-green/15" : d.heal ? "bg-rpg-red/15" : "bg-rpg-bg-2/60"
                        )}
                        style={R}
                      >
                        <span className="text-rpg-muted">{WEEKDAYS[wd]}</span>
                        {d.rest ? <Moon size={11} className="text-rpg-blue" aria-label="descanso" /> : d.future ? <span className="text-rpg-muted">·</span> : d.damage ? <span className="font-semibold text-rpg-green">{d.damage >= 1000 ? `${Math.round(d.damage / 100) / 10}k` : d.damage}</span> : d.heal ? <span className="text-rpg-red">+{d.heal}</span> : <span className="text-rpg-muted">0</span>}
                      </button>
                    );
                  })}
                </div>
              </Panel>

              <Panel title="Objetivos da Raid (semana)" icon={<Shield size={17} className="text-rpg-blue" aria-hidden />}>
                <ul className="space-y-2">
                  {o.objectives.map((x) => (
                    <li key={x.key} className="flex items-center gap-2 text-sm">
                      <span className={clsx("flex h-4 w-4 shrink-0 items-center justify-center border", x.complete ? "border-rpg-green bg-rpg-green/30 text-rpg-green" : "border-rpg-border")} style={{ borderRadius: 3 }} aria-hidden>
                        {x.complete ? "✓" : ""}
                      </span>
                      <span className="min-w-0 flex-1 text-rpg-text">
                        {x.label} ≥ {x.target}
                      </span>
                      <span className="h-2 w-20 overflow-hidden bg-rpg-bg-2" style={R} aria-hidden>
                        <span className="block h-full bg-rpg-green" style={{ width: `${(x.done / x.target) * 100}%` }} />
                      </span>
                      <span className="w-10 text-right text-xs tabular-nums text-rpg-muted">
                        {x.done}/{x.target}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-rpg-muted">Metas calculadas pela sua média das últimas 4 semanas.</p>
              </Panel>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <Panel title="Sua contribuição na Raid" icon={<Swords size={17} className="text-rpg-gold-light" aria-hidden />}>
            <p className="font-rpg text-4xl font-bold text-rpg-text">{nf(o.damage.total)}</p>
            <p className="text-sm text-rpg-muted">
              de dano ({contributionPct}% da vida do chefe) em {o.damage.strikes} golpe(s)
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <div className="rpg-tile p-2">
                <p className="text-[11px] text-rpg-muted">Vida curada</p>
                <p className="font-rpg text-lg font-bold text-rpg-red">{nf(o.healing.total)}</p>
              </div>
              <div className="rpg-tile p-2">
                <p className="text-[11px] text-rpg-muted">Média semanal (4 sem.)</p>
                <p className="font-rpg text-lg font-bold text-rpg-text">{nf(o.raid.baselineWeeklyAvg)}</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-rpg-muted">Raid individual: o dano vem só dos seus registros reais. Re-sincronizações nunca repetem golpes.</p>
          </Panel>

          <section className="rpg-panel border-rpg-purple/60 p-4" aria-label="Efeito da semana">
            <div className="flex items-start justify-between gap-2">
              <h2 className="flex items-center gap-2 font-rpg text-lg font-bold text-rpg-text">
                <Sparkles size={17} className="text-rpg-purple" aria-hidden /> Efeito da Semana
              </h2>
              <span className="border border-rpg-green/60 bg-rpg-green/10 px-2 py-0.5 text-xs font-bold text-rpg-green" style={R}>
                +{o.effect.pct}%
              </span>
            </div>
            <p className="mt-1 font-semibold text-rpg-text">{o.effect.name}</p>
            <p className="text-sm text-rpg-muted">{o.effect.description}</p>
          </section>

          <Panel title="Recompensas (Loot)" icon={<Gem size={17} className="text-rpg-purple" aria-hidden />}>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rpg-tile p-2">
                <Gem size={20} className="mx-auto text-rpg-purple" aria-hidden />
                <p className="text-sm font-bold text-rpg-text">+{nf(o.rewards.xp)}</p>
                <p className="text-[10px] text-rpg-muted">XP</p>
              </div>
              <div className="rpg-tile p-2">
                <Coins size={20} className="mx-auto text-rpg-gold-light" aria-hidden />
                <p className="text-sm font-bold text-rpg-text">+{nf(o.rewards.coins)}</p>
                <p className="text-[10px] text-rpg-muted">Moedas</p>
              </div>
              <div className="rpg-tile p-2">
                <Trophy size={20} className="mx-auto text-rpg-gold" aria-hidden />
                <p className="text-sm font-bold text-rpg-text">Troféu</p>
                <p className="text-[10px] text-rpg-muted">Coleção + Vila</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-rpg-muted">{o.raid.rewarded ? "Recompensa desta Raid já entregue." : "Entregue uma única vez ao derrotar o chefe."}</p>
          </Panel>

          <Panel title="Troféus na Vila" icon={<Trophy size={17} className="text-rpg-gold" aria-hidden />} action={<Link to="/inventario" className="text-xs text-rpg-blue hover:underline">Ver Coleção →</Link>}>
            {o.history.filter((h) => h.status === "derrotado").length === 0 && o.state !== "derrotado" ? (
              <EmptyNote>Derrote seu primeiro chefe para erguer um monumento na Arena.</EmptyNote>
            ) : (
              <ul className="space-y-1.5">
                {o.state === "derrotado" && (
                  <li className="rpg-tile flex items-center gap-2 p-2 text-sm">
                    <Trophy size={15} className="text-rpg-gold" aria-hidden /> <span className="flex-1 text-rpg-text">{o.boss.name}</span>
                    <span className="text-xs text-rpg-muted">semana atual</span>
                  </li>
                )}
                {o.history
                  .filter((h) => h.status === "derrotado")
                  .slice(0, 5)
                  .map((h) => (
                    <li key={h.id} className="rpg-tile flex items-center gap-2 p-2 text-sm">
                      <Trophy size={15} className="text-rpg-gold" aria-hidden /> <span className="flex-1 text-rpg-text">{h.boss}</span>
                      <span className="text-xs text-rpg-muted">
                        {fmtDay(h.weekStart)}–{fmtDay(h.weekEnd)}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
            {o.history.length > 0 && (
              <p className="mt-2 text-[11px] text-rpg-muted">
                Histórico: {o.history.filter((h) => h.status === "derrotado").length} vitória(s) em {o.history.length} Raid(s) anteriores.
              </p>
            )}
          </Panel>
        </aside>
      </div>

      <section className="rpg-panel flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center" aria-label="Mestre da Vila">
        <CharacterPortrait look={normalizeLook({ outfit: "manto", shirt: "#2B3A67", hat: "chapeu_mago", hatColor: "#2B3A67", prop: "cajado", hairStyle: "longo", beard: "cheia", hair: "#D8D8D8" }, DEFAULT_AVATAR_LOOK)} size={64} />
        <div className="min-w-0 flex-1 border-2 border-rpg-border bg-rpg-bg-2/70 p-3" style={R}>
          <p className="font-rpg font-bold text-rpg-gold-light">Mestre da Vila</p>
          <p className="text-sm text-rpg-text">{masterLine(o)}</p>
        </div>
      </section>

      <RaidSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={o.settings} onSave={(s) => a.settings.mutate(s, { onSuccess: () => { setSettingsOpen(false); notify("Configurações salvas. A dificuldade vale a partir da próxima Raid."); }, onError: (e) => notify(errMsg(e, "Não foi possível salvar."), "error") })} saving={a.settings.isPending} />
    </div>
  );
}

function RaidSettingsModal({ open, onClose, settings, onSave, saving }: { open: boolean; onClose: () => void; settings: RaidOverview["settings"]; onSave: (s: RaidOverview["settings"]) => void; saving: boolean }) {
  const [s, setS] = useState(settings);
  useEffect(() => setS(settings), [settings, open]);
  return (
    <Modal open={open} onClose={onClose} title="Configurações da Raid">
      <div className="space-y-4">
        <fieldset>
          <legend className="mb-1 text-sm font-semibold">Dificuldade (próximas Raids)</legend>
          <div className="flex flex-wrap gap-2">
            {(["leve", "normal", "desafiador"] as const).map((d) => (
              <label key={d} className={clsx("cursor-pointer border-2 px-3 py-1.5 text-sm", s.difficulty === d ? "border-rpg-gold text-rpg-gold-light" : "border-rpg-border")} style={R}>
                <input type="radio" name="dificuldade" className="sr-only" checked={s.difficulty === d} onChange={() => setS({ ...s, difficulty: d })} />
                {DIFF_LABEL[d]}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-rpg-muted">A vida do chefe é calculada pela sua média das últimas 4 semanas; a dificuldade só ajusta essa meta.</p>
        </fieldset>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm">
            Cura por inatividade
            <span className="block text-xs text-rpg-muted">Dias sem nenhum registro recuperam parte da vida do chefe.</span>
          </span>
          <RPGSwitch checked={s.healingEnabled} onChange={() => setS({ ...s, healingEnabled: !s.healingEnabled })} label="Cura por inatividade" />
        </div>
        <fieldset>
          <legend className="mb-1 text-sm font-semibold">Dias de descanso fixos (até 3)</legend>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((w, i) => {
              const on = s.restWeekdays.includes(i);
              return (
                <button key={w} type="button" aria-pressed={on} onClick={() => setS({ ...s, restWeekdays: on ? s.restWeekdays.filter((x) => x !== i) : [...s.restWeekdays, i].slice(-3) })} className={clsx("border-2 px-2.5 py-1 text-xs", on ? "border-rpg-blue text-rpg-blue" : "border-rpg-border")} style={R}>
                  {w}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-rpg-muted">Também dá para marcar um dia pontual de descanso tocando nele no painel de cura.</p>
        </fieldset>
        <div className="flex justify-end gap-2">
          <RPGButton variant="ghost" onClick={onClose}>
            Cancelar
          </RPGButton>
          <RPGButton onClick={() => onSave(s)} disabled={saving}>
            Salvar
          </RPGButton>
        </div>
      </div>
    </Modal>
  );
}
