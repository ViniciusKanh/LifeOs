import { useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import clsx from "clsx";
import { BookOpen, Building2, Compass, Download, Footprints, Landmark, LocateFixed, Lock, MapPin, Navigation, Route, Search, Shield, Star, Trash2, Trees, Utensils, Mountain, ShoppingBag, Theater, Church, Trophy, Camera } from "lucide-react";
import { RPGButton, RPGSwitch, RPGTabs, RPGToast } from "@/components/rpg";
import { Modal } from "@/components/ui/Modal";
import { useAtlas, useAtlasActions } from "@/hooks/useAdventures";
import { useLivingWorld } from "@/hooks/useLivingWorld";
import { getSprite } from "@/components/living-world/engine/sprites";
import { DEFAULT_AVATAR_LOOK, normalizeLook } from "@/components/living-world/engine/looks";
import { adventuresService, type AtlasOverview, type AtlasPlace, type PlaceSearchResult } from "@/services/adventuresService";
import { AdventureHeader, BackToWorld, EmptyNote, INPUT, PageError, PageSkeleton, Panel, R, StatusPill, ago, errMsg, fmtDay, nf, Spinner } from "@/components/adventures/AdventureKit";

const CATEGORY: Record<string, { label: string; icon: typeof MapPin; color: string }> = {
  historico: { label: "Histórico", icon: Landmark, color: "#F1C66A" },
  religioso: { label: "Religioso", icon: Church, color: "#A875F5" },
  parque: { label: "Parque", icon: Trees, color: "#4FD49A" },
  museu: { label: "Museu", icon: Building2, color: "#59A9F8" },
  gastronomia: { label: "Gastronomia", icon: Utensils, color: "#F2732B" },
  mirante: { label: "Mirante", icon: Mountain, color: "#59D4F8" },
  natureza: { label: "Natureza", icon: Trees, color: "#3F9A4A" },
  compras: { label: "Compras", icon: ShoppingBag, color: "#E78FC0" },
  esporte: { label: "Esporte", icon: Footprints, color: "#F16D75" },
  cultura: { label: "Cultura", icon: Theater, color: "#C58BFF" },
  outro: { label: "Outro", icon: MapPin, color: "#cfd6e6" },
};
const CATS = Object.keys(CATEGORY);

/** Título de explorador derivado do número real de lugares descobertos. */
const TIERS = [
  { min: 0, name: "Forasteiro" },
  { min: 1, name: "Novato do Atlas" },
  { min: 5, name: "Andarilho" },
  { min: 15, name: "Explorador" },
  { min: 40, name: "Desbravador" },
  { min: 100, name: "Cartógrafo Lendário" },
];
const MAP_STYLES = [
  { key: "pergaminho", label: "Pergaminho" },
  { key: "noite", label: "Noite" },
  { key: "padrao", label: "Padrão" },
] as const;
type MapStyle = (typeof MAP_STYLES)[number]["key"];
// Filtros só nos tiles (marcadores e névoa mantêm as cores).
const MAP_CSS = `.atlas-pergaminho .leaflet-tile-pane{filter:sepia(.55) saturate(1.25) hue-rotate(-12deg) brightness(.92) contrast(1.05)}
.atlas-noite .leaflet-tile-pane{filter:invert(.92) hue-rotate(195deg) saturate(.7) brightness(.85) contrast(.9)}
.atlas-map .leaflet-container{background:#1b1638}`;
const ACH_METRIC: Record<string, keyof AtlasOverview["progress"]> = { atlas_first: "places", atlas_urban: "places", atlas_hoods: "neighborhoods", atlas_regional: "cities", atlas_nomad: "states", atlas_carto: "cells" };

function pinIcon(category: string, star: boolean) {
  const C = CATEGORY[category] ?? CATEGORY.outro!;
  const icon = renderToStaticMarkup(<C.icon size={14} color="#1d1a24" strokeWidth={2.5} />);
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:32px;height:40px">
      <div style="position:absolute;left:2px;top:0;width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:linear-gradient(135deg,${C.color},#ffffff55);border:2px solid #1d1a24;box-shadow:0 0 12px ${C.color}"></div>
      <div style="position:absolute;left:2px;top:0;width:28px;height:28px;display:flex;align-items:center;justify-content:center">${icon}</div>
      ${star ? '<div style="position:absolute;right:-4px;top:-6px;color:#F1C66A;font-size:14px;text-shadow:0 0 4px #000">★</div>' : ""}
      <div style="position:absolute;left:11px;bottom:0;width:10px;height:4px;border-radius:50%;background:#0006"></div>
    </div>`,
    iconSize: [32, 40],
    iconAnchor: [9, 36],
    popupAnchor: [7, -34],
  });
}

/** Marcador do explorador: o sprite do seu herói (mesmo visual da Vila). */
function heroIcon(look: Parameters<typeof getSprite>[0]) {
  let src = "";
  try {
    src = getSprite(look, "stand", 0, false).toDataURL();
  } catch {
    src = "";
  }
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:44px;height:58px">
      <div style="position:absolute;left:4px;bottom:0;width:36px;height:12px;border-radius:50%;background:radial-gradient(#59D4F8aa,#59D4F800 70%)"></div>
      ${src ? `<img src="${src}" style="position:absolute;left:5px;bottom:4px;width:34px;height:48px;image-rendering:pixelated;filter:drop-shadow(0 0 4px #59D4F8)" alt="" />` : ""}
    </div>`,
    iconSize: [44, 58],
    iconAnchor: [22, 54],
  });
}

/** Textura de nuvens da névoa (gerada uma vez, sem imagens externas). */
let cloudPattern: HTMLCanvasElement | null = null;
function cloudCanvas() {
  if (cloudPattern) return cloudPattern;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * 256;
    const y = rnd() * 256;
    const r = 20 + rnd() * 60;
    for (const [dx, dy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]] as const) {
      const grd = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      grd.addColorStop(0, `rgba(${150 + rnd() * 60},${120 + rnd() * 40},255,0.16)`);
      grd.addColorStop(1, "rgba(150,120,255,0)");
      g.fillStyle = grd;
      g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
    }
  }
  cloudPattern = c;
  return c;
}

