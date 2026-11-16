import { useState } from "react";
import { X } from "lucide-react";
import { Button, Field } from "@/components/ui/primitives";
import { CATEGORY_LABEL, RARITY_LABEL } from "@/lib/shopLabels";
import { SHOP_CATEGORIES, SHOP_RARITIES } from "@/services/shopService";
import type { AdminShopProduct, ShopProductInput } from "@/services/adminService";

/**
 * Modal de criar/editar produto da Loja Arcana — usada no painel de
 * administração (/admin/loja). A chave (slug) nunca é editável depois de
 * criada: pedidos e inventário já existentes guardam a chave antiga.
 */
export function ProdutoLojaModal({
  produto,
  onClose,
  onSave,
}: {
  produto: AdminShopProduct | null;
  onClose: () => void;
  onSave: (input: ShopProductInput) => Promise<unknown>;
}) {
  const [name, setName] = useState(produto?.name ?? "");
  const [description, setDescription] = useState(produto?.description ?? "");
  const [category, setCategory] = useState<ShopProductInput["category"]>(produto?.category ?? "artefatos");
  const [rarity, setRarity] = useState<ShopProductInput["rarity"]>(produto?.rarity ?? "comum");
  const [currency, setCurrency] = useState<"coin" | "gem">(produto?.currency ?? "coin");
  const [price, setPrice] = useState(String(produto?.price ?? 50));
  const [art, setArt] = useState(produto?.art ?? "✨");
  const [effectText, setEffectText] = useState(produto?.effectText ?? "");
  const [durationText, setDurationText] = useState(produto?.durationText ?? "");
  const [stackable, setStackable] = useState(produto?.stackable ?? true);
  const [maxStack, setMaxStack] = useState(String(produto?.maxStack ?? 99));
  const [featured, setFeatured] = useState(produto?.featured ?? false);
  const [active, setActive] = useState(produto?.active ?? true);
  const [stock, setStock] = useState(produto?.stock != null ? String(produto.stock) : "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const priceNum = Number(price);
  const maxStackNum = Number(maxStack);
  const valid = name.trim().length >= 2 && description.trim().length >= 2 && Number.isFinite(priceNum) && priceNum >= 1 && art.trim().length >= 1;

  const handleSubmit = async () => {
    setError(null);
    if (!valid) return;
    setSaving(true);
    try {
      await onSave({
        category,
        rarity,
        name: name.trim(),
        description: description.trim(),
        currency,
        price: Math.round(priceNum),
        art: art.trim(),
        effectText: effectText.trim() || null,
        durationText: durationText.trim() || null,
        stackable,
        maxStack: Number.isFinite(maxStackNum) && maxStackNum >= 1 ? Math.round(maxStackNum) : 99,
        featured,
        active,
        stock: stock.trim() ? Math.max(0, Math.round(Number(stock))) : null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o produto.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl p-5 md:p-6 bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold">{produto ? `Editar: ${produto.name}` : "Novo produto"}</p>
          <button onClick={onClose} className="text-slate" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <Field label="Nome" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />

          <div>
            <label className="text-xs text-slate">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={400}
              rows={2}
              className="mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border focus:border-brand-500 transition-colors resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate">Categoria</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as ShopProductInput["category"])} className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border">
                {SHOP_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate">Raridade</label>
              <select value={rarity} onChange={(e) => setRarity(e.target.value as ShopProductInput["rarity"])} className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border">
                {SHOP_RARITIES.map((r) => (
                  <option key={r} value={r}>{RARITY_LABEL[r].label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate">Moeda</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value as "coin" | "gem")} className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border">
                <option value="coin">Moedas</option>
                <option value="gem">Gemas</option>
              </select>
            </div>
            <Field label="Preço" type="number" min={1} value={price} onChange={(e) => setPrice(e.target.value)} />
            <Field label="Ícone (emoji)" value={art} onChange={(e) => setArt(e.target.value)} maxLength={8} />
          </div>

          <Field label="Efeito (texto, opcional)" value={effectText} onChange={(e) => setEffectText(e.target.value)} maxLength={200} placeholder="O que o item realmente faz" />
          <Field label="Duração (texto, opcional)" value={durationText} onChange={(e) => setDurationText(e.target.value)} maxLength={80} placeholder="Ex.: 24 horas, uso único…" />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Estoque (vazio = ilimitado)" type="number" min={0} value={stock} onChange={(e) => setStock(e.target.value)} />
            <Field label="Empilha até" type="number" min={1} value={maxStack} onChange={(e) => setMaxStack(e.target.value)} disabled={!stackable} />
          </div>

          <div className="flex flex-wrap gap-4 pt-1">
            <label className="flex items-center gap-1.5 text-xs text-slate">
              <input type="checkbox" checked={stackable} onChange={(e) => setStackable(e.target.checked)} /> Empilhável
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate">
              <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} /> Destaque na Loja
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Ativo (à venda)
            </label>
          </div>

          {error && <p className="text-xs text-drop">{error}</p>}
          <Button onClick={handleSubmit} disabled={saving || !valid} className="w-full">
            {saving ? "Salvando..." : produto ? "Salvar alterações" : "Criar produto"}
          </Button>
        </div>
      </div>
    </div>
  );
}
