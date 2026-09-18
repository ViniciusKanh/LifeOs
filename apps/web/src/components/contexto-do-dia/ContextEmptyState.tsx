import { useState } from "react";
import { MapPin, LocateFixed } from "lucide-react";
import { Button, Card } from "@/components/ui/primitives";
import { LocationModal } from "./LocationModal";
import { useUpdateContextLocation } from "@/hooks/useContextOfDay";
import { requestBrowserLocation } from "@/services/contextService";

export function ContextEmptyState() {
  const [modalOpen, setModalOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updateLocation = useUpdateContextLocation();

  async function handleUseCurrentLocation() {
    setError(null);
    setLocating(true);
    try {
      const { latitude, longitude } = await requestBrowserLocation();
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
      updateLocation.mutate({ city: "Minha localização atual", latitude, longitude, timezone, autoLocation: true });
    } catch {
      setError("Não foi possível obter sua localização. Verifique a permissão do navegador ou escolha uma cidade manualmente.");
    } finally {
      setLocating(false);
    }
  }

  return (
    <Card className="flex flex-col items-center text-center max-w-md mx-auto py-14 px-6">
      <p className="font-display font-semibold text-2xl tracking-tight">Configure sua localização</p>
      <p className="text-sm mt-2 text-slate">O LifeOS usa sua região para mostrar contexto climático e ambiental — sem guardar histórico de localização.</p>
      {error && <p className="text-xs text-drop mt-3">{error}</p>}
      <div className="flex flex-col sm:flex-row gap-2.5 mt-6 w-full">
        <Button className="flex-1" onClick={handleUseCurrentLocation} disabled={locating}>
          <LocateFixed size={16} />
          {locating ? "Obtendo localização..." : "Usar localização atual"}
        </Button>
        <Button variant="secondary" className="flex-1" onClick={() => setModalOpen(true)}>
          <MapPin size={16} />
          Escolher cidade
        </Button>
      </div>
      {modalOpen && <LocationModal onClose={() => setModalOpen(false)} />}
    </Card>
  );
}
