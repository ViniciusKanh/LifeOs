import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { School } from "@/services/cityService";

/**
 * Mapa das escolas encontradas (Leaflet + OpenStreetMap). Só mostra a página atual da busca;
 * a escola selecionada fica destacada. Coordenadas vêm do cadastro da SME.
 */
const pin = (bg: string, size: number) =>
  L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;display:grid;place-items:center;background:${bg};border:2px solid #1e1b4b;border-radius:4px;box-shadow:0 2px 0 #0006;font-size:${Math.round(size * 0.5)}px">🏫</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
const ICON = { base: pin("#a78bfa", 24), active: pin("#f59e0b", 30) };
const SP: [number, number] = [-23.55, -46.63];

function Fit({ points, focus }: { points: Array<[number, number]>; focus: [number, number] | null }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join("|");
  useEffect(() => {
    if (points.length === 1) map.setView(points[0]!, 15);
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (focus) map.setView(focus, Math.max(map.getZoom(), 14));
  }, [focus, map]);
  return null;
}

export default function SchoolMap({ schools, selected, onSelect }: { schools: School[]; selected: string | null; onSelect: (codesc: string) => void }) {
  const located = schools.filter((s): s is School & { lat: number; lng: number } => s.lat != null && s.lng != null);
  const pts = located.map((s) => [s.lat, s.lng] as [number, number]);
  const sel = located.find((s) => s.codesc === selected);
  return (
    <div className="h-[300px] overflow-hidden border-2 border-rpg-border sm:h-[360px]" style={{ borderRadius: 4 }}>
      <MapContainer center={SP} zoom={11} scrollWheelZoom={false} className="h-full w-full" attributionControl>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Fit points={pts} focus={sel ? [sel.lat, sel.lng] : null} />
        {located.map((s) => (
          <Marker key={s.codesc} position={[s.lat, s.lng]} icon={s.codesc === selected ? ICON.active : ICON.base} eventHandlers={{ click: () => onSelect(s.codesc) }} title={`${s.tipo} ${s.nome}`}>
            <Popup>
              <strong>
                {s.tipo} {s.nome}
              </strong>
              <br />
              {s.endereco ?? ""} {s.bairro ? `· ${s.bairro}` : ""}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
