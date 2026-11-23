import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { Activity, Bike, BookOpen, Clock, Dumbbell, ExternalLink, Flame, Footprints, HeartPulse, Link2, MapPin, RefreshCw, Settings2, Sparkles, Target, Trophy, Unplug, Waves, Watch, PersonStanding } from "lucide-react";
import { RPGButton, RPGSwitch, RPGToast } from "@/components/rpg";
import { Modal } from "@/components/ui/Modal";
import { PixelScene } from "@/components/living-world/PixelScene";
import { drawTrainingScene } from "@/components/living-world/engine/adventureScenes";
import { DEFAULT_AVATAR_LOOK, normalizeLook } from "@/components/living-world/engine/looks";
import { useLivingWorld } from "@/hooks/useLivingWorld";
import { useStrava, useStravaActions } from "@/hooks/useAdventures";
import { adventuresService, type StravaOverview } from "@/services/adventuresService";
import { AdventureHeader, BackToWorld, EmptyNote, MeterRow, PageError, PageSkeleton, Panel, R, StatTile, StatusPill, ago, errMsg, fmtMin, nf, useConnect, useIntegrationReturn, Spinner } from "@/components/adventures/AdventureKit";

const CAT_ICON: Record<string, typeof Activity> = { corrida: PersonStanding, caminhada: Footprints, bike: Bike, natacao: Waves, musculacao: Dumbbell };
const CAT_TONE: Record<string, string> = { corrida: "text-rpg-orange", caminhada: "text-rpg-green", bike: "text-rpg-purple", natacao: "text-rpg-blue", musculacao: "text-rpg-cyan" };

function delta(cur: number, prev: number, unit = "") {
  if (!prev && !cur) return null;
  const d = Math.round((cur - prev) * 10) / 10;
  return <span className={d >= 0 ? "text-rpg-green" : "text-rpg-red"}>{d >= 0 ? "▲ +" : "▼ "}{nf(d)}{unit} vs semana anterior</span>;
}

