import { useMemo, useState } from "react";
import { Activity, Clock } from "lucide-react";
import { RPGPanel, RPGTabs } from "@/components/rpg";
import { useRhythm } from "@/hooks/useRhythm";
import { useWide } from "@/hooks/useWide";
import type { RhythmResult } from "@/services/rhythmService";

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const WEEKDAYS_FULL = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
type Span = "60" | "90";

const hourLabel = (h: number) => `${String(h).padStart(2, "0")}h`;

/** Agrupa as 24 horas em blocos (1h no desktop, 3h no celular para caber sem rolagem). */
function bucketize(data: RhythmResult, size: number) {
  const cols = Math.ceil(24 / size);
  const grid = data.grid.map((row) => Array.from({ length: cols }, (_, c) => row.slice(c * size, c * size + size).reduce((s, v) => s + v, 0)));
  const max = Math.max(1, ...grid.flat());
  return { cols, grid, max };
}

/**
 * Ritmo do herói: em que horários (no seu fuso) você de fato conclui
 * missões e ganha XP. Mapa de calor hora × dia da semana a partir de
 * registros reais; sem histórico suficiente, estado vazio honesto.
 */
export function HeroRhythmPanel() {
  const [span, setSpan] = useState<Span>("90");
  const { data, isLoading, isError, refetch } = useRhythm(Number(span));
  const desktop = useWide("(min-width: 768px)");
  const size = desktop ? 1 : 3;
  const view = useMemo(() => (data ? bucketize(data, size) : null), [data, size]);

  return (
    <RPGPanel
      title="Ritmo do herói"
      icon={<Activity size={16} aria-hidden />}
      actions={
        <RPGTabs
          size="sm"
          label="Período do ritmo"
          value={span}
          onChange={setSpan}
          tabs={[
            { value: "60", label: "60 dias" },
            { value: "90", label: "90 dias" },
          ]}
        />
      }
    >
      <p className="text-xs text-rpg-muted mb-3">
        Quando você realmente avança: conclusões de missões e XP ganho, por hora e dia da semana{data ? ` (fuso ${data.timezone})` : ""}.
      </p>

      {isError ? (
        <div className="text-center py-6">
          <p className="text-sm text-rpg-red">Não foi possível calcular seu ritmo agora.</p>
          <button type="button" onClick={() => refetch()} className="mt-2 text-xs underline text-rpg-gold-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold">
            Tentar novamente
          </button>
        </div>
      ) : isLoading || !data || !view ? (
        <div className="h-48 animate-pulse motion-reduce:animate-none bg-rpg-bg-2/60 rounded" aria-label="Calculando seu ritmo" />
      ) : !data.enough ? (
        <div className="text-center py-6 px-2">
          <p className="text-sm text-rpg-text">Ainda não há registros suficientes para revelar seu ritmo.</p>
          <p className="text-xs text-rpg-muted mt-1">
            {data.totalEvents === 0
              ? `Nenhuma missão concluída ou XP registrado nos últimos ${data.days} dias.`
              : `${data.totalEvents} registro${data.totalEvents === 1 ? "" : "s"} nos últimos ${data.days} dias — o mapa aparece a partir de 10.`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div role="table" aria-label={`Mapa de calor de atividade, ${data.totalEvents} registros`} className="w-full">
            <div role="row" className="grid gap-[2px] items-end" style={{ gridTemplateColumns: `2.25rem repeat(${view.cols}, minmax(0, 1fr))` }}>
              <span role="columnheader" className="sr-only">
                Dia
              </span>
              {Array.from({ length: view.cols }, (_, c) => (
                <span key={c} role="columnheader" className="text-[9px] text-rpg-muted text-center font-pixel leading-none">
                  {size === 1 ? (c % 3 === 0 ? c : "") : hourLabel(c * size)}
                </span>
              ))}
            </div>
            {view.grid.map((row, d) => (
              <div key={d} role="row" className="grid gap-[2px] mt-[2px]" style={{ gridTemplateColumns: `2.25rem repeat(${view.cols}, minmax(0, 1fr))` }}>
                <span role="rowheader" className="text-[10px] text-rpg-muted font-pixel self-center">
                  {WEEKDAYS[d]}
                </span>
                {row.map((v, c) => {
                  const from = c * size;
                  const label = `${WEEKDAYS_FULL[d]}, ${size === 1 ? hourLabel(from) : `${hourLabel(from)}–${hourLabel(from + size)}`}: ${v} registro${v === 1 ? "" : "s"}`;
                  return (
                    <span
                      key={c}
                      role="cell"
                      title={label}
                      aria-label={label}
                      className="block aspect-square min-h-[10px] rounded-[2px] border border-rpg-border/40"
                      style={{ backgroundColor: v === 0 ? "transparent" : `rgb(var(--rpg-purple) / ${0.2 + 0.8 * (v / view.max)})` }}
                    />
                  );
                })}
              </div>
            ))}
            <div className="flex items-center justify-end gap-1.5 mt-2 text-[10px] text-rpg-muted" aria-hidden>
              <span>menos</span>
              {[0.2, 0.45, 0.7, 1].map((a) => (
                <span key={a} className="w-3 h-3 rounded-[2px]" style={{ backgroundColor: `rgb(var(--rpg-purple) / ${a})` }} />
              ))}
              <span>mais</span>
            </div>
          </div>

          <div>
            <p className="font-pixel text-[11px] uppercase tracking-[0.14em] text-rpg-gold mb-2">Seus 3 melhores horários</p>
            <ol className="grid gap-2 sm:grid-cols-3">
              {data.bestSlots.map((s, i) => (
                <li key={`${s.weekday}-${s.hour}`} className="rpg-panel px-3 py-2 flex items-center gap-2 min-w-0">
                  <span className="font-pixel text-rpg-gold text-sm" aria-hidden>
                    {i + 1}º
                  </span>
                  <Clock size={14} className="text-rpg-purple shrink-0" aria-hidden />
                  <span className="text-sm text-rpg-text min-w-0">
                    <span className="capitalize">{WEEKDAYS_FULL[s.weekday]}</span>, {hourLabel(s.hour)}–{hourLabel(s.hour + 1)}
                    <span className="block text-[11px] text-rpg-muted">
                      {s.count} registro{s.count === 1 ? "" : "s"}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            {data.bestHours.length > 0 && (
              <p className="text-[11px] text-rpg-muted mt-2">
                Em qualquer dia, você rende mais às {data.bestHours.map((h) => hourLabel(h.hour)).join(", ")}. Considere reservar essas janelas para o trabalho que mais trava.
              </p>
            )}
          </div>
        </div>
      )}
    </RPGPanel>
  );
}
