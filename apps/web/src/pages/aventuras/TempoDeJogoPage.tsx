import { useMemo, useState } from "react";
import clsx from "clsx";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, CalendarDays, Clock, ExternalLink, Gamepad2, Hourglass, Library, Link2, Pin, PinOff, RefreshCw, Scale, Settings2, Trophy, Unplug, User, Sparkles } from "lucide-react";
import { RPGButton, RPGSwitch, RPGToast } from "@/components/rpg";
import { Modal } from "@/components/ui/Modal";
import { PixelScene } from "@/components/living-world/PixelScene";
import { drawGamerRoomScene } from "@/components/living-world/engine/adventureScenes";
import { DEFAULT_AVATAR_LOOK, normalizeLook } from "@/components/living-world/engine/looks";
import { useLivingWorld } from "@/hooks/useLivingWorld";
import { useSteam, useSteamActions } from "@/hooks/useAdventures";
import { adventuresService } from "@/services/adventuresService";
import { AdventureHeader, BackToWorld, EmptyNote, INPUT, MeterRow, PageError, PageSkeleton, Panel, R, StatTile, StatusPill, ago, errMsg, fmtMin, nf, useConnect, useIntegrationReturn, Spinner } from "@/components/adventures/AdventureKit";

const WD = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const hours = (m: number) => `${nf(Math.round(m / 6) / 10)} h`;

