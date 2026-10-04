import { useState } from "react";
import clsx from "clsx";
import { Modal, FormRow } from "@/components/ui/Modal";
import { RPGButton } from "@/components/rpg";
import { useAchievements } from "@/hooks/useAchievements";
import { useRewards } from "@/hooks/useGamification";
import { REWARD_ARTS, REWARD_CATEGORIES, type LimitPeriod, type Reward, type RewardCategory, type RewardCurrency, type RewardInput, type RewardRarity } from "@/services/gamificationService";
import { ART_LABEL, LIMIT_LABEL, RARITY, RARITY_ORDER, categoryGroup, rewardArtUrl, suggestedPrice } from "@/utils/treasureDisplay";

/** Campo no visual RPG (input moderno: fundo navy, borda bronze discreta, foco dourado). */
const field = "w-full px-3 py-2.5 text-sm bg-rpg-bg-2 text-rpg-text border border-rpg-border focus:border-rpg-gold outline-none placeholder:text-rpg-muted/70";

type Bands = Record<"pequena" | "media" | "grande" | "premium", [number, number]>;

function toInput(r: Reward | null): RewardInput {
  return r
    ? {
        name: r.name,
        description: r.description,
        icon: r.icon,
        category: r.category,
        rarity: r.rarity,
        currency: r.currency,
        cost: r.cost,
        requiredLevel: r.requiredLevel,
        requiredXp: r.requiredXp,
        requiredAchievementId: r.requiredAchievementId,
        redemptionLimit: r.redemptionLimit,
        cooldownHours: r.cooldownHours,
        limitPeriod: r.limitPeriod,
        tags: r.tags,
        art: r.art,
        isActive: r.isActive,
      }
    : { name: "", description: "", category: "diversao", rarity: "comum", currency: "coin", cost: 15, cooldownHours: 0, limitPeriod: "none", redemptionLimit: null, art: "gift", tags: [] };
}

const numOrNull = (v: string) => (v === "" ? null : Math.max(0, Math.round(Number(v))));

