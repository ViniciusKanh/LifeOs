import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import type { UseQueryResult } from "@tanstack/react-query";
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudRainWind, CloudSnow, CloudSun, MapPin, Moon, Sun, type LucideIcon } from "lucide-react";
import { drawWeatherThumb } from "../engine/weather";
import type { WeatherVisual, WorldWeatherResponse } from "@/services/livingWorldService";

const R = { borderRadius: 4 };

/** Rótulo curto de cada estado visual (o rótulo detalhado vem da Open-Meteo). */
export const VISUAL_LABEL: Record<WeatherVisual, string> = {
  clear: "Céu limpo",
  cloudy: "Nublado",
  fog: "Neblina",
  drizzle: "Garoa",
  rain: "Chuva",
  heavy_rain: "Chuva forte",
  snow: "Neve",
  storm: "Tempestade com relâmpagos",
};

const VISUAL_COLOR: Record<WeatherVisual, string> = {
  clear: "text-rpg-gold-light",
  cloudy: "text-rpg-muted",
  fog: "text-slate-300",
  drizzle: "text-rpg-blue",
  rain: "text-rpg-blue",
  heavy_rain: "text-rpg-blue",
  snow: "text-white",
  storm: "text-rpg-purple",
};

export function weatherIcon(visual: WeatherVisual, night: boolean): LucideIcon {
  if (visual === "clear") return night ? Moon : Sun;
  if (visual === "cloudy") return night ? CloudMoon : CloudSun;
  return { fog: CloudFog, drizzle: CloudDrizzle, rain: CloudRain, heavy_rain: CloudRainWind, snow: CloudSnow, storm: CloudLightning }[visual] ?? Cloud;
}

export function WeatherIcon({ visual, night = false, size = 18, className }: { visual: WeatherVisual; night?: boolean; size?: number; className?: string }) {
  const Icon = weatherIcon(visual, night);
  return <Icon size={size} className={className ?? VISUAL_COLOR[visual]} aria-hidden />;
}

/** Selo do clima sobre o mapa do Meu Mundo (cidade + condição), leva ao painel do clima. */
export function WeatherChip({ query }: { query: UseQueryResult<WorldWeatherResponse> }) {
  const d = query.data;
  if (!d) return null;
  if (!d.configured)
    return (
      <Link to="/meu-mundo/clima" className="rpg-tile flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-rpg-muted">
        <MapPin size={12} aria-hidden /> Definir cidade para o clima real
      </Link>
    );
  if ("unavailable" in d) return null;
  const night = d.current.isDay === false;
  return (
    <Link to="/meu-mundo/clima" className="rpg-tile flex items-center gap-2 px-2.5 py-1.5 text-[11px] font-semibold text-rpg-text" title={d.stale ? "Clima desatualizado: a Open-Meteo não respondeu" : `${d.current.label} · Open-Meteo`}>
      <MapPin size={12} className="text-rpg-muted" aria-hidden />
      {d.location.city ?? "Sua cidade"}
      <span className="h-3 w-px bg-rpg-border" aria-hidden />
      <WeatherIcon visual={d.current.visual} night={night} size={14} />
      {d.current.label} · {Math.round(d.current.temperature)}°C
      {d.stale && <span className="text-rpg-orange">(desatualizado)</span>}
    </Link>
  );
}

/** Miniatura estática de uma condição (cards de prévia). */
export function WeatherThumb({ visual, hour, className }: { visual: WeatherVisual; hour: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawWeatherThumb(ref.current, visual, hour);
  }, [visual, hour]);
  return <canvas ref={ref} width={300} height={130} className={className} style={{ ...R, imageRendering: "pixelated" }} aria-hidden />;
}
