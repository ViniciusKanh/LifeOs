import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, BarChart3, CalendarDays, CheckCircle2, Clock, ExternalLink, EyeOff, Gamepad2, Hourglass, LayoutGrid, Library, Link2, Lock, Pin, PinOff, RefreshCw, Scale, Search, Settings2, Sparkles, Trophy, Unplug, User } from "lucide-react";
import { RPGButton, RPGSwitch, RPGTabs, RPGToast } from "@/components/rpg";
import { Modal } from "@/components/ui/Modal";
import { PixelScene } from "@/components/living-world/PixelScene";
import { drawGamerRoomScene } from "@/components/living-world/engine/adventureScenes";
import { DEFAULT_AVATAR_LOOK, normalizeLook } from "@/components/living-world/engine/looks";
import { useLivingWorld } from "@/hooks/useLivingWorld";
import { useSteam, useSteamActions, useSteamGame } from "@/hooks/useAdventures";
import { adventuresService, type SteamGame, type SteamOverview } from "@/services/adventuresService";
import { AdventureHeader, BackToWorld, EmptyNote, INPUT, MeterRow, PageError, PageSkeleton, Panel, R, StatTile, StatusPill, ago, errMsg, fmtMin, nf, useConnect, useIntegrationReturn, Spinner } from "@/components/adventures/AdventureKit";

const WD = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const hours = (m: number) => `${nf(Math.round(m / 6) / 10)} h`;
type Tab = "geral" | "jogos" | "conquistas" | "equilibrio";
type Sort = "total" | "recente" | "duas" | "conquistas" | "nome";
const TOOLTIP = { background: "#1d1a2e", border: "1px solid #3b3657", fontSize: 12, borderRadius: 6 };

const ACH_STATUS: Record<SteamGame["achStatus"], { label: string; tone: string }> = {
  ok: { label: "", tone: "" },
  sem_conquistas: { label: "Sem conquistas na Steam", tone: "text-rpg-muted" },
  privado: { label: "Conquistas privadas", tone: "text-rpg-orange" },
  erro: { label: "Erro ao ler", tone: "text-rpg-red" },
  pendente: { label: "Lendo conquistas…", tone: "text-rpg-blue" },
};

/** Capa do jogo (CDN oficial da Steam) com fallback para o ícone de controle. */
function GameCover({ g, className }: { g: { header: string; name: string }; className?: string }) {
  const [broken, setBroken] = useState(false);
  return broken ? (
    <div className={clsx("flex items-center justify-center bg-gradient-to-br from-indigo-900 to-violet-900", className)}>
      <Gamepad2 size={26} className="text-rpg-muted" aria-hidden />
    </div>
  ) : (
    <img src={g.header} alt="" loading="lazy" className={clsx("object-cover", className)} onError={() => setBroken(true)} />
  );
}

