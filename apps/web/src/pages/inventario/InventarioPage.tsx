import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Backpack, Coins, Hammer, PackageSearch, Trophy } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RPGButton, RPGToast, rpgButtonClass } from "@/components/rpg";
import { TreasureSidePanel } from "@/components/treasure/TreasureSidePanel";
import { InventoryCollections } from "@/components/inventory/InventoryCollections";
import { InventoryFilters, type ViewMode } from "@/components/inventory/InventoryFilters";
import { InventoryHero } from "@/components/inventory/InventoryHero";
import { InventoryHistoryModal } from "@/components/inventory/InventoryHistoryModal";
import { InventoryItemCard } from "@/components/inventory/InventoryItemCard";
import { InventoryItemDetail } from "@/components/inventory/InventoryItemDetail";
import { InventoryKpis } from "@/components/inventory/InventoryKpis";
import { InventoryRecent } from "@/components/inventory/InventoryRecent";
import { ItemEquipModal } from "@/components/inventory/ItemEquipModal";
import { ItemUseModal } from "@/components/inventory/ItemUseModal";
import { NewItemOverlay } from "@/components/inventory/NewItemOverlay";
import { useInventory } from "@/hooks/useInventory";
import { useWide } from "@/hooks/useWide";
import type { InventoryItem, InventoryRecent as Recent, ItemRarity, ItemType } from "@/services/inventoryService";
import { matchesItemQuery, primaryAction, sortItems, type ItemSort } from "@/utils/inventoryDisplay";

const SEEN_KEY = "lifeos:inventory:lastSeen";
const readSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
};
const writeSeen = (v: string) => {
  try {
    localStorage.setItem(SEEN_KEY, v);
  } catch {
    // Sem armazenamento (aba privada): o aviso simplesmente não persiste.
  }
};

/**
 * Coleção / Inventário: tudo que o personagem já possui. Os itens nascem
 * de marcos reais (sincronizados no servidor); usar/equipar/favoritar só
 * atualiza a UI depois da confirmação do backend.
 */
