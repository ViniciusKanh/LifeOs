import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Coins, Gem, Pencil, Plus, Store, Trash2 } from "lucide-react";
import { useAdminShopProducts } from "@/hooks/useAdmin";
import { ProdutoLojaModal } from "@/components/admin/ProdutoLojaModal";
import { Button, Card, IconBadge, PageHeader } from "@/components/ui/primitives";
import { CATEGORY_LABEL, RARITY_LABEL } from "@/lib/shopLabels";
import { SHOP_CATEGORIES } from "@/services/shopService";
import type { AdminShopProduct } from "@/services/adminService";

function RarityTag({ rarity }: { rarity: AdminShopProduct["rarity"] }) {
  const tones: Record<string, string> = {
    muted: "bg-black/5 text-slate dark:bg-white/10",
    green: "bg-cat-green/10 text-cat-green",
    blue: "bg-cat-blue/10 text-cat-blue",
    purple: "bg-cat-purple/10 text-cat-purple",
    gold: "bg-signal/15 text-signal-deep dark:text-signal",
    pink: "bg-cat-pink/10 text-cat-pink",
  };
  const r = RARITY_LABEL[rarity];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${tones[r.tone] ?? tones.muted}`}>{r.label}</span>;
}

function ProductRow({ p, onEdit, onToggleActive, onDelete }: { p: AdminShopProduct; onEdit: () => void; onToggleActive: () => void; onDelete: () => void }) {
  return (
    <>
      <span className="text-xl shrink-0" aria-hidden>{p.art}</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate flex items-center gap-1.5">
          {p.name}
          {p.featured && <span className="text-[10px] font-semibold text-signal-deep dark:text-signal">★ destaque</span>}
        </p>
        <p className="text-xs text-slate truncate">{CATEGORY_LABEL[p.category]} · {p.key}</p>
      </div>
      <RarityTag rarity={p.rarity} />
      <span className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums shrink-0 w-20 justify-end">
        {p.currency === "coin" ? <Coins size={13} className="text-signal" /> : <Gem size={13} className="text-cat-purple" />}
        {p.price.toLocaleString("pt-BR")}
      </span>
      <button
        onClick={onToggleActive}
        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${p.active ? "bg-cat-green/10 text-cat-green" : "bg-black/5 text-slate dark:bg-white/10"}`}
        title={p.active ? "Clique para desativar (sai da Loja, quem já tem o item mantém)" : "Clique para ativar"}
      >
        {p.active ? "Ativo" : "Inativo"}
      </button>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onEdit} className="rounded-lg p-1.5 text-slate hover:bg-black/5 dark:hover:bg-white/10" aria-label={`Editar ${p.name}`}>
          <Pencil size={14} />
        </button>
        <button onClick={onDelete} className="rounded-lg p-1.5 text-drop hover:bg-drop/10" aria-label={`Excluir ${p.name}`}>
          <Trash2 size={14} />
        </button>
      </div>
    </>
  );
}

export function AdminLojaPage() {
  const { products, isLoading, create, update, setActive, remove } = useAdminShopProducts();
  const [category, setCategory] = useState<"all" | AdminShopProduct["category"]>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminShopProduct | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => (category === "all" ? products : products.filter((p) => p.category === category)), [products, category]);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (p: AdminShopProduct) => {
    setEditing(p);
    setModalOpen(true);
  };

  const handleDelete = async (p: AdminShopProduct) => {
    if (!window.confirm(`Excluir "${p.name}" definitivamente? Isso só funciona se ninguém nunca comprou este item.`)) return;
    setError(null);
    try {
      await remove.mutateAsync(p.key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível excluir — ele já foi comprado por alguém? Desative em vez de excluir.");
    }
  };

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 w-full space-y-4">
      <div>
        <Link to="/configuracoes" className="inline-flex items-center gap-1.5 text-xs text-slate hover:underline mb-1.5">
          <ArrowLeft size={13} /> Configurações
        </Link>
        <PageHeader
          icon={<Store size={20} />}
          title="Produtos da Loja Arcana"
          subtitle="Cadastre, edite preços e ative ou desative o que está à venda. Produtos já comprados nunca são apagados — só desativados, pra não sumir do Inventário de quem já tem."
          actions={
            <Button onClick={openCreate}>
              <Plus size={14} /> Novo produto
            </Button>
          }
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4 flex items-center gap-3">
          <IconBadge tone="blue" icon={<Store size={16} />} size={36} />
          <div>
            <p className="font-display font-bold text-xl leading-none">{products.length}</p>
            <p className="text-xs text-slate mt-1">Produtos no total</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <IconBadge tone="green" icon={<Store size={16} />} size={36} />
          <div>
            <p className="font-display font-bold text-xl leading-none">{products.filter((p) => p.active).length}</p>
            <p className="text-xs text-slate mt-1">Ativos na Loja</p>
          </div>
        </Card>
      </div>

      <Card className="p-5 md:p-6">
        <div className="mb-4 flex flex-wrap gap-1.5">
          <button onClick={() => setCategory("all")} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${category === "all" ? "bg-brand-500 text-white" : "bg-black/5 dark:bg-white/10 text-slate"}`}>
            Todos
          </button>
          {SHOP_CATEGORIES.map((c) => (
            <button key={c} onClick={() => setCategory(c)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${category === c ? "bg-brand-500 text-white" : "bg-black/5 dark:bg-white/10 text-slate"}`}>
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>

        {error && <p className="mb-3 text-xs text-drop">{error}</p>}

        {isLoading ? (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 rounded-xl bg-paper-border/60 dark:bg-ink-border/60 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate py-8 text-center">Nenhum produto nesta categoria ainda.</p>
        ) : (
          <ul className="space-y-1.5">
            {filtered.map((p) => (
              <li key={p.key} className="flex items-center gap-3 rounded-xl border border-paper-border/60 dark:border-ink-border/60 px-3 py-2">
                <ProductRow
                  p={p}
                  onEdit={() => openEdit(p)}
                  onToggleActive={() => setActive.mutate({ key: p.key, active: !p.active })}
                  onDelete={() => void handleDelete(p)}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {modalOpen && (
        <ProdutoLojaModal
          produto={editing}
          onClose={() => setModalOpen(false)}
          onSave={(input) => (editing ? update.mutateAsync({ key: editing.key, input }) : create.mutateAsync(input))}
        />
      )}
    </div>
  );
}
