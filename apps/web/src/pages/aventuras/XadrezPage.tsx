import { useState } from "react";
import clsx from "clsx";
import { Crown, ExternalLink, KeyRound, Puzzle, Swords, Trophy, TrendingUp } from "lucide-react";
import { RPGButton } from "@/components/rpg";
import { AdventureHeader, BackToWorld, EmptyNote, INPUT, PageError, PageSkeleton, Panel, R, Spinner, StatTile, errMsg, nf } from "@/components/adventures/AdventureKit";
import { SyncBar, XpChip } from "@/components/integrations/IntegrationKit";
import { useLocalToast, type Notify } from "@/components/integrations/PublicApiKit";
import { useChess, useChessActions } from "@/hooks/useAdventuresMore";
import type { ChessDaily, ChessOverview } from "@/services/adventuresMoreService";

const PERF_LABEL: Record<string, string> = { bullet: "Bullet", blitz: "Blitz", rapid: "Rápida", classical: "Clássica", correspondence: "Correspondência", puzzle: "Puzzles" };
const RESULT: Record<string, { l: string; tone: string }> = { vitoria: { l: "V", tone: "border-rpg-green text-rpg-green" }, derrota: { l: "D", tone: "border-rpg-red text-rpg-red" }, empate: { l: "E", tone: "border-rpg-muted text-rpg-muted" } };
const TOKEN_URL = "https://lichess.org/account/oauth/token/create?scopes[]=puzzle:read&description=LifeOS%20-%20Arena%20de%20Xadrez";

