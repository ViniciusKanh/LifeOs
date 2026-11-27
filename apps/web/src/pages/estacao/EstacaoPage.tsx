import { Suspense, lazy, useState } from "react";
import { Map as MapIcon } from "lucide-react";
import { RPGButton } from "@/components/rpg";
import { KitSection } from "@/components/rpg-modules/ModuleKit";
import { useLocalToast } from "@/components/integrations/PublicApiKit";
import { useStation, useStationActions } from "@/hooks/useStation";
import type { RouteOption } from "@/services/stationService";
import { DepartureBoard, LeaveCard, StationBanner, useElapsed } from "@/components/station/StationKit";
import { RouteOracle } from "@/components/station/RouteOracle";
import { SavedStops } from "@/components/station/SavedStops";
import { DataSources, JourneyList, Punctuality, TravelLog } from "@/components/station/StationLedger";

// O Leaflet só carrega quando a tela abre (não pesa no resto do app).
const StationMap = lazy(() => import("@/components/station/StationMap"));

/**
 * ESTAÇÃO DAS CARRUAGENS — transporte de São Paulo numa tela própria (saiu do Hoje).
 * Hora de partir da jornada principal, painel de partidas dos pontos guardados,
 * Oráculo de rotas (linhas diretas) e mapa. Programação = GTFS da SPTrans;
 * Olho Vivo é opcional e só troca o selo para "ao vivo" quando responde.
 */
export function EstacaoPage() {
  const q = useStation();
  const a = useStationActions();
  const [notify, toast] = useLocalToast();
  const [journeyId, setJourneyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<RouteOption | null>(null);
  const elapsed = useElapsed(q.dataUpdatedAt || Date.now());
  const o = q.data;

  if (q.isError)
    return (
      <div className="w-full px-4 py-6 md:px-6 lg:px-8">
        <div className="rpg-panel p-6 text-center">
          <p className="text-sm text-rpg-red">Não foi possível abrir a Estação das Carruagens.</p>
          <RPGButton variant="secondary" className="mt-3" onClick={() => void q.refetch()}>
            Tentar novamente
          </RPGButton>
        </div>
      </div>
    );
  if (!o)
    return (
      <div className="w-full space-y-3 px-4 py-6 md:px-6 lg:px-8" aria-busy aria-label="Carregando a Estação">
        <div className="rpg-panel h-36 animate-pulse" />
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rpg-panel h-72 animate-pulse" />
          <div className="rpg-panel h-72 animate-pulse" />
        </div>
      </div>
    );

  const journey = o.journeys.find((j) => j.id === journeyId) ?? o.journeys.find((j) => j.primary) ?? o.journeys[0] ?? null;
  const depart = () =>
    journey &&
    a.depart.mutate(
      { journeyId: journey.id },
      {
        onSuccess: (r) => notify(r.onTime ? `Na hora! +${r.xp} XP — boa viagem no ${r.line ?? "ônibus"}.` : "Partida registrada, mas fora da janela recomendada."),
        onError: (e) => notify(e instanceof Error ? e.message : "Não foi possível registrar a partida.", "error"),
      },
    );

  return (
    <div className="w-full space-y-3 px-4 py-6 md:px-6 lg:px-8">
      <StationBanner o={o} elapsed={elapsed} />

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {journey ? (
          <LeaveCard o={o} journey={journey} elapsed={elapsed} onSwitch={setJourneyId} onDepart={depart} departing={a.depart.isPending} />
        ) : (
          <KitSection title="Hora de partir" icon={<span aria-hidden>⚔</span>} tone="gold">
            <p className="text-sm text-rpg-text/90">Guarde uma jornada (ex.: Casa → Trabalho) no Oráculo de rotas. A partir dela, a Estação diz a hora exata de sair para pegar a linha e chegar a tempo do próximo compromisso da Agenda.</p>
            <p className="mt-2 text-[11px] text-rpg-muted">Sem GPS: a origem é um lugar do Atlas ou um endereço que você escolhe.</p>
          </KitSection>
        )}
        <DepartureBoard board={o.board} elapsed={elapsed} />
      </div>

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <KitSection title="Mapa da jornada" icon={<MapIcon size={16} />} action={preview ? <button type="button" className="text-xs text-rpg-blue hover:underline" onClick={() => setPreview(null)}>Voltar à jornada</button> : null}>
          <Suspense fallback={<div className="h-72 animate-pulse bg-rpg-bg-2 sm:h-80" />}>
            <StationMap stops={o.stops} journey={journey} option={preview} />
          </Suspense>
        </KitSection>
        <RouteOracle o={o} notify={notify} onPreview={setPreview} preview={preview} />
      </div>

      <SavedStops o={o} notify={notify} elapsed={elapsed} />

      <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Punctuality o={o} />
        <JourneyList o={o} notify={notify} />
        <TravelLog o={o} />
        <DataSources o={o} notify={notify} />
      </div>
      {toast}
    </div>
  );
}