function AchBar({ g }: { g: SteamGame }) {
  if (g.achStatus !== "ok" || !g.achTotal) return <p className={clsx("text-[11px]", ACH_STATUS[g.achStatus].tone)}>{ACH_STATUS[g.achStatus].label || "—"}</p>;
  const pct = Math.round(((g.achUnlocked ?? 0) / g.achTotal) * 100);
  return (
    <div>
      <div className="flex justify-between text-[11px] text-rpg-muted">
        <span>
          <Trophy size={11} className="mr-1 inline text-rpg-gold" aria-hidden />
          {g.achUnlocked}/{g.achTotal} conquistas
        </span>
        <span>{pct}%</span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden bg-rpg-bg-2" style={R}>
        <div className={clsx("h-full", pct === 100 ? "bg-rpg-gold" : "bg-emerald-400")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function TempoDeJogoPage() {
  const [range, setRange] = useState<7 | 14 | 30>(7);
  const [tab, setTab] = useState<Tab>("geral");
  const [openGame, setOpenGame] = useState<number | null>(null);
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

  // Leitura de conquistas em lotes: continua sozinha enquanto houver jogos pendentes.
  const rounds = useRef(0);
  const pending = o?.achievementSync?.pending ?? 0;
  useEffect(() => {
    if (!o?.account || pending === 0 || a.achSync.isPending || rounds.current >= 8) return;
    rounds.current += 1;
    a.achSync.mutate(false, { onError: (e) => notify(errMsg(e, "Falha ao ler conquistas."), "error") });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, o?.account, a.achSync.isPending]);

  if (q.isError) return <PageError what="o Tempo de Jogo" onRetry={() => void q.refetch()} />;
  if (!o) return <PageSkeleton />;
  const acc = o.account;

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
            <p className="text-[11px] text-rpg-muted">Na Steam, em Privacidade, deixe “Meu perfil” e “Detalhes do jogo” como Público. A Steam não informa histórico diário: o gráfico começa no dia da conexão.</p>
          </div>
        </div>
      </div>
    );

  const t = o.totals!;
  const p = o.period!;
  const games = o.games ?? [];
  const sync = () =>
    a.sync.mutate(undefined, {
      onSuccess: (r) => {
        rounds.current = 0;
        notify(r.skipped ? "Sincronizado há pouco." : `${r.games} jogo(s) atualizados${r.newAchievements ? `, ${r.newAchievements} conquista(s) nova(s)` : ""}.`);
      },
      onError: (e) => notify(errMsg(e, "Falha ao sincronizar."), "error"),
    });

  return (
    <div className="space-y-4 px-3 py-4 sm:px-4 md:px-6">
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
      <BackToWorld />
      <AdventureHeader icon={<Gamepad2 size={40} className="text-rpg-blue" />} title="Tempo de Jogo (Steam)" subtitle="Seus jogos, conquistas e o equilíbrio entre lazer e produtividade na sua jornada.">
        <StatusPill state={acc.lastError ? "warn" : "ok"} label="Steam" detail={acc.lastError ?? "Conectada"} />
        <StatusPill state="ok" label="Sincronização" detail={acc.lastSyncAt ? `Última: ${ago(acc.lastSyncAt)}` : "Nunca"} onClick={sync} />
        {acc.profileUrl && (
          <a href={acc.profileUrl} target="_blank" rel="noreferrer">
            <StatusPill state={acc.publicProfile ? "ok" : "warn"} label="Perfil" detail={`${acc.personaName ?? acc.steamId}${acc.publicProfile ? "" : " (privado)"}`} />
          </a>
        )}
      </AdventureHeader>

      {/* Herói + conta + indicadores */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,1fr)]">
        <section className="rpg-panel overflow-hidden p-0" aria-label="Sala do Aventureiro">
          <div className="aspect-[16/8] w-full">
            <PixelScene draw={draw} label="Sala do Aventureiro" />
          </div>
        </section>
        <div className="flex flex-col gap-3">
          <section className="rpg-panel flex items-center gap-3 p-4" aria-label="Conta Steam">
            {acc.avatarUrl ? <img src={acc.avatarUrl} alt="" className="h-14 w-14 rounded-full border-2 border-rpg-blue/60" /> : <User size={40} aria-hidden />}
            <div className="min-w-0 flex-1">
              <p className="text-xs text-rpg-muted">Conta Steam</p>
              <p className="truncate font-rpg text-xl font-bold text-rpg-text">{acc.personaName ?? acc.steamId}</p>
              <p className="text-[11px] text-rpg-muted">Perfil {acc.publicProfile ? "público" : "privado"} · conectada {ago(acc.connectedAt)}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <RPGButton variant="success" onClick={sync} disabled={a.sync.isPending}>
                {a.sync.isPending ? <Spinner /> : <RefreshCw size={15} aria-hidden />} Sincronizar
              </RPGButton>
              <RPGButton variant="secondary" onClick={() => setSettingsOpen(true)}>
                <Settings2 size={15} aria-hidden /> Gerenciar
              </RPGButton>
            </div>
          </section>
          <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3">
            <StatTile icon={<Library size={14} />} tone="text-rpg-purple" label="Jogos" value={nf(t.games)} hint={`${t.playedGames} já jogados`} />
            <StatTile icon={<Trophy size={14} />} tone="text-rpg-gold" label="Conquistas" value={nf(t.achievements)} hint="importadas da Steam" />
            <StatTile icon={<Clock size={14} />} tone="text-rpg-blue" label="Tempo total" value={hours(t.totalMin)} />
            <StatTile icon={<CalendarDays size={14} />} tone="text-rpg-blue" label="Últimos 14 dias" value={hours(t.last14Min)} hint="valor oficial da Steam" />
            <StatTile icon={<BarChart3 size={14} />} tone="text-rpg-purple" label={`Últimos ${p.rangeDays} dias`} value={p.coveredDays ? hours(p.gameMin) : "—"} hint={`estimado · ${p.coveredDays}/${p.rangeDays} dias`} />
            <StatTile icon={<Pin size={14} />} tone="text-rpg-gold-light" label="Troféus fixados" value={nf(o.pinnedTrophies ?? 0)} hint="na Coleção" />
          </div>
        </div>
      </div>

      <AchievementSyncBanner s={o.achievementSync} busy={a.achSync.isPending} onRefresh={() => { rounds.current = 0; a.achSync.mutate(true, { onSuccess: (r) => notify(r.newAchievements ? `${r.newAchievements} conquista(s) nova(s).` : "Conquistas verificadas."), onError: (e) => notify(errMsg(e, "Falha ao ler conquistas."), "error") }); }} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <RPGTabs<Tab>
          label="Seções do Tempo de Jogo"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "geral", label: "Visão geral", icon: <LayoutGrid size={14} /> },
            { value: "jogos", label: `Meus jogos (${games.length})`, icon: <Gamepad2 size={14} /> },
            { value: "conquistas", label: `Conquistas (${t.achievements})`, icon: <Trophy size={14} /> },
            { value: "equilibrio", label: "Equilíbrio", icon: <Scale size={14} /> },
          ]}
        />
        {(tab === "geral" || tab === "equilibrio") && (
          <RPGTabs<"7" | "14" | "30"> label="Período" size="sm" value={String(range) as "7" | "14" | "30"} onChange={(v) => setRange(Number(v) as 7 | 14 | 30)} tabs={[{ value: "7", label: "7 dias" }, { value: "14", label: "14 dias" }, { value: "30", label: "30 dias" }]} />
        )}
      </div>

      {tab === "geral" && <OverviewTab o={o} onOpenGame={setOpenGame} onSeeGames={() => setTab("jogos")} onSeeAch={() => setTab("conquistas")} onPin={(x) => a.pin.mutate(x, { onSuccess: () => notify(x.pin ? "Troféu fixado na Coleção." : "Troféu removido da Coleção.") })} />}
      {tab === "jogos" && <GamesTab games={games} onOpen={setOpenGame} />}
      {tab === "conquistas" && <AchievementsTab o={o} onPin={(x) => a.pin.mutate(x, { onSuccess: () => notify(x.pin ? "Troféu fixado na Coleção." : "Troféu removido da Coleção.") })} onOpenGame={setOpenGame} />}
      {tab === "equilibrio" && <BalanceTab o={o} onSettings={() => setSettingsOpen(true)} />}

      <GameModal appid={openGame} onClose={() => setOpenGame(null)} onPin={(x) => a.pin.mutate(x, { onSuccess: () => notify(x.pin ? "Troféu fixado na Coleção." : "Troféu removido da Coleção.") })} />
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