/** Criação/edição manual de recompensa (o preço sugerido é só referência). */
export function RewardFormModal({ open, initial, bands, onClose, onSaved }: { open: boolean; initial: Reward | null; bands?: Bands; onClose: () => void; onSaved?: (msg: string) => void }) {
  const { create, update, remove } = useRewards(true);
  const { achievements } = useAchievements(false);
  const [form, setForm] = useState<RewardInput>(() => toInput(initial));
  const [tagsText, setTagsText] = useState(() => (initial?.tags ?? []).join(", "));
  const [error, setError] = useState<string | null>(null);
  const [lastInitial, setLastInitial] = useState<Reward | null | undefined>(undefined);
  if (open && lastInitial !== initial) {
    setLastInitial(initial);
    setForm(toInput(initial));
    setTagsText((initial?.tags ?? []).join(", "));
    setError(null);
  }
  const pending = create.isPending || update.isPending || remove.isPending;
  const set = <K extends keyof RewardInput>(k: K, v: RewardInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const price = suggestedPrice(bands, categoryGroup((form.category ?? "diversao") as RewardCategory));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setError("Informe o nome da recompensa.");
    if (!Number.isInteger(form.cost) || form.cost < 1) return setError("O custo deve ser um número inteiro de pelo menos 1.");
    if (form.currency === "gem" && form.cost > 50) return setError("Recompensas em gemas custam no máximo 50.");
    const tags = tagsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 8);
    const payload = { ...form, tags, name: form.name.trim() };
    try {
      if (initial) await update.mutateAsync({ id: initial.id, input: payload });
      else await create.mutateAsync(payload);
      onSaved?.(initial ? "Recompensa atualizada." : "Recompensa adicionada ao Tesouro.");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={initial ? "Editar recompensa" : "Nova recompensa"}
      footer={
        <>
          {initial && (
            <RPGButton
              variant="danger"
              type="button"
              className="mr-auto"
              disabled={pending}
              onClick={async () => {
                await remove.mutateAsync(initial.id);
                onSaved?.(initial.timesRedeemed > 0 ? "Recompensa desativada (o histórico foi mantido)." : "Recompensa excluída.");
                onClose();
              }}
            >
              {initial.timesRedeemed > 0 ? "Desativar" : "Excluir"}
            </RPGButton>
          )}
          <RPGButton variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </RPGButton>
          <RPGButton variant="gold" type="submit" form="reward-form" disabled={pending}>
            {pending ? "Salvando…" : "Salvar"}
          </RPGButton>
        </>
      }
    >
      <form id="reward-form" onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormRow label="Nome" htmlFor="reward-name">
            <input id="reward-name" className={field} value={form.name} maxLength={80} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: 1h extra de série" required />
          </FormRow>
          <FormRow label="Categoria" htmlFor="reward-cat">
            <select id="reward-cat" className={field} value={categoryGroup((form.category ?? "diversao") as RewardCategory)} onChange={(e) => set("category", e.target.value as RewardCategory)}>
              {REWARD_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </FormRow>
        </div>
        <FormRow label="Descrição (opcional)" htmlFor="reward-desc">
          <input id="reward-desc" className={field} value={form.description ?? ""} maxLength={300} onChange={(e) => set("description", e.target.value)} />
        </FormRow>

        <fieldset>
          <legend className="text-xs font-medium text-slate">Imagem</legend>
          <div className="mt-1.5 grid grid-cols-4 sm:grid-cols-6 gap-1.5">
            {REWARD_ARTS.map((art) => (
              <button
                key={art}
                type="button"
                onClick={() => set("art", art)}
                aria-pressed={form.art === art}
                aria-label={ART_LABEL[art]}
                title={ART_LABEL[art]}
                className={clsx("border-2 overflow-hidden", form.art === art ? "border-rpg-gold" : "border-rpg-border opacity-80 hover:opacity-100")}
                style={{ borderRadius: 3 }}
              >
                <img src={rewardArtUrl(art)} alt="" className="pixelated w-full aspect-[8/5] object-cover" />
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
          <FormRow label="Raridade" htmlFor="reward-rarity">
            <select id="reward-rarity" className={field} value={form.rarity} onChange={(e) => set("rarity", e.target.value as RewardRarity)}>
              {RARITY_ORDER.map((r) => (
                <option key={r} value={r}>
                  {RARITY[r].label}
                </option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Moeda" htmlFor="reward-currency">
            <select id="reward-currency" className={field} value={form.currency} onChange={(e) => set("currency", e.target.value as RewardCurrency)}>
              <option value="coin">Moedas</option>
              <option value="gem">Gemas (rara)</option>
            </select>
          </FormRow>
          <FormRow label="Preço" htmlFor="reward-cost" hint={form.currency === "coin" && price ? `Sugestão: ${price[0]}–${price[1]} moedas` : form.currency === "gem" ? "Gemas: 1 a 50." : undefined}>
            <input id="reward-cost" type="number" min={1} step={1} className={field} value={form.cost} onChange={(e) => set("cost", Number(e.target.value))} required />
          </FormRow>
          <FormRow label="Nível requerido" htmlFor="reward-level" hint="Vazio = sem requisito.">
            <input id="reward-level" type="number" min={1} step={1} className={field} value={form.requiredLevel ?? ""} onChange={(e) => set("requiredLevel", numOrNull(e.target.value) || null)} />
          </FormRow>
          <FormRow label="XP total requerido" htmlFor="reward-xp" hint="Opcional.">
            <input id="reward-xp" type="number" min={0} step={50} className={field} value={form.requiredXp ?? ""} onChange={(e) => set("requiredXp", numOrNull(e.target.value))} />
          </FormRow>
          <FormRow label="Conquista requerida" htmlFor="reward-ach">
            <select id="reward-ach" className={field} value={form.requiredAchievementId ?? ""} onChange={(e) => set("requiredAchievementId", e.target.value || null)}>
              <option value="">Nenhuma</option>
              {achievements.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Limite" htmlFor="reward-period">
            <select id="reward-period" className={field} value={form.limitPeriod} onChange={(e) => set("limitPeriod", e.target.value as LimitPeriod)}>
              {(Object.keys(LIMIT_LABEL) as LimitPeriod[]).map((p) => (
                <option key={p} value={p}>
                  {LIMIT_LABEL[p]}
                </option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Recarga (horas)" htmlFor="reward-cd" hint="Intervalo personalizado. 0 = nenhum.">
            <input id="reward-cd" type="number" min={0} step={1} className={field} value={form.cooldownHours ?? 0} onChange={(e) => set("cooldownHours", Math.max(0, Number(e.target.value)))} />
          </FormRow>
          <FormRow label="Total de resgates" htmlFor="reward-limit" hint="Vazio = ilimitado.">
            <input id="reward-limit" type="number" min={1} step={1} className={field} value={form.redemptionLimit ?? ""} onChange={(e) => set("redemptionLimit", numOrNull(e.target.value) || null)} />
          </FormRow>
        </div>
        <FormRow label="Tags (separadas por vírgula)" htmlFor="reward-tags">
          <input id="reward-tags" className={field} value={tagsText} maxLength={200} onChange={(e) => setTagsText(e.target.value)} placeholder="série, noite, sofá" />
        </FormRow>
        {initial && (
          <label className="flex items-center gap-2 text-sm text-rpg-text">
            <input type="checkbox" checked={form.isActive !== false} onChange={(e) => set("isActive", e.target.checked)} /> Ativa no Tesouro
          </label>
        )}
        {error && (
          <p role="alert" className="text-xs text-rpg-red">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
