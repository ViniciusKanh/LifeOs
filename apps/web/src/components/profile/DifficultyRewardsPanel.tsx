import { useEffect, useState } from "react";
import { RotateCcw, Scale } from "lucide-react";
import { RPGBadge, RPGButton, RPGPanel } from "@/components/rpg";
import { useDifficultySettings, useGamificationRules } from "@/hooks/useGamification";
import { DIFFICULTIES, type DifficultyKey, type DifficultyRewards } from "@/services/gamificationService";

const FIELDS: Array<{ key: keyof DifficultyRewards["facil"]; label: string; short: string }> = [
  { key: "taskXp", label: "XP por tarefa", short: "XP tarefa" },
  { key: "taskCoins", label: "Moedas por tarefa", short: "🪙 tarefa" },
  { key: "contractXp", label: "Bônus de XP do contrato", short: "XP contrato" },
  { key: "contractCoins", label: "Bônus de moedas do contrato", short: "🪙 contrato" },
];

/**
 * "Balança de recompensas": o próprio usuário define quanto XP e quantas
 * moedas cada dificuldade vale. O backend limita os valores e aplica só às
 * recompensas futuras — XP já conquistado nunca muda.
 */
export function DifficultyRewardsPanel() {
  const { rewards, isLoading, isError, save } = useDifficultySettings();
  const { data: rules } = useGamificationRules();
  const [draft, setDraft] = useState<DifficultyRewards | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (rewards) setDraft(rewards);
  }, [rewards]);

  const limits = rules?.difficulty.limits;
  const dirty = !!draft && !!rewards && JSON.stringify(draft) !== JSON.stringify(rewards);
  const field = "w-full min-w-0 px-2 py-1.5 text-sm text-right font-pixel bg-rpg-bg-2 text-rpg-text border border-rpg-border focus:border-rpg-gold outline-none";

  const set = (d: DifficultyKey, k: keyof DifficultyRewards["facil"], raw: string) => {
    const max = limits?.[k] ?? 9999;
    const n = Math.min(max, Math.max(0, Math.round(Number(raw) || 0)));
    setDraft((cur) => (cur ? { ...cur, [d]: { ...cur[d], [k]: n } } : cur));
  };

  const onSave = async () => {
    if (!draft) return;
    setMsg(null);
    try {
      await save.mutateAsync(draft);
      setMsg({ tone: "ok", text: "Balança salva. Os novos valores valem para as próximas recompensas." });
    } catch (err) {
      setMsg({ tone: "err", text: err instanceof Error ? err.message : "Não foi possível salvar." });
    }
  };

  return (
    <RPGPanel
      title="Balança de recompensas"
      icon={<Scale size={16} />}
      actions={
        rules && (
          <RPGButton variant="ghost" onClick={() => setDraft(rules.difficulty.defaults)} title="Voltar aos valores padrão do LifeOS">
            <RotateCcw size={13} aria-hidden /> Padrão
          </RPGButton>
        )
      }
    >
      <p className="-mt-1 mb-3 text-xs text-rpg-muted">
        Defina quanto vale cada dificuldade. Tarefas com dificuldade usam estes valores no lugar da prioridade; o bônus do contrato é pago uma vez, quando todas as
        tarefas dele são concluídas. Os limites existem para manter a economia justa.
      </p>
      {isLoading && <p className="text-sm text-rpg-muted py-4">Carregando balança…</p>}
      {isError && <p className="text-sm text-rpg-red py-4" role="alert">Não foi possível carregar seus valores.</p>}
      {draft && (
        <>
          {/* Desktop/tablet: tabela; celular: um card por dificuldade. */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-rpg-muted">
                  <th className="py-1.5 pr-2 font-semibold">Dificuldade</th>
                  {FIELDS.map((f) => (
                    <th key={f.key} className="py-1.5 px-1 font-semibold text-right">
                      {f.short}
                      {limits && <span className="block normal-case tracking-normal text-[10px]">máx. {limits[f.key]}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DIFFICULTIES.map((d) => (
                  <tr key={d.id} className="border-t border-rpg-border/50">
                    <td className="py-2 pr-2"><RPGBadge tone={d.tone}>{d.label}</RPGBadge></td>
                    {FIELDS.map((f) => (
                      <td key={f.key} className="py-2 px-1 w-[18%]">
                        <input type="number" inputMode="numeric" min={0} max={limits?.[f.key]} value={draft[d.id][f.key]} onChange={(e) => set(d.id, f.key, e.target.value)} className={field} style={{ borderRadius: 3 }} aria-label={`${f.label} — ${d.label}`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="sm:hidden space-y-2">
            {DIFFICULTIES.map((d) => (
              <div key={d.id} className="border border-rpg-border/70 bg-rpg-bg-2/60 p-3" style={{ borderRadius: 3 }}>
                <RPGBadge tone={d.tone}>{d.label}</RPGBadge>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {FIELDS.map((f) => (
                    <label key={f.key} className="text-[11px] text-rpg-muted">
                      {f.label}
                      <input type="number" inputMode="numeric" min={0} max={limits?.[f.key]} value={draft[d.id][f.key]} onChange={(e) => set(d.id, f.key, e.target.value)} className={`${field} mt-1`} style={{ borderRadius: 3 }} />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <RPGButton variant="gold" disabled={!dirty || save.isPending} onClick={onSave}>
              {save.isPending ? "Salvando…" : "Salvar balança"}
            </RPGButton>
            {msg && <p className={`text-xs ${msg.tone === "ok" ? "text-rpg-green" : "text-rpg-red"}`} role="status">{msg.text}</p>}
          </div>
        </>
      )}
    </RPGPanel>
  );
}