/** Situação da leitura de conquistas: progresso, motivo de jogos sem conquistas e erros reais. */
function AchievementSyncBanner({ s, busy, onRefresh }: { s: SteamOverview["achievementSync"]; busy: boolean; onRefresh: () => void }) {
  if (!s || s.playedGames === 0) return null;
  const done = s.playedGames - s.pending;
  const reading = s.pending > 0;
  return (
    <section className={clsx("rpg-panel flex flex-wrap items-center gap-3 p-3", s.errors || s.privateGames ? "border-rpg-orange/60" : "")} aria-live="polite" aria-label="Leitura de conquistas">
      {reading ? <Spinner /> : s.errors || s.privateGames ? <AlertTriangle size={18} className="text-rpg-orange" aria-hidden /> : <CheckCircle2 size={18} className="text-rpg-green" aria-hidden />}
      <div className="min-w-[220px] flex-1">
        <p className="text-sm font-semibold text-rpg-text">
          {reading ? `Lendo conquistas: ${done} de ${s.playedGames} jogos verificados` : `Conquistas verificadas em ${s.playedGames} jogo(s)`}
        </p>
        <p className="text-[11px] text-rpg-muted">
          {s.withAchievements} com conquistas · {s.noAchievements} sem conquistas na Steam
          {s.privateGames ? ` · ${s.privateGames} com estatísticas privadas` : ""}
          {s.errors ? ` · ${s.errors} com erro (nova tentativa em ~1 h)` : ""}
        </p>
        {s.privateGames > 0 && <p className="text-[11px] text-rpg-orange">A Steam negou as conquistas: em Privacidade, deixe “Detalhes do jogo” como Público (e desmarque “sempre manter o tempo de jogo privado”).</p>}
        {s.lastError && <p className="text-[11px] text-rpg-red">Último erro: {s.lastError}</p>}
        {reading && (
          <div className="mt-1 h-1.5 overflow-hidden bg-rpg-bg-2" style={R}>
            <div className="h-full bg-rpg-blue transition-[width] duration-700" style={{ width: `${(done / Math.max(1, s.playedGames)) * 100}%` }} />
          </div>
        )}
      </div>
      <RPGButton variant="secondary" disabled={busy} onClick={onRefresh}>
        {busy ? <Spinner /> : <Trophy size={14} aria-hidden />} Atualizar conquistas
      </RPGButton>
    </section>
  );
}

