import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CloudSun, Droplets, Gauge, Info, Lamp, Loader2, MapPin, Music, Navigation, RefreshCw, Search, Sun, Thermometer, Umbrella, Wind } from "lucide-react";
import { RPGButton, RPGSwitch, RPGToast } from "@/components/rpg";
import { WorldCanvas } from "@/components/living-world/WorldCanvas";
import { usePrefersReducedMotion, useWorldEngineInputs } from "@/components/living-world/useWorldEngineInputs";
import { VISUAL_LABEL, WeatherIcon, WeatherThumb } from "@/components/living-world/weather/WeatherWidgets";
import type { WorldWeather } from "@/components/living-world/engine/weather";
import { useLivingWorld, useWorldActions, useWorldWeather, WORLD_KEY } from "@/hooks/useLivingWorld";
import { contextService } from "@/services/contextService";
import type { WeatherVisual, WorldSettings, WorldWeatherData } from "@/services/livingWorldService";
import type { GeocodeResult } from "@/types";

const R = { borderRadius: 6 };
const PREVIEWS: Array<{ visual: WeatherVisual; label: string }> = [
  { visual: "clear", label: "Céu limpo" },
  { visual: "fog", label: "Neblina" },
  { visual: "storm", label: "Tempestade com relâmpago" },
  { visual: "rain", label: "Chuva" },
];

const COMPASS = ["N", "NE", "L", "SE", "S", "SO", "O", "NO"];
const compass = (deg: number | null) => (deg == null ? "" : COMPASS[Math.round(deg / 45) % 8]!);
const hourLabel = (iso: string) => `${iso.slice(11, 13)}h`;
const isNightHour = (iso: string) => {
  const h = Number(iso.slice(11, 13));
  return h >= 19 || h < 6;
};
const timeAgo = (iso: string) => {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return min < 1 ? "agora" : min < 60 ? `há ${min} min` : `há ${Math.round(min / 60)} h`;
};

/** Efeitos reais que o clima atual causa na Vila (o que a tela descreve é o que o motor faz). */
function impactsFor(visual: WeatherVisual, settings: WorldSettings | undefined) {
  const wet = visual === "drizzle" || visual === "rain" || visual === "heavy_rain" || visual === "storm";
  return [
    {
      icon: Umbrella,
      tone: "text-rpg-blue",
      title: visual === "storm" ? "NPCs procuram abrigo" : wet ? "NPCs usam guarda-chuva" : visual === "fog" ? "Vila em silêncio" : "Vila movimentada",
      text: visual === "storm" ? "Aldeões correm para a porta coberta mais próxima." : wet ? "Dois terços dos aldeões abrem o guarda-chuva; os outros correm para se abrigar." : visual === "fog" ? "Neblina reduz a visibilidade; os pássaros somem do céu." : "Comerciantes nas lojas e borboletas no jardim.",
    },
    {
      icon: Music,
      tone: "text-rpg-purple",
      title: settings?.sound ? (wet ? "Som de chuva ligado" : "Som ambiente ligado") : "Som desligado",
      text: settings?.sound ? (visual === "storm" ? "Chuva contínua e trovão a cada relâmpago." : wet ? "Chuva contínua, mais forte quanto pior o tempo." : "Sem efeitos sonoros de clima agora.") : "Ative em Configurações para ouvir chuva e trovões.",
    },
    {
      icon: wet ? Droplets : Sun,
      tone: "text-rpg-green",
      title: wet ? "Poças e reflexos" : visual === "snow" ? "Neve caindo" : "Céu e sombras naturais",
      text: wet ? "Poças nas ruas com anéis de gotas; a chuva inclina com o vento real." : visual === "snow" ? "Flocos caindo e luz mais fria." : "Nuvens à deriva e luz conforme a hora do dia.",
    },
    {
      icon: Lamp,
      tone: "text-rpg-gold",
      title: wet || visual === "fog" ? "Iluminação ajustada" : "Iluminação natural",
      text: wet || visual === "fog" ? "Janelas e postes acendem e ficam mais quentes mesmo de dia." : "Luzes acendem só à noite.",
    },
  ];
}

