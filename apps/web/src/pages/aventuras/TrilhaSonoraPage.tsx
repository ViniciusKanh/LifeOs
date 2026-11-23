import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, BookOpen, CheckCircle2, Clock, Code2, ExternalLink, GraduationCap, Headphones, History, Link2, ListMusic, Lock, Music, Pause, Play, Plus, RefreshCw, SkipBack, SkipForward, Sparkles, Square, Target, Trash2, Unplug, Zap, FolderKanban } from "lucide-react";
import { RPGButton, RPGSwitch, RPGToast } from "@/components/rpg";
import { Modal } from "@/components/ui/Modal";
import { PixelScene } from "@/components/living-world/PixelScene";
import { drawTavernMusicScene, type PetLook } from "@/components/living-world/engine/adventureScenes";
import { DEFAULT_AVATAR_LOOK, normalizeLook } from "@/components/living-world/engine/looks";
import { useLivingWorld } from "@/hooks/useLivingWorld";
import { useAdventureWorld, useNowPlaying, useSpotify, useSpotifyActions } from "@/hooks/useAdventures";
import { adventuresService, type MusicSessionKind, type SpotifyOverview } from "@/services/adventuresService";
import { AdventureHeader, BackToWorld, EmptyNote, PageError, PageSkeleton, Panel, R, StatTile, StatusPill, ago, errMsg, fmtMin, nf, useConnect, useIntegrationReturn, Spinner } from "@/components/adventures/AdventureKit";

const KINDS: Record<MusicSessionKind, { label: string; icon: typeof Target }> = {
  foco: { label: "Foco", icon: Target },
  estudos: { label: "Estudos", icon: BookOpen },
  dissertacao: { label: "Dissertação", icon: GraduationCap },
  codigo: { label: "Código", icon: Code2 },
  leitura: { label: "Leitura", icon: BookOpen },
  projeto: { label: "Projeto", icon: FolderKanban },
};
const SLOTS: Record<string, string> = { foco: "Foco Profundo", codigo: "Codando na Vila", estudos: "Estudos & Leitura", leitura: "Leitura", relaxar: "Relaxamento", missoes: "Missões", descanso: "Descanso" };

function useElapsed(startedAt: string | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [startedAt]);
  return startedAt ? Math.max(0, Math.round((now - Date.parse(startedAt)) / 60000)) : 0;
}

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