/** Linha do rating (últimos pontos do histórico do Lichess). */
function RatingLine({ points }: { points: Array<{ day: string; rating: number }> }) {
  if (points.length < 2) return <p className="text-[11px] text-rpg-muted">Histórico curto demais para o gráfico.</p>;
  const vals = points.map((p) => p.rating);
  const min = Math.min(...vals);
  const span = Math.max(...vals) - min || 1;
  const W = 300;
  const H = 70;
  const xy = points.map((p, i) => [(i / (points.length - 1)) * W, H - 6 - ((p.rating - min) / span) * (H - 16)] as const);
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return (
    <figure aria-label={`Rating de ${first.rating} para ${last.rating}`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-20 w-full text-rpg-gold" preserveAspectRatio="none" aria-hidden>
        <polyline fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" points={xy.map(([x, y]) => `${x},${y}`).join(" ")} />
      </svg>
      <figcaption className="flex justify-between text-[10px] text-rpg-muted">
        <span>{first.day.split("-").reverse().join("/")} · {first.rating}</span>
        <span>
          {last.day.split("-").reverse().join("/")} · <b className="text-rpg-text">{last.rating}</b>
        </span>
      </figcaption>
    </figure>
  );
}

function DailyPuzzle({ d, hasToken, rules }: { d: ChessDaily; hasToken: boolean; rules: ChessOverview["rules"] }) {
  const [broken, setBroken] = useState(false);
  return (
    <Panel title="Puzzle do dia" icon={<Puzzle size={18} className="text-rpg-gold" />} action={d.solved ? <span className="text-xs font-bold text-rpg-green">Resolvido</span> : <XpChip xp={rules.daily} />}>
      <div className="flex flex-col gap-3 sm:flex-row">
        {d.imageUrl && !broken ? (
          <img src={d.imageUrl} alt="Posição do puzzle do dia" className="aspect-square w-full max-w-[220px] self-center border-2 border-rpg-border" style={R} onError={() => setBroken(true)} />
        ) : (
          <div className="grid aspect-square w-full max-w-[220px] grid-cols-8 self-center border-2 border-rpg-border" style={R} aria-hidden>
            {Array.from({ length: 64 }, (_, i) => (
              <span key={i} className={(Math.floor(i / 8) + i) % 2 ? "bg-[#7a5b3a]" : "bg-[#e8d3a8]"} />
            ))}
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-2 text-sm">
          <p className="text-rpg-muted">
            Rating <b className="text-rpg-text">{d.rating ?? "—"}</b> · {d.plays != null ? `${nf(d.plays)} tentativas` : ""}
            {d.perf ? ` · ${d.perf}` : ""}
          </p>
          {d.themes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {d.themes.map((t) => (
                <span key={t} className="border border-rpg-border bg-rpg-bg-2 px-1.5 text-[10px] text-rpg-muted" style={{ borderRadius: 3 }}>
                  {t}
                </span>
              ))}
            </div>
          )}
          <a href={d.url} target="_blank" rel="noreferrer noopener" className="rpg-btn rpg-btn-gold inline-flex items-center gap-1 text-sm">
            Resolver no Lichess <ExternalLink size={13} aria-hidden />
          </a>
          <p className="text-[11px] text-rpg-muted">
            {hasToken ? `Resolveu? O LifeOS confere no seu histórico de puzzles e paga +${rules.daily} XP.` : "Para o LifeOS confirmar os puzzles resolvidos, adicione um token pessoal (só leitura de puzzles)."}
          </p>
        </div>
      </div>
    </Panel>
  );
}

function ConnectForm({ notify }: { notify: Notify }) {
  const a = useChessActions();
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");
  const ok = /^[A-Za-z0-9_-]{2,30}$/.test(username.trim());
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        a.connect.mutate(
          { username: username.trim(), token: token.trim() || null },
          {
            onSuccess: (r) => notify(r.sync.ok ? `Arena ligada ao Lichess (${r.username}).` : `Conectado, mas a leitura falhou: ${r.sync.error}`, r.sync.ok ? "success" : "error"),
            onError: (err) => notify(errMsg(err, "Não foi possível conectar o Lichess."), "error"),
          },
        );
      }}
    >
      <label className="block text-xs font-semibold text-rpg-text" htmlFor="lichess-user">
        Seu usuário no Lichess
        <input id="lichess-user" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ex.: viniciuskanh" className={clsx(INPUT, "mt-1 w-full font-normal")} style={R} autoComplete="off" />
      </label>
      <label className="block text-xs font-semibold text-rpg-text" htmlFor="lichess-token">
        <span className="flex items-center gap-1">
          <KeyRound size={12} className="text-rpg-gold" aria-hidden /> Token pessoal (opcional, para os puzzles)
        </span>
        <input id="lichess-token" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="lip_…" className={clsx(INPUT, "mt-1 w-full font-mono font-normal")} style={R} autoComplete="off" />
      </label>
      <p className="text-[11px] text-rpg-muted">
        Partidas e rating são públicos. O token só libera o histórico de puzzles:{" "}
        <a href={TOKEN_URL} target="_blank" rel="noreferrer noopener" className="text-rpg-blue underline">
          gerar token só com leitura de puzzles
        </a>
        . Ele fica criptografado no servidor.
      </p>
      <RPGButton type="submit" variant="gold" disabled={!ok || a.connect.isPending} className="w-full justify-center text-sm">
        {a.connect.isPending ? <Spinner /> : <Swords size={15} aria-hidden />} Entrar na Arena
      </RPGButton>
    </form>
  );
}