/**
 * Névoa de guerra: canvas sobre o mapa pintado de escuro, com as células
 * reveladas "apagadas" (destination-out) e bordas suaves. Redesenha em
 * movimento/zoom; não bloqueia cliques (pointer-events: none).
 */
function FogLayer({ cells, cellDeg }: { cells: string[]; cellDeg: number }) {
  const map = useMap();
  const cellsRef = useRef(cells);
  cellsRef.current = cells;
  useEffect(() => {
    const canvas = L.DomUtil.create("canvas", "leaflet-zoom-hide") as HTMLCanvasElement;
    canvas.style.pointerEvents = "none";
    canvas.style.position = "absolute";
    const pane = map.getPanes().overlayPane;
    pane.appendChild(canvas);
    let raf = 0;
    const draw = () => {
      raf = 0;
      const size = map.getSize();
      canvas.width = size.x;
      canvas.height = size.y;
      L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
      const ctx = canvas.getContext("2d")!;
      const grad = ctx.createLinearGradient(0, 0, size.x, size.y);
      grad.addColorStop(0, "rgba(22,14,52,0.82)");
      grad.addColorStop(1, "rgba(12,10,32,0.86)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size.x, size.y);
      // Nuvens deslizam junto com o mapa (padrão ancorado na origem do mundo).
      const origin = map.latLngToContainerPoint([0, 0]);
      const pat = ctx.createPattern(cloudCanvas(), "repeat");
      if (pat) {
        pat.setTransform(new DOMMatrix().translate(origin.x % 256, origin.y % 256));
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, size.x, size.y);
      }
      ctx.globalCompositeOperation = "destination-out";
      ctx.shadowColor = "black";
      ctx.shadowBlur = Math.max(6, Math.min(30, map.getZoom() * 1.6));
      ctx.fillStyle = "black";
      const b = map.getBounds().pad(0.2);
      const visible: Array<[number, number, number, number]> = [];
      for (const c of cellsRef.current) {
        const [i, j] = c.split(":").map(Number) as [number, number];
        const s = i * cellDeg;
        const w = j * cellDeg;
        if (s > b.getNorth() || s + cellDeg < b.getSouth() || w > b.getEast() || w + cellDeg < b.getWest()) continue;
        const p1 = map.latLngToContainerPoint([s + cellDeg, w]);
        const p2 = map.latLngToContainerPoint([s, w + cellDeg]);
        ctx.fillRect(p1.x - 1, p1.y - 1, p2.x - p1.x + 2, p2.y - p1.y + 2);
        visible.push([p1.x, p1.y, p2.x - p1.x, p2.y - p1.y]);
      }
      // Borda dourada: só pinta onde ainda há névoa (source-atop), contornando as áreas reveladas.
      ctx.globalCompositeOperation = "source-atop";
      ctx.shadowColor = "rgba(241,198,106,0.9)";
      ctx.shadowBlur = 14;
      ctx.strokeStyle = "rgba(241,198,106,0.55)";
      ctx.lineWidth = 2;
      for (const [x, y, w, h] of visible) ctx.strokeRect(x, y, w, h);
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = "source-over";
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    map.on("move zoom resize viewreset", schedule);
    // O contêiner pode mudar de tamanho depois da montagem (grid responsivo).
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
      schedule();
    });
    ro.observe(map.getContainer());
    schedule();
    return () => {
      map.off("move zoom resize viewreset", schedule);
      ro.disconnect();
      cancelAnimationFrame(raf);
      canvas.remove();
    };
  }, [map, cellDeg]);
  useEffect(() => {
    map.fire("move");
  }, [cells, map]);
  return null;
}

function ClickToPick({ active, onPick }: { active: boolean; onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (active) onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, Math.max(map.getZoom(), 15), { duration: 0.8 });
  }, [target, map]);
  return null;
}

interface Draft {
  name: string;
  lat: number;
  lng: number;
  category: string;
  method: "manual" | "localizacao";
  osmRef: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  countryCode: string | null;
  visitedAt: string;
}

const localNow = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