function WeatherPanel({ d, onRefresh, refreshing }: { d: WorldWeatherData; onRefresh: () => void; refreshing: boolean }) {
  const c = d.current;
  const night = c.isDay === false;
  return (
    <section className="rpg-panel flex h-full flex-col gap-3 p-4" aria-label="Clima atual">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm text-rpg-text">
            <MapPin size={15} className="text-rpg-gold" aria-hidden /> Cidade: <strong className="truncate">{d.location.city ?? "—"}</strong>
          </p>
          <p className={clsx("mt-0.5 flex items-center gap-1.5 text-xs", d.stale ? "text-rpg-orange" : "text-rpg-green")}>
            <span className={clsx("h-2 w-2 rounded-full", d.stale ? "bg-rpg-orange" : "bg-rpg-green")} aria-hidden />
            {d.stale ? `Desatualizado (última leitura ${timeAgo(d.fetchedAt)})` : `Atualizado ${timeAgo(d.fetchedAt)}`}
          </p>
        </div>
        <button type="button" onClick={onRefresh} disabled={refreshing} className="rpg-tile flex h-9 w-9 items-center justify-center text-rpg-text" aria-label="Atualizar clima">
          <RefreshCw size={15} className={clsx(refreshing && "animate-spin")} aria-hidden />
        </button>
      </div>
      <div className="flex items-center gap-3 border-y border-rpg-border/60 py-3">
        <WeatherIcon visual={c.visual} night={night} size={52} />
        <div>
          <p className="font-rpg text-5xl font-bold leading-none text-rpg-text">{Math.round(c.temperature)}°C</p>
          <p className="mt-1 text-sm text-rpg-muted">{c.label}</p>
        </div>
        <div className="ml-auto border-l border-rpg-border/60 pl-3 text-right">
          <p className="flex items-center justify-end gap-1 text-[11px] text-rpg-muted">
            <Thermometer size={12} aria-hidden /> Sensação
          </p>
          <p className="text-xl font-semibold text-rpg-text">{Math.round(c.apparentTemperature)}°C</p>
        </div>
      </div>
      <dl className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="flex items-center gap-2 text-rpg-muted">
            <Droplets size={15} className="text-rpg-blue" aria-hidden /> Umidade
          </dt>
          <dd className="font-semibold text-rpg-text">{c.humidity == null ? "—" : `${c.humidity}%`}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="flex items-center gap-2 text-rpg-muted">
            <Wind size={15} className="text-rpg-blue" aria-hidden /> Vento
          </dt>
          <dd className="flex items-center gap-1 font-semibold text-rpg-text">
            {c.windSpeedKmh == null ? "—" : `${Math.round(c.windSpeedKmh)} km/h`}
            {c.windDirection != null && (
              <span className="flex items-center gap-0.5 text-xs text-rpg-muted" title={`Vento de ${compass(c.windDirection)}`}>
                <Navigation size={12} style={{ transform: `rotate(${c.windDirection + 180}deg)` }} aria-hidden /> {compass(c.windDirection)}
              </span>
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="flex items-center gap-2 text-rpg-muted" title="Probabilidade prevista para esta hora — não é chuva medida">
            <Umbrella size={15} className="text-rpg-blue" aria-hidden /> Chance de chuva (prevista)
          </dt>
          <dd className="font-semibold text-rpg-text">{c.precipitationProbability == null ? "—" : `${c.precipitationProbability}%`}</dd>
        </div>
      </dl>
      <p className="mt-auto text-right text-[11px] text-rpg-muted">
        Fonte:{" "}
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="text-rpg-blue underline">
          Open-Meteo
        </a>
      </p>
    </section>
  );
}

function LocationEditor({ city, onSaved }: { city: string | null; onSaved: (msg: string, tone?: "success" | "error") => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const search = useMutation({ mutationFn: (query: string) => contextService.geocode(query), onSuccess: setResults, onError: () => onSaved("Não foi possível buscar a cidade.", "error") });
  const save = useMutation({
    mutationFn: (r: GeocodeResult) => contextService.updateLocation({ city: r.name, region: r.region, country: r.country, latitude: r.latitude, longitude: r.longitude, timezone: r.timezone }),
    onSuccess: () => {
      setResults(null);
      setQ("");
      void qc.invalidateQueries({ queryKey: [...WORLD_KEY, "weather"] });
      void qc.invalidateQueries({ queryKey: ["context"] });
      onSaved("Cidade do clima atualizada.");
    },
    onError: () => onSaved("Não foi possível salvar a cidade.", "error"),
  });
  return (
    <div className="space-y-2">
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim().length >= 2) search.mutate(q.trim());
        }}
      >
        <label className="sr-only" htmlFor="clima-cidade">
          Cidade
        </label>
        <input id="clima-cidade" value={q} onChange={(e) => setQ(e.target.value)} placeholder={city ? `Trocar ${city}…` : "Buscar cidade (ex.: São Paulo)"} className="min-w-0 flex-1 border border-rpg-border bg-rpg-bg-2 px-2 py-1.5 text-sm text-rpg-text outline-none focus:border-rpg-gold" style={R} />
        <RPGButton variant="secondary" className="text-xs" disabled={search.isPending || q.trim().length < 2} type="submit">
          {search.isPending ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Search size={13} aria-hidden />} Buscar
        </RPGButton>
      </form>
      {results && (
        <ul className="space-y-1" aria-label="Cidades encontradas">
          {results.length === 0 && <li className="text-xs text-rpg-muted">Nenhuma cidade encontrada.</li>}
          {results.map((r) => (
            <li key={`${r.latitude},${r.longitude}`}>
              <button type="button" onClick={() => save.mutate(r)} disabled={save.isPending} className="rpg-tile w-full px-2 py-1.5 text-left text-sm text-rpg-text">
                {r.name}
                <span className="text-xs text-rpg-muted"> · {[r.region, r.country].filter(Boolean).join(", ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[10px] text-rpg-muted">É a mesma cidade do Contexto do Dia. Guardamos só a cidade escolhida, nunca um histórico de localização.</p>
    </div>
  );
}

/** Painel "Clima real no Meu Mundo": a Vila reage ao tempo da cidade do usuário. */
export function ClimaPage() {
  const q = useLivingWorld();
  const w = q.data;
  const actions = useWorldActions();
  const reduced = usePrefersReducedMotion();
  const { engineSettings, engineData } = useWorldEngineInputs(w, null, reduced);
  const enabled = w?.settings.weatherEnabled ?? true;
  const weather = useWorldWeather(!!w);
  const d = weather.data && "current" in weather.data ? weather.data : null;
  const [demo, setDemo] = useState<WeatherVisual | null>(null);
  const [hourIdx, setHourIdx] = useState(0);
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);
  const notify = (msg: string, tone: "success" | "error" = "success") => setToast({ msg, tone });
  const saveSettings = (p: Partial<WorldSettings>) => actions.saveSettings.mutate(p, { onError: () => notify("Não foi possível salvar.", "error") });

  const shownVisual: WeatherVisual | null = demo ?? (enabled && d ? d.current.visual : null);
  const engineWeather: WorldWeather | null = useMemo(
    () => (shownVisual ? { visual: shownVisual, intensity: w?.settings.weatherIntensity ?? 2, particles: w?.settings.weatherParticles ?? true, windDirection: d?.current.windDirection ?? null, windSpeedKmh: d?.current.windSpeedKmh ?? null } : null),
    [shownVisual, w?.settings.weatherIntensity, w?.settings.weatherParticles, d],
  );
  const impacts = impactsFor(shownVisual ?? "clear", w?.settings);
  const selectedHour = d?.hourly[hourIdx] ?? null;
  const localHour = w?.localHour ?? 14;

  const statusLive = !enabled ? { label: "Desligado", tone: "text-rpg-muted", dot: "bg-rpg-muted" } : !weather.data ? { label: "Conectando…", tone: "text-rpg-muted", dot: "bg-rpg-muted" } : !weather.data.configured ? { label: "Sem cidade", tone: "text-rpg-orange", dot: "bg-rpg-orange" } : "unavailable" in weather.data ? { label: "Indisponível", tone: "text-rpg-red", dot: "bg-rpg-red" } : d?.stale ? { label: "Desatualizado", tone: "text-rpg-orange", dot: "bg-rpg-orange" } : { label: "Conectado", tone: "text-rpg-green", dot: "bg-rpg-green" };

  return (
    <div className="space-y-4 px-3 py-4 sm:px-4 md:px-6">
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
      <Link to="/meu-mundo" className="inline-flex items-center gap-1.5 border border-rpg-border bg-rpg-bg-2/70 px-2.5 py-1 text-xs font-semibold text-rpg-green" style={R}>
        <ArrowLeft size={13} aria-hidden /> Meu Mundo — Vila
      </Link>
      <header className="flex flex-wrap items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center text-rpg-blue" aria-hidden>
          <CloudSun size={40} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="rpg-title font-rpg text-3xl font-bold leading-none text-rpg-text sm:text-4xl">Clima real no Meu Mundo</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-rpg-muted">
            A Vila reflete o clima e o horário da sua cidade em tempo real.
            <span title="Dados da Open-Meteo, atualizados a cada 15 minutos. Nada aqui gera XP ou altera seus registros.">
              <Info size={14} aria-hidden />
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="rpg-tile flex items-center gap-2 px-3 py-2">
            <Sun size={22} className="text-rpg-gold" aria-hidden />
            <div className="text-xs">
              <p className="font-semibold text-rpg-text">Dia/Noite automático</p>
              <p className="flex items-center gap-1 text-rpg-green">
                <span className="h-2 w-2 rounded-full bg-rpg-green" aria-hidden /> Ativado
              </p>
            </div>
          </div>
          <div className="rpg-tile flex items-center gap-2 px-3 py-2">
            <Gauge size={22} className="text-rpg-green" aria-hidden />
            <div className="text-xs">
              <p className="font-semibold text-rpg-text">Tempo ao vivo</p>
              <p className={clsx("flex items-center gap-1", statusLive.tone)}>
                <span className={clsx("h-2 w-2 rounded-full", statusLive.dot)} aria-hidden /> {statusLive.label}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rpg-ornate relative h-[360px] min-w-0 overflow-hidden p-0 sm:h-[460px]" aria-label="Vila com o clima aplicado">
          {!w && <div className="absolute inset-0 z-10 flex items-center justify-center bg-rpg-bg/70 text-sm text-rpg-muted" aria-busy="true">Construindo a Vila…</div>}
          <span className="absolute left-3 top-3 z-10 border-2 border-rpg-gold/70 bg-rpg-panel/90 px-3 py-1 font-rpg text-lg font-bold text-rpg-gold-light" style={R}>
            Vila
          </span>
          <WorldCanvas data={engineData} settings={engineSettings} selectedRoom={null} decorMode={false} onSelect={() => undefined} onAvatarMoved={() => undefined} weather={engineWeather} className="h-full w-full" />
          <div className="absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-2">
            {d && (
              <span className="rpg-tile flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-rpg-text">
                <MapPin size={12} aria-hidden /> {[d.location.city, d.location.region].filter(Boolean).join(", ")}
              </span>
            )}
            {shownVisual && (
              <span className="rpg-tile flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-rpg-text">
                <WeatherIcon visual={shownVisual} size={14} /> {demo ? `Prévia: ${VISUAL_LABEL[demo]}` : `${d?.current.label ?? VISUAL_LABEL[shownVisual]} agora`}
              </span>
            )}
            {demo && (
              <button type="button" className="rpg-tile px-2.5 py-1 text-xs font-semibold text-rpg-gold-light" onClick={() => setDemo(null)}>
                Voltar ao clima real
              </button>
            )}
          </div>
        </section>
        {weather.isLoading ? (
          <div className="rpg-panel h-full min-h-[260px] animate-pulse" aria-busy="true" />
        ) : d ? (
          <WeatherPanel d={d} onRefresh={() => void weather.refetch()} refreshing={weather.isFetching} />
        ) : (
          <section className="rpg-panel space-y-3 p-4">
            <h2 className="font-rpg text-lg font-bold text-rpg-text">{weather.data && "unavailable" in weather.data ? "Clima indisponível" : "Escolha sua cidade"}</h2>
            <p className="text-sm text-rpg-muted">{weather.data && "unavailable" in weather.data ? weather.data.message : weather.isError ? "Não foi possível consultar o clima agora." : "A Vila usa o clima real da cidade do Contexto do Dia. Busque a sua cidade para ligar o clima ao vivo."}</p>
            {weather.isError && (
              <RPGButton variant="secondary" className="text-xs" onClick={() => void weather.refetch()}>
                Tentar de novo
              </RPGButton>
            )}
            <LocationEditor city={null} onSaved={notify} />
          </section>
        )}
      </div>

      {/* Prévias: só mudam a cena desta tela, nunca o clima registrado */}
      <section aria-label="Pré-visualizar condições">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {PREVIEWS.map((p) => {
            const active = shownVisual === p.visual || (p.visual === "rain" && (shownVisual === "heavy_rain" || shownVisual === "drizzle"));
            return (
              <button key={p.visual} type="button" aria-pressed={demo === p.visual} onClick={() => setDemo(demo === p.visual ? null : p.visual)} className={clsx("group relative overflow-hidden border-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold", active ? "border-rpg-green shadow-[0_0_12px_rgba(79,212,154,0.35)]" : "border-rpg-border hover:border-rpg-gold/70")} style={R}>
                <WeatherThumb visual={p.visual} hour={localHour} className="block h-24 w-full sm:h-28" />
                <span className="absolute left-2 top-2 flex items-center gap-1.5 bg-rpg-bg/70 px-2 py-0.5 text-xs font-semibold text-rpg-text" style={R}>
                  <WeatherIcon visual={p.visual} size={14} /> {p.label}
                </span>
                {!demo && d && active && <span className="absolute bottom-2 right-2 bg-rpg-green/90 px-1.5 py-0.5 text-[10px] font-bold text-rpg-bg" style={R}>AGORA</span>}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-[11px] text-rpg-muted">Clique para pré-visualizar na Vila acima. A prévia não altera o clima real registrado.</p>
      </section>

      <section aria-label="Impacto no mundo">
        <h2 className="mb-2 flex items-center gap-2 font-rpg text-xl font-bold text-rpg-text">
          <span className="text-rpg-blue" aria-hidden>
            ✦
          </span>{" "}
          Impacto no mundo
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {impacts.map((i) => (
            <div key={i.title} className="rpg-panel flex items-start gap-3 p-3">
              <i.icon size={30} className={clsx("shrink-0", i.tone)} aria-hidden />
              <div>
                <p className="font-semibold text-rpg-text">{i.title}</p>
                <p className="text-xs text-rpg-muted">{i.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {d && d.hourly.length > 0 && (
        <section aria-label="Previsão das próximas horas">
          <h2 className="mb-2 font-rpg text-xl font-bold text-rpg-text">Previsão das próximas horas</h2>
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]" role="listbox" aria-label="Horas">
            {d.hourly.map((h, i) => (
              <button key={h.time} type="button" role="option" aria-selected={i === hourIdx} onClick={() => setHourIdx(i)} className={clsx("flex min-w-[84px] flex-col items-center gap-1.5 border-2 px-2 py-2.5", i === hourIdx ? "border-rpg-green bg-rpg-green/10" : "border-rpg-border bg-rpg-panel")} style={R}>
                <span className="text-sm font-semibold text-rpg-text">{i === 0 ? "Agora" : hourLabel(h.time)}</span>
                <WeatherIcon visual={h.visual} night={isNightHour(h.time)} size={26} />
                <span className="text-sm font-semibold text-rpg-text">{Math.round(h.temperature)}°C</span>
              </button>
            ))}
          </div>
          {selectedHour && (
            <div className="rpg-panel mt-2 flex flex-wrap items-center gap-3 p-3 text-sm">
              <WeatherIcon visual={selectedHour.visual} night={isNightHour(selectedHour.time)} size={22} />
              <span className="font-semibold text-rpg-text">{hourIdx === 0 ? "Agora" : hourLabel(selectedHour.time)}</span>
              <span className="text-rpg-muted">{selectedHour.label}</span>
              <span className="text-rpg-muted">{Math.round(selectedHour.temperature)}°C</span>
              <span className="text-rpg-muted" title="Probabilidade prevista, não chuva medida">
                Chance de chuva: {selectedHour.precipitationProbability == null ? "—" : `${selectedHour.precipitationProbability}%`}
              </span>
              <RPGButton variant="ghost" className="ml-auto text-xs" onClick={() => setDemo(selectedHour.visual)}>
                Ver na Vila
              </RPGButton>
            </div>
          )}
        </section>
      )}

      {w && (
        <section className="rpg-panel grid gap-4 p-4 md:grid-cols-2" aria-label="Configurações do clima">
          <div className="space-y-2">
            <h2 className="font-rpg text-lg font-bold text-rpg-text">Configurações do clima</h2>
            {(
              [
                ["Clima real na Vila", "weatherEnabled", "Aplica o tempo da sua cidade no Meu Mundo."],
                ["Partículas de chuva e neve", "weatherParticles", "Desligue em computadores mais lentos."],
                ["Sons de clima", "sound", "Chuva e trovões (começa desligado)."],
              ] as const
            ).map(([label, k, hint]) => (
              <div key={k} className="flex items-center justify-between gap-3 border-b border-rpg-border/50 py-1.5">
                <span className="text-sm text-rpg-text">
                  {label}
                  <span className="block text-[10px] text-rpg-muted">{hint}</span>
                </span>
                <RPGSwitch checked={w.settings[k] ?? true} onChange={() => saveSettings({ [k]: !(w.settings[k] ?? true) })} label={label} />
              </div>
            ))}
            <fieldset>
              <legend className="mb-1 text-[11px] text-rpg-muted">Intensidade dos efeitos</legend>
              <div className="flex gap-1">
                {([[0, "Sutil"], [1, "Média"], [2, "Completa"]] as const).map(([v, l]) => (
                  <button key={v} type="button" aria-pressed={(w.settings.weatherIntensity ?? 2) === v} onClick={() => saveSettings({ weatherIntensity: v })} className={clsx("flex-1 border px-2 py-1.5 text-xs font-semibold", (w.settings.weatherIntensity ?? 2) === v ? "border-rpg-gold bg-rpg-gold/10 text-rpg-gold-light" : "border-rpg-border text-rpg-muted")} style={R}>
                    {l}
                  </button>
                ))}
              </div>
            </fieldset>
            {reduced && <p className="text-[11px] text-rpg-orange">Seu sistema pede movimento reduzido: chuva, neve e relâmpagos ficam parados.</p>}
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-rpg-text">Localização</h3>
            <LocationEditor city={d?.location.city ?? null} onSaved={notify} />
          </div>
        </section>
      )}
    </div>
  );
}