/** Adiciona o token sem desconectar (mesmo usuário: o histórico e a data de conexão ficam). */
function AddToken({ username, notify }: { username: string; notify: Notify }) {
  const a = useChessActions();
  const [token, setToken] = useState("");
  return (
    <form
      className="mt-2 flex flex-col gap-2 border-t border-rpg-border/50 pt-2 sm:flex-row sm:items-center"
      onSubmit={(e) => {
        e.preventDefault();
        if (!token.trim()) return;
        a.connect.mutate({ username, token: token.trim() }, { onSuccess: () => (notify("Token salvo: os puzzles agora contam."), setToken("")), onError: (err) => notify(errMsg(err, "Token recusado."), "error") });
      }}
    >
      <p className="min-w-0 flex-1 text-[11px] text-rpg-muted">
        Sem token, os puzzles não contam.{" "}
        <a href={TOKEN_URL} target="_blank" rel="noreferrer noopener" className="text-rpg-blue underline">
          Gerar token (só leitura de puzzles)
        </a>
      </p>
      <label className="sr-only" htmlFor="lichess-token-add">
        Token pessoal do Lichess
      </label>
      <input id="lichess-token-add" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="lip_…" className={clsx(INPUT, "py-1 font-mono sm:w-48")} style={R} autoComplete="off" />
      <RPGButton type="submit" variant="secondary" className="text-xs" disabled={!token.trim() || a.connect.isPending}>
        Salvar token
      </RPGButton>
    </form>
  );
}

/**
 * Arena de Xadrez — perfil, partidas e puzzles do Lichess viram XP:
 * vitórias, puzzles, puzzle do dia e recordes de rating.
 */
