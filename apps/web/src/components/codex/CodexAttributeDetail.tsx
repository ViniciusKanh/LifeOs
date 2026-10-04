import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Modal } from "@/components/ui/Modal";
import { RPGBadge, RPGProgressBar } from "@/components/rpg";
import { RPG_TONE_TEXT } from "@/components/rpg/rpgAssets";
import { useAttributeDetail } from "@/hooks/useCodex";
import type { AttributeKey, Codex } from "@/services/codexService";
import { ATTR_UI, relicSrc } from "@/utils/codexDisplay";

const tok = (name: string) => `rgb(var(--rpg-${name}))`;

/** Detalhe do atributo: nível, evolução de 30 dias, principais fontes, últimas ações e itens relacionados. */
export function CodexAttributeDetail({ attrKey, codex, onClose }: { attrKey: AttributeKey | null; codex: Codex; onClose: () => void }) {
  const { data, isLoading, isError } = useAttributeDetail(attrKey);
  if (!attrKey) return null;
  const ui = ATTR_UI[attrKey];
  const Icon = ui.icon;
  return (
    <Modal open onClose={onClose} size="lg" title={data ? `${data.label} — Nv. ${data.level}` : "Atributo"}>
      {isLoading && <div className="h-48 rpg-bar animate-pulse" aria-label="Carregando atributo" />}
      {isError && <p className="text-sm text-rpg-red" role="alert">Não foi possível carregar o atributo.</p>}
      {data && (
        <div className="space-y-4 text-sm">
          <div className="flex items-start gap-3">
            <span className={`shrink-0 w-12 h-12 flex items-center justify-center border-2 border-rpg-gold/60 bg-rpg-bg ${RPG_TONE_TEXT[ui.tone]}`} style={{ borderRadius: 3 }} aria-hidden><Icon size={24} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-rpg-text/85">{data.description}</p>
              <RPGProgressBar className="mt-2" tone={ui.tone} label={`Nível ${data.level} → ${data.level + 1}`} value={data.xp - data.levelStartXp} max={data.nextLevelXp - data.levelStartXp} valueLabel={`${data.xp - data.levelStartXp} / ${data.nextLevelXp - data.levelStartXp} XP`} />
              <p className="mt-1 text-[11px] text-rpg-muted">
                Total {data.xp} XP · 30 dias: {data.last30} XP {data.trendPct == null ? "(sem base anterior)" : `(${data.trendPct >= 0 ? "+" : ""}${data.trendPct}% vs. 30 dias anteriores)`}
              </p>
            </div>
          </div>
          <div>
            <p className="mb-1 font-semibold text-rpg-text">Evolução — 30 dias</p>
            <div className="h-40" role="img" aria-label={`XP de ${data.label} por dia nos últimos 30 dias`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.series.map((d) => ({ ...d, label: d.date.slice(8, 10) + "/" + d.date.slice(5, 7) }))} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: tok("text-muted") }} interval={4} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: tok("text-muted") }} allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v: number) => [`${v} XP`, data.label]} />
                  <Bar dataKey="xp" fill={tok(ui.tone)} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rpg-panel p-3">
              <p className="font-semibold text-rpg-text mb-1">Principais fontes</p>
              {data.topSources.length === 0 && <p className="text-xs text-rpg-muted">Sem XP neste atributo ainda.</p>}
              <ul className="space-y-1 text-xs">
                {data.topSources.map((s) => (
                  <li key={s.source} className="flex justify-between"><span className="text-rpg-text">{s.label}</span><span className="font-pixel text-rpg-muted">{s.xp} XP</span></li>
                ))}
              </ul>
            </div>
            <div className="rpg-panel p-3">
              <p className="font-semibold text-rpg-text mb-1">Últimas ações</p>
              {data.recent.length === 0 && <p className="text-xs text-rpg-muted">Nenhuma ação registrada.</p>}
              <ul className="space-y-1 text-xs">
                {data.recent.map((r, i) => (
                  <li key={i} className="flex justify-between gap-2"><span className="truncate text-rpg-text">{r.label ?? "Ação"}</span><span className="shrink-0 font-pixel text-rpg-muted">+{r.xp}</span></li>
                ))}
              </ul>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {data.classes.length > 0 && <span className="text-rpg-muted">Classes ligadas: {data.classes.join(", ")}</span>}
            {codex.relics.filter((r) => data.relatedRelics.includes(r.id)).map((r) => (
              <span key={r.id} className="inline-flex items-center gap-1" title={r.obtainedBy}>
                <img src={relicSrc(r.id)} alt="" className={`pixelated w-6 h-6 ${r.unlocked ? "" : "grayscale opacity-40"}`} /> {r.name}
              </span>
            ))}
            {codex.titles.filter((t) => data.relatedTitles.includes(t.id)).map((t) => <RPGBadge key={t.id} tone={t.unlocked ? "gold" : "muted"}>{t.name}</RPGBadge>)}
          </div>
          <p className="text-[11px] text-rpg-muted">O XP de atributo é uma classificação do XP global (a soma dos atributos é igual ao seu XP total) — não é XP extra.</p>
        </div>
      )}
    </Modal>
  );
}
