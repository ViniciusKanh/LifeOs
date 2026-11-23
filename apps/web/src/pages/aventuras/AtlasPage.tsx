import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import clsx from "clsx";
import { BookOpen, Building2, Compass, Download, Footprints, Landmark, LocateFixed, Lock, MapPin, Navigation, Route, Search, Shield, Star, Trash2, Trees, Utensils, Mountain, ShoppingBag, Theater, Church, Trophy, Camera } from "lucide-react";
import { RPGButton, RPGSwitch, RPGToast } from "@/components/rpg";
import { Modal } from "@/components/ui/Modal";
import { useAtlas, useAtlasActions } from "@/hooks/useAdventures";
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

function pinIcon(color: string, star: boolean) {
  return L.divIcon({
    className: "",
    html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #1d1a24;box-shadow:0 0 10px ${color}"><div style="transform:rotate(45deg);text-align:center;line-height:22px;font-size:12px">${star ? "★" : "●"}</div></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -24],
  });
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
      ctx.fillStyle = "rgba(14,12,34,0.72)";
      ctx.fillRect(0, 0, size.x, size.y);
      ctx.globalCompositeOperation = "destination-out";
      ctx.shadowColor = "black";
      ctx.shadowBlur = Math.max(6, Math.min(30, map.getZoom() * 1.6));
      ctx.fillStyle = "black";
      const b = map.getBounds().pad(0.2);
      for (const c of cellsRef.current) {
        const [i, j] = c.split(":").map(Number) as [number, number];
        const s = i * cellDeg;
        const w = j * cellDeg;
        if (s > b.getNorth() || s + cellDeg < b.getSouth() || w > b.getEast() || w + cellDeg < b.getWest()) continue;
        const p1 = map.latLngToContainerPoint([s + cellDeg, w]);
        const p2 = map.latLngToContainerPoint([s, w + cellDeg]);
        ctx.fillRect(p1.x - 1, p1.y - 1, p2.x - p1.x + 2, p2.y - p1.y + 2);
      }
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
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtros">
                {[
                  ["todos", "Todos"],
                  ["favoritos", "★ Favoritos"],
                ].map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k!)} className={clsx("border-2 px-2.5 py-1 text-xs", filter === k ? "border-rpg-purple text-rpg-text" : "border-rpg-border text-rpg-muted")} style={R}>
                    {l}
                  </button>
                ))}
                <select aria-label="Filtrar por categoria" value={CATS.includes(filter) ? filter : ""} onChange={(e) => setFilter(e.target.value || "todos")} className={clsx(INPUT, "py-1 text-xs")} style={R}>
                  <option value="">Categoria…</option>
                  {CATS.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY[c]!.label}
                    </option>
                  ))}
                </select>
              </div>
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
            <div className={clsx("relative isolate z-0 h-[420px] overflow-hidden border-2 border-rpg-purple/50 sm:h-[480px]", picking && "cursor-crosshair")} style={R}>
              <MapContainer center={center} zoom={13} className="h-full w-full" scrollWheelZoom attributionControl>
                <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
                <FogLayer cells={o.cells} cellDeg={o.cellDeg} />
                <ClickToPick active={picking} onPick={(lat, lng) => void pickPoint(lat, lng)} />
                <FlyTo target={fly} />
                {o.routes.map((r) => (
                  <Polyline key={r.id} positions={r.points} pathOptions={{ color: "#59D4F8", weight: 3, dashArray: "6 6" }} />
                ))}
                {routeRec && routeRec.points.length > 1 && <Polyline positions={routeRec.points} pathOptions={{ color: "#4FD49A", weight: 4 }} />}
                {places.map((p) => (
                  <Marker key={p.id} position={[p.lat, p.lng]} icon={pinIcon(CATEGORY[p.category]?.color ?? "#cfd6e6", p.favorite)}>
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

          <Panel title={`Lugares descobertos (${pr.places})`} icon={<Landmark size={17} className="text-rpg-gold" aria-hidden />}>
            {o.places.length === 0 ? (
              <EmptyNote>Nenhum lugar ainda. Cada check-in vira uma descoberta com XP.</EmptyNote>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {o.places.slice(0, 8).map((p) => {
                  const C = CATEGORY[p.category] ?? CATEGORY.outro!;
                  return (
                    <button key={p.id} type="button" onClick={() => setFly([p.lat, p.lng])} className="rpg-tile overflow-hidden p-0 text-left hover:brightness-110">
                      <div className="flex h-16 items-center justify-center" style={{ background: `linear-gradient(135deg, ${C.color}55, #1d1a2490)` }}>
                        <C.icon size={28} style={{ color: C.color }} aria-hidden />
                        {p.favorite && <Star size={14} className="ml-1 text-rpg-gold" fill="currentColor" aria-label="favorito" />}
                      </div>
                      <div className="p-2">
                        <p className="truncate text-sm font-semibold text-rpg-text">{p.name}</p>
                        <p className="truncate text-[11px] text-rpg-muted">{[p.neighborhood, p.city].filter(Boolean).join(", ") || "Local sem endereço"}</p>
                        <p className="mt-1 flex items-center justify-between text-[10px]">
                          <span className="border border-rpg-border px-1.5" style={R}>
                            {C.label}
                          </span>
                          <span className="text-rpg-muted">{p.visits} visita(s)</span>
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel title="Progresso de Exploração" icon={<Compass size={17} className="text-rpg-purple" aria-hidden />}>
            <div className="flex items-center gap-4">
              <div className="relative h-24 w-24 shrink-0" role="img" aria-label={pr.region ? `${pct}% de ${pr.region.city}` : "Sem região de referência"}>
                <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="#2a2740" strokeWidth="4" />
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="#4FD49A" strokeWidth="4" strokeDasharray={`${Math.min(100, pct) * 0.974} 100`} />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center font-rpg text-xl font-bold text-rpg-text">{pr.region ? `${pct}%` : "—"}</span>
              </div>
              <ul className="min-w-0 flex-1 space-y-1 text-xs">
                <li className="flex justify-between"><span className="text-rpg-muted">Área revelada</span><span className="font-semibold text-rpg-text">{nf(pr.areaKm2)} km²</span></li>
                <li className="flex justify-between"><span className="text-rpg-muted">Lugares descobertos</span><span className="font-semibold text-rpg-text">{pr.places}</span></li>
                <li className="flex justify-between"><span className="text-rpg-muted">Cidades visitadas</span><span className="font-semibold text-rpg-text">{pr.cities}</span></li>
                <li className="flex justify-between"><span className="text-rpg-muted">Bairros explorados</span><span className="font-semibold text-rpg-text">{pr.neighborhoods}</span></li>
                <li className="flex justify-between"><span className="text-rpg-muted">Estados / países</span><span className="font-semibold text-rpg-text">{pr.states} / {pr.countries}</span></li>
                <li className="flex justify-between"><span className="text-rpg-muted">Rotas registradas</span><span className="font-semibold text-rpg-text">{pr.routes}{pr.routeKm ? ` · ${nf(pr.routeKm)} km` : ""}</span></li>
              </ul>
            </div>
            {pr.region ? (
              <p className="mt-2 text-[11px] text-rpg-muted">
                {pct}% = {nf(pr.region.revealedCells)} de {nf(pr.region.totalCells)} células de ~500 m dentro do retângulo de {pr.region.city}. Cada check-in revela ~1,4 km ao redor.
              </p>
            ) : (
              <p className="mt-2 text-[11px] text-rpg-muted">A porcentagem aparece depois do primeiro lugar com cidade identificada.</p>
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
          </Panel>

          <Panel title="Conquistas do Atlas" icon={<Trophy size={17} className="text-rpg-gold" aria-hidden />}>
            <div className="grid grid-cols-4 gap-1.5">
              {o.achievements.slice(0, 8).map((x) => (
                <div key={x.code} className={clsx("flex flex-col items-center border-2 p-1.5 text-center", x.unlockedAt ? "border-rpg-gold/70 bg-rpg-gold/10" : "border-rpg-border/60 opacity-60")} style={R} title={x.description}>
                  {x.unlockedAt ? <Shield size={20} className="text-rpg-gold" aria-hidden /> : <Lock size={18} className="text-rpg-muted" aria-hidden />}
                  <span className="text-[10px] leading-tight text-rpg-text">{x.title}</span>
                </div>
              ))}
            </div>
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

