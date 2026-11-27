import { Link } from "react-router-dom";
import clsx from "clsx";
import { Clock3, Footprints, MapPin, Sun, Wind } from "lucide-react";
import { R } from "@/components/adventures/AdventureKit";
import { IntegrationBanner, XpChip } from "@/components/integrations/IntegrationKit";
import { useAirQuality } from "@/hooks/usePublicApis";
import type { AirHour, AirWindow, AqiKey } from "@/services/publicApisService";

/* Cores por faixa do índice US AQI (mesma escala da EPA, em tons do tema). */
const AQI_TONE: Record<AqiKey, { bar: string; text: string; border: string }> = {
  bom: { bar: "bg-rpg-green", text: "text-rpg-green", border: "border-rpg-green/60" },
  moderado: { bar: "bg-rpg-gold", text: "text-rpg-gold-light", border: "border-rpg-gold/60" },
  sensiveis: { bar: "bg-rpg-orange", text: "text-rpg-orange", border: "border-rpg-orange/60" },
  ruim: { bar: "bg-rpg-red", text: "text-rpg-red", border: "border-rpg-red/60" },
  muito_ruim: { bar: "bg-rpg-purple", text: "text-rpg-purple", border: "border-rpg-purple/60" },
  perigoso: { bar: "bg-rpg-pink", text: "text-rpg-pink", border: "border-rpg-pink/60" },
  sem_dado: { bar: "bg-rpg-border", text: "text-rpg-muted", border: "border-rpg-border" },
};

const hh = (h: number) => `${String(h).padStart(2, "0")}h`;