export function XadrezPage() {
  const q = useChess();
  const a = useChessActions();
  const [notify, toast] = useLocalToast();
  if (q.isLoading) return <PageSkeleton />;
  if (q.isError || !q.data) return <PageError what="a Arena de Xadrez" onRetry={() => void q.refetch()} />;
  const o = q.data;
  return (
    <div className="space-y-4 px-3 py-4 sm:px-4 md:px-6">
      <BackToWorld />
      <AdventureHeader icon={<Crown size={40} className="text-rpg-gold" />} title="Arena de Xadrez" subtitle="Suas partidas e puzzles do Lichess viram experiência. Vitórias, recordes de rating e o puzzle do dia rendem XP.">
        {o.connected && <XpChip xp={o.xpTotal} className="text-[11px]" />}
      </AdventureHeader>

      {!o.connected ? (
        <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          <Panel title="Conectar o Lichess" icon={<Swords size={18} className="text-rpg-gold" />}>
            <ConnectForm notify={notify} />
          </Panel>
          <div className="space-y-3">
            <Panel title="Como a Arena paga">
              <ul className="space-y-1.5 text-xs text-rpg-muted">
                <li><b className="text-rpg-text">+{o.rules.win} XP e {o.rules.winCoins} moeda</b> por vitória ranqueada (até {o.rules.winCap} por dia); empate +{o.rules.draw}.</li>
                <li><b className="text-rpg-text">+{o.rules.puzzle} XP</b> por puzzle resolvido (até {o.rules.puzzleCap} por dia) e <b className="text-rpg-text">+{o.rules.daily}</b> pelo puzzle do dia.</li>
                <li><b className="text-rpg-text">+{o.rules.record} XP</b> a cada nova centena de rating (recorde pessoal).</li>
                <li>Só conta o que você jogar depois de conectar. Conquistas: Peão Promovido, Tático Afiado, Cavaleiro de 1500 e mais.</li>
              </ul>
            </Panel>
            {o.daily && <DailyPuzzle d={o.daily} hasToken={false} rules={o.rules} />}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 [&>*]:min-w-0">
            {o.perfs.slice(0, 4).map((p) => (
              <StatTile
                key={p.key}
                icon={<TrendingUp size={14} />}
                tone="text-rpg-gold"
                value={p.rating ?? "—"}
                label={PERF_LABEL[p.key] ?? p.key}
                hint={<span className={p.prog > 0 ? "text-rpg-green" : p.prog < 0 ? "text-rpg-red" : ""}>{p.provisional ? "provisório · " : ""}{p.prog > 0 ? `+${p.prog}` : p.prog} recente · {nf(p.games)} jogos</span>}
              />
            ))}
            <StatTile icon={<Trophy size={14} />} tone="text-rpg-green" value={nf(o.lifetime.win)} label="Vitórias" hint={`${nf(o.lifetime.all)} partidas no total`} />
            <StatTile icon={<Puzzle size={14} />} tone="text-rpg-purple" value={o.puzzles.solved} label="Puzzles resolvidos" hint={o.account.hasToken ? `${o.puzzles.today} hoje` : "adicione o token para contar"} />
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] [&>*]:min-w-0">
            <div className="space-y-4">
              {o.daily && <DailyPuzzle d={o.daily} hasToken={o.account.hasToken} rules={o.rules} />}
              <Panel title="Evolução do rating" icon={<TrendingUp size={18} className="text-rpg-gold" />}>
                {o.history.length === 0 ? (
                  <EmptyNote>Jogue partidas ranqueadas para ver a evolução.</EmptyNote>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
                    {o.history.slice(0, 2).map((h) => (
                      <div key={h.name}>
                        <p className="mb-1 text-xs font-semibold text-rpg-text">{h.name}</p>
                        <RatingLine points={h.points} />
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
            <Panel title="Partidas recentes" icon={<Swords size={18} className="text-rpg-gold" />}>
              {o.games.length === 0 ? (
                <EmptyNote>Nenhuma partida registrada ainda.</EmptyNote>
              ) : (
                <ul>
                  {o.games.map((g) => (
                    <li key={g.id} className="flex min-w-0 items-center gap-2 border-b border-dashed border-rpg-border/60 py-1.5">
                      <span className={clsx("flex h-6 w-6 shrink-0 items-center justify-center border text-[11px] font-bold", RESULT[g.result]?.tone)} style={R} aria-label={g.result}>
                        {RESULT[g.result]?.l}
                      </span>
                      <a href={g.url} target="_blank" rel="noreferrer noopener" className="min-w-0 flex-1 truncate text-xs text-rpg-text hover:underline" title={g.opening ?? undefined}>
                        vs. {g.opponent ?? "?"}
                        {g.opponentRating ? ` (${g.opponentRating})` : ""}
                        {g.opening ? <span className="text-rpg-muted"> · {g.opening}</span> : null}
                      </a>
                      <span className="shrink-0 text-[10px] text-rpg-muted">{g.speed ?? ""}</span>
                      {g.ratingDiff != null && <span className={clsx("w-8 shrink-0 text-right text-[11px] tabular-nums", g.ratingDiff > 0 ? "text-rpg-green" : g.ratingDiff < 0 ? "text-rpg-red" : "text-rpg-muted")}>{g.ratingDiff > 0 ? `+${g.ratingDiff}` : g.ratingDiff}</span>}
                    </li>
                  ))}
                </ul>
              )}
              <a href={o.account.url} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex items-center gap-1 text-[11px] text-rpg-blue hover:underline">
                Perfil {o.account.username} no Lichess <ExternalLink size={10} aria-hidden />
              </a>
            </Panel>
          </div>

          <section className="rpg-panel p-3" aria-label="Sincronização com o Lichess">
            <SyncBar
              status={o.account.lastSyncStatus}
              lastSyncAt={o.account.lastSyncAt}
              error={o.account.lastSyncError}
              busy={a.sync.isPending}
              onSync={() => a.sync.mutate(undefined, { onSuccess: (r) => notify(r.records.length ? `Recorde! ${r.records.join(", ")} (+${r.xp} XP).` : r.xp ? `Arena atualizada: +${r.xp} XP.` : "Tudo em dia na Arena."), onError: (e) => notify(errMsg(e, "Falha ao sincronizar."), "error") })}
              onDisconnect={() => a.disconnect.mutate(undefined, { onSuccess: () => notify("Lichess desconectado. Partidas e XP continuam.") })}
              disconnecting={a.disconnect.isPending}
              keepNote="As partidas, os puzzles e o XP já registrados continuam."
            />
            {!o.account.hasToken && <AddToken username={o.account.username} notify={notify} />}
          </section>
        </>
      )}
      {toast}
    </div>
  );
}
