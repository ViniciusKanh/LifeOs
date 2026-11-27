import { useEffect, useState } from "react";
import clsx from "clsx";
import { CalendarClock, Crown, ExternalLink, KeyRound, Skull, Star, Trophy } from "lucide-react";
import { RPGButton, RPGProgressBar } from "@/components/rpg";
import { EmptyNote, INPUT, R, Spinner, errMsg } from "@/components/adventures/AdventureKit";
import { IntegrationBanner, SyncBar, XpChip } from "@/components/integrations/IntegrationKit";
import { useAocActions, useAoc } from "@/hooks/useAdventuresMore";
import type { AocOverview } from "@/services/adventuresMoreService";

type Notify = (msg: string, tone?: "success" | "error") => void;

/** Contagem regressiva simples (dias, horas, minutos) até uma data ISO. */
function useCountdown(iso: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const ms = Math.max(0, Date.parse(iso) - now);
  const d = Math.floor(ms / 86400_000);
  const h = Math.floor((ms % 86400_000) / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  return ms === 0 ? null : d > 0 ? `${d}d ${h}h` : `${h}h ${String(m).padStart(2, "0")}min`;
}

function Connect({ o, notify }: { o: AocOverview; notify: Notify }) {
  const a = useAocActions();
  const [session, setSession] = useState("");
  const [board, setBoard] = useState("");
  return (
    <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          a.connect.mutate(
            { session: session.trim(), leaderboardId: board.trim() },
            { onSuccess: (r) => notify(`Advent of Code conectado: ${r.members} participante(s) no leaderboard.`), onError: (err) => notify(errMsg(err, "Não foi possível conectar o Advent of Code."), "error") },
          );
        }}
      >
        <ol className="space-y-1 text-xs text-rpg-muted">
          <li>1. Entre em adventofcode.com com sua conta.</li>
          <li>
            2. Em <b>[Leaderboard] → [Private]</b>, crie o seu leaderboard privado (ou use um em que você participa) e copie o número do código.
          </li>
          <li>
            3. Copie o cookie <b>session</b> do site (Ferramentas do desenvolvedor → Aplicativo → Cookies). Ele vence em cerca de um mês.
          </li>
        </ol>
        <label className="block text-xs font-semibold text-rpg-text" htmlFor="aoc-board">
          Número do leaderboard privado
          <input id="aoc-board" value={board} onChange={(e) => setBoard(e.target.value)} placeholder="ex.: 1234567" inputMode="numeric" className={clsx(INPUT, "mt-1 w-full font-normal")} style={R} />
        </label>
        <label className="block text-xs font-semibold text-rpg-text" htmlFor="aoc-session">
          <span className="flex items-center gap-1">
            <KeyRound size={12} className="text-rpg-gold" aria-hidden /> Cookie session
          </span>
          <input id="aoc-session" type="password" value={session} onChange={(e) => setSession(e.target.value)} placeholder="53616c7465645f5f…" className={clsx(INPUT, "mt-1 w-full font-mono font-normal")} style={R} autoComplete="off" />
        </label>
        <p className="text-[11px] text-rpg-muted">Fica criptografado no servidor e só serve para ler o leaderboard (o LifeOS respeita o limite de 1 consulta a cada 15 min).</p>
        <RPGButton type="submit" variant="gold" className="w-full justify-center text-sm" disabled={a.connect.isPending || session.trim().length < 20 || !/^\d{3,12}/.test(board.trim())}>
          {a.connect.isPending ? <Spinner /> : <Star size={15} aria-hidden />} Entrar no evento
        </RPGButton>
      </form>
      <div className="space-y-2 border border-dashed border-rpg-green/50 p-3 text-xs text-rpg-muted" style={R}>
        <p className="font-rpg text-sm font-bold text-rpg-green">Como o evento paga</p>
        <p>
          Estrela 1: <b className="text-rpg-text">+{o.rules.part1} XP</b> · Estrela 2: <b className="text-rpg-text">+{o.rules.part2} XP</b> (XP de código: sobe o nível da Forja).
        </p>
        <p>
          Derrotar o chefe (as duas estrelas do último dia): <b className="text-rpg-text">+{o.rules.boss} XP</b>. Todas as estrelas do ano: <b className="text-rpg-text">+{o.rules.full} XP</b>.
        </p>
        <p>Estrelas de anos anteriores entram na sua coleção e nas conquistas, sem XP retroativo.</p>
      </div>
    </div>
  );
}