export function StravaPage() {
  const q = useStrava();
  const a = useStravaActions();
  const world = useLivingWorld();
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteData, setDeleteData] = useState(false);
  const notify = (msg: string, tone: "success" | "error" = "success") => setToast({ msg, tone });
  useIntegrationReturn(notify, "Strava");
  const connect = useConnect(adventuresService.stravaConnect, notify);
  const hero = useMemo(() => normalizeLook({ ...(world.data?.avatar ?? {}), hat: "bandana", hatColor: "#C8423B" }, DEFAULT_AVATAR_LOOK), [world.data?.avatar]);
  const o = q.data;
  const draw = useMemo(() => (ctx: CanvasRenderingContext2D, t: number, still: boolean) => drawTrainingScene(ctx, t, { hero, still, active: Boolean(o?.connection) }), [hero, o?.connection]);

  if (q.isError) return <PageError what="a integração com o Strava" onRetry={() => void q.refetch()} />;
  if (!o) return <PageSkeleton />;
  const c = o.connection;
  const sync = () => a.sync.mutate(undefined, { onSuccess: (r) => notify(r.imported || r.linked ? `${r.imported} treino(s) importado(s)${r.linked ? `, ${r.linked} vinculado(s) a registros manuais` : ""}.` : "Tudo em dia: nenhum treino novo."), onError: (e) => notify(errMsg(e, "Falha ao sincronizar."), "error") });
  const setting = (k: keyof NonNullable<StravaOverview["connection"]>["settings"]) => a.settings.mutate({ [k]: !c?.settings[k] }, { onError: (e) => notify(errMsg(e, "Não foi possível salvar."), "error") });

  return (
    <div className="space-y-4 px-3 py-4 sm:px-4 md:px-6">
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
      <BackToWorld />
      <AdventureHeader icon={<Activity size={40} className="text-rpg-orange" />} title="Strava → Saúde automática" subtitle="Suas atividades do Strava entram automaticamente no LifeOS, geram XP, alimentam a Vitalidade e registram sua jornada na Crônica.">
        <StatusPill state="ok" label="Atributo: Vitalidade" detail="+XP por atividade" />
        <Link to="/conquistas">
          <StatusPill state="ok" label="Conquistas" detail="Primeira Trilha, Atleta Sincronizado" />
        </Link>
        <Link to="/saude">
          <StatusPill state="ok" label="Evolução" detail="Ver na Saúde →" />
        </Link>
      </AdventureHeader>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <div className="min-w-0 space-y-4">
          <section className="rpg-panel overflow-hidden p-0" aria-label="Campo de Treinamento">
            <div className="aspect-[16/7] w-full">
              <PixelScene draw={draw} label="Campo de Treinamento: herói correndo na trilha" />
            </div>
          </section>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <StatTile icon={<PersonStanding size={15} />} tone="text-rpg-orange" label="Atividades" value={nf(o.totals.activities)} hint={o.totals.week.activities ? `▲ +${o.totals.week.activities} esta semana` : "nenhuma esta semana"} />
            <StatTile icon={<MapPin size={15} />} tone="text-rpg-blue" label="Distância" value={`${nf(o.totals.distanceKm)} km`} hint={delta(o.totals.week.distanceKm, o.totals.lastWeek.distanceKm, " km")} />
            <StatTile icon={<Clock size={15} />} tone="text-rpg-cyan" label="Tempo total" value={fmtMin(o.totals.minutes)} hint={o.totals.week.minutes ? `+${fmtMin(o.totals.week.minutes)} esta semana` : undefined} />
            <StatTile icon={<Flame size={15} />} tone="text-rpg-orange" label="Calorias" value={o.totals.calories == null ? "—" : `${nf(o.totals.calories)} kcal`} hint={o.totals.calories == null ? "Strava não informou" : `em ${o.totals.caloriesCoverage} atividade(s) com dado`} />
            <div className="rpg-tile flex flex-col gap-0.5 border-2 border-rpg-purple/60 p-3">
              <span className="flex items-center gap-1.5 text-xs text-rpg-purple">
                <Sparkles size={15} /> <span className="text-rpg-muted">XP de Saúde</span>
              </span>
              <span className="font-rpg text-2xl font-bold text-rpg-text">+{nf(o.totals.xp)} XP</span>
            </div>
          </div>

          <Panel title="Atividades importadas" icon={<PersonStanding size={17} className="text-rpg-green" aria-hidden />}>
            {!c ? (
              <EmptyNote>Conecte o Strava para trazer seus treinos automaticamente.</EmptyNote>
            ) : o.activities.length === 0 ? (
              <EmptyNote>Nenhuma atividade importada ainda. Atividades privadas (“Só você”) não são lidas.</EmptyNote>
            ) : (
              <ul className="space-y-2">
                {o.activities.slice(0, 12).map((x) => {
                  const Icon = CAT_ICON[x.category] ?? Activity;
                  return (
                    <li key={x.id} className="rpg-tile flex flex-wrap items-center gap-x-4 gap-y-1 p-2.5">
                      <Icon size={22} className={clsx("shrink-0", CAT_TONE[x.category] ?? "text-rpg-text")} aria-hidden />
                      <div className="min-w-[140px] flex-1">
                        <p className="font-semibold text-rpg-text">{x.kind}</p>
                        <p className="truncate text-[11px] text-rpg-muted">
                          {x.name} · {new Date(x.performedAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          {x.linkedManual ? " · vinculado ao seu registro manual" : ""}
                        </p>
                      </div>
                      {x.distanceKm != null && <span className="text-sm text-rpg-text">{nf(x.distanceKm)} km</span>}
                      <span className="text-sm text-rpg-text">{fmtMin(x.minutes)}</span>
                      {x.paceMinKm != null && <span className="text-xs text-rpg-muted">{Math.floor(x.paceMinKm)}:{String(Math.round((x.paceMinKm % 1) * 60)).padStart(2, "0")}/km</span>}
                      {x.paceMinKm == null && x.speedKmh != null && <span className="text-xs text-rpg-muted">{nf(x.speedKmh)} km/h</span>}
                      {x.avgHr != null && (
                        <span className="flex items-center gap-1 text-xs text-rpg-muted">
                          <HeartPulse size={12} className="text-rpg-red" aria-hidden /> {Math.round(Number(x.avgHr))} bpm
                        </span>
                      )}
                      {x.calories != null && <span className="text-xs text-rpg-orange">{nf(x.calories)} kcal</span>}
                      <a href={x.url} target="_blank" rel="noreferrer" className="text-rpg-muted hover:text-rpg-text" aria-label={`Abrir ${x.name} no Strava`}>
                        <ExternalLink size={14} />
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel title="Conexão com o Strava" icon={<Link2 size={17} className="text-rpg-orange" aria-hidden />} action={c ? <span className="border border-rpg-green/60 bg-rpg-green/10 px-2 py-0.5 text-[11px] font-semibold text-rpg-green" style={R}>✓ Conectado</span> : undefined}>
            {!o.configured ? (
              <div className="space-y-2 text-sm">
                <p className="text-rpg-text">A integração ainda não foi configurada pelo administrador.</p>
                <p className="text-xs text-rpg-muted">Configurações → Strava: Client ID, Client Secret e token do webhook (criados em strava.com/settings/api).</p>
              </div>
            ) : !c ? (
              <div className="space-y-3 text-sm">
                <p className="text-rpg-text">Autorize o LifeOS a ler suas atividades (somente leitura, sem atividades privadas). Seus treinos dos últimos 30 dias entram na hora.</p>
                <RPGButton className="w-full" onClick={() => void connect.go()} disabled={connect.busy}>
                  {connect.busy ? <Spinner /> : <Link2 size={16} aria-hidden />} Conectar com Strava
                </RPGButton>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  {c.avatarUrl ? <img src={c.avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" /> : <PersonStanding size={40} aria-hidden />}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-rpg-text">{c.athleteName ?? "Atleta"}</p>
                    {c.username && <p className="text-xs text-rpg-muted">@{c.username}</p>}
                  </div>
                  <div className="text-right text-[11px] text-rpg-muted">
                    Desde
                    <br />
                    {new Date(c.connectedAt.includes("T") ? c.connectedAt : `${c.connectedAt.replace(" ", "T")}Z`).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" })}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
                  {([
                    ["autoImport", "Importar automaticamente"],
                    ["registerChronicle", "Registrar na Crônica"],
                    ["awardXp", "Gerar XP"],
                  ] as const).map(([k, label]) => (
                    <label key={k} className="flex items-center justify-between gap-2 border border-rpg-border/70 bg-rpg-bg-2/60 px-2 py-1.5 text-[11px]" style={R}>
                      {label}
                      <RPGSwitch checked={c.settings[k]} onChange={() => setting(k)} label={label} />
                    </label>
                  ))}
                </div>
                {c.lastError && (
                  <p className="border border-rpg-orange/60 bg-rpg-orange/10 p-2 text-xs text-rpg-orange" style={R} role="alert">
                    {c.lastError}
                  </p>
                )}
                <div className="flex gap-2">
                  <RPGButton variant="success" className="flex-1" onClick={sync} disabled={a.sync.isPending}>
                    {a.sync.isPending ? <Spinner /> : <RefreshCw size={15} aria-hidden />} Sincronizar agora
                  </RPGButton>
                  <RPGButton variant="secondary" onClick={() => setSettingsOpen(true)} aria-label="Configurações da conexão">
                    <Settings2 size={15} aria-hidden />
                  </RPGButton>
                </div>
                <p className="text-[11px] text-rpg-muted">Última sincronização: {c.lastSyncAt ? ago(c.lastSyncAt) : "nunca"}. Treinos novos chegam sozinhos pelo webhook; a sincronização manual reconcilia.</p>
              </div>
            )}
          </Panel>

          <Panel title="Crônica da Saúde" icon={<BookOpen size={17} className="text-rpg-blue" aria-hidden />} action={<Link to="/timeline" className="text-xs text-rpg-blue hover:underline">Ver completa →</Link>}>
            {o.activities.length === 0 ? (
              <EmptyNote>Os treinos importados aparecem aqui como capítulos da sua jornada.</EmptyNote>
            ) : (
              <ol className="relative space-y-2 border-l-2 border-rpg-green/40 pl-4">
                {o.activities.slice(0, 5).map((x) => (
                  <li key={x.id} className="relative">
                    <span className="absolute -left-[23px] top-2 h-3 w-3 rounded-full border-2 border-rpg-green bg-rpg-bg" aria-hidden />
                    <p className="text-[10px] text-rpg-muted">{new Date(x.performedAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                    <p className="text-sm font-semibold text-rpg-text">
                      {x.kind}
                      {x.distanceKm ? ` de ${nf(x.distanceKm)} km` : ""} registrada!
                    </p>
                    <p className="text-[11px] text-rpg-muted">{fmtMin(x.minutes)} · alimentou a Vitalidade e a Raid da semana.</p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </aside>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Panel title="Evolução da Saúde" icon={<HeartPulse size={17} className="text-rpg-pink" aria-hidden />}>
          <p className="text-sm text-rpg-text">
            Dias com treino nos últimos 30 dias: <strong>{o.activeDays30}</strong>
          </p>
          <MeterRow label="Constância (30 dias)" value={o.activeDays30} max={30} tone="bg-emerald-400" right={`${o.activeDays30}/30`} />
          <Link to="/saude" className="mt-2 inline-block text-xs text-rpg-blue hover:underline">
            Abrir Saúde e Vitalidade do Dia →
          </Link>
        </Panel>
        <Panel title="Meta semanal" icon={<Target size={17} className="text-rpg-purple" aria-hidden />}>
          <MeterRow label={`${o.weeklyGoal.doneDays} / ${o.weeklyGoal.target} dias com treino`} value={o.weeklyGoal.doneDays} max={o.weeklyGoal.target} tone="bg-emerald-400" />
          <p className="mt-2 text-[11px] text-rpg-muted">Ao completar {o.weeklyGoal.target} dias na semana: bônus único de +{o.xpRules.weeklyBonus.xp} XP. XP por treino: {o.xpRules.min}–{o.xpRules.max}, até {o.xpRules.dailyCap} treinos por dia.</p>
        </Panel>
        <Panel title="Integrações e dispositivos" icon={<Watch size={17} className="text-rpg-cyan" aria-hidden />}>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Activity size={16} className="text-rpg-orange" aria-hidden /> Strava
              </span>
              <span className={c ? "text-rpg-green" : "text-rpg-muted"}>{c ? "Conectado" : o.configured ? "Desconectado" : "Não configurado"}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Watch size={16} className="text-rpg-muted" aria-hidden /> Relógio / smartwatch
              </span>
              <span className="text-xs text-rpg-muted">via Strava</span>
            </li>
          </ul>
          <p className="mt-2 text-[11px] text-rpg-muted">Relógios entram quando o próprio app do relógio envia as atividades ao Strava. O LifeOS não lê o relógio diretamente.</p>
        </Panel>
      </div>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Conexão com o Strava">
        <div className="space-y-3 text-sm">
          <p>Desconectar revoga o acesso do LifeOS no Strava.</p>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={deleteData} onChange={(e) => setDeleteData(e.target.checked)} />
            Apagar também os treinos importados (registros manuais vinculados são mantidos)
          </label>
          <div className="flex justify-end gap-2">
            <RPGButton variant="ghost" onClick={() => setSettingsOpen(false)}>
              Cancelar
            </RPGButton>
            <RPGButton variant="danger" disabled={a.disconnect.isPending} onClick={() => a.disconnect.mutate(deleteData, { onSuccess: () => { setSettingsOpen(false); notify("Strava desconectado."); }, onError: (e) => notify(errMsg(e, "Falha ao desconectar."), "error") })}>
              <Unplug size={15} aria-hidden /> Desconectar
            </RPGButton>
          </div>
        </div>
      </Modal>
      <p className="sr-only">
        <Trophy aria-hidden /> Conquistas ligadas ao Strava aparecem na tela de Conquistas.
      </p>
    </div>
  );
}
