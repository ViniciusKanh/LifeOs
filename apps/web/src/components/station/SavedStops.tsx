import { useState } from "react";
import clsx from "clsx";
import { Footprints, MapPinned, Plus, Search, Star, Trash2 } from "lucide-react";
import { RPGBadge, RPGButton } from "@/components/rpg";
import { KitSection } from "@/components/rpg-modules/ModuleKit";
import { Modal } from "@/components/ui/Modal";
import { useStationActions } from "@/hooks/useStation";
import { stationService, type Place, type StationOverview, type StopResult } from "@/services/stationService";
import { LineBadge, R, SourceTag } from "./StationKit";
import { PlacePicker } from "./PlacePicker";

type Notify = (m: string, tone?: "success" | "error") => void;

function StopResults({ list, onPick, busy }: { list: StopResult[]; onPick: (s: StopResult) => void; busy: boolean }) {
  if (!list.length) return <p className="text-xs text-rpg-muted">Nenhum ponto encontrado.</p>;
  return (
    <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1 [scrollbar-width:thin]">
      {list.map((s) => (
        <li key={s.code} className="border border-rpg-border bg-rpg-bg-2 p-2" style={R}>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-rpg-text">{s.name}</p>
              <p className="truncate text-[11px] text-rpg-muted">
                {s.address ?? `Ponto ${s.code}`}
                {s.meters != null ? ` · ${s.meters} m · ~${s.walkMinutes} min a pé` : ""}
              </p>
            </div>
            <RPGButton variant="blue" className="shrink-0 px-2 text-xs" disabled={busy} onClick={() => onPick(s)}>
              <Plus size={13} aria-hidden /> Guardar
            </RPGButton>
          </div>
          {s.lines.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {s.lines.slice(0, 8).map((l) => (
                <LineBadge key={`${l.line}-${l.headsign}`} l={l} size="sm" />
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Guardar ponto: pelos pontos perto de um lugar (Atlas ou endereço) ou pelo nome. */
function AddStopModal({ o, open, onClose, notify }: { o: StationOverview; open: boolean; onClose: () => void; notify: Notify }) {
  const a = useStationActions();
  const [mode, setMode] = useState<"perto" | "nome">(o.feed.ready ? "perto" : "nome");
  const [origin, setOrigin] = useState<Place | null>(null);
  const [q, setQ] = useState("");
  const [list, setList] = useState<StopResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<StopResult[]>) => {
    setBusy(true);
    try {
      setList(await fn());
    } catch (e) {
      notify(e instanceof Error ? e.message : "Busca indisponível.", "error");
    } finally {
      setBusy(false);
    }
  };
  const pick = (s: StopResult) =>
    a.addStop.mutate(
      { code: s.code, name: s.name, address: s.address, from: mode === "perto" && origin ? { lat: origin.lat, lon: origin.lon } : null, walkMinutes: s.walkMinutes ?? 5 },
      {
        onSuccess: (r) => {
          notify(`Ponto guardado · ${r.walkMinutes} min a pé.`);
          onClose();
        },
        onError: (e) => notify(e instanceof Error ? e.message : "Não foi possível guardar o ponto.", "error"),
      },
    );
  return (
    <Modal open={open} onClose={onClose} title="Guardar ponto" size="md">
      <div className="space-y-3">
        <div className="flex gap-1.5" role="tablist" aria-label="Como encontrar o ponto">
          {(["perto", "nome"] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} type="button" disabled={m === "perto" && !o.feed.ready} onClick={() => (setMode(m), setList(null))} className={clsx("min-h-[36px] flex-1 border-2 px-2 text-xs font-semibold disabled:opacity-40", mode === m ? "border-rpg-gold bg-rpg-gold/15 text-rpg-gold-light" : "border-rpg-border text-rpg-muted")} style={R}>
              {m === "perto" ? "Perto de um lugar" : "Pelo nome"}
            </button>
          ))}
        </div>
        {mode === "perto" ? (
          <>
            <PlacePicker
              label="Perto de"
              value={origin}
              places={o.places}
              onChange={(p) => {
                setOrigin(p);
                void run(() => stationService.near(p.lat, p.lon));
              }}
            />
            <p className="text-[10px] text-rpg-muted">Pontos a até 500 m. Ao guardar, a caminhada é calculada pelo mapa (OSRM) a partir deste lugar.</p>
          </>
        ) : (
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim().length >= 3) void run(() => stationService.search(q.trim()));
            }}
          >
            <input aria-label="Nome do ponto ou rua" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome do ponto ou rua (ex.: Paulista)" className="min-h-[40px] min-w-0 flex-1 border border-rpg-border bg-rpg-bg-2 px-2 text-sm text-rpg-text outline-none focus:border-rpg-gold" style={R} />
            <RPGButton type="submit" variant="blue" disabled={busy || q.trim().length < 3}>
              <Search size={14} aria-hidden /> Buscar
            </RPGButton>
          </form>
        )}
        {busy && <div className="h-20 animate-pulse bg-rpg-bg-2" style={R} aria-busy="true" />}
        {list && !busy && <StopResults list={list} onPick={pick} busy={a.addStop.isPending} />}
      </div>
    </Modal>
  );
}

export function SavedStops({ o, notify, elapsed }: { o: StationOverview; notify: Notify; elapsed: number }) {
  const a = useStationActions();
  const [adding, setAdding] = useState(false);
  const mins = (m: number) => Math.max(0, m - Math.floor(elapsed / 60));
  return (
    <KitSection
      title="Pontos guardados"
      icon={<MapPinned size={16} />}
      action={
        o.stops.length < 6 ? (
          <button type="button" onClick={() => setAdding(true)} className="inline-flex min-h-[32px] items-center gap-1 text-xs text-rpg-blue hover:underline">
            <Plus size={13} aria-hidden /> Guardar ponto
          </button>
        ) : null
      }
    >
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {o.stops.map((s, i) => (
          <li key={s.id} className="flex min-w-0 flex-col gap-2 border-2 border-t-[3px] border-rpg-border border-t-rpg-gold/60 bg-rpg-bg-2 p-3" style={R}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-rpg-text">{s.name}</p>
                <p className="flex items-center gap-1 truncate text-[11px] text-rpg-muted">
                  <Footprints size={11} aria-hidden /> {s.walk} min a pé{s.address ? ` · ${s.address}` : ""}
                </p>
              </div>
              {i === 0 ? (
                <RPGBadge tone="gold">Principal</RPGBadge>
              ) : (
                <button type="button" aria-label={`Tornar ${s.name} o ponto principal`} title="Tornar principal" onClick={() => a.updateStop.mutate({ id: s.id, first: true })} className="text-rpg-muted hover:text-rpg-gold">
                  <Star size={15} aria-hidden />
                </button>
              )}
              <button type="button" aria-label={`Remover ${s.name}`} onClick={() => a.removeStop.mutate(s.id, { onSuccess: () => notify("Ponto removido.") })} className="text-rpg-muted hover:text-rpg-red">
                <Trash2 size={15} aria-hidden />
              </button>
            </div>
            {s.passes.length === 0 ? (
              <p className="text-xs text-rpg-muted">{o.feed.ready || o.live.ok ? "Sem passagens na próxima hora e meia." : "Sem horários: importe o GTFS ou configure o Olho Vivo."}</p>
            ) : (
              <ul className="space-y-1">
                {s.passes.slice(0, 4).map((p, k) => (
                  <li key={`${p.line}-${p.atSec}-${k}`} className="flex items-center gap-2 text-xs">
                    <LineBadge l={p} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-rpg-muted">{p.headsign ?? ""}</span>
                    <SourceTag source={p.source} />
                    <span className="w-10 text-right font-pixel text-base text-amber-300">{mins(p.inMinutes)}′</span>
                  </li>
                ))}
              </ul>
            )}
            <RPGButton
              variant="secondary"
              className="mt-auto justify-center text-xs"
              disabled={!!o.today || a.depart.isPending}
              onClick={() =>
                a.depart.mutate(
                  { stopId: s.id },
                  { onSuccess: (r) => notify(r.onTime ? `Na hora! +${r.xp} XP.` : "Partida registrada, mas fora da janela."), onError: (e) => notify(e instanceof Error ? e.message : "Não foi possível registrar.", "error") },
                )
              }
            >
              🏇 Parti deste ponto
            </RPGButton>
          </li>
        ))}
        {o.stops.length < 6 && (
          <li>
            <button type="button" onClick={() => setAdding(true)} className="flex h-full min-h-[140px] w-full flex-col items-center justify-center gap-1 border-2 border-dashed border-rpg-border p-3 text-center text-rpg-muted hover:border-rpg-gold hover:text-rpg-text" style={R}>
              <span className="text-2xl" aria-hidden>
                🚏
              </span>
              <span className="text-sm font-semibold">Guardar ponto</span>
              <span className="text-[11px]">Perto de um lugar do Atlas, de um endereço ou pelo nome · até 6</span>
            </button>
          </li>
        )}
      </ul>
      {adding && <AddStopModal o={o} open={adding} onClose={() => setAdding(false)} notify={notify} />}
    </KitSection>
  );
}
