import { useMemo, useState } from "react";
import { ArrowRight, Coins, Gem, PackagePlus, Plus, Sparkles, Store, Wand2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { RPGBadge, RPGButton, RPGRewardCard, RPGToast, RewardRedeemModal } from "@/components/rpg";
import { AIRewardGeneratorModal } from "@/components/treasure/AIRewardGeneratorModal";
import { RareRewardGoals } from "@/components/treasure/RareRewardGoals";
import { RewardFilters, type StateFilter } from "@/components/treasure/RewardFilters";
import { RewardFormModal } from "@/components/treasure/RewardFormModal";
import { RewardHistory, RewardHistoryModal } from "@/components/treasure/RewardHistory";
import { RewardInventory, type InventoryAction } from "@/components/treasure/RewardInventory";
import { TreasureHero } from "@/components/treasure/TreasureHero";
import { TreasureKpis } from "@/components/treasure/TreasureKpis";
import { useRewards, useTreasure } from "@/hooks/useGamification";
import { gamificationService, type InventoryItem, type RedemptionStatus, type Reward } from "@/services/gamificationService";
import { RARITY, categoryGroup, categoryLabel, formatWhen, limitText, matchesQuery, requirementText, rewardArtUrl, sortRewards, type CategoryGroup, type SortKey } from "@/utils/treasureDisplay";

const FEATURED = 8;

/**
 * Tesouro & Recompensas: a economia de recompensas pessoais do LifeOS RPG.
 * Moedas (e gemas, raras) ganhas com ações reais viram benefícios escolhidos
 * pelo próprio usuário. Todo saldo/estado vem do backend; a UI só atualiza
 * depois da confirmação do servidor.
 */
export function TesouroPage() {
  const { data, isLoading, isError, refetch, consume, cancelItem } = useTreasure();
  const { update, redeem } = useRewards(true);
  const qc = useQueryClient();
  const [group, setGroup] = useState<CategoryGroup | "all">("all");
  const [sort, setSort] = useState<SortKey>("relevantes");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<Reward | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [redeeming, setRedeeming] = useState<Reward | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [history, setHistory] = useState<{ status: "all" | RedemptionStatus; rewardId: string | null } | null>(null);
  const [itemAction, setItemAction] = useState<{ item: InventoryItem; action: "use" | "details" | "cancel" } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Pacote inicial: idempotente no backend (não duplica recompensas pelo nome).
  const starter = useMutation({
    mutationFn: gamificationService.starterRewards,
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["gamification"] });
      setToast(r.created > 0 ? `${r.created} recompensa(s) do pacote inicial adicionadas.` : "Você já tem todas as recompensas do pacote inicial.");
    },
    onError: () => setToast("Não foi possível adicionar o pacote inicial."),
  });

  const summary = data?.summary;
  const rewards = useMemo(() => data?.rewards ?? [], [data?.rewards]);
  const active = useMemo(() => rewards.filter((r) => r.isActive), [rewards]);
  const inactive = useMemo(() => rewards.filter((r) => !r.isActive), [rewards]);
  const counts = useMemo(() => {
    const c: Partial<Record<CategoryGroup, number>> = {};
    for (const r of active) c[categoryGroup(r.category)] = (c[categoryGroup(r.category)] ?? 0) + 1;
    return c;
  }, [active]);
  // Preferência real: categorias que o usuário mais resgatou (usado em "Mais relevantes").
  const groupScore = useMemo(() => {
    const s: Partial<Record<CategoryGroup, number>> = {};
    for (const r of active) s[categoryGroup(r.category)] = (s[categoryGroup(r.category)] ?? 0) + r.timesRedeemed;
    return s;
  }, [active]);
  const coinsPerDay = summary ? summary.wallet.earned30 / 30 : undefined;

  const visible = useMemo(() => {
    const list = active.filter(
      (r) =>
        (group === "all" || categoryGroup(r.category) === group) &&
        (stateFilter === "all" || (stateFilter === "favorites" ? r.isFavorite : stateFilter === "available" ? r.availability.available : !r.availability.available)) &&
        matchesQuery(r, query),
    );
    return sortRewards(list, sort, groupScore);
  }, [active, group, stateFilter, query, sort, groupScore]);
  const shown = showAll ? visible : visible.slice(0, FEATURED);
  const filtering = group !== "all" || stateFilter !== "all" || query.trim() !== "";

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (r: Reward) => {
    setEditing(r);
    setFormOpen(true);
  };
  const toggleFavorite = (r: Reward) => update.mutate({ id: r.id, input: { isFavorite: !r.isFavorite } }, { onError: () => setToast("Não foi possível atualizar o favorito.") });

  const onInventory = (item: InventoryItem, action: InventoryAction) => {
    if (action === "history") setHistory({ status: "all", rewardId: item.rewardId });
    else setItemAction({ item, action });
  };
  const confirmItem = async () => {
    if (!itemAction) return;
    const { item, action } = itemAction;
    try {
      if (action === "use") {
        await consume.mutateAsync(item.nextRedemptionId);
        setToast(`Recompensa utilizada: ${item.name}. Aproveite!`);
      } else if (action === "cancel") {
        await cancelItem.mutateAsync(item.nextRedemptionId);
        setToast(`${item.name} devolvida — valor estornado.`);
      }
      setItemAction(null);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Não foi possível concluir a ação.");
    }
  };
  const detailsReward = itemAction?.action === "details" ? rewards.find((r) => r.id === itemAction.item.rewardId) : undefined;

  const heroActions = (
    <>
      <RPGButton variant="gold" onClick={openCreate}>
        <Plus size={15} aria-hidden /> Nova recompensa
      </RPGButton>
      <RPGButton variant="primary" onClick={() => setAiOpen(true)}>
        <Wand2 size={15} aria-hidden /> ✨ Criar recompensas com IA
      </RPGButton>
      <RPGButton variant="secondary" disabled={starter.isPending} onClick={() => starter.mutate()} title="Café, série, videogame, dia leve… custos calibrados pela economia atual">
        <PackagePlus size={15} aria-hidden /> Pacote inicial
      </RPGButton>
    </>
  );

  return (
    <div className="w-full px-4 md:px-6 lg:px-8 py-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px] items-start">
        <div className="space-y-5 min-w-0">
          <TreasureHero actions={heroActions} />
          {isError ? (
            <div className="rpg-panel p-6 text-center">
              <p className="text-sm text-rpg-red">Não foi possível carregar o Tesouro.</p>
              <RPGButton variant="secondary" className="mt-3" onClick={() => refetch()}>
                Tentar novamente
              </RPGButton>
            </div>
          ) : (
            <>
              <TreasureKpis summary={summary} loading={isLoading} />
              {(isLoading || active.length > 0) && (
                <RewardFilters group={group} onGroup={setGroup} counts={counts} sort={sort} onSort={setSort} state={stateFilter} onState={setStateFilter} query={query} onQuery={setQuery} />
              )}

              <section aria-labelledby="featured-title" className="space-y-3">
                <div className="flex items-center gap-2">
                  <Store size={16} className="text-rpg-gold" aria-hidden />
                  <h2 id="featured-title" className="font-pixel text-xs uppercase tracking-[0.14em] text-rpg-gold">
                    {filtering ? `Recompensas (${visible.length})` : "Recompensas em destaque"}
                  </h2>
                  {visible.length > FEATURED && (
                    <button type="button" onClick={() => setShowAll((v) => !v)} className="ml-auto inline-flex items-center gap-1 text-xs text-rpg-blue hover:underline">
                      {showAll ? "Mostrar menos" : `Ver todos (${visible.length})`} <ArrowRight size={12} aria-hidden />
                    </button>
                  )}
                </div>

                {isLoading && (
                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" aria-label="Carregando recompensas">
                    {Array.from({ length: 4 }, (_, i) => (
                      <div key={i} className="rpg-panel h-72 animate-pulse" />
                    ))}
                  </div>
                )}

                {!isLoading && active.length === 0 && (
                  <div className="rpg-panel rpg-panel-gold flex flex-col items-center text-center gap-3 py-10 px-4">
                    <img src="/assets/rpg/rewards/gift.webp" alt="" aria-hidden className="pixelated w-40 h-[100px] object-cover border-2 border-rpg-bronze" style={{ borderRadius: 3 }} />
                    <p className="font-pixel text-xs uppercase tracking-[0.16em] text-rpg-gold">Seu tesouro ainda está vazio</p>
                    <p className="text-sm text-rpg-muted max-w-md">Crie recompensas para transformar sua evolução em momentos que realmente importam.</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      <RPGButton variant="gold" onClick={openCreate}>
                        <Plus size={15} aria-hidden /> Criar recompensa
                      </RPGButton>
                      <RPGButton variant="primary" onClick={() => setAiOpen(true)}>
                        <Sparkles size={15} aria-hidden /> Gerar com Gemini
                      </RPGButton>
                    </div>
                  </div>
                )}

                {!isLoading && active.length > 0 && visible.length === 0 && (
                  <div className="rpg-panel flex flex-col items-center text-center gap-2 py-8">
                    <p className="text-sm text-rpg-muted">
                      {stateFilter === "available" ? "Nenhuma recompensa disponível agora — conclua missões para ganhar moedas." : "Nada encontrado com esses filtros."}
                    </p>
                    <RPGButton
                      variant="ghost"
                      onClick={() => {
                        setGroup("all");
                        setStateFilter("all");
                        setQuery("");
                      }}
                    >
                      Limpar filtros
                    </RPGButton>
                  </div>
                )}

                {shown.length > 0 && (
                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                    {shown.map((r) => (
                      <RPGRewardCard
                        key={r.id}
                        reward={r}
                        balance={summary?.coins ?? 0}
                        gems={summary?.gems ?? 0}
                        coinsPerDay={coinsPerDay}
                        onRedeem={() => setRedeeming(r)}
                        onEdit={() => openEdit(r)}
                        onToggleFavorite={() => toggleFavorite(r)}
                      />
                    ))}
                  </div>
                )}
              </section>

              {inactive.length > 0 && (
                <details className="rpg-panel p-3 group">
                  <summary className="cursor-pointer list-none text-sm text-rpg-muted">Desativadas ({inactive.length})</summary>
                  <div className="mt-3 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                    {inactive.map((r) => (
                      <RPGRewardCard key={r.id} reward={r} balance={summary?.coins ?? 0} gems={summary?.gems ?? 0} onRedeem={() => undefined} onEdit={() => openEdit(r)} />
                    ))}
                  </div>
                </details>
              )}
            </>
          )}
        </div>

        <aside className="space-y-4 min-w-0" aria-label="Inventário, histórico e metas">
          <RewardInventory items={data?.inventory ?? []} loading={isLoading} onAction={onInventory} onViewAll={() => setHistory({ status: "available", rewardId: null })} />
          <RewardHistory items={data?.history ?? []} loading={isLoading} onViewAll={() => setHistory({ status: "all", rewardId: null })} />
          <RareRewardGoals goals={data?.goals ?? []} loading={isLoading} />
        </aside>
      </div>

      <RewardFormModal open={formOpen} initial={editing} bands={data?.config.priceBands} onClose={() => setFormOpen(false)} onSaved={setToast} />
      <RewardRedeemModal
        reward={redeeming}
        balance={summary?.coins ?? 0}
        gems={summary?.gems ?? 0}
        onClose={() => setRedeeming(null)}
        onConfirm={async (r, requestId) => redeem.mutateAsync({ id: r.id, requestId })}
        onViewInventory={() => {
          setRedeeming(null);
          document.getElementById("inventario-title")?.scrollIntoView({ behavior: "smooth", block: "center" });
        }}
      />
      {aiOpen && (
        <AIRewardGeneratorModal
          onClose={() => setAiOpen(false)}
          onManual={() => {
            setAiOpen(false);
            openCreate();
          }}
          onDone={(msg) => {
            setAiOpen(false);
            setToast(msg);
          }}
        />
      )}
      {history && <RewardHistoryModal open initial={history.status} rewardId={history.rewardId} onClose={() => setHistory(null)} />}

      <Modal
        open={!!itemAction}
        onClose={() => setItemAction(null)}
        size="sm"
        title={itemAction?.action === "use" ? "Usar recompensa?" : itemAction?.action === "cancel" ? "Devolver recompensa?" : "Detalhes da recompensa"}
        footer={
          itemAction?.action === "details" ? (
            <RPGButton variant="gold" onClick={() => setItemAction(null)}>
              Fechar
            </RPGButton>
          ) : (
            <>
              <RPGButton variant="ghost" onClick={() => setItemAction(null)}>
                Cancelar
              </RPGButton>
              <RPGButton variant={itemAction?.action === "cancel" ? "danger" : "gold"} onClick={confirmItem} disabled={consume.isPending || cancelItem.isPending}>
                {itemAction?.action === "cancel" ? "Devolver e estornar" : "Usar agora"}
              </RPGButton>
            </>
          )
        }
      >
        {itemAction && (
          <div className="flex items-start gap-3 text-sm">
            <img src={rewardArtUrl(itemAction.item.art, detailsReward?.category)} alt="" aria-hidden className="pixelated w-24 h-[60px] object-cover border-2 border-rpg-bronze shrink-0" style={{ borderRadius: 3 }} />
            <div className="min-w-0 space-y-1">
              <p className="font-rpg font-bold text-rpg-text">{itemAction.item.name}</p>
              {itemAction.action === "use" && <p className="text-rpg-muted">Esta ação consumirá 1 unidade (você tem {itemAction.item.quantity}).</p>}
              {itemAction.action === "cancel" && <p className="text-rpg-muted">1 unidade sai do inventário e o valor pago volta para a sua carteira.</p>}
              {itemAction.action === "details" && (
                <>
                  {detailsReward?.description && <p className="text-rpg-muted">{detailsReward.description}</p>}
                  <p className="flex flex-wrap gap-1.5">
                    {detailsReward && <RPGBadge tone={RARITY[detailsReward.rarity].tone}>{RARITY[detailsReward.rarity].label}</RPGBadge>}
                    {detailsReward && <RPGBadge tone="muted">{categoryLabel(detailsReward.category)}</RPGBadge>}
                  </p>
                  {detailsReward && (
                    <p className="inline-flex items-center gap-1 text-xs text-rpg-muted">
                      {detailsReward.currency === "gem" ? <Gem size={12} aria-hidden /> : <Coins size={12} aria-hidden />} {detailsReward.cost} · {limitText(detailsReward)} · {requirementText(detailsReward)}
                    </p>
                  )}
                  <p className="text-xs text-rpg-muted">
                    No inventário: {itemAction.item.quantity} · último resgate {formatWhen(itemAction.item.lastRedeemedAt)}
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>
      <RPGToast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
