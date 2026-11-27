import { useState } from "react";
import clsx from "clsx";
import { ArrowRightLeft, Footprints, Hourglass, Sparkles } from "lucide-react";
import { RPGBadge, RPGButton } from "@/components/rpg";
import { KitSection } from "@/components/rpg-modules/ModuleKit";
import { useStationActions } from "@/hooks/useStation";
import type { Place, RouteOption, RoutePlan, StationOverview } from "@/services/stationService";
import { LineBadge, R } from "./StationKit";
import { PlacePicker } from "./PlacePicker";

type Notify = (m: string, tone?: "success" | "error") => void;

/**
 * Oráculo de rotas: linhas DIRETAS entre dois lugares (pontos a até 600 m de cada
 * lado). Baldeação ainda não entra — a tela diz isso em vez de inventar rota.
 */
export function RouteOracle({ o, notify, onPreview, preview }: { o: StationOverview; notify: Notify; onPreview: (opt: RouteOption | null) => void; preview: RouteOption | null }) {
  const a = useStationActions();
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [name, setName] = useState("");
  const ask = () => {
    if (!from || !to) return;
    a.plan.mutate(
      { from, to },
      {
        onSuccess: (r) => {
          setPlan(r);
          onPreview(r.options[0] ?? null);
          setName(`${from.label} → ${to.label}`.slice(0, 60));
        },
        onError: (e) => notify(e instanceof Error ? e.message : "O Oráculo não respondeu.", "error"),
      },
    );
  };
  const save = (opt: RouteOption) => {
    if (!plan) return;
    a.createJourney.mutate(
      { name: name.trim() || `${plan.from.label} → ${plan.to.label}`, origin: plan.from, dest: plan.to, tripId: opt.tripId, boardSeq: opt.board.seq, alightSeq: opt.alight.seq },
      {
        onSuccess: () => {
          notify("Jornada guardada. A Hora de Partir já usa ela.");
          setPlan(null);
          onPreview(null);
        },
        onError: (e) => notify(e instanceof Error ? e.message : "Não foi possível guardar a jornada.", "error"),
      },
    );
  };
  return (
    <KitSection title="Oráculo de rotas" icon={<Sparkles size={16} />} tone="legendary" action={<RPGBadge tone="purple">Linhas diretas</RPGBadge>}>
      {!o.feed.ready ? (
        <p className="text-sm text-rpg-muted">O Oráculo usa a programação da SPTrans, que ainda não foi importada.</p>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-start">
            <PlacePicker label="De" value={from} onChange={setFrom} places={o.places} />
            <button type="button" aria-label="Inverter origem e destino" onClick={() => (setFrom(to), setTo(from))} className="mx-auto mt-6 hidden h-9 w-9 items-center justify-center border border-rpg-border text-rpg-muted hover:text-rpg-gold sm:flex" style={R}>
              <ArrowRightLeft size={15} aria-hidden />
            </button>
            <PlacePicker label="Para" value={to} onChange={setTo} places={o.places} />
          </div>
          <RPGButton variant="primary" className="w-full justify-center sm:w-auto" disabled={!from || !to || a.plan.isPending} onClick={ask}>
            <Sparkles size={14} aria-hidden /> {a.plan.isPending ? "Consultando…" : "Consultar o Oráculo"}
          </RPGButton>
          {plan && (
            <div className="space-y-2" aria-live="polite">
              {plan.closeEnough && <p className="border border-rpg-green/50 bg-rpg-green/10 p-2 text-xs text-rpg-green" style={R}>São só ~{plan.walkOnlyMinutes} min a pé. Talvez nem precise de ônibus.</p>}
              {plan.options.length === 0 ? (
                <p className="text-sm text-rpg-muted">Nenhuma linha direta liga esses dois lugares (pontos a até 600 m). Rotas com baldeação ainda não entram no cálculo.</p>
              ) : (
                plan.options.map((opt, i) => (
                  <article
                    key={`${opt.tripId}-${opt.board.stopId}`}
                    className={clsx("cursor-pointer space-y-1.5 border-2 bg-rpg-bg-2 p-2.5", preview?.tripId === opt.tripId ? "border-rpg-gold shadow-[0_0_14px_-6px_rgb(var(--rpg-gold))]" : "border-rpg-border hover:border-rpg-gold/60")}
                    style={R}
                    onClick={() => onPreview(opt)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {i === 0 && <RPGBadge tone="gold">★ Melhor</RPGBadge>}
                      <LineBadge l={opt} />
                      <span className="min-w-0 flex-1 truncate text-xs text-rpg-muted">→ {opt.headsign ?? opt.longName}</span>
                      <span className="font-rpg text-2xl font-bold text-rpg-text">{opt.total} min</span>
                    </div>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-rpg-muted">
                      <span className="inline-flex items-center gap-0.5"><Footprints size={11} aria-hidden /> {opt.walkTo} min até {opt.board.name}</span>
                      <span className="inline-flex items-center gap-0.5"><Hourglass size={11} aria-hidden /> ~{Math.max(0, opt.wait)} min</span>
                      <span>🚌 {opt.ride} min (passa ~{opt.busAt}{opt.headwayMin ? `, a cada ${opt.headwayMin} min` : ""})</span>
                      <span className="inline-flex items-center gap-0.5"><Footprints size={11} aria-hidden /> {opt.walkFrom} min</span>
                      <span>· chega ~{opt.arriveAt}</span>
                    </p>
                    {preview?.tripId === opt.tripId && (
                      <div className="flex flex-col gap-1.5 pt-1 sm:flex-row" onClick={(e) => e.stopPropagation()}>
                        <input aria-label="Nome da jornada" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="min-h-[36px] min-w-0 flex-1 border border-rpg-border bg-rpg-bg px-2 text-xs text-rpg-text outline-none focus:border-rpg-gold" style={R} />
                        <RPGButton variant="gold" className="justify-center text-xs" disabled={a.createJourney.isPending} onClick={() => save(opt)}>
                          Guardar como jornada
                        </RPGButton>
                      </div>
                    )}
                  </article>
                ))
              )}
              <p className="text-[10px] text-rpg-muted">Espera e horários pela frequência programada (~). Caminhada pelo OSRM{plan.options.some((x) => x.walkEstimated) ? " (algumas estimadas em linha reta)" : ""}. Baldeações ainda não entram no cálculo.</p>
            </div>
          )}
        </div>
      )}
    </KitSection>
  );
}
