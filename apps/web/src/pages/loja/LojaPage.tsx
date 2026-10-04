import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, Coins, Gift, History, PackagePlus, Plus, Scale, ScrollText, Search, ShoppingBag, Store, TrendingUp, Wand2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RewardAIModal } from "@/components/rewards/RewardAIModal";
import { Modal, FormRow } from "@/components/ui/Modal";
import { RPGBadge, RPGButton, RPGPageHeader, RPGPanel, RPGRewardCard, RPGStatCard, RPGToast, RPGWallet, RewardRedeemModal, rpgButtonClass } from "@/components/rpg";
import { useDifficultySettings, useGamificationProfile, useGamificationRules, useRedemptions, useRewards, useWallet } from "@/hooks/useGamification";
import { REWARD_CATEGORIES, gamificationService, type Reward, type RewardCategory, type RewardInput } from "@/services/gamificationService";

const ICONS = ["🎁", "🎬", "🎮", "☕", "🍫", "🍕", "📚", "🛁", "😴", "🎧", "🛍️", "🌳", "🍿", "🎟️"];

/** Campo no visual RPG (input moderno: fundo navy, borda bronze discreta, foco dourado). */
const field =
  "w-full px-3 py-2.5 text-sm bg-rpg-bg-2 text-rpg-text border border-rpg-border focus:border-rpg-gold outline-none placeholder:text-rpg-muted/70";

