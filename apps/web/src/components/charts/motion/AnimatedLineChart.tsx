import { useId, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useElementSize } from "./useElementSize";

/**
 * Gráfico de linhas animado (SVG + motion). Um único eixo Y (nunca dois);
 * linhas de 2px desenhadas com pathLength; área com degradê suave só na
 * primeira série; crosshair + tooltip no hover/toque. Com 2+ séries,
 * mostra legenda (identidade nunca só pela cor).
 */
export interface LineSeries {
  key: string;
  label: string;
  color: string;
  values: Array<number | null>;
}

export function AnimatedLineChart({
  labels,
  series,
  height = 180,
  yMax,
  formatValue = (v) => String(Math.round(v)),
  ariaLabel,
}: {
  labels: string[];
  series: LineSeries[];
  height?: number;
  yMax?: number;
  formatValue?: (v: number) => string;
  ariaLabel: string;
}) {
  const gradientId = useId();
  const { ref, width } = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 30;
  const padR = 10;
  const padT = 10;
  const padB = 24;
  const innerW = Math.max(0, width - padL - padR);
  const innerH = height - padT - padB;

  const max = useMemo(() => {
    const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
    const m = yMax ?? Math.max(1, ...all);
    return m;
  }, [series, yMax]);

  const x = (i: number) => padL + (labels.length <= 1 ? innerW / 2 : (i / (labels.length - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / max) * innerH;

  const paths = series.map((s) => {
    let d = "";
    let started = false;
    s.values.forEach((v, i) => {
      if (v === null) {
        started = false;
        return;
      }
      d += `${started ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      started = true;
    });
    return d.trim();
  });

  const firstValid = series[0]?.values.map((v, i) => (v === null ? null : i)).filter((i): i is number => i !== null) ?? [];
  const area =
    firstValid.length >= 2
      ? `${paths[0]} L${x(firstValid[firstValid.length - 1]).toFixed(1)},${(padT + innerH).toFixed(1)} L${x(firstValid[0]).toFixed(1)},${(padT + innerH).toFixed(1)} Z`
      : "";

  // Rótulos do eixo X seletivos: no máximo ~7, para nunca colidirem.
  const step = Math.max(1, Math.ceil(labels.length / 7));
  const ticks = [0, max / 2, max];

  const handleMove = (clientX: number, rect: DOMRect) => {
    if (labels.length === 0) return;
    const rel = clientX - rect.left - padL;
    const idx = Math.round((rel / Math.max(innerW, 1)) * (labels.length - 1));
    setHover(Math.min(labels.length - 1, Math.max(0, idx)));
  };

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          onMouseMove={(e) => handleMove(e.clientX, e.currentTarget.getBoundingClientRect())}
          onMouseLeave={() => setHover(null)}
          onTouchMove={(e) => handleMove(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
          onTouchEnd={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={series[0]?.color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={series[0]?.color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} className="stroke-paper-border dark:stroke-ink-border" strokeDasharray={t === 0 ? undefined : "3 4"} />
              <text x={padL - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-slate text-[10px]">
                {formatValue(t)}
              </text>
            </g>
          ))}
          {labels.map((l, i) =>
            i % step === 0 || i === labels.length - 1 ? (
              <text key={`${l}-${i}`} x={x(i)} y={height - 6} textAnchor="middle" className="fill-slate text-[10px]">
                {l}
              </text>
            ) : null
          )}
          {area && <motion.path d={area} fill={`url(#${gradientId})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.6 }} />}
          {paths.map((d, i) => (
            <motion.path
              key={series[i].key}
              d={d}
              fill="none"
              stroke={series[i].color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.2, delay: i * 0.15, ease: "easeInOut" }}
            />
          ))}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH} className="stroke-slate/40" />
              {series.map((s) => {
                const v = s.values[hover];
                return v === null ? null : (
                  <circle key={s.key} cx={x(hover)} cy={y(v)} r={4.5} fill={s.color} className="stroke-paper-raised dark:stroke-ink-raised" strokeWidth={2} />
                );
              })}
            </g>
          )}
        </svg>
      )}
      {hover !== null && width > 0 && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-xl border border-paper-border dark:border-ink-border bg-paper-raised/95 dark:bg-ink-raised/95 backdrop-blur px-3 py-2 shadow-card text-xs"
          style={{ left: Math.min(Math.max(x(hover) - 60, 0), width - 130) }}
        >
          <p className="font-semibold mb-1">{labels[hover]}</p>
          {series.map((s) => (
            <p key={s.key} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="text-slate">{s.label}:</span>
              <span className="font-semibold">{s.values[hover] === null ? "—" : formatValue(s.values[hover] as number)}</span>
            </p>
          ))}
        </div>
      )}
      {series.length > 1 && (
        <div className="absolute -bottom-6 left-0 flex flex-wrap gap-3 text-[11px] text-slate">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="w-3 h-[2px] rounded-full" style={{ backgroundColor: s.color }} /> {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
