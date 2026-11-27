import { useState } from "react";
import clsx from "clsx";
import { MapPin, Search } from "lucide-react";
import { stationService } from "@/services/stationService";
import type { Place, StationOverview } from "@/services/stationService";
import { R } from "./StationKit";

const FIELD = "min-h-[40px] w-full min-w-0 border border-rpg-border bg-rpg-bg-2 px-2 text-sm text-rpg-text outline-none focus:border-rpg-gold";

/**
 * Escolha de lugar: um lugar do Atlas (nada de GPS) ou um endereço buscado no
 * OpenStreetMap, limitado à Grande São Paulo.
 */
export function PlacePicker({ label, value, onChange, places }: { label: string; value: Place | null; onChange: (p: Place) => void; places: StationOverview["places"] }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<Place & { detail: string }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const search = async () => {
    if (q.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      setResults(await stationService.geocode(q.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Busca indisponível.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <fieldset className="min-w-0 space-y-1.5">
      <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-rpg-muted">{label}</legend>
      {value && (
        <p className="flex items-center gap-1.5 border border-rpg-gold/50 bg-rpg-gold/10 px-2 py-1.5 text-sm text-rpg-text" style={R}>
          <MapPin size={14} className="shrink-0 text-rpg-gold" aria-hidden /> <span className="truncate">{value.label}</span>
        </p>
      )}
      {places.length > 0 && (
        <select
          aria-label={`${label}: lugar do Atlas`}
          className={FIELD}
          style={R}
          value=""
          onChange={(e) => {
            const p = places.find((x) => x.id === e.target.value);
            if (p) onChange({ label: p.label, lat: p.lat, lon: p.lon });
          }}
        >
          <option value="">Lugar do Atlas…</option>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      )}
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input aria-label={`${label}: endereço`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="ou busque um endereço" className={FIELD} style={R} />
        <button type="submit" disabled={busy || q.trim().length < 3} className="flex min-h-[40px] min-w-[40px] items-center justify-center border border-rpg-border bg-rpg-panel text-rpg-text hover:border-rpg-gold disabled:opacity-50" style={R} aria-label="Buscar endereço">
          <Search size={15} aria-hidden />
        </button>
      </form>
      {error && <p className="text-[11px] text-rpg-red">{error}</p>}
      {results && (
        <ul className="max-h-40 overflow-y-auto border border-rpg-border/60 [scrollbar-width:thin]" style={R}>
          {results.length === 0 && <li className="p-2 text-[11px] text-rpg-muted">Nada encontrado na Grande São Paulo.</li>}
          {results.map((r) => (
            <li key={`${r.lat},${r.lon}`}>
              <button
                type="button"
                className={clsx("block w-full px-2 py-1.5 text-left hover:bg-rpg-gold/10")}
                onClick={() => {
                  onChange({ label: r.label, lat: r.lat, lon: r.lon });
                  setResults(null);
                  setQ("");
                }}
              >
                <span className="block truncate text-xs font-semibold text-rpg-text">{r.label}</span>
                <span className="block truncate text-[10px] text-rpg-muted">{r.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
