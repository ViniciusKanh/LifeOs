import { useState } from "react";
import { MapPin, LocateFixed, Search, X } from "lucide-react";
import { Button, Field } from "@/components/ui/primitives";
import { contextService, requestBrowserLocation } from "@/services/contextService";
import { useUpdateContextLocation } from "@/hooks/useContextOfDay";
import type { GeocodeResult } from "@/types";

export function LocationModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updateLocation = useUpdateContextLocation();

  async function handleSearch(value: string) {
    setQuery(value);
    setError(null);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const found = await contextService.geocode(value.trim());
      setResults(found);
    } catch {
      setError("Não foi possível buscar essa cidade agora.");
    } finally {
      setSearching(false);
    }
  }

  function selectResult(r: GeocodeResult) {
    updateLocation.mutate(
      { city: r.name, region: r.region, country: r.country, latitude: r.latitude, longitude: r.longitude, timezone: r.timezone, autoLocation: false },
      { onSuccess: onClose }
    );
  }

  async function handleUseCurrentLocation() {
    setError(null);
    setLocating(true);
    try {
      const { latitude, longitude } = await requestBrowserLocation();
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
      updateLocation.mutate(
        { city: "Minha localização atual", region: null, country: null, latitude, longitude, timezone, autoLocation: true },
        { onSuccess: onClose }
      );
    } catch {
      setError("Não foi possível obter sua localização. Verifique a permissão do navegador ou escolha uma cidade manualmente.");
    } finally {
      setLocating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border shadow-card p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <p className="font-display font-bold text-lg">Configurar localização</p>
          <button onClick={onClose} aria-label="Fechar" className="text-slate hover:text-inherit">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-slate mb-4">O LifeOS usa sua região só para mostrar contexto climático e ambiental — sem histórico de localização.</p>

        <Button variant="secondary" className="w-full mb-4" onClick={handleUseCurrentLocation} disabled={locating}>
          <LocateFixed size={16} />
          {locating ? "Obtendo localização..." : "Usar minha localização atual"}
        </Button>

        <div className="relative">
          <Field label="Ou busque uma cidade" placeholder="Ex.: São Paulo" value={query} onChange={(e) => handleSearch(e.target.value)} />
          <Search size={14} className="absolute right-3 top-9 text-slate" />
        </div>

        {searching && <p className="text-xs text-slate mt-2">Buscando...</p>}
        {error && <p className="text-xs text-drop mt-2">{error}</p>}

        {results.length > 0 && (
          <ul className="mt-2 space-y-1 max-h-52 overflow-y-auto">
            {results.map((r, i) => (
              <li key={i}>
                <button
                  onClick={() => selectResult(r)}
                  className="w-full text-left flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-paper dark:hover:bg-ink"
                >
                  <MapPin size={14} className="text-slate shrink-0" />
                  <span>
                    {r.name}
                    {r.region ? `, ${r.region}` : ""} {r.country ? `— ${r.country}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
