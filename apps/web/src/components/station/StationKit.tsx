import { useEffect, useState } from "react";
import clsx from "clsx";
import { Bus, CalendarClock, Footprints, Radio, Swords, Timer, TrainFront } from "lucide-react";
import { RPGBadge, RPGButton } from "@/components/rpg";
import { KitSection } from "@/components/rpg-modules/ModuleKit";
import type { BoardPass, Journey, LineChip, StationOverview } from "@/services/stationService";

export const R = { borderRadius: 4 } as const;

/** Selo da linha com a cor oficial da SPTrans (cor da área). Metrô/CPTM ganham ícone de trem. */
export function LineBadge({ l, size = "md" }: { l: Pick<LineChip, "line" | "color" | "textColor" | "routeType">; size?: "sm" | "md" | "lg" }) {
  const rail = l.routeType === 1 || l.routeType === 2;
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-pixel font-semibold leading-none shadow-[inset_0_-2px_0_rgb(0_0_0/0.3)]",
        size === "sm" ? "px-1.5 py-1 text-[11px]" : size === "lg" ? "px-2.5 py-1.5 text-base" : "px-2 py-1 text-[13px]",
        !l.color && "bg-rpg-blue text-white",
      )}
      style={{ borderRadius: 3, ...(l.color ? { background: l.color, color: l.textColor ?? "#fff" } : {}) }}
    >
      {rail ? <TrainFront size={size === "lg" ? 14 : 11} aria-hidden /> : null}
      {l.line}
    </span>
  );
}

/** Segundos que passaram desde que a visão chegou — o relógio da tela anda sozinho entre as atualizações. */
export function useElapsed(since: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return Math.max(0, Math.floor((now - since) / 1000));
}

export const clockOf = (sec: number) => {
  const s = ((Math.floor(sec) % 86400) + 86400) % 86400;
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":");
};
export const mmss = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** Selo de origem da previsão: o usuário sempre sabe se é programação ou GPS. */
export function SourceTag({ source }: { source: "programado" | "ao vivo" }) {
  return source === "ao vivo" ? (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rpg-green">
      <span className="h-2 w-2 animate-pulse rounded-full bg-rpg-green shadow-[0_0_8px_rgb(var(--rpg-green))] motion-reduce:animate-none" aria-hidden /> ao vivo
    </span>
  ) : (
    <span className="text-[11px] text-amber-300/80" title="Estimativa pela frequência programada da SPTrans (não é GPS)">
      ~ prog.
    </span>
  );
}

/* ═══════════════════════ Banner com relógio de estação ═══════════════════════ */

export function StationBanner({ o, elapsed }: { o: StationOverview; elapsed: number }) {
  const liveLabel = !o.live.enabled ? "Olho Vivo opcional" : o.live.ok ? "Olho Vivo ao vivo" : "Olho Vivo indisponível";
  return (
    <header className="relative overflow-hidden border-2 border-rpg-gold/60 bg-gradient-to-b from-[#1a2350] via-[#22265a] to-[#3a2a4f]" style={R}>
      <Skyline />
      <div className="absolute inset-0 bg-gradient-to-r from-rpg-bg via-rpg-bg/90 to-rpg-bg/30" aria-hidden />
      <div className="relative grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0">
          <p className="font-pixel text-[10px] uppercase tracking-widest text-rpg-gold">Executar · Transporte</p>
          <h1 className="rpg-title text-2xl font-bold leading-tight sm:text-3xl">Estação das Carruagens</h1>
          <p className="mt-1 max-w-xl text-sm text-rpg-text/85">Horários da SPTrans, caminhada calculada pelo mapa e a Agenda dizendo quando você precisa chegar.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <RPGBadge tone={o.feed.ready ? "gold" : "muted"} icon={<Timer size={11} aria-hidden />}>
              {o.feed.ready ? `Programação ${o.feed.version ? new Date(`${o.feed.version}T12:00:00`).toLocaleDateString("pt-BR") : ""}` : "Programação não importada"}
            </RPGBadge>
            <RPGBadge tone={o.live.ok ? "green" : "muted"} icon={<Radio size={11} aria-hidden />}>
              {liveLabel}
            </RPGBadge>
            <RPGBadge tone="green" icon={<Footprints size={11} aria-hidden />}>
              Caminhada OSRM
            </RPGBadge>
          </div>
        </div>
        <div className="justify-self-start border-[3px] border-rpg-gold/60 bg-[#0a0c14] px-4 py-2 text-center shadow-[inset_0_0_18px_#000,0_0_18px_-6px_rgb(255_184_64)] md:justify-self-end" style={R} aria-label={`Hora em São Paulo: ${o.clock.time}`}>
          <p className="font-pixel text-4xl font-bold tabular-nums leading-none text-amber-400 [text-shadow:0_0_8px_rgb(255_184_64/0.7)] sm:text-5xl">{clockOf(o.clock.nowSec + elapsed)}</p>
          <p className="mt-1 font-pixel text-[10px] uppercase tracking-widest text-amber-300/75">
            {o.clock.weekday} · {o.clock.dayKey.split("-").reverse().slice(0, 2).join("/")} · São Paulo
          </p>
          {o.clock.holiday && <p className="text-[10px] text-rpg-orange">Feriado: {o.clock.holiday} · horário de domingo</p>}
        </div>
      </div>
    </header>
  );
}