function OverviewTab({ o, onOpenGame, onSeeGames, onSeeAch, onPin }: { o: SteamOverview; onOpenGame: (id: number) => void; onSeeGames: () => void; onSeeAch: () => void; onPin: (x: { appid: number; apiName: string; pin: boolean }) => void }) {
  const p = o.period!;
  const b = o.balance!;
  const prevDiff = p.prevGameMin && p.prevGameMin > 0 ? Math.round(((p.gameMin - p.prevGameMin) / p.prevGameMin) * 100) : null;
  const top = [...(o.games ?? [])].sort((x, y) => y.recentMin - x.recentMin || y.totalMin - x.totalMin).slice(0, 5);
  const maxRecent = Math.max(1, ...top.map((g) => g.recentMin || g.totalMin));
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Tempo de jogo (período)" icon={<Hourglass size={17} className="text-rpg-gold-light" aria-hidden />}>
          <p className="font-rpg text-4xl font-bold text-rpg-text">{p.coveredDays ? fmtMin(p.gameMin) : "—"}</p>
          {prevDiff != null ? (
            <p className={clsx("text-sm", prevDiff >= 0 ? "text-rpg-orange" : "text-rpg-green")}>
              {prevDiff >= 0 ? "▲" : "▼"} {Math.abs(prevDiff)}% em relação ao período anterior
            </p>
          ) : (
            <p className="text-sm text-rpg-muted">Sem período anterior com dados para comparar.</p>
          )}
          <p className="mt-2 text-[11px] text-rpg-muted">{p.note}</p>
        </Panel>
        <BalanceDonut b={b} />
        <DailyChart o={o} compact />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Panel title="Jogos mais jogados" icon={<Gamepad2 size={17} className="text-rpg-blue" aria-hidden />} action={<button type="button" className="text-xs text-rpg-blue hover:underline" onClick={onSeeGames}>Ver todos →</button>}>
          {top.length === 0 ? (
            <EmptyNote>Nenhum jogo encontrado. Confira se “Detalhes do jogo” está público na Steam.</EmptyNote>
          ) : (
            <ul className="space-y-2">
              {top.map((g) => (
                <li key={g.appid}>
                  <button type="button" onClick={() => onOpenGame(g.appid)} className="rpg-tile flex w-full items-center gap-3 p-2 text-left hover:brightness-110">
                    <GameCover g={g} className="h-12 w-24 shrink-0 rounded" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate font-semibold text-rpg-text">{g.name}</p>
                        <p className="shrink-0 text-xs text-rpg-text">{hours(g.totalMin)}</p>
                      </div>
                      <div className="h-1.5 overflow-hidden bg-rpg-bg-2" style={R} aria-hidden>
                        <div className="h-full bg-violet-400" style={{ width: `${((g.recentMin || g.totalMin) / maxRecent) * 100}%` }} />
                      </div>
                      <p className="text-[11px] text-rpg-muted">
                        {g.recentMin ? `+${hours(g.recentMin)} em 14 dias` : "Sem tempo nos últimos 14 dias"} · {g.achStatus === "ok" && g.achTotal ? `${g.achUnlocked}/${g.achTotal} conquistas` : ACH_STATUS[g.achStatus].label}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Conquistas recentes" icon={<Trophy size={17} className="text-rpg-gold" aria-hidden />} action={<button type="button" className="text-xs text-rpg-blue hover:underline" onClick={onSeeAch}>Ver todas →</button>}>
          {!o.recentAchievements?.length ? (
            <EmptyNote>Assim que a leitura terminar, suas conquistas aparecem aqui.</EmptyNote>
          ) : (
            <ul className="space-y-1.5">
              {o.recentAchievements.slice(0, 6).map((x) => (
                <AchievementRow key={`${x.appid}-${x.apiName}`} x={x} onPin={onPin} />
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function AchievementRow({ x, onPin }: { x: NonNullable<SteamOverview["recentAchievements"]>[number]; onPin: (x: { appid: number; apiName: string; pin: boolean }) => void }) {
  return (
    <li className="rpg-tile flex items-center gap-2.5 p-2">
      {x.icon ? <img src={x.icon} alt="" className="h-10 w-10 shrink-0 border border-rpg-gold/50" style={R} /> : <Trophy size={24} className="shrink-0 text-rpg-gold" aria-hidden />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-rpg-text">{x.name}</p>
        {x.description && <p className="truncate text-[11px] text-rpg-muted">{x.description}</p>}
        <p className="text-[10px] text-rpg-muted">
          {x.game ?? "Jogo"} · {new Date(x.unlockedAt).toLocaleDateString("pt-BR")}
        </p>
      </div>
      <button type="button" onClick={() => onPin({ appid: x.appid, apiName: x.apiName, pin: !x.pinned })} aria-pressed={x.pinned} aria-label={x.pinned ? "Remover da Coleção" : "Fixar na Coleção"} title={x.pinned ? "Remover da Coleção" : "Fixar como troféu na Coleção"} className={clsx("p-1", x.pinned ? "text-rpg-gold" : "text-rpg-muted hover:text-rpg-text")}>
        {x.pinned ? <Pin size={16} /> : <PinOff size={16} />}
      </button>
    </li>
  );
}

function BalanceDonut({ b }: { b: NonNullable<SteamOverview["balance"]> }) {
  const total = b.gameMin + b.productiveMin;
  const data = [
    { name: "Jogos", value: b.gameMin, color: "#A875F5" },
    { name: "Registrado no LifeOS", value: b.productiveMin, color: "#4FD49A" },
  ];
  return (
    <Panel title="Balanço de tempo" icon={<Scale size={17} className="text-rpg-purple" aria-hidden />}>
      {total === 0 ? (
        <EmptyNote>Sem tempo de jogo estimado nem registros no período.</EmptyNote>
      ) : (
        <div className="flex items-center gap-3">
          <div className="relative h-36 w-36 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" innerRadius="68%" outerRadius="100%" stroke="none" startAngle={90} endAngle={-270}>
                  {data.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="font-rpg text-lg font-bold leading-tight text-rpg-text">{hours(total)}</span>
              <span className="text-[10px] text-rpg-muted">no período</span>
            </div>
          </div>
          <ul className="space-y-2 text-sm">
            {data.map((d) => (
              <li key={d.name}>
                <span className="flex items-center gap-1.5 text-rpg-text">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} aria-hidden /> {d.name} ({Math.round((d.value / total) * 100)}%)
                </span>
                <span className="pl-4 text-xs text-rpg-muted">{fmtMin(d.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-2 text-[11px] text-rpg-muted">Lazer faz parte do bem-estar: é um espelho, não uma nota.</p>
    </Panel>
  );
}

function DailyChart({ o, compact }: { o: SteamOverview; compact?: boolean }) {
  const chart = (o.daily ?? []).map((d) => ({
    ...d,
    label: `${WD[new Date(`${d.day}T12:00:00Z`).getUTCDay()]} ${d.day.slice(8)}`,
    jogo: d.minutes == null ? 0 : Math.round(d.minutes / 6) / 10,
    registrado: Math.round(d.productiveMin / 6) / 10,
  }));
  const empty = chart.every((d) => d.minutes == null);
  return (
    <Panel title={compact ? "Tempo de jogo por dia" : "Jogo × tempo registrado por dia"} icon={<CalendarDays size={17} className="text-rpg-blue" aria-hidden />}>
      {empty ? (
        <EmptyNote>O gráfico diário começa a partir dos snapshots coletados depois da conexão (um por dia).</EmptyNote>
      ) : (
        <div className={compact ? "h-44" : "h-64"}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
              <CartesianGrid stroke="#ffffff14" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#a9a3c2", fontSize: 9 }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: "#a9a3c2", fontSize: 10 }} unit="h" />
              <Tooltip
                contentStyle={TOOLTIP}
                formatter={(v: number, n: string, item: { payload?: { minutes: number | null; spanDays: number } }) =>
                  n === "jogo" ? [item.payload?.minutes == null ? "sem dado" : `${fmtMin(item.payload.minutes)}${item.payload.spanDays > 1 ? ` (acumulado de ${item.payload.spanDays} dias)` : ""}`, "Jogo"] : [`${v} h`, "Registrado no LifeOS"]
                }
              />
              {!compact && <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => (v === "jogo" ? "Jogo (estimado)" : "Registrado no LifeOS")} />}
              <Bar dataKey="jogo" radius={[3, 3, 0, 0]}>
                {chart.map((d) => (
                  <Cell key={d.day} fill={d.minutes == null ? "#3b3657" : d.spanDays > 1 ? "#7c6ab0" : "#A875F5"} />
                ))}
              </Bar>
              {!compact && <Bar dataKey="registrado" fill="#4FD49A" radius={[3, 3, 0, 0]} />}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-1 text-[11px] text-rpg-muted">Barra clara = acumulado de mais de um dia sem snapshot no meio.</p>
    </Panel>
  );
}

function GamesTab({ games, onOpen }: { games: SteamGame[]; onOpen: (id: number) => void }) {
  const [term, setTerm] = useState("");
  const [sort, setSort] = useState<Sort>("total");
  const [onlyPlayed, setOnlyPlayed] = useState(true);
  const list = useMemo(() => {
    const pct = (g: SteamGame) => (g.achTotal ? (g.achUnlocked ?? 0) / g.achTotal : -1);
    const cmp: Record<Sort, (a: SteamGame, b: SteamGame) => number> = {
      total: (a, b) => b.totalMin - a.totalMin,
      recente: (a, b) => (b.lastPlayed ?? "").localeCompare(a.lastPlayed ?? ""),
      duas: (a, b) => b.recentMin - a.recentMin,
      conquistas: (a, b) => pct(b) - pct(a),
      nome: (a, b) => a.name.localeCompare(b.name, "pt-BR"),
    };
    return games.filter((g) => (!onlyPlayed || g.totalMin > 0) && g.name.toLowerCase().includes(term.trim().toLowerCase())).sort(cmp[sort]);
  }, [games, term, sort, onlyPlayed]);
  return (
    <section className="rpg-panel space-y-3 p-4" aria-label="Meus jogos">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[200px] flex-1">
          <span className="sr-only">Buscar jogo</span>
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-rpg-muted" aria-hidden />
          <input className={clsx(INPUT, "w-full pl-8")} style={R} placeholder="Buscar jogo…" value={term} onChange={(e) => setTerm(e.target.value)} />
        </label>
        <select aria-label="Ordenar" className={INPUT} style={R} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="total">Mais jogados</option>
          <option value="duas">Últimos 14 dias</option>
          <option value="recente">Jogados recentemente</option>
          <option value="conquistas">% de conquistas</option>
          <option value="nome">Nome</option>
        </select>
        <label className="flex items-center gap-2 text-xs text-rpg-muted">
          Só jogados <RPGSwitch checked={onlyPlayed} onChange={() => setOnlyPlayed(!onlyPlayed)} label="Mostrar só jogos já jogados" />
        </label>
      </div>
      {list.length === 0 ? (
        <EmptyNote>Nenhum jogo encontrado.</EmptyNote>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {list.map((g) => (
            <li key={g.appid}>
              <button type="button" onClick={() => onOpen(g.appid)} className="rpg-tile group flex h-full w-full flex-col overflow-hidden p-0 text-left transition hover:-translate-y-0.5 hover:brightness-110">
                <GameCover g={g} className="aspect-[460/215] w-full" />
                <div className="flex flex-1 flex-col gap-1.5 p-2.5">
                  <p className="truncate font-semibold text-rpg-text">{g.name}</p>
                  <p className="text-[11px] text-rpg-muted">
                    {hours(g.totalMin)} no total{g.recentMin ? ` · +${hours(g.recentMin)} em 14 dias` : ""}
                    {g.lastPlayed ? ` · jogado ${ago(g.lastPlayed)}` : ""}
                  </p>
                  <div className="mt-auto">
                    <AchBar g={g} />
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AchievementsTab({ o, onPin, onOpenGame }: { o: SteamOverview; onPin: (x: { appid: number; apiName: string; pin: boolean }) => void; onOpenGame: (id: number) => void }) {
  const [game, setGame] = useState<string>("");
  const [term, setTerm] = useState("");
  const [onlyPinned, setOnlyPinned] = useState(false);
  const all = o.recentAchievements ?? [];
  const gamesWith = useMemo(() => [...new Map(all.map((x) => [x.appid, x.game ?? `App ${x.appid}`])).entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR")), [all]);
  const list = all.filter((x) => (!game || String(x.appid) === game) && (!onlyPinned || x.pinned) && `${x.name} ${x.description ?? ""}`.toLowerCase().includes(term.trim().toLowerCase()));
  const completed = (o.games ?? []).filter((g) => g.achTotal && g.achUnlocked === g.achTotal);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatTile icon={<Trophy size={14} />} tone="text-rpg-gold" label="Conquistas" value={nf(all.length)} />
        <StatTile icon={<Gamepad2 size={14} />} tone="text-rpg-blue" label="Jogos com conquistas" value={nf(o.achievementSync?.withAchievements ?? 0)} />
        <StatTile icon={<Sparkles size={14} />} tone="text-rpg-gold-light" label="Jogos 100%" value={nf(completed.length)} hint={completed[0]?.name} />
        <StatTile icon={<Pin size={14} />} tone="text-rpg-purple" label="Fixadas na Coleção" value={nf(o.pinnedTrophies ?? 0)} />
      </div>
      <section className="rpg-panel space-y-3 p-4" aria-label="Todas as conquistas">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[200px] flex-1">
            <span className="sr-only">Buscar conquista</span>
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-rpg-muted" aria-hidden />
            <input className={clsx(INPUT, "w-full pl-8")} style={R} placeholder="Buscar conquista…" value={term} onChange={(e) => setTerm(e.target.value)} />
          </label>
          <select aria-label="Filtrar por jogo" className={INPUT} style={R} value={game} onChange={(e) => setGame(e.target.value)}>
            <option value="">Todos os jogos</option>
            {gamesWith.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-xs text-rpg-muted">
            Só fixadas <RPGSwitch checked={onlyPinned} onChange={() => setOnlyPinned(!onlyPinned)} label="Mostrar só fixadas" />
          </label>
          {game && (
            <RPGButton variant="ghost" onClick={() => onOpenGame(Number(game))}>
              Ver bloqueadas do jogo →
            </RPGButton>
          )}
        </div>
        {list.length === 0 ? (
          <EmptyNote>{all.length ? "Nenhuma conquista com esse filtro." : "Nenhuma conquista importada ainda. Veja o status da leitura acima."}</EmptyNote>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {list.slice(0, 150).map((x) => (
              <AchievementRow key={`${x.appid}-${x.apiName}`} x={x} onPin={onPin} />
            ))}
          </ul>
        )}
        <p className="text-[11px] text-rpg-muted">Conquistas desbloqueadas depois da conexão rendem +{o.xpRules?.perAchievement} XP (até {o.xpRules?.dailyCap} por dia). Fixar é só cosmético. Para ver as bloqueadas e a raridade, abra o jogo.</p>
      </section>
    </div>
  );
}

function BalanceTab({ o, onSettings }: { o: SteamOverview; onSettings: () => void }) {
  const b = o.balance!;
  const limitMin = b.weeklyLimitHours ? b.weeklyLimitHours * 60 : null;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <div className="space-y-4">
          <BalanceDonut b={b} />
          <Panel title="Meta pessoal" icon={<Scale size={17} className="text-rpg-pink" aria-hidden />} action={<button type="button" className="text-xs text-rpg-blue hover:underline" onClick={onSettings}>{limitMin ? "Alterar" : "Definir meta"}</button>}>
            {limitMin ? (
              <>
                <MeterRow label={`Até ${b.weeklyLimitHours} h de jogo por semana`} value={b.weekGameMin} max={limitMin} tone={b.weekGameMin > limitMin ? "bg-rose-400" : "bg-sky-400"} right={`${fmtMin(b.weekGameMin)} esta semana`} />
                <p className="mt-2 text-sm text-rpg-text">{b.weekGameMin > limitMin ? "Você passou da meta que definiu. Sem drama: ajuste o plano se fizer sentido." : "Dentro da meta que você definiu."}</p>
              </>
            ) : (
              <p className="text-sm text-rpg-muted">Sem meta definida. Se quiser, defina um limite semanal pessoal — é opcional.</p>
            )}
          </Panel>
        </div>
        <DailyChart o={o} />
      </div>
      <p className="text-[11px] text-rpg-muted">Tempo registrado no LifeOS: {b.productiveSources}.</p>
    </div>
  );
}

function GameModal({ appid, onClose, onPin }: { appid: number | null; onClose: () => void; onPin: (x: { appid: number; apiName: string; pin: boolean }) => void }) {
  const q = useSteamGame(appid);
  const [showLocked, setShowLocked] = useState(true);
  const g = q.data;
  const unlocked = g?.achievements.filter((a) => a.achieved).length ?? 0;
  const total = g?.achievements.length ?? 0;
  return (
    <Modal open={appid != null} onClose={onClose} title={g?.name ?? "Jogo"} size="lg">
      {q.isLoading ? (
        <p className="flex items-center gap-2 text-sm">
          <Spinner /> Buscando conquistas na Steam…
        </p>
      ) : q.isError || !g ? (
        <p className="text-sm text-rpg-red">{errMsg(q.error, "Não foi possível abrir o jogo.")}</p>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1.2fr_1fr]">
            <GameCover g={g} className="aspect-[460/215] w-full rounded" />
            <div className="space-y-1.5 text-sm">
              <p>
                <Clock size={13} className="mr-1 inline text-rpg-muted" aria-hidden />
                {hours(g.totalMin)} no total{g.recentMin ? ` · +${hours(g.recentMin)} em 14 dias` : ""}
              </p>
              {g.lastPlayed && <p className="text-xs text-rpg-muted">Última sessão {ago(g.lastPlayed)}</p>}
              {total > 0 && <MeterRow label="Conquistas" value={unlocked} max={total} tone={unlocked === total ? "bg-amber-400" : "bg-emerald-400"} right={`${unlocked}/${total} (${Math.round((unlocked / total) * 100)}%)`} />}
              <a href={g.storeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-rpg-blue hover:underline">
                Abrir na Steam <ExternalLink size={12} aria-hidden />
              </a>
            </div>
          </div>
          {g.status !== "ok" ? (
            <p className={clsx("rounded border p-3 text-sm", g.status === "sem_conquistas" ? "border-rpg-border text-rpg-muted" : "border-rpg-orange/60 text-rpg-orange")}>
              {g.error ?? "Este jogo não tem conquistas na Steam."}
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Conquistas</p>
                <label className="flex items-center gap-2 text-xs text-rpg-muted">
                  Mostrar bloqueadas <RPGSwitch checked={showLocked} onChange={() => setShowLocked(!showLocked)} label="Mostrar conquistas bloqueadas" />
                </label>
              </div>
              <ul className="grid max-h-[50vh] gap-1.5 overflow-auto sm:grid-cols-2">
                {g.achievements
                  .filter((x) => showLocked || x.achieved)
                  .map((x) => (
                    <li key={x.apiName} className={clsx("rpg-tile flex items-center gap-2 p-2", !x.achieved && "opacity-60")}>
                      {x.icon ? <img src={x.icon} alt="" className={clsx("h-10 w-10 shrink-0", !x.achieved && "grayscale")} style={R} /> : x.achieved ? <Trophy size={22} className="shrink-0 text-rpg-gold" aria-hidden /> : <Lock size={20} className="shrink-0 text-rpg-muted" aria-hidden />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-rpg-text">{x.name}</p>
                        <p className="truncate text-[11px] text-rpg-muted">
                          {x.description ?? (x.hidden ? (
                            <span className="inline-flex items-center gap-1">
                              <EyeOff size={11} aria-hidden /> Conquista secreta
                            </span>
                          ) : "")}
                        </p>
                        <p className="text-[10px] text-rpg-muted">
                          {x.achieved && x.unlockedAt ? `Desbloqueada em ${new Date(x.unlockedAt).toLocaleDateString("pt-BR")}` : "Bloqueada"}
                          {x.globalPct != null ? ` · ${x.globalPct}% dos jogadores` : ""}
                          {x.globalPct != null && x.globalPct < 10 ? " · rara" : ""}
                        </p>
                      </div>
                      {x.achieved && (
                        <button type="button" onClick={() => onPin({ appid: g.appid, apiName: x.apiName, pin: !x.pinned })} aria-pressed={x.pinned} aria-label={x.pinned ? "Remover da Coleção" : "Fixar na Coleção"} className={clsx("p-1", x.pinned ? "text-rpg-gold" : "text-rpg-muted hover:text-rpg-text")}>
                          {x.pinned ? <Pin size={15} /> : <PinOff size={15} />}
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

function SteamSettingsModal({ open, onClose, limit, achXp, onSave, onDisconnect }: { open: boolean; onClose: () => void; limit: number | null; achXp: boolean; onSave: (s: { weeklyLimitHours: number | null; achievementXp: boolean }) => void; onDisconnect: (deleteData: boolean) => void }) {
  const [l, setL] = useState(limit ? String(limit) : "");
  const [x, setX] = useState(achXp);
  const [del, setDel] = useState(false);
  useEffect(() => {
    setL(limit ? String(limit) : "");
    setX(achXp);
  }, [limit, achXp, open]);
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
