import { useMemo } from "react";
import clsx from "clsx";
import { RPGAvatar } from "@/components/rpg";
import type { RegionKey, WorldRegion } from "@/services/worldmapService";
import { MAP_H, MAP_W, REGION_ORDER, REGION_UI, islandPath } from "./regionUi";
import { RegionCard } from "./RegionCard";

/**
 * Mapa visual (desktop): mar escuro, ilhas pixeladas em SVG e caminhos
 * tracejados ligando cada região ao centro (Encruzilhada, onde está o
 * herói). Os textos ficam em botões HTML sobrepostos — legíveis, focáveis
 * e acessíveis — posicionados em % do viewBox. Sem animação contínua.
 */
export function WorldMapCanvas({ regions, onOpen }: { regions: WorldRegion[]; onOpen: (key: RegionKey) => void }) {
  const byKey = useMemo(() => new Map(regions.map((r) => [r.key, r])), [regions]);
  // Formas das ilhas são estáticas: calculadas uma vez.
  const islands = useMemo(
    () =>
      REGION_ORDER.map((key) => {
        const u = REGION_UI[key];
        return {
          key,
          shore: islandPath(u.pos.x, u.pos.y, u.size.rx, u.size.ry, u.seed, 1.12),
          land: islandPath(u.pos.x, u.pos.y, u.size.rx, u.size.ry, u.seed, 0.92),
          core: islandPath(u.pos.x, u.pos.y - 8, u.size.rx, u.size.ry, u.seed + 1, 0.45),
        };
      }),
    [],
  );
  const center = REGION_UI.encruzilhada.pos;

  return (
    <div className="relative w-full overflow-hidden border-2 border-rpg-gold/60 bg-rpg-bg-2 shadow-rpg" style={{ aspectRatio: `${MAP_W} / ${MAP_H}`, borderRadius: 4 }}>
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="absolute inset-0 h-full w-full" shapeRendering="crispEdges" aria-hidden focusable="false">
        <defs>
          <pattern id="mapa-mar" width="32" height="32" patternUnits="userSpaceOnUse">
            <rect x="4" y="10" width="8" height="2" className="fill-rpg-blue/20" />
            <rect x="20" y="26" width="8" height="2" className="fill-rpg-blue/15" />
          </pattern>
          <pattern id="mapa-nevoa" width="12" height="12" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" className="fill-rpg-muted/25" />
            <rect x="6" y="6" width="6" height="6" className="fill-rpg-muted/15" />
          </pattern>
        </defs>
        <rect width={MAP_W} height={MAP_H} fill="url(#mapa-mar)" />
        {islands.map((i) => {
          const r = byKey.get(i.key);
          const u = REGION_UI[i.key];
          const fog = r?.fogged ?? true;
          return (
            <g key={i.key} className={clsx(fog && "opacity-60")}>
              <path d={i.shore} className={fog ? "fill-rpg-muted/10" : u.shore} />
              <path d={i.land} className={fog ? "fill-rpg-muted/20" : u.land} />
              <path d={i.core} className={fog ? "fill-rpg-muted/20" : "fill-rpg-text/10"} />
              {fog && <path d={i.land} fill="url(#mapa-nevoa)" />}
            </g>
          );
        })}
        {/* Caminhos do centro até cada região (por cima das ilhas, como estradas). */}
        {REGION_ORDER.filter((k) => k !== "encruzilhada").map((key) => {
          const p = REGION_UI[key].pos;
          const fog = byKey.get(key)?.fogged ?? true;
          return (
            <path
              key={`path-${key}`}
              d={`M${center.x} ${center.y} L${center.x} ${(center.y + p.y) / 2} L${p.x} ${(center.y + p.y) / 2} L${p.x} ${p.y}`}
              fill="none"
              strokeWidth={4}
              strokeDasharray="10 10"
              className={fog ? "stroke-rpg-muted/30" : "stroke-rpg-gold/60"}
            />
          );
        })}
        {/* Rosa dos ventos (decorativa). */}
        <g transform="translate(930 560)" className="fill-rpg-gold/50">
          <rect x="-4" y="-36" width="8" height="72" />
          <rect x="-36" y="-4" width="72" height="8" />
          <rect x="-10" y="-10" width="20" height="20" className="fill-rpg-gold-light/70" />
        </g>
        <text x="930" y="512" textAnchor="middle" className="fill-rpg-gold-light/70 font-pixel" fontSize="16">
          N
        </text>
      </svg>

      {/* Herói na Encruzilhada. */}
      <div
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-full"
        style={{
          left: `${(center.x / MAP_W) * 100}%`,
          top: `${((center.y - 52) / MAP_H) * 100}%`,
        }}
      >
        <RPGAvatar size="md" alt="Seu herói na Encruzilhada" />
      </div>

      {REGION_ORDER.map((key) => {
        const r = byKey.get(key);
        if (!r) return null;
        const p = REGION_UI[key].pos;
        return (
          <div
            key={key}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${(p.x / MAP_W) * 100}%`,
              top: `${(p.y / MAP_H) * 100}%`,
              width: "clamp(190px, 23%, 260px)",
            }}
          >
            <RegionCard region={r} compact onOpen={() => onOpen(key)} />
          </div>
        );
      })}
    </div>
  );
}