/** Silhueta da cidade com uma carruagem-ônibus em pixel (SVG próprio, sem asset externo). */
function Skyline() {
  return (
    <svg className="pointer-events-none absolute bottom-0 right-0 h-full w-full opacity-60 md:w-2/3" viewBox="0 0 600 160" preserveAspectRatio="xMaxYMax slice" aria-hidden>
      <g fill="#141b3d">
        {[[20, 60, 40], [70, 30, 30], [110, 80, 50], [170, 45, 26], [205, 70, 60], [300, 20, 22], [330, 55, 48], [390, 35, 36], [440, 75, 70], [520, 50, 40]].map(([x, y, w]) => (
          <rect key={x} x={x} y={y} width={w} height={160 - y!} />
        ))}
      </g>
      <g fill="#f6d27a" opacity=".5">
        {[[76, 40], [88, 52], [214, 80], [340, 66], [398, 46], [452, 88], [530, 60]].map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="4" height="4" />
        ))}
      </g>
      <g className="motion-safe:animate-[busdrift_14s_linear_infinite]">
        <g transform="translate(230,118)">
          <rect width="120" height="30" fill="#FF671F" />
          <rect width="120" height="6" fill="#ffb066" />
          <g fill="#9fd3ff">
            <rect x="10" y="9" width="16" height="10" />
            <rect x="32" y="9" width="16" height="10" />
            <rect x="54" y="9" width="16" height="10" />
            <rect x="76" y="9" width="16" height="10" />
          </g>
          <rect x="98" y="9" width="16" height="18" fill="#1b2240" />
          <circle cx="24" cy="31" r="7" fill="#111" />
          <circle cx="96" cy="31" r="7" fill="#111" />
          <rect x="2" y="22" width="6" height="4" fill="#ffe38a" />
        </g>
      </g>
      <rect x="0" y="150" width="600" height="10" fill="#0d1230" />
      <style>{"@keyframes busdrift{0%{transform:translateX(-60px)}50%{transform:translateX(40px)}100%{transform:translateX(-60px)}}"}</style>
    </svg>
  );
}

/* ═══════════════════════ Painel de partidas (letreiro) ═══════════════════════ */

const Flap = ({ v }: { v: string }) => (
  <span className="relative mr-0.5 inline-block bg-[#1b1f2b] px-1 shadow-[inset_0_-1px_0_#000,inset_0_1px_0_#2c3242] after:absolute after:inset-x-0 after:top-1/2 after:h-px after:bg-black/60" style={{ borderRadius: 2 }}>
    {v}
  </span>
);