/**
 * Advent of Code — evento sazonal da Forja do Código: calendário de estrelas,
 * chefe no último dia e ranking do leaderboard privado.
 */
export function AdventOfCodePanel({ notify }: { notify: Notify }) {
  const [year, setYear] = useState<number | undefined>(undefined);
  const q = useAoc(year);
  const a = useAocActions();
  const o = q.data;
  const countdown = useCountdown(o?.nextEvent.startsAt ?? new Date().toISOString());
  const eventRunning = !!o && o.year === new Date().getUTCFullYear() && new Date().getUTCMonth() === 11;

  return (
    <section className="rpg-panel relative overflow-hidden p-4" aria-label="Advent of Code">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-56 bg-[radial-gradient(ellipse_at_top,rgba(74,200,110,0.16),transparent_70%)]" aria-hidden />
      <IntegrationBanner
        icon={<Star size={22} />}
        tone="green"
        title={`Advent of Code${o ? ` ${o.year}` : ""}`}
        subtitle="Estrelas do dia e seu ranking privado. O chefe espera no último dia."
        right={o?.connected ? <XpChip xp={o.xpTotal} className="text-[11px]" /> : null}
      />
      {q.isLoading ? (
        <div className="h-40 animate-pulse bg-rpg-bg-2" style={R} aria-busy="true" />
      ) : q.isError || !o ? (
        <p className="text-sm text-rpg-red" role="alert">
          Não foi possível carregar o Advent of Code.
        </p>
      ) : (
        <div className="space-y-3">
          {countdown && !eventRunning && (
            <p className="flex flex-wrap items-center gap-2 border border-rpg-green/50 bg-rpg-green/10 px-3 py-2 text-xs text-rpg-text" style={R}>
              <CalendarClock size={14} className="text-rpg-green" aria-hidden />
              O Advent of Code {o.nextEvent.year} começa em <b>{countdown}</b> ({o.nextEvent.days} dias de desafios, um novo à meia-noite de Nova York, 2h de Brasília).
            </p>
          )}
          {!o.connected ? (
            <Connect o={o} notify={notify} />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-rpg-muted" htmlFor="aoc-year">
                  Ano
                </label>
                <select id="aoc-year" value={o.year} onChange={(e) => setYear(Number(e.target.value))} className={clsx(INPUT, "py-1 text-xs")} style={R}>
                  {o.years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <span className="flex-1" />
                <span className="flex items-center gap-1 font-rpg text-sm font-bold text-rpg-gold-light">
                  <Star size={14} className="fill-current" aria-hidden /> {o.myStars}/{o.maxStars}
                </span>
              </div>
              <ol className={clsx("grid gap-1.5", o.days > 12 ? "grid-cols-5 sm:grid-cols-9 lg:grid-cols-[repeat(13,minmax(0,1fr))]" : "grid-cols-4 sm:grid-cols-6")} aria-label="Calendário de estrelas">
                {o.grid.map((d) => {
                  const stars = (d.part1 ? 1 : 0) + (d.part2 ? 1 : 0);
                  return (
                    <li
                      key={d.day}
                      className={clsx("flex flex-col items-center justify-center border p-1.5 text-center", d.boss ? "border-rpg-red/70 bg-rpg-red/10" : stars === 2 ? "border-rpg-gold/70 bg-rpg-gold/10" : d.open ? "border-rpg-border bg-rpg-bg-2/60" : "border-rpg-border/40 opacity-50")}
                      style={R}
                      aria-label={`Dia ${d.day}${d.boss ? " (chefe)" : ""}: ${stars} estrela(s)${d.open ? "" : ", ainda fechado"}`}
                    >
                      <span className="flex items-center gap-0.5 text-[10px] text-rpg-muted">
                        {d.boss && <Skull size={10} className="text-rpg-red" aria-hidden />}
                        {d.boss ? "Chefe" : `Dia ${d.day}`}
                      </span>
                      <span className="text-sm leading-none text-rpg-gold-light" aria-hidden>
                        {"★".repeat(stars)}
                        <span className="text-rpg-border">{"★".repeat(2 - stars)}</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
              <RPGProgressBar value={o.myStars} max={o.maxStars} tone="gold" label={`Todas as estrelas de ${o.year}: +${o.rules.full} XP`} valueLabel={`${o.myStars}/${o.maxStars}`} />
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] [&>*]:min-w-0">
                <div>
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-rpg-text">
                    <Trophy size={13} className="text-rpg-gold" aria-hidden /> Leaderboard privado {o.account.leaderboardId}
                  </p>
                  {o.leaderboard.length === 0 ? (
                    <EmptyNote>Sem dados deste ano ainda.</EmptyNote>
                  ) : (
                    <ol>
                      {o.leaderboard.slice(0, 8).map((m) => (
                        <li key={m.id} className={clsx("flex items-center gap-2 border-b border-dashed border-rpg-border/60 py-1 text-xs", m.me && "font-bold text-rpg-gold-light")}>
                          <span className="w-5 text-right tabular-nums text-rpg-muted">{m.rank}</span>
                          {m.rank === 1 && <Crown size={12} className="text-rpg-gold" aria-hidden />}
                          <span className="min-w-0 flex-1 truncate">{m.name}</span>
                          <span className="tabular-nums text-rpg-muted">{m.stars}★</span>
                          <span className="w-10 text-right tabular-nums">{m.score}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                  {o.members.length > 1 && (
                    <label className="mt-2 flex items-center gap-2 text-[11px] text-rpg-muted">
                      Você é
                      <select value={o.account.memberId ?? ""} onChange={(e) => a.member.mutate(e.target.value, { onSuccess: () => notify("Participante atualizado.") })} className={clsx(INPUT, "py-0.5 text-[11px]")} style={R}>
                        {o.members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold text-rpg-text">Coleção de estrelas</p>
                  {o.starsByYear.length === 0 ? (
                    <p className="text-[11px] text-rpg-muted">Escolha outros anos acima para trazer as estrelas antigas.</p>
                  ) : (
                    <ul className="space-y-1">
                      {o.starsByYear
                        .sort((x, y) => y.year - x.year)
                        .map((s) => (
                          <li key={s.year} className="flex items-center gap-2 text-[11px]">
                            <span className="w-10 text-rpg-muted">{s.year}</span>
                            <span className="h-2 flex-1 overflow-hidden bg-rpg-bg" style={{ borderRadius: 3 }} aria-hidden>
                              <span className={clsx("block h-full", s.stars >= s.max ? "bg-rpg-gold" : "bg-rpg-green")} style={{ width: `${(s.stars / s.max) * 100}%` }} />
                            </span>
                            <span className="w-12 text-right tabular-nums text-rpg-text">
                              {s.stars}/{s.max}★
                            </span>
                          </li>
                        ))}
                    </ul>
                  )}
                  <a href={`https://adventofcode.com/${o.year}`} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex items-center gap-1 text-[11px] text-rpg-blue hover:underline">
                    Abrir o evento de {o.year} <ExternalLink size={10} aria-hidden />
                  </a>
                </div>
              </div>
              <SyncBar
                status={o.account.lastSyncStatus}
                lastSyncAt={o.syncedAt}
                error={o.account.lastSyncError}
                busy={a.sync.isPending}
                onSync={() => a.sync.mutate(o.year, { onSuccess: (r) => notify(r.xp ? `+${r.xp} XP de código no Advent of Code.` : r.newStars ? `${r.newStars} estrela(s) na coleção.` : "Estrelas em dia."), onError: (e) => notify(errMsg(e, "Falha ao atualizar."), "error") })}
                onDisconnect={() => a.disconnect.mutate(undefined, { onSuccess: () => notify("Advent of Code desconectado. Estrelas e XP continuam.") })}
                disconnecting={a.disconnect.isPending}
                keepNote="As estrelas e o XP já registrados continuam."
              />
            </>
          )}
        </div>
      )}
    </section>
  );
}