function RewardFormModal({ open, initial, onClose }: { open: boolean; initial: Reward | null; onClose: () => void }) {
  const { create, update, remove } = useRewards(true);
  const [form, setForm] = useState<RewardInput>(() => toInput(initial));
  const [error, setError] = useState<string | null>(null);
  const [lastInitial, setLastInitial] = useState<Reward | null | undefined>(undefined);
  if (open && lastInitial !== initial) {
    setLastInitial(initial);
    setForm(toInput(initial));
    setError(null);
  }
  const pending = create.isPending || update.isPending || remove.isPending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setError("Informe o nome da recompensa.");
    if (!Number.isInteger(form.cost) || form.cost < 1) return setError("O custo deve ser um número inteiro de pelo menos 1 moeda.");
    try {
      if (initial) await update.mutateAsync({ id: initial.id, input: form });
      else await create.mutateAsync(form);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
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
        <FormRow label="Nome" htmlFor="reward-name">
          <input id="reward-name" className={field} value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Um episódio da série" required />
        </FormRow>
        <FormRow label="Descrição (opcional)" htmlFor="reward-desc">
          <input id="reward-desc" className={field} value={form.description ?? ""} maxLength={300} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </FormRow>
        <fieldset>
          <legend className="text-xs font-medium text-slate">Ícone</legend>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {ICONS.map((icon) => (
              <button
                key={icon}
                type="button"
                onClick={() => setForm({ ...form, icon })}
                aria-pressed={form.icon === icon}
                aria-label={`Ícone ${icon}`}
                className={`w-10 h-10 text-xl border-2 ${form.icon === icon ? "border-rpg-gold bg-rpg-gold/15" : "border-rpg-border bg-rpg-bg-2"}`}
                style={{ borderRadius: 3 }}
              >
                {icon}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormRow label="Categoria" htmlFor="reward-cat">
            <select id="reward-cat" className={field} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as RewardCategory })}>
              {REWARD_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Custo (moedas)" htmlFor="reward-cost">
            <input id="reward-cost" type="number" min={1} step={1} className={field} value={form.cost} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} required />
          </FormRow>
          <FormRow label="Recarga (horas)" htmlFor="reward-cd" hint="0 = sem intervalo mínimo entre resgates.">
            <input id="reward-cd" type="number" min={0} step={1} className={field} value={form.cooldownHours ?? 0} onChange={(e) => setForm({ ...form, cooldownHours: Math.max(0, Number(e.target.value)) })} />
          </FormRow>
          <FormRow label="Limite de resgates" htmlFor="reward-limit" hint="Vazio = ilimitado.">
            <input
              id="reward-limit"
              type="number"
              min={1}
              step={1}
              className={field}
              value={form.redemptionLimit ?? ""}
              onChange={(e) => setForm({ ...form, redemptionLimit: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </FormRow>
        </div>
        {initial && (
          <label className="flex items-center gap-2 text-sm text-rpg-text">
            <input type="checkbox" checked={form.isActive !== false} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Ativa na loja
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

function toInput(r: Reward | null): RewardInput {
  return r
    ? { name: r.name, description: r.description, icon: r.icon, category: r.category, cost: r.cost, cooldownHours: r.cooldownHours, redemptionLimit: r.redemptionLimit, isActive: r.isActive }
    : { name: "", description: "", icon: "🎁", category: "lazer", cost: 20, cooldownHours: 0, redemptionLimit: null };
}

type SortKey = "disponiveis" | "baratas" | "caras" | "resgatadas" | "recentes";
const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: "disponiveis", label: "Disponíveis primeiro" },
  { id: "baratas", label: "Mais baratas" },
  { id: "caras", label: "Mais caras" },
  { id: "resgatadas", label: "Mais resgatadas" },
  { id: "recentes", label: "Mais recentes" },
];

/** Pode resgatar agora? Mesmas condições que o backend valida no resgate. */
function canRedeem(r: Reward, balance: number): boolean {
  const soldOut = r.redemptionLimit != null && r.timesRedeemed >= r.redemptionLimit;
  return r.isActive && !soldOut && !r.availableAt && r.cost <= balance;
}

function sortRewards(list: Reward[], sort: SortKey, balance: number): Reward[] {
  const by: Record<SortKey, (a: Reward, b: Reward) => number> = {
    disponiveis: (a, b) => Number(canRedeem(b, balance)) - Number(canRedeem(a, balance)) || a.cost - b.cost,
    baratas: (a, b) => a.cost - b.cost,
    caras: (a, b) => b.cost - a.cost,
    resgatadas: (a, b) => b.timesRedeemed - a.timesRedeemed || a.cost - b.cost,
    recentes: (a, b) => b.createdAt.localeCompare(a.createdAt),
  };
  return [...list].sort(by[sort]);
}

/** Linha "ação → recompensa" do painel Como ganhar moedas. */
function EarnRow({ label, xp, coins, hint }: { label: string; xp: number; coins: number; hint?: string }) {
  return (
    <li className="flex items-center justify-between gap-2 py-1.5">
      <span className="min-w-0 text-rpg-text">
        {label}
        {hint && <span className="block text-[10px] text-rpg-muted">{hint}</span>}
      </span>
      <span className="font-pixel text-xs text-rpg-muted shrink-0">
        +{xp} XP · <span className="text-rpg-gold-light">+{coins} 🪙</span>
      </span>
    </li>
  );
}

/**
 * Loja de recompensas: o usuário cria as próprias recompensas e troca
 * moedas ganhas com ações reais. Entradas: HUD, Dashboard e Conquistas.
 */
export function LojaPage() {
  const profile = useGamificationProfile();
  const rules = useGamificationRules();
  const wallet = useWallet();
  const { priority, rewards: difficulty } = useDifficultySettings();
  const { rewards, isLoading, isError, redeem } = useRewards(true);
  const redemptions = useRedemptions();
  const [category, setCategory] = useState<RewardCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("disponiveis");
  const [onlyAffordable, setOnlyAffordable] = useState(false);
  const [editing, setEditing] = useState<Reward | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [redeeming, setRedeeming] = useState<Reward | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const qc = useQueryClient();
  // Pacote inicial: idempotente no backend (não duplica recompensas pelo nome).
  const starter = useMutation({
    mutationFn: gamificationService.starterRewards,
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["gamification"] });
      setToast(r.created > 0 ? `${r.created} recompensa(s) do pacote inicial adicionadas.` : "Você já tem todas as recompensas do pacote inicial.");
    },
    onError: () => setToast("Não foi possível adicionar o pacote inicial."),
  });

  const balance = wallet.data?.balance ?? profile.data?.coins ?? 0;
  // Média real de moedas/dia nos últimos 30 dias (base das estimativas dos cards).
  const coinsPerDay = wallet.data ? wallet.data.earned30 / 30 : undefined;

  const active = useMemo(() => rewards.filter((r) => r.isActive), [rewards]);
  const inactive = useMemo(() => rewards.filter((r) => !r.isActive), [rewards]);
  const affordableCount = useMemo(() => active.filter((r) => canRedeem(r, balance)).length, [active, balance]);
  // Próxima recompensa ao alcance: a mais barata que ainda não cabe no saldo.
  const nextGoal = useMemo(
    () => active.filter((r) => r.cost > balance && !(r.redemptionLimit != null && r.timesRedeemed >= r.redemptionLimit)).sort((a, b) => a.cost - b.cost)[0] ?? null,
    [active, balance],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("pt-BR");
    const list = active.filter(
      (r) =>
        (category === "all" || r.category === category) &&
        (!onlyAffordable || canRedeem(r, balance)) &&
        (!q || r.name.toLocaleLowerCase("pt-BR").includes(q) || (r.description ?? "").toLocaleLowerCase("pt-BR").includes(q)),
    );
    return sortRewards(list, sort, balance);
  }, [active, category, onlyAffordable, query, sort, balance]);
  const filtering = category !== "all" || onlyAffordable || query.trim() !== "";

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (r: Reward) => {
    setEditing(r);
    setFormOpen(true);
  };
  const clearFilters = () => {
    setCategory("all");
    setOnlyAffordable(false);
    setQuery("");
  };

  return (
    <div className="px-4 md:px-6 lg:px-8 py-6 space-y-6 max-w-7xl mx-auto">
      <RPGPageHeader
        banner="loja"
        size="md"
        eyebrow="Recompensas"
        title="Loja do Aventureiro"
        subtitle="Troque moedas ganhas com missões, contratos, hábitos e foco por recompensas definidas por você."
        actions={
          <>
            <RPGButton variant="gold" onClick={openCreate}>
              <Plus size={15} aria-hidden /> Nova recompensa
            </RPGButton>
            <RPGButton variant="primary" onClick={() => setAiOpen(true)}>
              <Wand2 size={15} aria-hidden /> Montar com IA
            </RPGButton>
            <RPGButton variant="secondary" disabled={starter.isPending} onClick={() => starter.mutate()} title="Café, série, videogame, folga… custos calibrados pela economia atual">
              <PackagePlus size={15} aria-hidden /> Pacote inicial
            </RPGButton>
          </>
        }
      />

      {/* Carteira: números reais do ledger de moedas. */}
      <section aria-label="Carteira" className="grid gap-3 grid-cols-2 xl:grid-cols-4">
        <RPGStatCard layout="wide" icon={<Coins size={22} />} tone="gold" label="Saldo" value={wallet.data || profile.data ? String(balance) : "—"} caption="moedas disponíveis" />
        <RPGStatCard
          layout="wide"
          icon={<TrendingUp size={22} />}
          tone="green"
          label="Ganho em 30 dias"
          value={wallet.data ? `+${wallet.data.earned30}` : "—"}
          caption={coinsPerDay !== undefined ? `média de ${coinsPerDay.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}/dia` : undefined}
        />
        <RPGStatCard layout="wide" icon={<ShoppingBag size={22} />} tone="orange" label="Gasto em 30 dias" value={wallet.data ? `-${wallet.data.spent30}` : "—"} caption={wallet.data ? `${wallet.data.spent} no total` : undefined} />
        <RPGStatCard
          layout="wide"
          icon={<Gift size={22} />}
          tone="purple"
          label="Ao seu alcance"
          value={isLoading ? "—" : String(affordableCount)}
          caption={nextGoal ? `próxima: ${nextGoal.name} (faltam ${nextGoal.cost - balance})` : active.length > 0 ? "todas cabem no saldo" : "crie sua primeira recompensa"}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6 min-w-0">
          <RPGPanel title="Recompensas" icon={<Store size={16} />} actions={<RPGWallet coins={balance} size="sm" />}>
            {/* Busca, ordenação e filtro de saldo */}
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <label className="relative flex-1 min-w-0">
                <span className="sr-only">Buscar recompensas</span>
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-rpg-muted" aria-hidden />
                <input className={`${field} pl-8`} style={{ borderRadius: 3 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar recompensa…" />
              </label>
              <label className="sm:w-52 shrink-0">
                <span className="sr-only">Ordenar</span>
                <select className={field} style={{ borderRadius: 3 }} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                  {SORTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                aria-pressed={onlyAffordable}
                onClick={() => setOnlyAffordable((v) => !v)}
                className={`shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs border ${onlyAffordable ? "border-rpg-gold text-rpg-gold-light bg-rpg-gold/10" : "border-rpg-border text-rpg-muted"}`}
                style={{ borderRadius: 3 }}
              >
                <Coins size={13} aria-hidden /> Posso resgatar
              </button>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-3 -mx-1 px-1" role="tablist" aria-label="Filtrar por categoria">
              {[{ id: "all" as const, label: "Todas" }, ...REWARD_CATEGORIES].map((c) => (
                <button
                  key={c.id}
                  role="tab"
                  aria-selected={category === c.id}
                  onClick={() => setCategory(c.id)}
                  className={`shrink-0 px-2.5 py-1 text-xs border ${category === c.id ? "border-rpg-gold text-rpg-gold-light bg-rpg-gold/10" : "border-rpg-border text-rpg-muted"}`}
                  style={{ borderRadius: 3 }}
                >
                  {c.label}
                  {c.id !== "all" && <span className="ml-1 opacity-70">{active.filter((r) => r.category === c.id).length}</span>}
                </button>
              ))}
            </div>

            {isLoading && (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Carregando recompensas">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="rpg-panel h-40 animate-pulse" />
                ))}
              </div>
            )}
            {isError && <p className="text-sm text-rpg-red">Não foi possível carregar a loja.</p>}
            {!isLoading && !isError && active.length === 0 && (
              <div className="flex flex-col items-center text-center gap-3 py-10">
                <Gift size={32} className="text-rpg-gold" aria-hidden />
                <p className="font-rpg text-rpg-text">Nenhuma recompensa na loja ainda.</p>
                <p className="text-sm text-rpg-muted max-w-sm">Crie recompensas que valham a pena para você — um episódio, um café especial, uma tarde livre.</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <RPGButton variant="gold" onClick={openCreate}>
                    <Plus size={15} aria-hidden /> Criar recompensa
                  </RPGButton>
                  <RPGButton variant="secondary" disabled={starter.isPending} onClick={() => starter.mutate()}>
                    <PackagePlus size={15} aria-hidden /> Pacote inicial
                  </RPGButton>
                  <RPGButton variant="primary" onClick={() => setAiOpen(true)}>
                    <Wand2 size={15} aria-hidden /> Montar com IA
                  </RPGButton>
                </div>
              </div>
            )}
            {!isLoading && active.length > 0 && visible.length === 0 && (
              <div className="flex flex-col items-center text-center gap-2 py-8">
                <p className="text-sm text-rpg-muted">{onlyAffordable ? "Nenhuma recompensa cabe no saldo agora — conclua missões para ganhar moedas." : "Nada encontrado com esses filtros."}</p>
                {filtering && (
                  <RPGButton variant="ghost" onClick={clearFilters}>
                    Limpar filtros
                  </RPGButton>
                )}
              </div>
            )}
            {visible.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((r) => (
                  <RPGRewardCard key={r.id} reward={r} balance={balance} coinsPerDay={coinsPerDay} onRedeem={() => setRedeeming(r)} onEdit={() => openEdit(r)} />
                ))}
              </div>
            )}
          </RPGPanel>

          {inactive.length > 0 && (
            <details className="rpg-panel p-4 group">
              <summary className="cursor-pointer list-none flex items-center gap-2 text-sm text-rpg-muted">
                <Archive size={14} aria-hidden /> Desativadas ({inactive.length})
                <span className="ml-auto text-[11px] group-open:hidden">mostrar</span>
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {inactive.map((r) => (
                  <RPGRewardCard key={r.id} reward={r} balance={balance} onRedeem={() => undefined} onEdit={() => openEdit(r)} />
                ))}
              </div>
            </details>
          )}
        </div>

        <div className="space-y-6 min-w-0">
          <RPGPanel title="Como ganhar moedas" icon={<ScrollText size={16} />}>
            {rules.data ? (
              <ul className="divide-y divide-rpg-border/50 text-sm">
                {/* Valores do próprio usuário (Missões → Valor das missões); padrão enquanto carrega. */}
                {(["Baixa", "Média", "Alta"] as const).map((p) => (
                  <EarnRow
                    key={p}
                    label={`Missão ${p.toLowerCase()}`}
                    xp={priority?.[p].xp ?? rules.data.task.xpByPriority[p] ?? 0}
                    coins={priority?.[p].coins ?? rules.data.task.coinsByPriority[p] ?? 0}
                  />
                ))}
                {difficulty && (
                  <EarnRow label="Missão épica" hint="com dificuldade definida" xp={difficulty.epico.taskXp} coins={difficulty.epico.taskCoins} />
                )}
                <EarnRow label="Hábito cumprido" xp={rules.data.habit.xp} coins={rules.data.habit.coins} />
                <EarnRow label={`Foco (${rules.data.focus.blockMinutes} min)`} xp={rules.data.focus.xpPerBlock} coins={rules.data.focus.coinsPerBlock} />
                <EarnRow label="Projeto concluído" xp={rules.data.project.xp} coins={rules.data.project.coins} />
              </ul>
            ) : (
              <div className="h-24 rpg-bar animate-pulse" />
            )}
            <Link to="/tarefas?valores=1" className={rpgButtonClass("secondary", "mt-3 w-full justify-center")}>
              <Scale size={14} aria-hidden /> Ajustar valor das missões
            </Link>
            <p className="mt-3 text-[11px] text-rpg-muted">XP nunca diminui. Desfazer e refazer uma ação não rende recompensa de novo.</p>
          </RPGPanel>

          <RPGPanel title="Resgates recentes" icon={<History size={16} />}>
            {redemptions.isLoading && <div className="h-16 rpg-bar animate-pulse" />}
            {redemptions.data && redemptions.data.length === 0 && <p className="text-sm text-rpg-muted">Nenhum resgate ainda.</p>}
            {redemptions.data && redemptions.data.length > 0 && (
              <ul className="divide-y divide-rpg-border/60">
                {redemptions.data.slice(0, 10).map((r) => (
                  <li key={r.id} className="flex items-center gap-2 py-2 text-sm">
                    <span aria-hidden>{r.icon || "🎁"}</span>
                    <span className="min-w-0 flex-1 truncate text-rpg-text">{r.rewardName}</span>
                    <RPGBadge tone="gold">-{r.cost}</RPGBadge>
                    <time className="text-[11px] text-rpg-muted" dateTime={r.redeemedAt}>
                      {new Date(r.redeemedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </RPGPanel>
        </div>
      </div>

      <RewardFormModal open={formOpen} initial={editing} onClose={() => setFormOpen(false)} />
      <RewardRedeemModal
        reward={redeeming}
        balance={balance}
        onClose={() => setRedeeming(null)}
        onConfirm={async (r) => redeem.mutateAsync(r.id)}
      />
      {aiOpen && (
        <RewardAIModal
          onClose={() => setAiOpen(false)}
          onDone={(msg) => {
            setAiOpen(false);
            setToast(msg);
          }}
        />
      )}
      <RPGToast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
