import { Backpack, Crown, FlaskConical, Package, Shirt, Sparkles } from "lucide-react";
import { RPGStatCard } from "@/components/rpg";
import type { InventoryData } from "@/services/inventoryService";

const fmt = (n: number) => n.toLocaleString("pt-BR");

/** Faixa de KPIs do inventário — tudo calculado no servidor a partir dos itens reais. */
export function InventoryKpis({ kpis, loading }: { kpis: InventoryData["kpis"] | undefined; loading: boolean }) {
  if (loading || !kpis) {
    return (
      <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 2xl:grid-cols-6" aria-label="Carregando indicadores">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="rpg-panel h-[68px] animate-pulse" />
        ))}
      </div>
    );
  }
  const k = kpis;
  const pct = k.capacity > 0 ? Math.round((k.slotsUsed / k.capacity) * 100) : 0;
  return (
    <section aria-label="Resumo do inventário" className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 2xl:grid-cols-6">
      <RPGStatCard layout="wide" dense tone="gold" icon={<Backpack size={20} />} value={fmt(k.totalItems)} label="Total de itens" caption={`em ${fmt(k.slotsUsed)} espaços`} />
      <RPGStatCard layout="wide" dense tone="gold" icon={<Crown size={20} />} value={fmt(k.rareRelics)} label="Relíquias raras" caption="épicas e lendárias" />
      <RPGStatCard layout="wide" dense tone="purple" icon={<FlaskConical size={20} />} value={fmt(k.consumables)} label="Consumíveis" caption="poções e pergaminhos" />
      <RPGStatCard layout="wide" dense tone="blue" icon={<Shirt size={20} />} value={fmt(k.cosmetics)} label="Cosméticos" caption="aparência e títulos" />
      <RPGStatCard layout="wide" dense tone="green" icon={<Package size={20} />} value={`${fmt(k.slotsUsed)}/${fmt(k.capacity)}`} label="Espaços ocupados" pct={pct} caption={`${pct}% · capacidade visual`} />
      <RPGStatCard layout="wide" dense tone="cyan" icon={<Sparkles size={20} />} value={fmt(k.activeBonuses)} label="Bônus ativos" caption="efeitos e passivos" />
    </section>
  );
}