export function InventarioPage() {
  const { data, isLoading, isError, refetch, use, equip, flags } = useInventory();
  const navigate = useNavigate();
  const wide = useWide();
  const [type, setType] = useState<ItemType | "all">("all");
  const [query, setQuery] = useState("");
  const [rarity, setRarity] = useState<ItemRarity | "all">("all");
  const [origin, setOrigin] = useState("all");
  const [sort, setSort] = useState<ItemSort>("recent");
  const [view, setView] = useState<ViewMode>("grid");
  const [organizing, setOrganizing] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [useTarget, setUseTarget] = useState<InventoryItem | null>(null);
  const [equipTarget, setEquipTarget] = useState<{ item: InventoryItem; equip: boolean } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [newItem, setNewItem] = useState<Recent | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const origins = useMemo(() => [...new Set(items.map((i) => i.origin?.sourceType).filter((o): o is string => !!o))].sort(), [items]);
  const visible = useMemo(
    () =>
      sortItems(
        items.filter(
          (i) =>
            (organizing || !i.archived) &&
            (type === "all" || i.type === type) &&
            (rarity === "all" || i.rarity === rarity) &&
            (origin === "all" || i.origin?.sourceType === origin) &&
            matchesItemQuery(i, query),
        ),
        sort,
      ),
    [items, organizing, type, rarity, origin, query, sort],
  );
  const selected = items.find((i) => i.key === selectedKey) ?? visible[0] ?? null;
  const archivedCount = items.filter((i) => i.archived).length;

  // Aviso de "novo item": só para aquisições posteriores à última visita (por navegador).
  const newest = data?.recent[0];
  useEffect(() => {
    if (!newest) return;
    const seen = readSeen();
    if (!seen) writeSeen(newest.at);
    else if (newest.at > seen) setNewItem(newest);
  }, [newest]);
  const dismissNew = () => {
    if (newest) writeSeen(newest.at);
    setNewItem(null);
  };

  const select = (item: InventoryItem) => {
    setSelectedKey(item.key);
    if (!wide) setSheetOpen(true);
  };
  const selectKey = (key: string) => {
    const it = items.find((i) => i.key === key);
    if (it) select(it);
  };
  const onPrimary = (item: InventoryItem) => {
    const a = primaryAction(item);
    if (a.kind === "use") setUseTarget(item);
    else if (a.kind === "equip" || a.kind === "unequip") setEquipTarget({ item, equip: a.kind === "equip" });
    else if (a.kind === "origin" && item.origin?.link) navigate(item.origin.link);
    else select(item);
  };
  const onFavorite = (item: InventoryItem) =>
    flags.mutate({ key: item.key, favorite: !item.favorite }, { onError: (e) => setToast(e instanceof Error ? e.message : "Não foi possível favoritar.") });
  const onArchive = (item: InventoryItem) =>
    flags.mutate(
      { key: item.key, archived: !item.archived },
      { onSuccess: () => setToast(item.archived ? `${item.name} voltou para a visão padrão.` : `${item.name} arquivado.`), onError: (e) => setToast(e instanceof Error ? e.message : "Não foi possível arquivar.") },
    );

  const equippedName = (item: InventoryItem): string | null => {
    const slot = item.key.split(":")[0];
    return items.find((i) => i.equipped && i.key.split(":")[0] === slot)?.name ?? null;
  };

  const handlers = { onSelect: select, onPrimary, onFavorite, onArchive };
  const detail = selected && <InventoryItemDetail item={selected} effects={data?.effects ?? []} onPrimary={onPrimary} onFavorite={onFavorite} busy={use.isPending || equip.isPending} />;
  const empty = !isLoading && !isError && items.length === 0;

  return (
    <div className="w-full px-4 md:px-6 lg:px-8 py-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px] items-start">
        <div className="space-y-4 min-w-0">
          <InventoryHero organizing={organizing} onOrganize={() => setOrganizing((v) => !v)} />
          {isError ? (
            <div className="rpg-panel p-6 text-center">
              <p className="text-sm text-rpg-red">Não foi possível carregar o inventário.</p>
              <RPGButton variant="secondary" className="mt-3" onClick={() => refetch()}>
                Tentar novamente
              </RPGButton>
            </div>
          ) : (
            <>
              <InventoryKpis kpis={data?.kpis} loading={isLoading} />
              {organizing && (
                <p className="rpg-panel px-3 py-2 text-xs text-rpg-gold-light" role="status">
                  Modo organização: favorite, arquive ou desarquive itens{archivedCount > 0 ? ` (${archivedCount} arquivado${archivedCount > 1 ? "s" : ""} visíveis agora)` : ""}. Itens de missão ativos não podem ser arquivados.
                </p>
              )}
              {!empty && (
                <InventoryFilters
                  type={type}
                  onType={setType}
                  counts={data?.counts ?? {}}
                  query={query}
                  onQuery={setQuery}
                  rarity={rarity}
                  onRarity={setRarity}
                  origin={origin}
                  onOrigin={setOrigin}
                  origins={origins}
                  sort={sort}
                  onSort={setSort}
                  view={view}
                  onView={setView}
                />
              )}

              {isLoading && (
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" aria-label="Carregando itens">
                  {Array.from({ length: 8 }, (_, i) => (
                    <div key={i} className="rpg-panel h-72 animate-pulse" />
                  ))}
                </div>
              )}

              {empty && (
                <div className="rpg-panel rpg-panel-gold flex flex-col items-center text-center gap-3 py-10 px-4">
                  <Backpack size={36} className="text-rpg-gold" aria-hidden />
                  <p className="font-pixel text-xs uppercase tracking-[0.16em] text-rpg-gold">Seu inventário ainda está vazio</p>
                  <p className="text-sm text-rpg-muted max-w-md">Complete missões, cumpra contratos e avance nas campanhas para encontrar seus primeiros tesouros.</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Link to="/forja-campanhas" className={rpgButtonClass("primary")}>
                      <Hammer size={14} aria-hidden /> Ver Campanhas
                    </Link>
                    <Link to="/conquistas" className={rpgButtonClass("secondary")}>
                      <Trophy size={14} aria-hidden /> Ver Conquistas
                    </Link>
                    <Link to="/tesouro" className={rpgButtonClass("secondary")}>
                      <Coins size={14} aria-hidden /> Abrir Tesouro
                    </Link>
                  </div>
                </div>
              )}

              {!isLoading && !empty && visible.length === 0 && (
                <div className="rpg-panel flex flex-col items-center text-center gap-2 py-8">
                  <PackageSearch size={28} className="text-rpg-muted" aria-hidden />
                  <p className="text-sm text-rpg-muted">Nenhum item com esses filtros.</p>
                  <RPGButton
                    variant="ghost"
                    onClick={() => {
                      setType("all");
                      setRarity("all");
                      setOrigin("all");
                      setQuery("");
                    }}
                  >
                    Limpar filtros
                  </RPGButton>
                </div>
              )}

              {visible.length > 0 &&
                (view === "grid" ? (
                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                    {visible.map((i) => (
                      <InventoryItemCard key={i.key} item={i} selected={selected?.key === i.key} organizing={organizing} {...handlers} />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {visible.map((i) => (
                      <InventoryItemCard key={i.key} item={i} variant="list" selected={selected?.key === i.key} organizing={organizing} {...handlers} />
                    ))}
                  </div>
                ))}
            </>
          )}
        </div>

        <aside className="space-y-4 min-w-0" aria-label="Item selecionado, conjuntos e aquisições">
          {wide && (
            <TreasureSidePanel id="item-selecionado" title="Item selecionado" icon={<Backpack size={16} />}>
              {isLoading && <div className="h-56 rpg-bar animate-pulse" />}
              {!isLoading && !selected && <p className="text-sm text-rpg-muted py-2">Selecione um item para ver detalhes.</p>}
              {detail}
            </TreasureSidePanel>
          )}
          <InventoryCollections sets={data?.sets ?? []} loading={isLoading} />
          <InventoryRecent items={data?.recent ?? []} loading={isLoading} onSelect={selectKey} onViewAll={() => setHistoryOpen(true)} />
        </aside>
      </div>

      {!wide && (
        <Modal open={sheetOpen && !!selected} onClose={() => setSheetOpen(false)} title="Item selecionado">
          {detail}
        </Modal>
      )}
      <ItemUseModal
        item={useTarget}
        effects={data?.effects ?? []}
        onClose={() => setUseTarget(null)}
        onConfirm={async (item, requestId) => {
          const r = await use.mutateAsync({ key: item.key, requestId });
          setUseTarget(null);
          setToast(r.message);
        }}
      />
      <ItemEquipModal
        item={equipTarget?.item ?? null}
        equip={equipTarget?.equip ?? true}
        currentName={equipTarget ? equippedName(equipTarget.item) : null}
        onClose={() => setEquipTarget(null)}
        onConfirm={async (item, eq) => {
          const r = await equip.mutateAsync({ key: item.key, equip: eq });
          setEquipTarget(null);
          setToast(r.message);
        }}
      />
      <InventoryHistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} />
      <NewItemOverlay
        item={newItem}
        onClose={dismissNew}
        onView={(key) => {
          dismissNew();
          selectKey(key);
        }}
      />
      <RPGToast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