/** 24 barras do dia: altura = AQI, cor = faixa; janela de ouro com contorno dourado. */
function HourStrip({ hours, window, nowHour }: { hours: AirHour[]; window: AirWindow | null; nowHour: number }) {
  const max = Math.max(100, ...hours.map((h) => h.aqi ?? 0));
  return (
    <div>
      <div className="flex h-20 items-end gap-[2px]" role="list" aria-label="Qualidade do ar por hora hoje">
        {hours.map((h) => {
          const inWin = !!window && h.hour >= window.start && h.hour < window.end;
          const label = `${hh(h.hour)}: AQI ${h.aqi ?? "sem dado"}${h.uv != null ? `, UV ${Math.round(h.uv)}` : ""}`;
          return (
            <div key={h.hour} role="listitem" aria-label={label} title={label} className="flex h-full min-w-0 flex-1 flex-col justify-end">
              <span
                className={clsx("w-full", AQI_TONE[h.level].bar, h.hour < nowHour && !inWin ? "opacity-35" : inWin ? "opacity-100" : "opacity-70", inWin && "outline outline-2 outline-rpg-gold")}
                style={{ height: `${Math.max(6, ((h.aqi ?? 0) / max) * 100)}%`, borderRadius: 2 }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-rpg-muted" aria-hidden>
        <span>0h</span>
        <span>6h</span>
        <span>12h</span>
        <span>18h</span>
        <span>23h</span>
      </div>
    </div>
  );
}

/**
 * Ar do Treino — qualidade do ar, UV e pólen (Open-Meteo) com a melhor janela
 * para treinar ao ar livre. Treino de corrida, caminhada, bike ou esporte numa
 * hora de ar bom ganha bônus automaticamente.
 */
export function TrainingAir() {
  const q = useAirQuality();
  const o = q.data;
  return (
    <section className="rpg-panel relative mt-4 overflow-hidden p-4" aria-label="Ar do Treino (qualidade do ar)">
      <IntegrationBanner
        icon={<Wind size={22} />}
        tone="cyan"
        title="Ar do Treino"
        subtitle="Qualidade do ar, UV e pólen de hoje (Open-Meteo) e a melhor janela para treinar fora."
        right={o && o.configured && !o.unavailable ? <XpChip xp={o.bonus.xp} className="text-[11px]" /> : null}
      />
      {q.isLoading ? (
        <div className="h-40 animate-pulse bg-rpg-bg-2" style={R} aria-busy="true" />
      ) : q.isError || !o ? (
        <p className="text-sm text-rpg-red" role="alert">
          Não foi possível ler a qualidade do ar.{" "}
          <button type="button" className="underline" onClick={() => void q.refetch()}>
            Tentar de novo
          </button>
        </p>
      ) : !o.configured ? (
        <div className="flex flex-wrap items-center gap-3 border border-dashed border-rpg-cyan/50 p-3 text-sm text-rpg-muted" style={R}>
          <MapPin size={18} className="text-rpg-cyan" aria-hidden />
          <span className="min-w-0 flex-1">Escolha sua cidade no Clima (é a mesma do Contexto do Dia) para ver o ar da sua região. Não guardamos histórico de localização.</span>
          <Link to="/meu-mundo/clima" className="rpg-btn rpg-btn-blue text-xs">
            Escolher cidade
          </Link>
        </div>
      ) : o.unavailable ? (
        <p className="text-sm text-rpg-orange" role="status">
          {o.message}
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] [&>*]:min-w-0">
            <div className={clsx("border bg-rpg-bg-2/60 p-3", AQI_TONE[o.current?.level.key ?? "sem_dado"].border)} style={R}>
              <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-rpg-muted">
                <MapPin size={11} aria-hidden /> Agora · {o.location.city ?? "sua cidade"}
                {o.stale && <span className="text-rpg-orange"> · desatualizado</span>}
              </p>
              <div className="flex items-end gap-2">
                <span className={clsx("font-rpg text-4xl font-bold leading-none", AQI_TONE[o.current?.level.key ?? "sem_dado"].text)}>{o.current?.aqi ?? "—"}</span>
                <span className="pb-1">
                  <span className={clsx("block text-sm font-bold", AQI_TONE[o.current?.level.key ?? "sem_dado"].text)}>{o.current?.level.label ?? "Sem dado"}</span>
                  <span className="block text-[10px] text-rpg-muted">índice US AQI</span>
                </span>
              </div>
              <p className="mt-1 text-[11px] text-rpg-muted">PM2.5 {o.current?.pm25 != null ? `${Math.round(o.current.pm25)} µg/m³` : "—"} · PM10 {o.current?.pm10 != null ? `${Math.round(o.current.pm10)} µg/m³` : "—"}</p>
            </div>
            <div className="border border-rpg-gold/60 bg-rpg-bg-2/60 p-3" style={R}>
              <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-rpg-muted">
                <Clock3 size={11} aria-hidden /> Janela para treinar fora
              </p>
              {o.window ? (
                <>
                  <p className={clsx("font-rpg text-2xl font-bold", o.window.quality === "ouro" ? "text-rpg-gold-light" : o.window.quality === "aceitavel" ? "text-rpg-text" : "text-rpg-orange")}>
                    {hh(o.window.start)} – {hh(o.window.end)}
                  </p>
                  <p className="text-[11px] text-rpg-muted">
                    {o.window.quality === "ouro" ? "Janela de ouro: ar bom e UV baixo." : o.window.quality === "aceitavel" ? "Ar moderado. Prefira treino leve." : "Ar ruim o dia todo. Melhor treinar em ambiente fechado."} AQI médio {o.window.avgAqi}.
                  </p>
                </>
              ) : (
                <p className="text-sm text-rpg-muted">Sem janela boa no resto de hoje.{o.windowTomorrow ? ` Amanhã: ${hh(o.windowTomorrow.start)}–${hh(o.windowTomorrow.end)}.` : ""}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 [&>*]:min-w-0">
              <div className="rpg-tile p-2">
                <p className="flex items-center gap-1 text-[10px] text-rpg-muted">
                  <Sun size={11} className="text-rpg-orange" aria-hidden /> UV máximo
                </p>
                <p className="font-rpg text-xl font-bold text-rpg-text">{o.uvMax != null ? Math.round(o.uvMax) : "—"}</p>
                <p className="text-[10px] text-rpg-muted">{o.uvMaxLevel ?? "sem dado"}</p>
              </div>
              <div className="rpg-tile p-2">
                <p className="text-[10px] text-rpg-muted">🌾 Pólen</p>
                <p className="font-rpg text-xl font-bold text-rpg-text">{o.pollenMax != null ? Math.round(o.pollenMax) : "—"}</p>
                <p className="text-[10px] text-rpg-muted">{o.pollenMax != null ? "grãos/m³ (pico)" : "sem medição na região"}</p>
              </div>
            </div>
          </div>

          <HourStrip hours={o.hours} window={o.window} nowHour={o.nowHour} />

          <div className="space-y-1">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-rpg-text">
              <Footprints size={13} className="text-rpg-green" aria-hidden /> Treinos de hoje
            </p>
            {o.workouts.length === 0 ? (
              <p className="text-[11px] text-rpg-muted">
                Nenhum treino registrado hoje. Corrida, caminhada, bike ou esporte numa hora de ar bom (AQI ≤ {o.rules.goodAqi}) ganha +{o.rules.bonus} XP (até {o.rules.dailyCap} por dia).
              </p>
            ) : (
              <ul className="space-y-1">
                {o.workouts.map((w) => (
                  <li key={w.workoutId} className="flex flex-wrap items-center gap-2 border-b border-dashed border-rpg-border/60 py-1 text-xs">
                    <span className="min-w-0 flex-1 truncate text-rpg-text">
                      {w.kind} · {hh(w.hour)}
                    </span>
                    <span className="text-[11px] text-rpg-muted">AQI {w.aqi ?? "—"}</span>
                    {w.paid ? (
                      <XpChip xp={o.rules.bonus} coins={o.rules.coins} />
                    ) : (
                      <span className="text-[10px] text-rpg-muted">{!w.outdoor ? "treino em ambiente fechado" : w.aqi == null ? "sem previsão gravada" : w.eligible ? "limite do dia atingido" : "ar acima do limite"}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-[10px] text-rpg-muted">Dados: Open-Meteo Air Quality (previsão por modelo, não estação oficial). {o.bonus.count} treino(s) com bônus de ar bom no total.</p>
        </div>
      )}
    </section>
  );
}