/** Reduz a foto no navegador (JPEG ~1280px) antes de enviar. */
async function compressPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    let q = 0.82;
    let out = c.toDataURL("image/jpeg", q);
    while (out.length > 650_000 && q > 0.4) {
      q -= 0.12;
      out = c.toDataURL("image/jpeg", q);
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function AtlasPage() {
  const [region, setRegion] = useState<string | null>(null);
  const q = useAtlas(region);
  const a = useAtlasActions();
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);
  const notify = (msg: string, tone: "success" | "error" = "success") => setToast({ msg, tone });
  const [filter, setFilter] = useState<"todos" | "favoritos" | string>("todos");
  const [mapStyle, setMapStyle] = useState<MapStyle>("pergaminho");
  const world = useLivingWorld();
  const heroMarker = useMemo(() => heroIcon(normalizeLook(world.data?.avatar ?? {}, DEFAULT_AVATAR_LOOK)), [world.data?.avatar]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fly, setFly] = useState<[number, number] | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [routeRec, setRouteRec] = useState<{ points: Array<[number, number]>; started: string } | null>(null);
  const watchRef = useRef<number | null>(null);
  const o = q.data;

  useEffect(() => () => {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
  }, []);

  const places = useMemo(() => (o ? o.places.filter((p) => (filter === "todos" ? true : filter === "favoritos" ? p.favorite : p.category === filter)) : []), [o, filter]);
  const center: [number, number] = o?.places[0] ? [o.places[0].lat, o.places[0].lng] : [-23.5505, -46.6333];

  if (q.isError) return <PageError what="o Atlas" onRetry={() => void q.refetch()} />;
  if (!o) return <PageSkeleton />;

  const runSearch = async () => {
    if (search.trim().length < 2) return;
    setSearching(true);
    try {
      const r = await adventuresService.searchPlaces(search.trim(), o.places[0] ? { lat: o.places[0].lat, lng: o.places[0].lng } : undefined);
      setResults(r.results);
      if (!r.results.length) notify("Nada encontrado no OpenStreetMap para essa busca.", "error");
    } catch (e) {
      notify(errMsg(e, "Busca indisponível no momento."), "error");
    } finally {
      setSearching(false);
    }
  };

  const draftFrom = (p: { lat: number; lng: number; name?: string | null; category?: string; osmRef?: string | null; neighborhood?: string | null; city?: string | null; state?: string | null; country?: string | null; countryCode?: string | null }, method: Draft["method"]): Draft => ({
    name: p.name ?? "",
    lat: p.lat,
    lng: p.lng,
    category: p.category ?? "outro",
    method,
    osmRef: p.osmRef ?? null,
    neighborhood: p.neighborhood ?? null,
    city: p.city ?? null,
    state: p.state ?? null,
    country: p.country ?? null,
    countryCode: p.countryCode ?? null,
    visitedAt: localNow(),
  });

  const pickPoint = async (lat: number, lng: number) => {
    setPicking(false);
    try {
      const r = await adventuresService.reverse(lat, lng);
      setDraft(draftFrom({ lat, lng, ...(r.place ?? {}) }, "manual"));
    } catch {
      setDraft(draftFrom({ lat, lng }, "manual"));
    }
  };

  const gpsCheckin = () => {
    if (!o.settings.locationEnabled) return setConsentOpen(true);
    if (!("geolocation" in navigator)) return notify("Este dispositivo não oferece localização.", "error");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setFly([lat, lng]);
        try {
          const r = await adventuresService.reverse(lat, lng);
          setDraft(draftFrom({ lat, lng, ...(r.place ?? {}) }, "localizacao"));
        } catch {
          setDraft(draftFrom({ lat, lng }, "localizacao"));
        }
      },
      () => notify("Não foi possível obter sua localização. Verifique a permissão do navegador.", "error"),
      { enableHighAccuracy: o.settings.preciseLocation, timeout: 15000 }
    );
  };

  const saveDraft = () => {
    if (!draft) return;
    a.checkin.mutate(
      {
        name: draft.name.trim() || null,
        lat: draft.lat,
        lng: draft.lng,
        osmRef: draft.osmRef,
        category: draft.category,
        method: draft.method,
        visitedAt: new Date(draft.visitedAt).toISOString(),
        neighborhood: draft.neighborhood,
        city: draft.city,
        state: draft.state,
        country: draft.country,
        countryCode: draft.countryCode,
      },
      {
        onSuccess: (r) => {
          setDraft(null);
          setResults(null);
          setFly([draft.lat, draft.lng]);
          notify(r.isNewPlace ? `Novo lugar descoberto! +${r.xp} XP · ${r.revealedCells} área(s) revelada(s).` : `Visita registrada${r.xp ? ` (+${r.xp} XP)` : ""}.`);
        },
        onError: (e) => notify(errMsg(e, "Não foi possível registrar."), "error"),
      }
    );
  };

  const toggleRoute = () => {
    if (routeRec) {
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
      const pts = routeRec.points;
      setRouteRec(null);
      if (pts.length < 2) return notify("Rota muito curta para salvar.", "error");
      void adventuresService
        .saveRoute({ name: `Rota de ${new Date(routeRec.started).toLocaleDateString("pt-BR")}`, points: pts, startedAt: routeRec.started })
        .then(() => {
          notify("Rota registrada e áreas reveladas no Atlas.");
          void q.refetch();
        })
        .catch((e) => notify(errMsg(e, "Não foi possível salvar a rota."), "error"));
      return;
    }
    if (!o.settings.locationEnabled) return setConsentOpen(true);
    const started = new Date().toISOString();
    setRouteRec({ points: [], started });
    // Só registra enquanto esta tela estiver aberta e até você parar.
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => setRouteRec((r) => (r ? { ...r, points: [...r.points, [pos.coords.latitude, pos.coords.longitude]] } : r)),
      () => notify("Localização indisponível; rota interrompida.", "error"),
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
  };

  const exportData = async () => {
    try {
      const data = await adventuresService.exportAtlas();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "atlas-lifeos.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      notify(errMsg(e, "Falha ao exportar."), "error");
    }
  };

  const pr = o.progress;
  const pct = pr.region?.pct ?? 0;
  const lastPlace = o.recent[0] ? o.places.find((p) => p.id === o.recent[0]!.placeId) ?? null : null;
  const tierIdx = TIERS.reduce((acc, t, i) => (pr.places >= t.min ? i : acc), 0);
  const tier = TIERS[tierIdx]!;
  const nextTier = TIERS[tierIdx + 1] ?? null;

  return (
    <div className="space-y-4 px-3 py-4 sm:px-4 md:px-6">
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
      <BackToWorld />
      <AdventureHeader icon={<Compass size={40} className="text-rpg-gold" />} title="Atlas de Exploração" subtitle="Registre, explore e descubra o mundo real. Suas visitas viram conquistas, experiência e expandem o mapa da sua jornada.">
        <StatusPill state={o.settings.locationEnabled ? "ok" : "off"} label="Localização" detail={o.settings.locationEnabled ? (o.settings.preciseLocation ? "Ativada (precisa)" : "Ativada (aproximada)") : "Desativada"} onClick={() => setPrivacyOpen(true)} />
        <StatusPill state="ok" label="Dados do mapa" detail="OpenStreetMap" />
      </AdventureHeader>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
        <div className="min-w-0 space-y-3">
          <section className="rpg-panel space-y-3 p-3" aria-label="Mapa do Atlas">
            <div className="flex flex-wrap items-center gap-2">
              <form
                className="flex min-w-[220px] flex-1 items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void runSearch();
                }}
              >
                <label className="sr-only" htmlFor="atlas-busca">
                  Buscar lugar, bairro ou cidade
                </label>
                <input id="atlas-busca" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar lugar, bairro ou cidade…" className={clsx(INPUT, "flex-1")} style={R} />
                <RPGButton type="submit" variant="secondary" disabled={searching} aria-label="Buscar">
                  {searching ? <Spinner /> : <Search size={15} aria-hidden />}
                </RPGButton>
              </form>
              <RPGTabs<MapStyle> label="Estilo do mapa" size="sm" value={mapStyle} onChange={setMapStyle} tabs={MAP_STYLES.map((m) => ({ value: m.key, label: m.label }))} />
            </div>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Filtros">
              {[
                { k: "todos", l: "Todos", n: o.places.length, color: "#A875F5", Icon: MapPin },
                { k: "favoritos", l: "Favoritos", n: o.places.filter((p) => p.favorite).length, color: "#F1C66A", Icon: Star },
                ...CATS.filter((c) => o.places.some((p) => p.category === c)).map((c) => ({ k: c, l: CATEGORY[c]!.label, n: o.places.filter((p) => p.category === c).length, color: CATEGORY[c]!.color, Icon: CATEGORY[c]!.icon })),
              ].map(({ k, l, n, color, Icon }) => (
                <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={clsx("flex shrink-0 items-center gap-1.5 border-2 px-2.5 py-1 text-xs transition", filter === k ? "text-rpg-text" : "border-rpg-border text-rpg-muted hover:text-rpg-text")} style={{ ...R, borderColor: filter === k ? color : undefined, background: filter === k ? `${color}22` : undefined }}>
                  <Icon size={12} style={{ color }} aria-hidden /> {l}
                  <span className="rounded bg-rpg-bg-2 px-1 text-[10px] tabular-nums">{n}</span>
                </button>
              ))}
            </div>
            {results && results.length > 0 && (
              <ul className="max-h-48 overflow-auto border border-rpg-border bg-rpg-bg-2" style={R}>
                {results.map((r) => (
                  <li key={r.osmRef}>
                    <button type="button" className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-rpg-bg" onClick={() => { setFly([r.lat, r.lng]); setDraft(draftFrom(r, "manual")); setResults(null); }}>
                      <MapPin size={14} className="mt-0.5 shrink-0" style={{ color: CATEGORY[r.category]?.color }} aria-hidden />
                      <span>
                        <span className="block font-semibold text-rpg-text">{r.name}</span>
                        <span className="block text-[11px] text-rpg-muted">{r.displayName}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <style>{MAP_CSS}</style>
            <div className={clsx("atlas-map relative isolate z-0 h-[440px] overflow-hidden border-2 border-rpg-gold/50 shadow-[0_0_30px_rgba(168,117,245,.25)] sm:h-[520px]", `atlas-${mapStyle}`, picking && "cursor-crosshair")} style={R}>
              <MapContainer center={center} zoom={13} className="h-full w-full" scrollWheelZoom attributionControl>
                <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
                <FogLayer cells={o.cells} cellDeg={o.cellDeg} />
                <ClickToPick active={picking} onPick={(lat, lng) => void pickPoint(lat, lng)} />
                <FlyTo target={fly} />
                {o.routes.map((r) => (
                  <Polyline key={r.id} positions={r.points} pathOptions={{ color: "#59D4F8", weight: 3, dashArray: "6 6" }} />
                ))}
                {routeRec && routeRec.points.length > 1 && <Polyline positions={routeRec.points} pathOptions={{ color: "#4FD49A", weight: 4 }} />}
                {lastPlace && <Marker position={[lastPlace.lat, lastPlace.lng]} icon={heroMarker} zIndexOffset={1000} interactive={false} />}
                {places.map((p) => (
                  <Marker key={p.id} position={[p.lat, p.lng]} icon={pinIcon(p.category, p.favorite)}>
                    <Popup>
                      <PlacePopup p={p} onFav={() => a.updatePlace.mutate({ id: p.id, favorite: !p.favorite })} onRevisit={() => setDraft({ ...draftFrom({ ...p, osmRef: null }, "manual") })} onDelete={() => a.deletePlace.mutate(p.id, { onSuccess: () => notify("Lugar removido e névoa recalculada.") })} />
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
              {picking && (
                <div className="pointer-events-none absolute inset-x-0 top-2 z-[500] mx-auto w-fit border-2 border-rpg-gold bg-rpg-bg/90 px-3 py-1 text-xs text-rpg-text" style={R}>
                  Toque no mapa onde você esteve
                </div>
              )}
              {o.places.length === 0 && !picking && (
                <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[500] mx-auto w-fit max-w-[90%] border-2 border-rpg-border bg-rpg-bg/90 px-3 py-1.5 text-center text-xs text-rpg-text" style={R}>
                  O mapa está coberto pela névoa. Busque um lugar ou faça seu primeiro check-in para revelá-lo.
                </div>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rpg-tile flex items-center justify-between gap-2 p-2.5">
                <span className="flex items-center gap-2 text-sm">
                  <LocateFixed size={18} className="text-rpg-green" aria-hidden />
                  <span>
                    <span className="block font-semibold text-rpg-text">Sua localização</span>
                    <span className="block text-[11px] text-rpg-muted">{o.settings.locationEnabled ? "Só ao tocar em check-in" : "Desligada por padrão"}</span>
                  </span>
                </span>
                <RPGSwitch checked={o.settings.locationEnabled} onChange={() => (o.settings.locationEnabled ? a.settings.mutate({ locationEnabled: false }) : setConsentOpen(true))} label="Usar localização" />
              </div>
              <RPGButton variant="success" className="h-full" onClick={() => (o.settings.locationEnabled ? gpsCheckin() : setPicking(true))}>
                <MapPin size={18} aria-hidden />
                <span className="flex flex-col items-start leading-tight">
                  Fazer check-in
                  <span className="text-[10px] font-normal opacity-80">{o.settings.locationEnabled ? "Registrar lugar atual" : "Escolher no mapa"}</span>
                </span>
              </RPGButton>
              <RPGButton variant="secondary" className="h-full" onClick={toggleRoute}>
                <Route size={18} aria-hidden />
                <span className="flex flex-col items-start leading-tight">
                  {routeRec ? `Parar rota (${routeRec.points.length} pts)` : "Iniciar rota"}
                  <span className="text-[10px] font-normal opacity-80">{routeRec ? "Salvar percurso" : "Registrar um percurso"}</span>
                </span>
              </RPGButton>
            </div>
          </section>

          <Panel title={`Lugares descobertos (${places.length}${filter !== "todos" ? ` de ${pr.places}` : ""})`} icon={<Landmark size={17} className="text-rpg-gold" aria-hidden />}>
            {o.places.length === 0 ? (
              <EmptyNote>Nenhum lugar ainda. Cada check-in vira uma descoberta com XP.</EmptyNote>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {places.slice(0, 12).map((p) => {
                  const C = CATEGORY[p.category] ?? CATEGORY.outro!;
                  return (
                    <article key={p.id} className="rpg-tile group relative overflow-hidden p-0 transition hover:-translate-y-0.5">
                      <button type="button" onClick={() => setFly([p.lat, p.lng])} className="block w-full text-left" aria-label={`Ver ${p.name} no mapa`}>
                        <div className="relative flex h-24 items-center justify-center overflow-hidden" style={{ background: `radial-gradient(circle at 30% 20%, ${C.color}88, transparent 60%), linear-gradient(135deg, ${C.color}44, #1d1a24 85%)` }}>
                          <C.icon size={40} style={{ color: C.color, filter: `drop-shadow(0 0 10px ${C.color})` }} className="transition group-hover:scale-110" aria-hidden />
                          <span className="absolute bottom-1.5 left-2 border border-white/20 bg-black/40 px-1.5 text-[10px] text-white backdrop-blur-sm" style={R}>
                            {C.label}
                          </span>
                          <span className="absolute bottom-1.5 right-2 border border-white/20 bg-black/40 px-1.5 text-[10px] text-white backdrop-blur-sm" style={R}>
                            {p.visits} visita(s)
                          </span>
                        </div>
                        <div className="p-2.5">
                          <p className="truncate font-semibold text-rpg-text">{p.name}</p>
                          <p className="truncate text-[11px] text-rpg-muted">{[p.neighborhood, p.city].filter(Boolean).join(", ") || "Local sem endereço"}</p>
                          <p className="text-[10px] text-rpg-muted">Descoberto {ago(p.firstVisitAt)}</p>
                        </div>
                      </button>
                      <button type="button" onClick={() => a.updatePlace.mutate({ id: p.id, favorite: !p.favorite })} aria-pressed={p.favorite} aria-label={p.favorite ? "Desfavoritar" : "Favoritar"} className={clsx("absolute right-2 top-2 rounded-full bg-black/40 p-1 backdrop-blur-sm", p.favorite ? "text-rpg-gold" : "text-white/70 hover:text-white")}>
                        <Star size={15} fill={p.favorite ? "currentColor" : "none"} />
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        <aside className="space-y-4">
          <section className="rpg-panel overflow-hidden p-0" aria-label="Progresso de exploração">
            <div className="bg-gradient-to-br from-violet-900/70 via-indigo-900/50 to-emerald-900/40 p-4">
              <p className="text-[11px] uppercase tracking-wider text-rpg-gold-light">Título de explorador</p>
              <p className="font-rpg text-2xl font-bold text-rpg-text">{tier.name}</p>
              {nextTier ? (
                <>
                  <div className="mt-2 h-2 overflow-hidden bg-black/30" style={R}>
                    <div className="h-full bg-gradient-to-r from-amber-300 to-yellow-200" style={{ width: `${((pr.places - tier.min) / (nextTier.min - tier.min)) * 100}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] text-rpg-muted">
                    {pr.places}/{nextTier.min} lugares para virar <strong className="text-rpg-text">{nextTier.name}</strong>
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-rpg-gold-light">Título máximo alcançado!</p>
              )}
            </div>
            <div className="flex items-center gap-4 p-4">
              <div className="relative h-28 w-28 shrink-0" role="img" aria-label={pr.region ? `${pct}% de ${pr.region.city}` : "Sem região de referência"}>
                <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                  <defs>
                    <linearGradient id="atlasRing" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#4FD49A" />
                      <stop offset="100%" stopColor="#59D4F8" />
                    </linearGradient>
                  </defs>
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="#2a2740" strokeWidth="3.5" />
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="url(#atlasRing)" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${Math.max(pct > 0 ? 2 : 0, Math.min(100, pct)) * 0.974} 100`} style={{ filter: "drop-shadow(0 0 3px #4FD49A)" }} />
                </svg>
                <span className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-rpg text-xl font-bold text-rpg-text">{pr.region ? `${pct}%` : "—"}</span>
                  <span className="text-[9px] text-rpg-muted">{pr.region?.city ?? "região"}</span>
                </span>
              </div>
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5">
                {[
                  { l: "Área revelada", v: `${nf(pr.areaKm2)} km²`, c: "text-rpg-green" },
                  { l: "Lugares", v: pr.places, c: "text-rpg-gold-light" },
                  { l: "Bairros", v: pr.neighborhoods, c: "text-rpg-cyan" },
                  { l: "Cidades", v: pr.cities, c: "text-rpg-purple" },
                  { l: "Estados/países", v: `${pr.states}/${pr.countries}`, c: "text-rpg-pink" },
                  { l: "Rotas", v: pr.routeKm ? `${pr.routes} · ${nf(pr.routeKm)} km` : pr.routes, c: "text-rpg-blue" },
                ].map((x) => (
                  <div key={x.l} className="rpg-tile px-2 py-1.5">
                    <p className={clsx("font-rpg text-base font-bold leading-tight", x.c)}>{x.v}</p>
                    <p className="text-[10px] text-rpg-muted">{x.l}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-4 pb-4">
              {pr.region ? (
                <p className="text-[11px] text-rpg-muted">
                  {pct}% = {nf(pr.region.revealedCells)} de {nf(pr.region.totalCells)} células de ~500 m dentro do retângulo de {pr.region.city}. Cada check-in revela ~1,4 km ao redor.
                </p>
              ) : (
                <p className="text-[11px] text-rpg-muted">A porcentagem aparece depois do primeiro lugar com cidade identificada.</p>
              )}
              {pr.regions.length > 1 && (
                <select aria-label="Região de referência" value={pr.region?.key ?? ""} onChange={(e) => setRegion(e.target.value || null)} className={clsx(INPUT, "mt-2 w-full py-1 text-xs")} style={R}>
                  {pr.regions.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label} ({r.places})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </section>

          <Panel title="Conquistas do Atlas" icon={<Trophy size={17} className="text-rpg-gold" aria-hidden />} action={<span className="text-[11px] text-rpg-muted">{o.achievements.filter((x) => x.unlockedAt).length}/{o.achievements.length}</span>}>
            <ul className="space-y-1.5">
              {o.achievements.map((x) => {
                const metric = ACH_METRIC[x.code];
                const value = metric ? Number(pr[metric] ?? 0) : 0;
                const done = Boolean(x.unlockedAt) || value >= x.threshold;
                return (
                  <li key={x.code} className={clsx("rpg-tile flex items-center gap-2.5 p-2", done && "border-rpg-gold/60 bg-rpg-gold/5")} title={x.description}>
                    <span className={clsx("flex h-9 w-9 shrink-0 items-center justify-center border-2", done ? "border-rpg-gold bg-rpg-gold/15 text-rpg-gold" : "border-rpg-border text-rpg-muted")} style={{ borderRadius: 8, transform: "rotate(45deg)" }}>
                      <span style={{ transform: "rotate(-45deg)" }}>{done ? <Shield size={16} aria-hidden /> : <Lock size={14} aria-hidden />}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-rpg-text">{x.title}</p>
                      <p className="truncate text-[10px] text-rpg-muted">{x.description}</p>
                      {!done && (
                        <div className="mt-1 h-1 overflow-hidden bg-rpg-bg-2" style={R}>
                          <div className="h-full bg-gradient-to-r from-violet-400 to-cyan-300" style={{ width: `${Math.min(100, (value / x.threshold) * 100)}%` }} />
                        </div>
                      )}
                    </div>
                    <span className={clsx("text-[11px] font-bold tabular-nums", done ? "text-rpg-gold" : "text-rpg-muted")}>{done ? "✓" : `${nf(Math.min(value, x.threshold))}/${nf(x.threshold)}`}</span>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel title="Últimas explorações" icon={<Navigation size={17} className="text-rpg-cyan" aria-hidden />}>
            {o.recent.length === 0 ? (
              <EmptyNote>Seus check-ins aparecem aqui.</EmptyNote>
            ) : (
              <ol className="relative space-y-2 border-l-2 border-rpg-cyan/40 pl-4">
                {o.recent.slice(0, 5).map((r) => (
                  <li key={r.id} className="relative">
                    <span className="absolute -left-[23px] top-2 h-3 w-3 rounded-full border-2 border-rpg-cyan bg-rpg-bg" aria-hidden />
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-rpg-text">{r.name}</p>
                        <p className="truncate text-[11px] text-rpg-muted">{r.where || (r.method === "localizacao" ? "Check-in por localização" : "Check-in manual")}</p>
                      </div>
                      <div className="shrink-0 text-right text-[10px]">
                        <p className="text-rpg-muted">{ago(r.visitedAt)}</p>
                        {r.xp > 0 && <p className="font-semibold text-rpg-green">+{r.xp} XP</p>}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel title="Diário do Explorador" icon={<BookOpen size={17} className="text-rpg-pink" aria-hidden />}>
            <p className="text-sm text-rpg-muted">Registre impressões, fotos e anotações das suas explorações.</p>
            {o.journal.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm">
                {o.journal.slice(0, 3).map((j) => (
                  <li key={j.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-rpg-text">
                      {j.hasPhoto && <Camera size={12} className="mr-1 inline text-rpg-muted" aria-label="com foto" />}
                      {j.title}
                    </span>
                    <span className="shrink-0 text-[11px] text-rpg-muted">{fmtDay(j.visitedOn)}</span>
                  </li>
                ))}
              </ul>
            )}
            <RPGButton variant="pink" className="mt-3 w-full" onClick={() => setJournalOpen(true)}>
              <BookOpen size={15} aria-hidden /> Abrir diário
            </RPGButton>
          </Panel>

          <Panel title="Privacidade" icon={<Lock size={17} className="text-rpg-muted" aria-hidden />}>
            <p className="text-[11px] text-rpg-muted">Histórico privado. O OpenStreetMap só recebe o termo buscado ou um ponto isolado; nada é publicado.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <RPGButton variant="secondary" onClick={() => void exportData()}>
                <Download size={14} aria-hidden /> Exportar
              </RPGButton>
              <RPGButton variant="secondary" onClick={() => setPrivacyOpen(true)}>
                <Lock size={14} aria-hidden /> Configurar
              </RPGButton>
            </div>
          </Panel>
        </aside>
      </div>

      <CheckinModal draft={draft} setDraft={setDraft} onSave={saveDraft} saving={a.checkin.isPending} />
      <Modal open={consentOpen} onClose={() => setConsentOpen(false)} title="Usar sua localização no Atlas?">
        <div className="space-y-3 text-sm">
          <p>Com a localização ativada, o check-in usa o GPS do aparelho para sugerir o lugar — você sempre confirma antes de salvar.</p>
          <ul className="space-y-1 text-xs text-rpg-muted">
            <li>• Nada de rastreamento em segundo plano: a posição só é lida quando você toca em “Fazer check-in” ou grava uma rota.</li>
            <li>• Por padrão a coordenada é arredondada (~110 m). A precisão exata é opcional.</li>
            <li>• Dá para desativar e apagar o histórico a qualquer momento.</li>
          </ul>
          <div className="flex justify-end gap-2">
            <RPGButton variant="ghost" onClick={() => setConsentOpen(false)}>
              Agora não
            </RPGButton>
            <RPGButton onClick={() => a.settings.mutate({ locationEnabled: true }, { onSuccess: () => { setConsentOpen(false); notify("Localização ativada para check-ins."); } })}>Ativar localização</RPGButton>
          </div>
        </div>
      </Modal>
      <PrivacyModal open={privacyOpen} onClose={() => setPrivacyOpen(false)} o={o} onSetting={(p) => a.settings.mutate(p)} onExport={() => void exportData()} onDeleteAll={() => a.deleteHistory.mutate(undefined, { onSuccess: () => { setPrivacyOpen(false); notify("Histórico do Atlas apagado."); } })} onDeleteRoute={(id) => a.deleteRoute.mutate(id)} />
      <JournalModal open={journalOpen} onClose={() => setJournalOpen(false)} o={o} notify={notify} />
    </div>
  );
}

function PlacePopup({ p, onFav, onRevisit, onDelete }: { p: AtlasPlace; onFav: () => void; onRevisit: () => void; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="min-w-[180px] text-slate-800">
      <p className="font-bold">{p.name}</p>
      <p className="text-xs">{[p.neighborhood, p.city, p.state].filter(Boolean).join(", ")}</p>
      <p className="text-xs">
        {CATEGORY[p.category]?.label} · {p.visits} visita(s)
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        <button type="button" className="rounded border px-2 py-0.5 text-xs" onClick={onFav}>
          {p.favorite ? "★ Favorito" : "☆ Favoritar"}
        </button>
        <button type="button" className="rounded border px-2 py-0.5 text-xs" onClick={onRevisit}>
          Registrar visita
        </button>
        {confirm ? (
          <button type="button" className="rounded border border-red-500 px-2 py-0.5 text-xs text-red-600" onClick={onDelete}>
            Confirmar exclusão
          </button>
        ) : (
          <button type="button" className="rounded border px-2 py-0.5 text-xs" onClick={() => setConfirm(true)} aria-label="Excluir lugar">
            <Trash2 size={11} className="inline" /> Excluir
          </button>
        )}
      </div>
    </div>
  );
}

function CheckinModal({ draft, setDraft, onSave, saving }: { draft: Draft | null; setDraft: (d: Draft | null) => void; onSave: () => void; saving: boolean }) {
  return (
    <Modal open={!!draft} onClose={() => setDraft(null)} title="Registrar visita">
      {draft && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
          <label className="block text-sm">
            Nome do lugar
            <input className={clsx(INPUT, "mt-1 w-full")} style={R} value={draft.name} maxLength={160} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ex.: Parque da Juventude" />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-sm">
              Categoria
              <select className={clsx(INPUT, "mt-1 w-full")} style={R} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                {CATS.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY[c]!.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Quando
              <input type="datetime-local" className={clsx(INPUT, "mt-1 w-full")} style={R} value={draft.visitedAt} max={localNow()} onChange={(e) => setDraft({ ...draft, visitedAt: e.target.value })} />
            </label>
          </div>
          <p className="text-xs text-rpg-muted">
            {[draft.neighborhood, draft.city, draft.state, draft.country].filter(Boolean).join(", ") || "Endereço será identificado pelo OpenStreetMap, se disponível."}
            {draft.method === "localizacao" ? " · via localização" : " · check-in manual"}
          </p>
          <div className="flex justify-end gap-2">
            <RPGButton type="button" variant="ghost" onClick={() => setDraft(null)}>
              Cancelar
            </RPGButton>
            <RPGButton type="submit" disabled={saving}>
              {saving ? <Spinner /> : <MapPin size={15} aria-hidden />} Confirmar check-in
            </RPGButton>
          </div>
        </form>
      )}
    </Modal>
  );
}

function PrivacyModal({ open, onClose, o, onSetting, onExport, onDeleteAll, onDeleteRoute }: { open: boolean; onClose: () => void; o: AtlasOverview; onSetting: (p: Partial<AtlasOverview["settings"]>) => void; onExport: () => void; onDeleteAll: () => void; onDeleteRoute: (id: string) => void }) {
  const [confirm, setConfirm] = useState("");
  return (
    <Modal open={open} onClose={onClose} title="Privacidade do Atlas">
      <div className="space-y-3 text-sm">
        {([
          ["locationEnabled", "Usar localização no check-in", "Desligada por padrão. Nada roda em segundo plano."],
          ["preciseLocation", "Precisão exata", "Sem isso, o GPS é arredondado para ~110 m antes de salvar."],
          ["useStravaRoutes", "Usar rotas do Strava", "Revela no mapa o trajeto dos treinos importados (opcional)."],
        ] as const).map(([k, label, hint]) => (
          <div key={k} className="flex items-center justify-between gap-3">
            <span>
              {label}
              <span className="block text-xs text-rpg-muted">{hint}</span>
            </span>
            <RPGSwitch checked={o.settings[k]} onChange={() => onSetting({ [k]: !o.settings[k] })} label={label} />
          </div>
        ))}
        {o.routes.length > 0 && (
          <div>
            <p className="mb-1 font-semibold">Rotas salvas</p>
            <ul className="max-h-32 space-y-1 overflow-auto text-xs">
              {o.routes.map((r) => (
                <li key={r.id} className="flex items-center justify-between">
                  <span>
                    {r.name} {r.distanceKm ? `· ${nf(r.distanceKm)} km` : ""} {r.source === "strava" ? "(Strava)" : ""}
                  </span>
                  <button type="button" className="text-rpg-red" onClick={() => onDeleteRoute(r.id)} aria-label={`Excluir rota ${r.name}`}>
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <RPGButton variant="secondary" onClick={onExport}>
            <Download size={14} aria-hidden /> Exportar meus dados (JSON)
          </RPGButton>
        </div>
        <div className="border border-rpg-red/50 p-3" style={R}>
          <p className="font-semibold text-rpg-red">Apagar todo o histórico</p>
          <p className="text-xs text-rpg-muted">Remove lugares, check-ins, rotas, névoa revelada e o diário. O XP já ganho permanece.</p>
          <div className="mt-2 flex gap-2">
            <input aria-label="Digite APAGAR para confirmar" className={clsx(INPUT, "flex-1")} style={R} placeholder="Digite APAGAR" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <RPGButton variant="danger" disabled={confirm !== "APAGAR"} onClick={onDeleteAll}>
              Apagar
            </RPGButton>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function JournalModal({ open, onClose, o, notify }: { open: boolean; onClose: () => void; o: AtlasOverview; notify: (m: string, t?: "success" | "error") => void }) {
  const a = useAtlasActions();
  const empty = { id: undefined as string | undefined, title: "", body: "", rating: 0, category: "", tags: "", placeId: "", visitedOn: new Date().toISOString().slice(0, 10), photo: undefined as string | null | undefined };
  const [f, setF] = useState(empty);
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);
  useEffect(() => {
    if (!open) setF(empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const save = () =>
    a.saveJournal.mutate(
      { id: f.id, title: f.title.trim(), body: f.body.trim() || null, rating: f.rating || null, category: f.category || null, tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean), placeId: f.placeId || null, visitedOn: f.visitedOn, ...(f.photo !== undefined ? { photo: f.photo } : {}) },
      { onSuccess: () => { setF(empty); notify("Registro salvo no Diário do Explorador."); }, onError: (e) => notify(errMsg(e, "Não foi possível salvar."), "error") }
    );
  return (
    <Modal open={open} onClose={onClose} title="Diário do Explorador" size="lg">
      <div className="grid gap-4 md:grid-cols-2">
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (f.title.trim()) save();
          }}
        >
          <input className={clsx(INPUT, "w-full")} style={R} placeholder="Título" value={f.title} maxLength={140} onChange={(e) => setF({ ...f, title: e.target.value })} aria-label="Título" />
          <div className="grid grid-cols-2 gap-2">
            <select className={INPUT} style={R} value={f.placeId} onChange={(e) => setF({ ...f, placeId: e.target.value })} aria-label="Lugar">
              <option value="">Sem lugar</option>
              {o.places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input type="date" className={INPUT} style={R} value={f.visitedOn} onChange={(e) => setF({ ...f, visitedOn: e.target.value })} aria-label="Data" />
          </div>
          <textarea className={clsx(INPUT, "h-24 w-full")} style={R} placeholder="Impressões, descobertas, o que sentiu…" value={f.body} maxLength={5000} onChange={(e) => setF({ ...f, body: e.target.value })} aria-label="Texto" />
          <div className="grid grid-cols-2 gap-2">
            <input className={INPUT} style={R} placeholder="Categoria do passeio" value={f.category} maxLength={40} onChange={(e) => setF({ ...f, category: e.target.value })} aria-label="Categoria do passeio" />
            <input className={INPUT} style={R} placeholder="Marcadores (vírgula)" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} aria-label="Marcadores" />
          </div>
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Avaliação pessoal">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={f.rating === n} onClick={() => setF({ ...f, rating: f.rating === n ? 0 : n })} className={n <= f.rating ? "text-rpg-gold" : "text-rpg-muted"} aria-label={`${n} estrela(s)`}>
                <Star size={18} fill={n <= f.rating ? "currentColor" : "none"} />
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-rpg-muted">
            <Camera size={14} aria-hidden /> Foto (opcional)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="text-xs"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  setF({ ...f, photo: await compressPhoto(file) });
                } catch {
                  notify("Não foi possível ler a foto.", "error");
                }
              }}
            />
          </label>
          {f.photo && <img src={f.photo} alt="Prévia da foto" className="max-h-32 rounded" />}
          <RPGButton type="submit" disabled={!f.title.trim() || a.saveJournal.isPending} className="w-full">
            {f.id ? "Atualizar registro" : "Salvar no diário"}
          </RPGButton>
        </form>
        <div className="max-h-[420px] space-y-2 overflow-auto">
          {o.journal.length === 0 ? (
            <EmptyNote>Seus registros aparecem aqui.</EmptyNote>
          ) : (
            o.journal.map((j) => (
              <article key={j.id} className="rpg-tile p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-rpg-text">{j.title}</p>
                    <p className="text-[11px] text-rpg-muted">
                      {fmtDay(j.visitedOn)}
                      {j.placeName ? ` · ${j.placeName}` : ""}
                      {j.rating ? ` · ${"★".repeat(j.rating)}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {j.hasPhoto && (
                      <button type="button" aria-label="Ver foto" className="text-rpg-muted hover:text-rpg-text" onClick={() => void adventuresService.journalPhoto(j.id).then((r) => setViewPhoto(r.photo))}>
                        <Camera size={14} />
                      </button>
                    )}
                    <button type="button" aria-label="Editar" className="text-rpg-muted hover:text-rpg-text" onClick={() => setF({ id: j.id, title: j.title, body: j.body ?? "", rating: j.rating ?? 0, category: j.category ?? "", tags: j.tags.join(", "), placeId: j.placeId ?? "", visitedOn: j.visitedOn, photo: undefined })}>
                      <BookOpen size={14} />
                    </button>
                    <button type="button" aria-label="Excluir" className="text-rpg-red" onClick={() => a.deleteJournal.mutate(j.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {j.body && <p className="mt-1 line-clamp-3 text-sm text-rpg-text">{j.body}</p>}
                {j.tags.length > 0 && <p className="mt-1 text-[10px] text-rpg-muted">{j.tags.map((t) => `#${t}`).join(" ")}</p>}
              </article>
            ))
          )}
        </div>
      </div>
      {viewPhoto && (
        <button type="button" className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80" onClick={() => setViewPhoto(null)} aria-label="Fechar foto">
          <img src={viewPhoto} alt="Foto do diário" className="max-h-[85vh] max-w-[90vw]" />
        </button>
      )}
    </Modal>
  );
}

