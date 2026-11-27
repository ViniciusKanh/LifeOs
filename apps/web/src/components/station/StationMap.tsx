import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Journey, RouteOption, SavedStop } from "@/services/stationService";

/**
 * Mapa da estação (Leaflet + OpenStreetMap). Mostra os pontos guardados, a jornada
 * principal (ou a opção do Oráculo em destaque) com o trajeto desenhado PELOS
 * PONTOS da viagem — o shape oficial é pesado demais para guardar.
 */
const pin = (bg: string, glyph: string, size = 26) =>
  L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;display:grid;place-items:center;background:${bg};border:2px solid #3e2a14;border-radius:4px;box-shadow:0 2px 0 #0006;font-size:${Math.round(size * 0.5)}px">${glyph}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
const ICON = { stop: pin("#e0b04a", "🚏"), origin: pin("#8b5cf6", "🏠", 28), dest: pin("#4ac86e", "🏰", 28), board: pin("#f6d27a", "▲", 22), alight: pin("#f6d27a", "▼", 22) };

function Fit({ points }: { points: Array<[number, number]> }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join("|");
  useEffect(() => {
    if (points.length === 1) map.setView(points[0]!, 16);
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

export default function StationMap({ stops, journey, option }: { stops: SavedStop[]; journey: Journey | null; option: RouteOption | null }) {
  const route = option
    ? { color: option.color ?? "#3b82f6", path: option.path, line: option.line, from: null as [number, number] | null, to: null as [number, number] | null, board: [option.board.lat, option.board.lon] as [number, number], alight: [option.alight.lat, option.alight.lon] as [number, number] }
    : journey
      ? { color: journey.color ?? "#3b82f6", path: journey.path, line: journey.line, from: [journey.originLat, journey.originLon] as [number, number], to: [journey.destLat, journey.destLon] as [number, number], board: journey.boardLat != null ? ([journey.boardLat, journey.boardLon!] as [number, number]) : null, alight: journey.alightLat != null ? ([journey.alightLat, journey.alightLon!] as [number, number]) : null }
      : null;
  const pts = useMemo(() => {
    const out: Array<[number, number]> = [];
    if (route) out.push(...route.path, ...[route.from, route.to, route.board, route.alight].filter((p): p is [number, number] => !!p));
    else for (const s of stops) if (s.lat != null && s.lon != null) out.push([s.lat, s.lon]);
    return out;
  }, [route, stops]);
  const center: [number, number] = pts[0] ?? [-23.5505, -46.6333];
  return (
    <div className="station-map relative isolate z-0 h-72 overflow-hidden border-2 border-rpg-border sm:h-80" style={{ borderRadius: 4 }}>
      <style>{".station-map .leaflet-tile-pane{filter:sepia(.35) saturate(1.1) brightness(.95)}.station-map .leaflet-container{background:#1b1638}"}</style>
      <MapContainer center={center} zoom={15} className="h-full w-full" scrollWheelZoom={false} attributionControl>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
        <Fit points={pts} />
        {route && route.path.length > 1 && <Polyline positions={route.path} pathOptions={{ color: route.color, weight: 6, opacity: 0.85 }} />}
        {route?.from && route.board && <Polyline positions={[route.from, route.board]} pathOptions={{ color: "#4ac86e", weight: 3, dashArray: "6 6" }} />}
        {route?.to && route.alight && <Polyline positions={[route.alight, route.to]} pathOptions={{ color: "#4ac86e", weight: 3, dashArray: "6 6" }} />}
        {route?.from && <Marker position={route.from} icon={ICON.origin} />}
        {route?.to && <Marker position={route.to} icon={ICON.dest} />}
        {route?.board && <Marker position={route.board} icon={ICON.board}><Popup>Embarque · {route.line}</Popup></Marker>}
        {route?.alight && <Marker position={route.alight} icon={ICON.alight}><Popup>Desembarque</Popup></Marker>}
        {stops.filter((s) => s.lat != null && s.lon != null).map((s) => (
          <Marker key={s.id} position={[s.lat!, s.lon!]} icon={ICON.stop}>
            <Popup>
              <b>{s.name}</b>
              <br />
              {s.linesHere.slice(0, 6).map((l) => l.line).join(" · ")}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      <div className="pointer-events-none absolute bottom-2 left-2 z-[500] grid gap-0.5 border border-rpg-border bg-rpg-panel/90 px-2 py-1 text-[10px] text-rpg-text" style={{ borderRadius: 3 }}>
        <span>🏠 origem · 🏰 destino · 🚏 ponto guardado</span>
        {route && <span>━ trajeto do {route.line} (pelos pontos) · ┅ a pé</span>}
      </div>
    </div>
  );
}