export function TempoDeJogoPage() {
  const [range, setRange] = useState<7 | 14 | 30>(7);
  const q = useSteam(range);
  const a = useSteamActions();
  const world = useLivingWorld();
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);
  const [profile, setProfile] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const notify = (msg: string, tone: "success" | "error" = "success") => setToast({ msg, tone });
  useIntegrationReturn(notify, "Steam");
  const connect = useConnect(adventuresService.steamConnect, notify);
  const hero = useMemo(() => normalizeLook(world.data?.avatar ?? {}, DEFAULT_AVATAR_LOOK), [world.data?.avatar]);
  const o = q.data;
  const recentlyPlayed = Boolean(o?.games?.some((g) => g.lastPlayed && Date.now() - Date.parse(g.lastPlayed) < 3 * 3600_000));
  const draw = useMemo(() => (ctx: CanvasRenderingContext2D, t: number, still: boolean) => drawGamerRoomScene(ctx, t, { playing: recentlyPlayed, trophies: o?.pinnedTrophies ?? 0, hero, still }), [recentlyPlayed, o?.pinnedTrophies, hero]);

  if (q.isError) return <PageError what="o Tempo de Jogo" onRetry={() => void q.refetch()} />;
  if (!o) return <PageSkeleton />;
  const acc = o.account;
  const sync = () => a.sync.mutate(undefined, { onSuccess: (r) => notify(r.skipped ? "Sincronizado há pouco." : `${r.games} jogo(s) atualizados${r.newAchievements ? `, ${r.newAchievements} conquista(s) nova(s)` : ""}.`), onError: (e) => notify(errMsg(e, "Falha ao sincronizar."), "error") });

  if (!acc)
    return (
      <div className="space-y-4 px-3 py-4 sm:px-4 md:px-6">
        <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
        <BackToWorld />
        <AdventureHeader icon={<Gamepad2 size={40} className="text-rpg-blue" />} title="Tempo de Jogo (Steam)" subtitle="Acompanhe seus jogos e conquistas e equilibre lazer e produtividade na sua jornada." />
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="rpg-panel overflow-hidden p-0">
            <div className="aspect-[16/9]">
              <PixelScene draw={draw} label="Sala do Aventureiro" />
            </div>
          </div>
          <div className="rpg-panel space-y-3 p-4">
            <h2 className="font-rpg text-xl font-bold">Conectar a Steam</h2>
            {!o.configured ? (
              <p className="text-sm text-rpg-muted">A Steam ainda não foi configurada pelo administrador (Configurações → Steam: Web API Key).</p>
            ) : (
              <>
                <RPGButton className="w-full" onClick={() => void connect.go()} disabled={connect.busy}>
                  {connect.busy ? <Spinner /> : <Link2 size={16} aria-hidden />} Entrar com a Steam
                </RPGButton>
                <p className="text-xs text-rpg-muted">Login oficial da Steam (OpenID): confirma que a conta é sua sem compartilhar senha.</p>
                <form
                  className="space-y-1.5 border-t border-rpg-border/60 pt-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    a.link.mutate(profile, { onSuccess: () => notify("Perfil Steam vinculado."), onError: (err) => notify(errMsg(err, "Perfil não encontrado."), "error") });
                  }}
                >
                  <label className="block text-xs text-rpg-muted" htmlFor="steam-perfil">
                    Ou informe o perfil público (URL, SteamID64 ou nome personalizado)
                  </label>
                  <div className="flex gap-2">
                    <input id="steam-perfil" className={clsx(INPUT, "flex-1")} style={R} value={profile} onChange={(e) => setProfile(e.target.value)} placeholder="steamcommunity.com/id/seu-nome" />
                    <RPGButton type="submit" variant="secondary" disabled={profile.trim().length < 2 || a.link.isPending}>
                      Vincular
                    </RPGButton>
                  </div>
                </form>
              </>
            )}
            <p className="text-[11px] text-rpg-muted">Para os jogos aparecerem, em Steam → Privacidade, “Detalhes do jogo” precisa estar Público. A Steam não informa histórico diário: o gráfico começa no dia da conexão.</p>
          </div>
        </div>
      </div>
    );

  const t = o.totals!;
  const p = o.period!;
  const b = o.balance!;
  const total = b.gameMin + b.productiveMin;
  const gamePct = total ? Math.round((b.gameMin / total) * 100) : 0;
  const limitMin = b.weeklyLimitHours ? b.weeklyLimitHours * 60 : null;
  const prevDiff = p.prevGameMin && p.prevGameMin > 0 ? Math.round(((p.gameMin - p.prevGameMin) / p.prevGameMin) * 100) : null;
  const chart = (o.daily ?? []).map((d) => ({ ...d, label: `${WD[new Date(`${d.day}T12:00:00Z`).getUTCDay()]} ${d.day.slice(8)}/${d.day.slice(5, 7)}`, h: d.minutes == null ? 0 : Math.round(d.minutes / 6) / 10 }));
  const steamAch = [
    { title: "Primeira Conexão Steam", desc: "Conecte e sincronize sua conta", value: 1, target: 1 },
    { title: "Colecionador", desc: "Tenha 50 jogos na biblioteca", value: t.games, target: 50 },
    { title: "Mestre das Conquistas", desc: "Importe 100 conquistas", value: t.achievements, target: 100 },
  ];

  return (
    <div className="space-y-4 px-3 py-4 sm:px-4 md:px-6">
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
      <BackToWorld />
      <AdventureHeader icon={<Gamepad2 size={40} className="text-rpg-blue" />} title="Tempo de Jogo (Steam)" subtitle="Seu tempo de jogo, conquistas e o equilíbrio entre lazer e produtividade na sua jornada.">
        <StatusPill state={acc.lastError ? "warn" : "ok"} label="Steam" detail={acc.lastError ?? "Conectado"} />
        <StatusPill state="ok" label="Sincronização" detail={acc.lastSyncAt ? `Última: ${ago(acc.lastSyncAt)}` : "Nunca"} onClick={sync} />
        {acc.profileUrl && (
          <a href={acc.profileUrl} target="_blank" rel="noreferrer">
            <StatusPill state={acc.publicProfile ? "ok" : "warn"} label="Perfil" detail={`${acc.personaName ?? acc.steamId}${acc.publicProfile ? "" : " (privado)"}`} />
          </a>
        )}
      </AdventureHeader>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,1fr)]">
        <section className="rpg-panel overflow-hidden p-0" aria-label="Sala do Aventureiro">
          <div className="aspect-[16/9]">
            <PixelScene draw={draw} label="Sala do Aventureiro" />
          </div>
        </section>
        <div className="space-y-3">
          <section className="rpg-panel flex items-center gap-3 p-4" aria-label="Conta Steam">
            {acc.avatarUrl ? <img src={acc.avatarUrl} alt="" className="h-14 w-14 rounded-full" /> : <User size={40} aria-hidden />}
            <div className="min-w-0 flex-1">
              <p className="text-xs text-rpg-muted">Conta Steam</p>
              <p className="truncate font-rpg text-xl font-bold text-rpg-text">{acc.personaName ?? acc.steamId}</p>
              <p className="text-[11px] text-rpg-muted">Conta conectada · perfil {acc.publicProfile ? "público" : "privado"}</p>
            </div>
            <RPGButton variant="secondary" onClick={() => setSettingsOpen(true)}>
              <Settings2 size={15} aria-hidden /> Gerenciar
            </RPGButton>
          </section>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <StatTile icon={<Library size={14} />} tone="text-rpg-purple" label="Jogos na biblioteca" value={nf(t.games)} />
            <StatTile icon={<Trophy size={14} />} tone="text-rpg-gold" label="Conquistas importadas" value={nf(t.achievements)} />
            <StatTile icon={<Clock size={14} />} tone="text-rpg-blue" label="Tempo total" value={hours(t.totalMin)} />
            <StatTile icon={<CalendarDays size={14} />} tone="text-rpg-blue" label="Últimos 14 dias" value={hours(t.last14Min)} hint="dado oficial da Steam" />
            <StatTile icon={<BarChart3 size={14} />} tone="text-rpg-purple" label={`Últimos ${p.rangeDays} dias`} value={p.coveredDays ? hours(p.gameMin) : "—"} hint={`estimado · ${p.coveredDays}/${p.rangeDays} dias com dado`} />
            <RPGButton variant="success" className="h-full" onClick={sync} disabled={a.sync.isPending}>
              {a.sync.isPending ? <Spinner /> : <RefreshCw size={15} aria-hidden />} Sincronizar
            </RPGButton>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período">
        <span className="text-sm text-rpg-muted">Período:</span>
        {([7, 14, 30] as const).map((r) => (
          <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)} className={clsx("border-2 px-3 py-1 text-xs", range === r ? "border-rpg-green text-rpg-text" : "border-rpg-border text-rpg-muted")} style={R}>
            Últimos {r} dias
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Tempo de jogo (período)" icon={<Hourglass size={17} className="text-rpg-gold-light" aria-hidden />}>
          <p className="font-rpg text-4xl font-bold text-rpg-text">{p.coveredDays ? fmtMin(p.gameMin) : "—"}</p>
          {prevDiff != null ? (
            <p className={clsx("text-sm", prevDiff >= 0 ? "text-rpg-orange" : "text-rpg-green")}>{prevDiff >= 0 ? "▲" : "▼"} {Math.abs(prevDiff)}% em relação ao período anterior</p>
          ) : (
            <p className="text-sm text-rpg-muted">Sem período anterior com dados para comparar.</p>
          )}
          <p className="mt-2 text-[11px] text-rpg-muted">{p.note}</p>
        </Panel>

        <Panel title="Equilíbrio do período" icon={<Scale size={17} className="text-rpg-purple" aria-hidden />}>
          <div className="space-y-2">
            <MeterRow label="Tempo registrado no LifeOS" value={b.productiveMin} max={Math.max(1, total)} tone="bg-emerald-400" right={`${fmtMin(b.productiveMin)} · ${total ? 100 - gamePct : 0}%`} />
            <MeterRow label="Tempo de jogo (estimado)" value={b.gameMin} max={Math.max(1, total)} tone="bg-violet-400" right={`${fmtMin(b.gameMin)} · ${gamePct}%`} />
          </div>
          <p className="mt-2 text-[11px] text-rpg-muted">Registrado: {b.productiveSources}. Lazer também é parte do bem-estar — use isso só como espelho, não como nota.</p>
          {limitMin && <MeterRow label={`Sua meta: até ${b.weeklyLimitHours} h de jogo por semana`} value={b.weekGameMin} max={limitMin} tone={b.weekGameMin > limitMin ? "bg-rose-400" : "bg-sky-400"} right={`${fmtMin(b.weekGameMin)} esta semana`} />}
        </Panel>

        <Panel title="Tempo de jogo por dia" icon={<CalendarDays size={17} className="text-rpg-blue" aria-hidden />}>
          {chart.every((d) => d.minutes == null) ? (
            <EmptyNote>Os dados diários começam a partir dos snapshots coletados depois da conexão.</EmptyNote>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
                  <CartesianGrid stroke="#ffffff14" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#a9a3c2", fontSize: 9 }} interval={range === 7 ? 0 : "preserveStartEnd"} />
                  <YAxis tick={{ fill: "#a9a3c2", fontSize: 10 }} unit="h" />
                  <Tooltip contentStyle={{ background: "#1d1a2e", border: "1px solid #3b3657", fontSize: 12 }} formatter={(_v: number, _n: string, item: { payload?: { minutes: number | null; spanDays: number } }) => [item.payload?.minutes == null ? "sem dado" : `${fmtMin(item.payload.minutes)}${item.payload.spanDays > 1 ? ` (acumulado de ${item.payload.spanDays} dias)` : ""}`, "Jogo"]} />
                  <Bar dataKey="h" radius={[3, 3, 0, 0]}>
                    {chart.map((d) => (
                      <Cell key={d.day} fill={d.minutes == null ? "#3b3657" : d.spanDays > 1 ? "#7c6ab0" : "#A875F5"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="mt-1 text-[11px] text-rpg-muted">Barras claras = acumulado de mais de um dia (sem snapshot no meio).</p>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Panel title="Jogos mais jogados" icon={<Gamepad2 size={17} className="text-rpg-blue" aria-hidden />}>
          {!o.games?.length ? (
            <EmptyNote>{acc.publicProfile ? "Nenhum jogo encontrado. Confira se “Detalhes do jogo” está público na Steam." : "Perfil privado: a Steam não libera a lista de jogos."}</EmptyNote>
          ) : (
            <ul className="space-y-1.5">
              {o.games.slice(0, 8).map((g) => (
                <li key={g.appid} className="rpg-tile flex flex-wrap items-center gap-x-3 gap-y-1 p-2">
                  <img src={g.header} alt="" loading="lazy" className="h-9 w-24 shrink-0 object-cover" style={R} onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
                  <div className="min-w-[120px] flex-1">
                    <p className="truncate text-sm font-semibold text-rpg-text">{g.name}</p>
                    <p className="text-[11px] text-rpg-muted">
                      {g.lastPlayed ? `Jogado ${ago(g.lastPlayed)}` : "Sem data de última sessão"}
                      {g.achTotal ? ` · ${g.achUnlocked}/${g.achTotal} conquistas` : ""}
                    </p>
                  </div>
                  <span className="text-xs text-rpg-text">{hours(g.totalMin)}</span>
                  {g.recentMin > 0 && <span className="text-xs text-rpg-green">+{hours(g.recentMin)} em 14 dias</span>}
                  <a href={g.storeUrl} target="_blank" rel="noreferrer" className="text-rpg-muted hover:text-rpg-text" aria-label={`Abrir ${g.name} na Steam`}>
                    <ExternalLink size={14} />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Conquistas recentes (Steam)" icon={<Trophy size={17} className="text-rpg-gold" aria-hidden />}>
          {!o.recentAchievements?.length ? (
            <EmptyNote>As conquistas aparecem conforme os jogos recentes são sincronizados.</EmptyNote>
          ) : (
            <ul className="space-y-1.5">
              {o.recentAchievements.slice(0, 6).map((x) => (
                <li key={`${x.appid}-${x.apiName}`} className="rpg-tile flex items-center gap-2 p-2">
                  {x.icon ? <img src={x.icon} alt="" className="h-9 w-9 shrink-0" style={R} /> : <Trophy size={22} className="shrink-0 text-rpg-gold" aria-hidden />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-rpg-text">{x.name}</p>
                    <p className="truncate text-[11px] text-rpg-muted">{x.description ?? x.game}</p>
                    <p className="text-[10px] text-rpg-muted">{x.game} · {ago(x.unlockedAt)}</p>
                  </div>
                  <button type="button" onClick={() => a.pin.mutate({ appid: x.appid, apiName: x.apiName, pin: !x.pinned }, { onSuccess: () => notify(x.pinned ? "Troféu removido da Coleção." : "Troféu fixado na Coleção e na Sala do Aventureiro.") })} aria-pressed={x.pinned} aria-label={x.pinned ? "Remover da Coleção" : "Fixar na Coleção"} title={x.pinned ? "Remover da Coleção" : "Fixar como troféu na Coleção"} className={x.pinned ? "text-rpg-gold" : "text-rpg-muted hover:text-rpg-text"}>
                    {x.pinned ? <Pin size={16} /> : <PinOff size={16} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-rpg-muted">Conquistas desbloqueadas depois da conexão rendem +{o.xpRules?.perAchievement} XP (até {o.xpRules?.dailyCap}/dia). Fixar como troféu é só cosmético.</p>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Coleção de troféus (LifeOS)" icon={<Sparkles size={17} className="text-rpg-gold-light" aria-hidden />} action={<span className="text-xs text-rpg-muted">{o.pinnedTrophies ?? 0} troféu(s) fixado(s)</span>}>
          <div className="grid gap-2 sm:grid-cols-3">
            {steamAch.map((x) => (
              <div key={x.title} className={clsx("rpg-tile p-3", x.value >= x.target && "border-rpg-gold/70")}>
                <Trophy size={20} className={x.value >= x.target ? "text-rpg-gold" : "text-rpg-muted"} aria-hidden />
                <p className="mt-1 text-sm font-semibold text-rpg-text">{x.title}</p>
                <p className="text-[11px] text-rpg-muted">{x.desc}</p>
                <MeterRow label="" value={Math.min(x.value, x.target)} max={x.target} tone="bg-emerald-400" right={x.value >= x.target ? "Concluído" : `${nf(x.value)}/${nf(x.target)}`} />
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Impacto na sua jornada" icon={<Scale size={17} className="text-rpg-pink" aria-hidden />}>
          <p className="text-sm text-rpg-text">
            {limitMin
              ? b.weekGameMin > limitMin
                ? `Você passou da meta que definiu (${b.weeklyLimitHours} h) nesta semana. Sem drama: ajuste o plano se fizer sentido para você.`
                : `Dentro da meta que você definiu (${b.weeklyLimitHours} h por semana).`
              : "O tempo de jogo também faz parte do bem-estar. Se quiser, defina uma meta semanal pessoal em Gerenciar."}
          </p>
        </Panel>
      </div>

      <SteamSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        limit={acc.settings.weeklyLimitHours}
        achXp={acc.settings.achievementXp}
        onSave={(s) => a.settings.mutate(s, { onSuccess: () => { setSettingsOpen(false); notify("Preferências salvas."); }, onError: (e) => notify(errMsg(e, "Não foi possível salvar."), "error") })}
        onDisconnect={(del) => a.disconnect.mutate(del, { onSuccess: () => { setSettingsOpen(false); notify("Steam desconectada."); } })}
      />
    </div>
  );
}

function SteamSettingsModal({ open, onClose, limit, achXp, onSave, onDisconnect }: { open: boolean; onClose: () => void; limit: number | null; achXp: boolean; onSave: (s: { weeklyLimitHours: number | null; achievementXp: boolean }) => void; onDisconnect: (deleteData: boolean) => void }) {
  const [l, setL] = useState(limit ? String(limit) : "");
  const [x, setX] = useState(achXp);
  const [del, setDel] = useState(false);
  const n = l.trim() ? Number(l) : null;
  const valid = n == null || (Number.isFinite(n) && n >= 1 && n <= 100);
  return (
    <Modal open={open} onClose={onClose} title="Gerenciar Steam">
      <div className="space-y-3 text-sm">
        <label className="block">
          Meta pessoal: máximo de horas de jogo por semana (opcional)
          <input type="number" min={1} max={100} className={clsx(INPUT, "mt-1 w-full")} style={R} value={l} onChange={(e) => setL(e.target.value)} placeholder="Sem meta" />
        </label>
        <div className="flex items-center justify-between">
          <span>XP por conquistas Steam novas</span>
          <RPGSwitch checked={x} onChange={() => setX(!x)} label="XP por conquistas" />
        </div>
        <div className="flex justify-end">
          <RPGButton disabled={!valid} onClick={() => onSave({ weeklyLimitHours: n, achievementXp: x })}>
            Salvar
          </RPGButton>
        </div>
        <div className="border border-rpg-red/50 p-3" style={R}>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={del} onChange={(e) => setDel(e.target.checked)} /> Apagar também jogos, snapshots e conquistas importadas
          </label>
          <RPGButton variant="danger" className="mt-2" onClick={() => onDisconnect(del)}>
            <Unplug size={14} aria-hidden /> Desconectar Steam
          </RPGButton>
        </div>
      </div>
    </Modal>
  );
}
