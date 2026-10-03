import { useState } from "react";
import { Check, Database, Lightbulb, Wand2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { RPGButton } from "@/components/rpg";
import { useRewards } from "@/hooks/useGamification";
import { REWARD_CATEGORIES, gamificationService, type RewardSuggestion } from "@/services/gamificationService";

const field = "w-full px-3 py-2 text-sm bg-rpg-bg-2 text-rpg-text border border-rpg-border focus:border-rpg-gold outline-none";

/**
 * "Mercador do Copilot": o Gemini sugere recompensas com custo calibrado
 * pelo ganho REAL de moedas. Separa dado real (ganho) de sugestão (itens);
 * nada entra na loja sem o usuário marcar e confirmar.
 */
export function RewardAIModal({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const { create } = useRewards(true);
  const suggest = useMutation({ mutationFn: (wish?: string) => gamificationService.suggestRewards(wish) });
  const [wish, setWish] = useState("");
  const [items, setItems] = useState<Array<RewardSuggestion & { picked: boolean }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const ask = async () => {
    setError(null);
    try {
      const r = await suggest.mutateAsync(wish.trim() || undefined);
      setItems(r.suggestions.map((s) => ({ ...s, picked: true })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "A IA não conseguiu sugerir recompensas.");
    }
  };

  const save = async () => {
    const chosen = items.filter((i) => i.picked);
    if (chosen.length === 0) return;
    setSaving(true);
    try {
      for (const s of chosen) {
        await create.mutateAsync({ name: s.name, description: s.description, icon: s.icon, category: s.category, cost: s.cost, cooldownHours: s.cooldownHours });
      }
      onDone(`${chosen.length} recompensa(s) adicionada(s) à loja.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar as recompensas.");
    } finally {
      setSaving(false);
    }
  };

  const basedOn = suggest.data?.basedOn;
  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title="Montar recompensas com a IA"
      footer={
        items.length > 0 ? (
          <div className="flex justify-end gap-2">
            <RPGButton variant="ghost" onClick={onClose}>Cancelar</RPGButton>
            <RPGButton variant="gold" disabled={saving || !items.some((i) => i.picked)} onClick={save}>
              <Check size={14} aria-hidden /> {saving ? "Adicionando…" : "Adicionar à loja"}
            </RPGButton>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-4">
        <label className="block text-xs font-semibold text-rpg-muted" htmlFor="reward-wish">O que você gostaria de ganhar? (opcional)</label>
        <textarea id="reward-wish" rows={2} value={wish} onChange={(e) => setWish(e.target.value)} className={field} style={{ borderRadius: 3 }} placeholder="Ex.: coisas para relaxar no fim de semana, algo ligado a música…" />
        <RPGButton variant="primary" disabled={suggest.isPending} onClick={ask}>
          <Wand2 size={14} aria-hidden /> {suggest.isPending ? "O mercador está pensando…" : items.length ? "Sugerir outras" : "Sugerir recompensas"}
        </RPGButton>

        {basedOn && (
          <p className="flex items-start gap-2 text-xs text-rpg-muted">
            <Database size={13} className="mt-0.5 shrink-0 text-rpg-blue" aria-hidden />
            <span><strong className="text-rpg-text">Dado real:</strong> saldo de {basedOn.balance} moedas; {basedOn.coinsLast30Days} moedas ganhas nos últimos 30 dias (média {basedOn.avgCoinsPerDay}/dia). Os custos abaixo são sugestões da IA com base nisso.</span>
          </p>
        )}

        {items.length > 0 && (
          <ul className="space-y-2">
            {items.map((s, i) => (
              <li key={i} className="rpg-panel p-3 flex items-start gap-3">
                <input type="checkbox" checked={s.picked} onChange={(e) => setItems((arr) => arr.map((x, j) => (j === i ? { ...x, picked: e.target.checked } : x)))} className="mt-1.5 accent-[rgb(var(--rpg-gold))]" aria-label={`Incluir ${s.name}`} />
                <span className="text-2xl leading-none" aria-hidden>{s.icon ?? "🎁"}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-rpg-text">{s.name}</p>
                  {s.description && <p className="text-xs text-rpg-muted">{s.description}</p>}
                  {s.rationale && <p className="mt-1 flex items-start gap-1 text-[11px] text-rpg-purple"><Lightbulb size={11} className="mt-0.5 shrink-0" aria-hidden /> Sugestão da IA: {s.rationale}</p>}
                  <p className="mt-1 text-[11px] text-rpg-muted">{REWARD_CATEGORIES.find((c) => c.id === s.category)?.label} {s.cooldownHours > 0 && `· intervalo de ${s.cooldownHours} h`}</p>
                </div>
                <label className="shrink-0 text-[10px] text-rpg-muted text-right">
                  Custo
                  <input
                    type="number"
                    min={1}
                    max={100000}
                    value={s.cost}
                    onChange={(e) => setItems((arr) => arr.map((x, j) => (j === i ? { ...x, cost: Math.max(1, Math.round(Number(e.target.value) || 1)) } : x)))}
                    className={`${field} !w-20 mt-1 text-right font-pixel`}
                    style={{ borderRadius: 3 }}
                  />
                </label>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="text-xs text-rpg-red" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
