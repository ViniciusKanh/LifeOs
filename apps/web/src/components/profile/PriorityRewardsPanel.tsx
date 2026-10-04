import { useEffect, useState } from "react";
import { RotateCcw, Swords } from "lucide-react";
import { RPGBadge, RPGButton, RPGPanel } from "@/components/rpg";
import { useDifficultySettings, useGamificationRules } from "@/hooks/useGamification";
import { PRIORITIES, type PriorityKey, type PriorityRewards } from "@/services/gamificationService";

const PRIORITY_HINT: Record<PriorityKey, string> = {
  Baixa: "Rotina e pequenas pendências",
  "Média": "O trabalho do dia a dia",
  Alta: "O que move a jornada",
};

/**
 * "Valor das missões": o usuário define quanto XP e quantas moedas cada
 * prioridade vale. Vale para tarefas SEM dificuldade (a Balança por
 * dificuldade tem precedência). O backend limita e aplica só ao futuro.
 */
export function PriorityRewardsPanel({ className }: { className?: string }) {
  const { priority, isLoading, isError, save } = useDifficultySettings();
  const { data: rules } = useGamificationRules();
  const [draft, setDraft] = useState<PriorityRewards | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (priority) setDraft(priority);
  }, [priority]);

  const limits = rules?.task.priorityLimits ?? { xp: 150, coins: 30 };
  const dirty = !!draft && !!priority && JSON.stringify(draft) !== JSON.stringify(priority);
  const field = "w-full min-w-0 px-2 py-1.5 text-sm text-right font-pixel bg-rpg-bg-2 text-rpg-text border border-rpg-border focus:border-rpg-gold outline-none";

  const set = (p: PriorityKey, k: "xp" | "coins", raw: string) => {
    const n = Math.min(limits[k], Math.max(0, Math.round(Number(raw) || 0)));
    setDraft((cur) => (cur ? { ...cur, [p]: { ...cur[p], [k]: n } } : cur));
  };

  const defaults = (): PriorityRewards | null => {
    if (!rules) return null;
    const t = rules.task;
    return Object.fromEntries(PRIORITIES.map(({ id }) => [id, { xp: t.xpByPriority[id] ?? 0, coins: t.coinsByPriority[id] ?? 0 }])) as PriorityRewards;
  };

  const onSave = async () => {
    if (!draft) return;
    setMsg(null);
    try {
      await save.mutateAsync({ priority: draft });
      setMsg({ tone: "ok", text: "Valores salvos. Valem para as próximas missões concluídas." });
    } catch (err) {
      setMsg({ tone: "err", text: err instanceof Error ? err.message : "Não foi possível salvar." });
    }
  };

  return (
    <RPGPanel
      title="Valor das missões"
      icon={<Swords size={16} />}
      className={className}
      actions={
        rules && (
          <RPGButton variant="ghost" onClick={() => setDraft(defaults())} title="Voltar aos valores padrão do LifeOS">
            <RotateCcw size={13} aria-hidden /> Padrão
          </RPGButton>
        )
      }
    >
      <p className="-mt-1 mb-3 text-xs text-rpg-muted">
        Quanto vale concluir uma missão de cada prioridade. Missões com dificuldade definida usam a Balança. Bônus de prazo
        {rules ? ` (+${rules.task.dailyMissionXp} XP no dia, +${rules.task.beforeDeadlineXp} XP antes do prazo)` : ""} continuam somando. XP já conquistado nunca muda.
      </p>
      {isLoading && <p className="text-sm text-rpg-muted py-4">Carregando valores…</p>}
      {isError && <p className="text-sm text-rpg-red py-4" role="alert">Não foi possível carregar seus valores.</p>}
      {draft && (
        <>
          <ul className="space-y-2">
            {PRIORITIES.map((p) => (
              <li key={p.id} className="grid grid-cols-2 sm:grid-cols-[1fr_96px_96px] items-center gap-2 border border-rpg-border/70 bg-rpg-bg-2/60 p-2.5" style={{ borderRadius: 3 }}>
                <div className="col-span-2 sm:col-span-1 min-w-0">
                  <RPGBadge tone={p.tone}>{p.id}</RPGBadge>
                  <p className="mt-1 text-[11px] text-rpg-muted truncate">{PRIORITY_HINT[p.id]}</p>
                </div>
                <label className="text-[11px] text-rpg-muted">
                  XP <span className="text-[10px]">(máx. {limits.xp})</span>
                  <input type="number" inputMode="numeric" min={0} max={limits.xp} value={draft[p.id].xp} onChange={(e) => set(p.id, "xp", e.target.value)} className={`${field} mt-1`} style={{ borderRadius: 3 }} aria-label={`XP — prioridade ${p.id}`} />
                </label>
                <label className="text-[11px] text-rpg-muted">
                  Moedas <span className="text-[10px]">(máx. {limits.coins})</span>
                  <input type="number" inputMode="numeric" min={0} max={limits.coins} value={draft[p.id].coins} onChange={(e) => set(p.id, "coins", e.target.value)} className={`${field} mt-1`} style={{ borderRadius: 3 }} aria-label={`Moedas — prioridade ${p.id}`} />
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <RPGButton variant="gold" disabled={!dirty || save.isPending} onClick={onSave}>
              {save.isPending ? "Salvando…" : "Salvar valores"}
            </RPGButton>
            {msg && <p className={`text-xs ${msg.tone === "ok" ? "text-rpg-green" : "text-rpg-red"}`} role="status">{msg.text}</p>}
          </div>
        </>
      )}
    </RPGPanel>
  );
}