export function TrilhaSonoraPage() {
  const q = useSpotify();
  const a = useSpotifyActions();
  const world = useLivingWorld();
  const adv = useAdventureWorld();
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);
  const [kind, setKind] = useState<MusicSessionKind>("foco");
  const [slotOpen, setSlotOpen] = useState<string | null>(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const notify = (msg: string, tone: "success" | "error" = "success") => setToast({ msg, tone });
  useIntegrationReturn(notify, "Spotify");
  const connect = useConnect(adventuresService.spotifyConnect, notify);
  const o = q.data;
  const np = useNowPlaying(Boolean(o?.connection));
  const now = np.data?.nowPlaying ?? null;
  const elapsed = useElapsed(o?.openSession?.startedAt);
  const hero = useMemo(() => normalizeLook(world.data?.avatar ?? {}, DEFAULT_AVATAR_LOOK), [world.data?.avatar]);
  const pet: PetLook | null = adv.data?.companion ? { color: adv.data.companion.color, mood: adv.data.companion.mood, stage: adv.data.companion.stage, appearance: adv.data.companion.appearance } : null;
  const playing = Boolean(now?.isPlaying);
  const draw = useMemo(() => (ctx: CanvasRenderingContext2D, t: number, still: boolean) => drawTavernMusicScene(ctx, t, { playing, hero, pet, still }), [playing, hero, pet]);

  if (q.isError) return <PageError what="a Trilha Sonora" onRetry={() => void q.refetch()} />;
  if (!o) return <PageSkeleton />;
  const c = o.connection;
  const control = (act: "play" | "pause" | "next" | "previous") => a.player.mutate(act, { onError: (e) => notify(errMsg(e, "Controle indisponível."), "error") });
  const setting = (k: keyof SpotifyOverview["settings"]) => a.settings.mutate({ [k]: !o.settings[k] }, { onError: (e) => notify(errMsg(e, "Não foi possível salvar."), "error") });
  const ins = o.insight;

  return (
    <div className="space-y-4 px-3 py-4 sm:px-4 md:px-6">
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
      <BackToWorld />
      <AdventureHeader icon={<Music size={40} className="text-rpg-green" />} title="Trilha Sonora do Herói" subtitle="Suas músicas no Spotify, ligadas às sessões de foco, estudo e código — e tocando na Taverna da Vila.">
        <StatusPill state={c ? "ok" : o.configured ? "off" : "config"} label={c ? "Spotify conectado" : o.configured ? "Spotify desconectado" : "Spotify não configurado"} detail={c?.displayName ?? (c ? null : "Sessões funcionam sem ele")} />
        {c && (
          <StatusPill
            state={c.lastError ? "warn" : "ok"}
            label="Última sincronização"
            detail={c.lastError ?? (c.lastSyncAt ? ago(c.lastSyncAt) : "nunca")}
            onClick={() => a.sync.mutate(undefined, { onSuccess: (r) => notify(r.added ? `${r.added} faixa(s) nova(s) observada(s).` : "Nenhuma faixa nova."), onError: (e) => notify(errMsg(e, "Falha ao sincronizar."), "error") })}
          />
        )}
      </AdventureHeader>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <section className="rpg-panel relative overflow-hidden p-0" aria-label="Taverna do Herói">
          <div className="aspect-[16/9] w-full">
            <PixelScene draw={draw} label={playing ? "Taverna: herói ouvindo música" : "Taverna do Herói"} />
          </div>
          <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-3 border-2 border-rpg-border bg-rpg-bg/90 p-2.5" style={R}>
            {!c ? (
              <div className="flex w-full flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-rpg-text">{o.configured ? "Conecte o Spotify para ver o que está tocando." : "O administrador ainda não configurou o Spotify. As sessões abaixo já funcionam."}</span>
                {o.configured && (
                  <RPGButton variant="success" onClick={() => void connect.go()} disabled={connect.busy}>
                    {connect.busy ? <Spinner /> : <Link2 size={15} aria-hidden />} Conectar Spotify
                  </RPGButton>
                )}
              </div>
            ) : !now ? (
              <p className="text-sm text-rpg-muted">Nada tocando agora. Abra o Spotify em qualquer aparelho.</p>
            ) : (
              <>
                {now.image && !o.settings.privateMode ? <img src={now.image} alt="" className="h-12 w-12 shrink-0 object-cover" style={R} /> : <Music size={32} className="shrink-0 text-rpg-green" aria-hidden />}
                <div className="min-w-[120px] flex-1">
                  <p className="truncate font-semibold text-rpg-text">{o.settings.privateMode ? "Faixa oculta (modo privado)" : now.track}</p>
                  <p className="truncate text-xs text-rpg-muted">{o.settings.privateMode ? "—" : now.artists.join(", ")}</p>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-rpg-muted">
                    <span>{mmss(now.progressMs)}</span>
                    <div className="h-1.5 flex-1 overflow-hidden bg-rpg-bg-2" style={R}>
                      <div className="h-full bg-rpg-green" style={{ width: `${(now.progressMs / Math.max(1, now.durationMs)) * 100}%` }} />
                    </div>
                    <span>{mmss(now.durationMs)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => control("previous")} aria-label="Faixa anterior" className="p-1.5 text-rpg-text hover:text-rpg-green" disabled={!c.premium}>
                    <SkipBack size={18} />
                  </button>
                  <button type="button" onClick={() => control(now.isPlaying ? "pause" : "play")} aria-label={now.isPlaying ? "Pausar" : "Tocar"} className="rounded-full border-2 border-rpg-green p-2 text-rpg-green hover:bg-rpg-green/10" disabled={!c.premium}>
                    {now.isPlaying ? <Pause size={18} /> : <Play size={18} />}
                  </button>
                  <button type="button" onClick={() => control("next")} aria-label="Próxima faixa" className="p-1.5 text-rpg-text hover:text-rpg-green" disabled={!c.premium}>
                    <SkipForward size={18} />
                  </button>
                  <a href={now.url} target="_blank" rel="noreferrer" className="p-1.5 text-rpg-muted hover:text-rpg-text" aria-label="Abrir no Spotify">
                    <ExternalLink size={16} />
                  </a>
                </div>
                {!c.premium && <p className="w-full text-[10px] text-rpg-muted">Controles de reprodução exigem Spotify Premium. Use o app do Spotify para trocar de faixa.</p>}
              </>
            )}
          </div>
        </section>

        <div className="space-y-4">
          <Panel title="Sessão atual" icon={<Headphones size={17} className="text-rpg-purple" aria-hidden />}>
            {o.openSession ? (
              <>
                <p className="mb-2 text-sm text-rpg-text">
                  Em andamento: <strong>{KINDS[o.openSession.kind].label}</strong> desde {new Date(o.openSession.startedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rpg-tile p-2">
                    <Clock size={15} className="mx-auto text-rpg-muted" aria-hidden />
                    <p className="font-rpg text-lg font-bold">{fmtMin(elapsed)}</p>
                    <p className="text-[10px] text-rpg-muted">duração</p>
                  </div>
                  <div className="rpg-tile p-2">
                    <CheckCircle2 size={15} className="mx-auto text-rpg-green" aria-hidden />
                    <p className="font-rpg text-lg font-bold">{o.openSession.tasks}</p>
                    <p className="text-[10px] text-rpg-muted">tarefas concluídas</p>
                  </div>
                  <div className="rpg-tile p-2">
                    <Music size={15} className="mx-auto text-rpg-purple" aria-hidden />
                    <p className="font-rpg text-lg font-bold">{o.openSession.plays}</p>
                    <p className="text-[10px] text-rpg-muted">faixas observadas</p>
                  </div>
                </div>
                <RPGButton variant="danger" className="mt-3 w-full" disabled={a.stop.isPending} onClick={() => a.stop.mutate(undefined, { onSuccess: () => notify("Sessão encerrada e registrada."), onError: (e) => notify(errMsg(e, "Falha ao encerrar."), "error") })}>
                  <Square size={14} aria-hidden /> Encerrar sessão
                </RPGButton>
              </>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo de sessão">
                  {o.sessionKinds.map((k) => {
                    const K = KINDS[k];
                    return (
                      <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={clsx("flex items-center gap-1 border-2 px-2.5 py-1 text-xs", kind === k ? "border-rpg-purple bg-rpg-purple/15 text-rpg-text" : "border-rpg-border text-rpg-muted")} style={R}>
                        <K.icon size={13} aria-hidden /> {K.label}
                      </button>
                    );
                  })}
                </div>
                <RPGButton className="w-full" disabled={a.start.isPending} onClick={() => a.start.mutate(kind, { onSuccess: () => notify(`Sessão de ${KINDS[kind].label.toLowerCase()} iniciada.`), onError: (e) => notify(errMsg(e, "Falha ao iniciar."), "error") })}>
                  <Play size={15} aria-hidden /> Iniciar sessão
                </RPGButton>
                <p className="mt-2 text-[11px] text-rpg-muted">Durante a sessão, as tarefas concluídas e as faixas tocadas (se o Spotify estiver conectado) são ligadas a ela. Sessões de 25 min ou mais dão +10 XP (até 3 por dia).</p>
              </>
            )}
          </Panel>

          <section className="rpg-panel border-rpg-purple/60 p-4" aria-label="Insight da Trilha">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-rpg text-lg font-bold text-rpg-text">
                <Sparkles size={17} className="text-rpg-purple" aria-hidden /> Insight da Trilha
              </h2>
              <span className="border border-rpg-purple/60 px-1.5 text-[10px] text-rpg-purple" style={R}>
                dados reais
              </span>
            </div>
            {!ins ? (
              <p className="text-sm text-rpg-muted">Insights desativados nas configurações de privacidade.</p>
            ) : ins.sufficient ? (
              <>
                <p className="font-rpg text-lg font-bold leading-snug text-rpg-text">{ins.message}</p>
                <p className="mt-1 text-xs text-rpg-muted">
                  {ins.tasksPerHourWith} vs {ins.tasksPerHourWithout} tarefas/h · {ins.withMusic} sessões com música e {ins.withoutMusic} sem.
                  {ins.durationCaveat ? " As durações médias são bem diferentes, o que pesa na comparação." : ""}
                </p>
                {ins.genres.length > 0 && <p className="mt-1 text-xs text-rpg-text">Gênero com mais tarefas/h: {ins.genres[0]!.genre} ({ins.genres[0]!.tasksPerHour}/h, {ins.genres[0]!.sessions} sessões).</p>}
                <p className="mt-2 text-[11px] italic text-rpg-muted">{ins.caveat}</p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-rpg-text">{ins.message}</p>
                <p className="mt-1 text-xs text-rpg-muted">{ins.need}</p>
                <p className="mt-1 text-xs text-rpg-muted">
                  Hoje: {ins.withMusic} com música · {ins.withoutMusic} sem música.
                </p>
              </>
            )}
          </section>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr_1.2fr]">
        <Panel title="Gêneros e produtividade (30 dias)" icon={<BarChart3 size={17} className="text-rpg-purple" aria-hidden />}>
          {o.genres.length === 0 ? (
            <EmptyNote>{o.settings.stats ? "Sem faixas observadas ainda." : "Estatísticas desativadas."}</EmptyNote>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={o.genres} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#ffffff14" vertical={false} />
                  <XAxis dataKey="genre" tick={{ fill: "#a9a3c2", fontSize: 10 }} interval={0} tickFormatter={(v: string) => (v.length > 10 ? `${v.slice(0, 9)}…` : v)} />
                  <YAxis yAxisId="l" tick={{ fill: "#a9a3c2", fontSize: 10 }} allowDecimals={false} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fill: "#a9a3c2", fontSize: 10 }} hide />
                  <Tooltip contentStyle={{ background: "#1d1a2e", border: "1px solid #3b3657", fontSize: 12 }} formatter={(v: number, n: string) => [v ?? "—", n === "plays" ? "Faixas" : "Tarefas/h nas sessões"]} />
                  <Bar yAxisId="l" dataKey="plays" fill="#A875F5" radius={[3, 3, 0, 0]} />
                  <Line yAxisId="r" dataKey="tasksPerHour" stroke="#4FD49A" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="mt-1 text-[11px] text-rpg-muted">Gênero vem do artista no Spotify; quando não informado, aparece como “Sem gênero informado”.</p>
        </Panel>

        <Panel title="Resumo do período" icon={<Zap size={17} className="text-rpg-gold-light" aria-hidden />}>
          <div className="grid grid-cols-2 gap-2">
            <StatTile icon={<Music size={14} />} tone="text-rpg-green" label="Tempo ouvido" value={o.summary.listenedMin == null ? "—" : fmtMin(o.summary.listenedMin)} />
            <StatTile icon={<CheckCircle2 size={14} />} tone="text-rpg-green" label="Tarefas nas sessões" value={nf(o.summary.tasksInSessions)} />
            <StatTile icon={<Target size={14} />} tone="text-rpg-purple" label="Sessões" value={nf(o.summary.sessions)} hint={`${o.summary.sessionsWithMusic} com música`} />
            <StatTile icon={<Clock size={14} />} tone="text-rpg-gold-light" label="Duração média" value={fmtMin(o.summary.avgSessionMin)} />
          </div>
          <p className="mt-2 text-[11px] text-rpg-muted">{o.summary.coverageNote}</p>
        </Panel>

        <Panel title="Histórico de sessões" icon={<History size={17} className="text-rpg-blue" aria-hidden />}>
          {o.sessions.length === 0 ? (
            <EmptyNote>Inicie uma sessão para começar o histórico.</EmptyNote>
          ) : (
            <ul className="max-h-64 space-y-1.5 overflow-auto">
              {o.sessions.map((s) => (
                <li key={s.id} className="rpg-tile flex items-center gap-2 p-2">
                  {s.cover ? <img src={s.cover} alt="" className="h-9 w-9 shrink-0 object-cover" style={R} /> : <Headphones size={22} className="shrink-0 text-rpg-purple" aria-hidden />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-rpg-text">{s.topGenre ?? (s.withMusic ? "Música" : "Sem música")}{s.topArtist ? ` · ${s.topArtist}` : ""}</p>
                    <p className="text-[11px] text-rpg-muted">
                      {new Date(s.startedAt).toLocaleString("pt-BR", { weekday: "short", hour: "2-digit", minute: "2-digit" })} · {KINDS[s.kind]?.label} ({fmtMin(s.minutes)}){s.endedAt ? "" : " · em andamento"}
                    </p>
                  </div>
                  <span className="shrink-0 border border-rpg-green/60 bg-rpg-green/10 px-1.5 py-0.5 text-[11px] text-rpg-green" style={R}>
                    ✓ {s.tasks} tarefa(s)
                  </span>
                  <button type="button" aria-label="Excluir sessão" className="text-rpg-muted hover:text-rpg-red" onClick={() => a.deleteSession.mutate(s.id)}>
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Playlists da Jornada" icon={<ListMusic size={17} className="text-rpg-green" aria-hidden />}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {["foco", "codigo", "estudos", "descanso"].map((slot) => {
              const p = o.playlists.find((x) => x.slot === slot);
              return (
                <div key={slot} className="rpg-tile overflow-hidden p-0">
                  <div className="flex h-20 items-center justify-center bg-gradient-to-br from-violet-900/70 to-emerald-900/50">
                    {p?.image ? <img src={p.image} alt="" className="h-full w-full object-cover" /> : <ListMusic size={28} className="text-rpg-muted" aria-hidden />}
                  </div>
                  <div className="space-y-1 p-2">
                    <p className="text-xs font-semibold text-rpg-text">{SLOTS[slot]}</p>
                    <p className="truncate text-[11px] text-rpg-muted">{p?.name ?? "Nenhuma escolhida"}</p>
                    <div className="flex gap-1">
                      {p?.url && (
                        <a href={p.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[11px] text-rpg-green hover:underline">
                          <Play size={11} aria-hidden /> Abrir
                        </a>
                      )}
                      {c && (
                        <button type="button" className="ml-auto text-[11px] text-rpg-blue hover:underline" onClick={() => setSlotOpen(slot)}>
                          {p ? "Trocar" : <span className="flex items-center gap-0.5"><Plus size={11} /> Escolher</span>}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {!c && <p className="mt-2 text-[11px] text-rpg-muted">Conecte o Spotify para ligar suas playlists às atividades.</p>}
        </Panel>

        <Panel title="Configurações e privacidade" icon={<Lock size={17} className="text-rpg-muted" aria-hidden />}>
          {!c ? (
            <p className="text-sm text-rpg-muted">Sem Spotify conectado, nenhum dado musical é coletado.</p>
          ) : (
            <>
              <div className="space-y-2">
                {([
                  ["recordHistory", "Registrar histórico de escutas"],
                  ["linkSessions", "Ligar músicas às sessões"],
                  ["stats", "Gerar estatísticas"],
                  ["insights", "Mostrar insights"],
                  ["privateMode", "Modo privado (ocultar faixas)"],
                ] as const).map(([k, label]) => (
                  <div key={k} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-rpg-text">{label}</span>
                    <RPGSwitch checked={o.settings[k]} onChange={() => setting(k)} label={label} />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <RPGButton variant="secondary" onClick={() => a.sync.mutate(undefined, { onSuccess: () => notify("Sincronizado."), onError: (e) => notify(errMsg(e, "Falha."), "error") })} disabled={a.sync.isPending}>
                  <RefreshCw size={14} aria-hidden /> Sincronizar
                </RPGButton>
                <RPGButton variant="secondary" onClick={() => a.deleteHistory.mutate(undefined, { onSuccess: () => notify("Histórico de escutas apagado.") })}>
                  <Trash2 size={14} aria-hidden /> Apagar histórico
                </RPGButton>
                <RPGButton variant="danger" onClick={() => setDisconnectOpen(true)}>
                  <Unplug size={14} aria-hidden /> Desconectar
                </RPGButton>
              </div>
            </>
          )}
        </Panel>
      </div>

      <PlaylistPicker slot={slotOpen} onClose={() => setSlotOpen(null)} onPick={(slot, p) => a.playlist.mutate({ slot, playlist: p }, { onSuccess: () => { setSlotOpen(null); notify("Playlist da jornada salva."); }, onError: (e) => notify(errMsg(e, "Não foi possível salvar."), "error") })} />
      <Modal open={disconnectOpen} onClose={() => setDisconnectOpen(false)} title="Desconectar Spotify">
        <DisconnectBody onCancel={() => setDisconnectOpen(false)} busy={a.disconnect.isPending} onConfirm={(del) => a.disconnect.mutate(del, { onSuccess: () => { setDisconnectOpen(false); notify("Spotify desconectado. Para revogar de vez, remova o LifeOS em spotify.com/account/apps."); } })} />
      </Modal>
    </div>
  );
}

function DisconnectBody({ onCancel, onConfirm, busy }: { onCancel: () => void; onConfirm: (deleteData: boolean) => void; busy: boolean }) {
  const [del, setDel] = useState(false);
  return (
    <div className="space-y-3 text-sm">
      <p>O LifeOS para de ler o Spotify. As sessões continuam funcionando sem música.</p>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={del} onChange={(e) => setDel(e.target.checked)} /> Apagar também o histórico de escutas e as playlists da jornada
      </label>
      <div className="flex justify-end gap-2">
        <RPGButton variant="ghost" onClick={onCancel}>
          Cancelar
        </RPGButton>
        <RPGButton variant="danger" disabled={busy} onClick={() => onConfirm(del)}>
          Desconectar
        </RPGButton>
      </div>
    </div>
  );
}

function PlaylistPicker({ slot, onClose, onPick }: { slot: string | null; onClose: () => void; onPick: (slot: string, p: { id: string; name: string; image: string | null; url: string } | null) => void }) {
  const [list, setList] = useState<Array<{ id: string; name: string; image: string | null; url: string; tracks: number | null }> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!slot) return;
    setList(null);
    setErr(null);
    adventuresService.userPlaylists().then((r) => setList(r.playlists), (e) => setErr(errMsg(e, "Não foi possível listar suas playlists.")));
  }, [slot]);
  return (
    <Modal open={!!slot} onClose={onClose} title={`Playlist para ${slot ? SLOTS[slot] : ""}`}>
      {err ? (
        <p className="text-sm text-rpg-red">{err}</p>
      ) : !list ? (
        <p className="flex items-center gap-2 text-sm"><Spinner /> Carregando…</p>
      ) : list.length === 0 ? (
        <EmptyNote>Nenhuma playlist encontrada na sua conta.</EmptyNote>
      ) : (
        <ul className="max-h-80 space-y-1 overflow-auto">
          {list.map((p) => (
            <li key={p.id}>
              <button type="button" className="flex w-full items-center gap-2 p-1.5 text-left text-sm hover:bg-rpg-bg-2" style={R} onClick={() => slot && onPick(slot, p)}>
                {p.image ? <img src={p.image} alt="" className="h-8 w-8 object-cover" /> : <ListMusic size={20} aria-hidden />}
                <span className="flex-1 truncate">{p.name}</span>
                {p.tracks != null && <span className="text-xs text-rpg-muted">{p.tracks} faixas</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {slot && (
        <button type="button" className="mt-2 text-xs text-rpg-red hover:underline" onClick={() => onPick(slot, null)}>
          Remover playlist deste espaço
        </button>
      )}
    </Modal>
  );
}
