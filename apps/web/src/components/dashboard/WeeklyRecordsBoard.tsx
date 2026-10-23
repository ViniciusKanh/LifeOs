import { useEffect, useRef } from "react";
import clsx from "clsx";
import { ArrowDownRight, ArrowUpRight, Medal, Minus, Swords } from "lucide-react";
import { RPGBadge, RPGPanel, RPGProgressBar } from "@/components/rpg";
import { useWeeklyRecords } from "@/hooks/useRecords";
import { useRpgPreferences } from "@/hooks/useRpgPreferences";
import type { RecordRow } from "@/services/recordsService";
import { playSfx } from "@/utils/sfx";

const fmt = (n: number) => n.toLocaleString("pt-BR");
const br = (iso: string) => iso.slice(5).split("-").reverse().join("/");

function Row({ r }: { r: RecordRow }) {
  const ref = Math.max(r.best, r.lastWeek, r.thisWeek, 1);
  const delta = r.thisWeek - r.lastWeek;
  return (
    <li className={clsx("border p-2.5", r.newRecord ? "border-rpg-gold/80 bg-rpg-gold/10" : "border-rpg-border/70 bg-rpg-bg-2/60")} style={{ borderRadius: 3 }}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 flex-1 basis-full sm:basis-0 text-sm leading-tight text-rpg-text">{r.label}</span>
        {r.newRecord && (
          <RPGBadge tone="gold" icon={<Medal size={10} aria-hidden />}>
            Novo recorde
          </RPGBadge>
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-pixel text-xl tabular-nums text-rpg-text">{fmt(r.thisWeek)}</span>
        {r.unit && <span className="text-[11px] text-rpg-muted">{r.unit}</span>}
        <span
          className={clsx("ml-auto inline-flex flex-wrap justify-end items-center gap-0.5 text-[11px] font-semibold", delta > 0 ? "text-rpg-green" : delta < 0 ? "text-rpg-red" : "text-rpg-muted")}
          aria-label={`Semana passada: ${fmt(r.lastWeek)}`}
        >
          {delta > 0 ? <ArrowUpRight size={12} aria-hidden /> : delta < 0 ? <ArrowDownRight size={12} aria-hidden /> : <Minus size={12} aria-hidden />}
          {delta > 0 ? "+" : ""}
          {fmt(delta)} vs. {fmt(r.lastWeek)}
        </span>
      </div>
      <RPGProgressBar className="mt-1.5" tone={r.newRecord ? "gold" : "purple"} label={`${r.label}: esta semana contra o recorde`} value={r.thisWeek} max={ref} showLabel={false} />
      <p className="mt-1 text-[10px] text-rpg-muted">
        {r.bestWeekStart ? `Recorde anterior: ${fmt(r.best)} (semana de ${br(r.bestWeekStart)})` : "Primeira semana com registro — o recorde começa agora."}
      </p>
    </li>
  );
}

/**
 * Placar da semana: você contra você. Esta semana × semana passada × a sua
 * melhor semana anterior. Selo "Novo recorde" quando supera todas.
 */
export function WeeklyRecordsBoard({ className }: { className?: string }) {
  const { data, isLoading, isError } = useWeeklyRecords();
  const { prefs } = useRpgPreferences();
  const celebrated = useRef<string | null>(null);

  // Som de recorde uma única vez por semana (e só se o usuário ligou os sons).
  useEffect(() => {
    if (!data || data.newRecords === 0 || celebrated.current === data.weekStart) return;
    celebrated.current = data.weekStart;
    playSfx("record", prefs.sound);
  }, [data, prefs.sound]);

  return (
    <RPGPanel
      title="Placar da semana"
      icon={<Swords size={14} />}
      className={className}
      actions={data ? <span className="hidden sm:inline text-[11px] text-rpg-muted">{`${br(data.weekStart)}–${br(data.weekEnd)} · dia ${data.daysElapsed}/7`}</span> : undefined}
    >
      {isLoading ? (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Carregando placar">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-24 rpg-bar animate-pulse motion-reduce:animate-none" />
          ))}
        </div>
      ) : isError || !data ? (
        <p className="text-sm text-rpg-red">Não foi possível carregar o placar agora.</p>
      ) : (
        <>
          <p className="-mt-1 mb-3 text-xs text-rpg-muted">
            {data.newRecords > 0
              ? `${data.newRecords} recorde${data.newRecords > 1 ? "s" : ""} pessoal${data.newRecords > 1 ? "is" : ""} batido${data.newRecords > 1 ? "s" : ""} nesta semana!`
              : "Você × você: só a sua semana contra a anterior e contra o seu melhor — sem ranking com ninguém."}
          </p>
          <ul className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            {data.records
              .filter((r) => r.key !== "workoutMinutes" || r.thisWeek > 0 || r.best > 0)
              .map((r) => (
                <Row key={r.key} r={r} />
              ))}
          </ul>
        </>
      )}
    </RPGPanel>
  );
}