export function DepartureBoard({ board, elapsed }: { board: BoardPass[]; elapsed: number }) {
  // Os minutos descem localmente entre as atualizações; passagem que já passou some.
  const rows = board.map((p) => ({ ...p, inMin: p.inMinutes - Math.floor(elapsed / 60) })).filter((p) => p.inMin >= 0);
  return (
    <KitSection title="Painel de partidas" icon={<Bus size={16} />} action={<span className="hidden text-[10px] text-rpg-muted sm:inline">próxima hora · seus pontos e jornadas</span>}>
      <div className="border-[3px] border-[#2a2f3f] bg-[#090b12] p-2 shadow-[inset_0_0_22px_#000]" style={R}>
        {rows.length === 0 ? (
          <p className="px-2 py-6 text-center font-pixel text-sm text-amber-300/70">Nenhuma partida programada na próxima hora.</p>
        ) : (
          <table className="w-full border-separate [border-spacing:0_5px]">
            <caption className="sr-only">Próximas partidas nos seus pontos</caption>
            <thead>
              <tr className="font-pixel text-[9px] uppercase tracking-widest text-amber-300/60">
                <th className="px-2 text-left font-normal">Linha</th>
                <th className="px-2 text-left font-normal">Destino</th>
                <th className="hidden px-2 text-left font-normal md:table-cell">Ponto</th>
                <th className="px-2 text-right font-normal">Em</th>
                <th className="hidden px-2 text-right font-normal sm:table-cell">Fonte</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => (
                <tr key={`${p.stopId}-${p.line}-${p.atSec}-${i}`} className="font-pixel text-amber-400">
                  <td className="bg-[#11141d] px-2 py-1.5" style={{ borderRadius: "3px 0 0 3px" }}>
                    <LineBadge l={p} size="sm" />
                  </td>
                  <td className="max-w-[14rem] truncate bg-[#11141d] px-2 py-1.5 text-sm uppercase">{p.headsign ?? "—"}</td>
                  <td className="hidden max-w-[10rem] truncate bg-[#11141d] px-2 py-1.5 text-xs uppercase text-amber-300/70 md:table-cell">{p.stopName}</td>
                  <td className="whitespace-nowrap bg-[#11141d] px-2 py-1.5 text-right text-base">
                    {p.inMin === 0 ? (
                      <span className="text-rpg-green">agora</span>
                    ) : (
                      <>
                        {String(p.inMin).padStart(2, "0").split("").map((d, k) => <Flap key={k} v={d} />)} <span className="text-xs">min</span>
                      </>
                    )}
                  </td>
                  <td className="hidden whitespace-nowrap bg-[#11141d] px-2 py-1.5 text-right sm:table-cell" style={{ borderRadius: "0 3px 3px 0" }}>
                    <SourceTag source={p.source} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-2 text-[10px] text-rpg-muted">“~ prog.” = estimativa pela frequência programada da SPTrans, não é GPS. “ao vivo” só aparece quando o Olho Vivo responde.</p>
    </KitSection>
  );
}

/* ═══════════════════════ Hora de partir ═══════════════════════ */

function TrailNode({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="grid w-24 shrink-0 justify-items-center gap-0.5 text-center sm:w-28">
      <span className="flex h-10 w-10 items-center justify-center border-2 border-rpg-gold bg-rpg-bg-2 text-lg" style={R} aria-hidden>
        {icon}
      </span>
      <span className="line-clamp-2 text-[11px] font-semibold leading-tight text-rpg-text">{title}</span>
      <span className="text-[10px] text-rpg-muted">{sub}</span>
    </div>
  );
}

function TrailLeg({ label, sub, color, dashed }: { label: string; sub?: string; color: string; dashed?: boolean }) {
  return (
    <div className="-mt-5 grid min-w-[60px] flex-1 justify-items-center gap-0.5 text-[10px]">
      <span className="whitespace-nowrap font-semibold" style={dashed ? { color } : undefined}>{label}</span>
      <span className="block h-1.5 w-full" style={{ borderRadius: 2, background: dashed ? `repeating-linear-gradient(90deg, ${color} 0 6px, transparent 6px 10px)` : color, boxShadow: dashed ? undefined : `0 0 10px -2px ${color}` }} aria-hidden />
      {sub && <span className="text-rpg-muted">{sub}</span>}
    </div>
  );
}

const addMin = (hhmm: string, m: number) => {
  const [h, mm] = hhmm.split(":").map(Number);
  const t = (((h! * 60 + mm! + m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

export function LeaveCard({
  o,
  journey,
  elapsed,
  onSwitch,
  onDepart,
  departing,
}: {
  o: StationOverview;
  journey: Journey;
  elapsed: number;
  onSwitch: (id: string) => void;
  onDepart: () => void;
  departing: boolean;
}) {
  const p = journey.plan;
  const left = p ? p.leaveInSeconds - elapsed : null;
  const late = left != null && left < -o.rules.graceMinutes * 60;
  const lineColor = journey.color ?? "rgb(var(--rpg-blue))";
  return (
    <KitSection
      title="Hora de partir"
      icon={<Swords size={16} />}
      tone="gold"
      action={
        o.journeys.length > 1 ? (
          <select aria-label="Jornada" value={journey.id} onChange={(e) => onSwitch(e.target.value)} className="min-h-[32px] max-w-[12rem] border border-rpg-border bg-rpg-bg-2 px-1.5 text-xs text-rpg-text" style={R}>
            {o.journeys.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name}
              </option>
            ))}
          </select>
        ) : (
          <RPGBadge tone="gold">{journey.name}</RPGBadge>
        )
      }
    >
      {!p ? (
        <p className="py-4 text-sm text-rpg-muted">
          Nenhuma passagem da linha <b className="text-rpg-text">{journey.line}</b> alcançável nas próximas horas{o.feed.ready ? "" : " (a programação da SPTrans ainda não foi importada)"}.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div>
              <p className="font-pixel text-[10px] uppercase tracking-widest text-rpg-gold">{late ? "Perdeu esta" : left != null && left <= 0 ? "Saia agora" : "Saia em"}</p>
              <p className={clsx("font-pixel text-6xl font-bold tabular-nums leading-none sm:text-7xl", late ? "text-rpg-red" : left != null && left <= 120 ? "text-rpg-orange" : "text-rpg-gold-light")} aria-live="polite">
                {late ? `+${mmss(-left!)}` : mmss(left ?? 0)}
              </p>
            </div>
            <div className="min-w-0 flex-1 basis-full space-y-1 text-sm sm:basis-0">
              <p className="flex flex-wrap items-center gap-1.5">
                Pegue o <LineBadge l={{ ...journey, line: p.pass.line }} /> → <b>{p.pass.headsign ?? journey.headsign ?? "—"}</b> <SourceTag source={p.pass.source} />
              </p>
              <p className="text-xs text-rpg-muted">
                Passa em <b className="text-rpg-text">{journey.boardName}</b> por volta das <b className="text-amber-300">{p.pass.at}</b>
                {p.pass.headwayMin ? ` · a cada ${p.pass.headwayMin} min nesta faixa` : ""}
              </p>
              {p.next && <p className="text-xs text-rpg-muted">Se perder: próxima ~{p.next.at} (saia até {p.next.leaveAt})</p>}
            </div>
          </div>
          <div className="flex items-start overflow-x-auto pb-1 pt-5 [scrollbar-width:thin]" aria-label="Trajeto">
            <TrailNode icon="🏠" title={journey.originLabel} sub={`sai ${p.leaveAt}`} />
            <TrailLeg label={`🚶 ${journey.walkTo} min`} color="rgb(var(--rpg-green))" dashed />
            <TrailNode icon="🚏" title={journey.boardName} sub={`~${p.pass.at}`} />
            <TrailLeg label={`${journey.line} · ${journey.ride} min`} color={lineColor} />
            <TrailNode icon="🚏" title={journey.alightName} sub={`~${addMin(p.pass.at, journey.ride)}`} />
            <TrailLeg label={`🚶 ${journey.walkFrom} min`} color="rgb(var(--rpg-green))" dashed />
            <TrailNode icon="🏰" title={journey.destLabel} sub={`~${p.arriveAt}`} />
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {o.event && (
              <span className="inline-flex items-center gap-1 border border-rpg-border bg-rpg-bg-2 px-2 py-1.5" style={R}>
                <CalendarClock size={13} className="text-rpg-gold" aria-hidden /> {o.event.title} · <b>{new Date(o.event.startsAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</b>
              </span>
            )}
            {p.fitsEvent != null && (
              <span className={clsx("border px-2 py-1.5", p.fitsEvent ? "border-rpg-green/50 text-rpg-green" : "border-rpg-red/50 text-rpg-red")} style={R}>
                {p.fitsEvent ? `✔ Chega com ${p.slackMinutes} min de folga` : "✖ Nenhuma passagem chega a tempo — avise que vai atrasar"}
              </span>
            )}
            <span className="border border-rpg-border px-2 py-1.5 text-rpg-muted" style={R}>
              Porta a porta: {journey.walkTo + journey.ride + journey.walkFrom} min + espera{journey.walkEstimated ? " · caminhada estimada" : ""}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {o.today ? (
              <p className={clsx("text-sm font-semibold", o.today.onTime ? "text-rpg-green" : "text-rpg-orange")}>
                {o.today.onTime ? `✔ Partida de hoje registrada na hora (+${o.rules.onTime} XP)` : "Partida de hoje registrada (fora da janela)"}
              </p>
            ) : (
              <RPGButton variant="primary" onClick={onDepart} disabled={departing} className="justify-center">
                🏇 Parti agora <span className="ml-1 border border-white/40 px-1 font-pixel text-[10px]">+{o.rules.onTime} XP</span>
              </RPGButton>
            )}
          </div>
        </div>
      )}
    </KitSection>
  );
}
