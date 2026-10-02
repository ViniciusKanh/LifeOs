import { useEffect, useMemo, useState } from "react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { Button, Card } from "@/components/ui/primitives";
import { LIFE_AREAS } from "@/utils/lifeOsLabels";
import type { LifeArea, WheelData } from "@/types";
import { RPG_SECTION_TITLE } from "@/components/rpg/rpgAssets";

/**
 * Roda da vida: nota 0–10 por área (autoavaliação, dado declarado pelo
 * usuário). O radar mostra a avaliação atual sobre a anterior; reavaliar
 * grava uma nova data, preservando o histórico.
 */
export function WheelOfLife({
  wheel,
  onSave,
  isSaving,
  compact = false,
}: {
  wheel: WheelData;
  onSave?: (scores: Array<{ area: LifeArea; score: number }>) => Promise<unknown>;
  isSaving?: boolean;
  compact?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<LifeArea, number>>({} as Record<LifeArea, number>);
  const hasAny = wheel.latest.some((w) => w.score != null);

  useEffect(() => {
    const d = {} as Record<LifeArea, number>;
    for (const w of wheel.latest) d[w.area] = w.score ?? 5;
    setDraft(d);
  }, [wheel]);

  const data = useMemo(
    () =>
      LIFE_AREAS.map((a) => {
        const w = wheel.latest.find((x) => x.area === a.key);
        return { area: `${a.emoji} ${a.label}`, atual: editing ? draft[a.key] ?? 0 : w?.score ?? 0, anterior: w?.previousScore ?? null };
      }),
    [wheel, editing, draft]
  );
  const hasPrevious = data.some((d) => d.anterior != null);
  const lastDate = wheel.history.at(-1)?.assessedOn;

  const save = async () => {
    if (!onSave) return;
    await onSave(LIFE_AREAS.map((a) => ({ area: a.key, score: draft[a.key] ?? 5 })));
    setEditing(false);
  };

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <div>
          <p className={`text-sm font-semibold ${RPG_SECTION_TITLE}`}>Roda da vida</p>
          <p className="text-[11px] text-slate">
            {hasAny ? `Sua autoavaliação${lastDate ? ` de ${new Date(`${lastDate}T00:00:00`).toLocaleDateString("pt-BR")}` : ""} — 0 a 10 por área.` : "Dê uma nota de 0 a 10 para cada área e veja onde está o desequilíbrio."}
          </p>
        </div>
        {onSave && !editing && (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <SlidersHorizontal size={14} /> {hasAny ? "Reavaliar" : "Avaliar agora"}
          </Button>
        )}
      </div>

      <div className={`grid gap-4 ${editing ? "lg:grid-cols-2" : ""}`}>
        <div className={compact ? "h-56" : "h-64 sm:h-72"}>
          {hasAny || editing ? (
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={data} outerRadius="72%">
                <PolarGrid stroke="currentColor" className="text-paper-border dark:text-ink-border" />
                <PolarAngleAxis dataKey="area" tick={{ fontSize: 10, fill: "currentColor" }} className="text-slate" />
                <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
                {hasPrevious && !editing && <Radar name="Anterior" dataKey="anterior" stroke="#98A2B3" fill="#98A2B3" fillOpacity={0.12} strokeDasharray="4 4" />}
                <Radar name="Atual" dataKey="atual" stroke="#9550FF" fill="#9550FF" fillOpacity={0.28} strokeWidth={2} isAnimationActive />
                <Tooltip formatter={(v) => `${v}/10`} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full rounded-xl border border-dashed border-paper-border dark:border-ink-border flex items-center justify-center text-xs text-slate px-6 text-center">
              Nenhuma avaliação ainda.
            </div>
          )}
        </div>

        {editing && (
          <div className="space-y-2.5">
            {LIFE_AREAS.map((a) => (
              <label key={a.key} className="flex items-center gap-3">
                <span className="w-36 shrink-0 text-xs">
                  {a.emoji} {a.label}
                </span>
                <input
                  type="range"
                  min={0}
                  max={10}
                  value={draft[a.key] ?? 5}
                  onChange={(e) => setDraft((d) => ({ ...d, [a.key]: Number(e.target.value) }))}
                  className="flex-1 accent-cat-purple"
                  aria-label={`Nota para ${a.label}`}
                />
                <span className="w-6 text-right text-sm font-bold tabular-nums">{draft[a.key] ?? 5}</span>
              </label>
            ))}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
              <Button onClick={save} disabled={isSaving}>
                {isSaving && <Loader2 size={14} className="animate-spin" />} Salvar avaliação
              </Button>
            </div>
          </div>
        )}
      </div>

      {!editing && wheel.history.length > 1 && (
        <p className="text-[11px] text-slate mt-2">
          Média: {wheel.history.at(-2)!.average} → <strong className="text-inherit">{wheel.history.at(-1)!.average}</strong> ({wheel.history.length} avaliações)
        </p>
      )}
    </Card>
  );
}
