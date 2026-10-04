import { useState } from "react";
import { ArrowRight, Coins, Gem, History } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RPGBadge, RPGTabs } from "@/components/rpg";
import { useRedemptions } from "@/hooks/useGamification";
import type { Redemption, RedemptionStatus } from "@/services/gamificationService";
import { formatWhen, rewardArtUrl } from "@/utils/treasureDisplay";
import { TreasureSidePanel } from "./TreasureSidePanel";

const STATUS: Record<RedemptionStatus, { label: string; tone: "blue" | "green" | "muted" | "orange" }> = {
  available: { label: "No inventário", tone: "blue" },
  used: { label: "Usado", tone: "green" },
  canceled: { label: "Estornado", tone: "muted" },
  expired: { label: "Expirado", tone: "orange" },
};

function Row({ r, showStatus }: { r: Redemption; showStatus?: boolean }) {
  const Icon = r.currency === "gem" ? Gem : Coins;
  return (
    <li className="flex items-center gap-2.5 py-2">
      <img src={rewardArtUrl(r.art)} alt="" aria-hidden className="pixelated w-10 h-8 object-cover border border-rpg-bronze shrink-0" style={{ borderRadius: 2 }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-rpg-text">{r.rewardName}</p>
        <p className="text-[11px] text-rpg-muted">
          <time dateTime={r.redeemedAt}>{formatWhen(r.redeemedAt)}</time>
          {showStatus && (
            <>
              {" · "}
              <RPGBadge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</RPGBadge>
            </>
          )}
        </p>
      </div>
      <span className={`inline-flex items-center gap-1 font-pixel text-xs tabular-nums ${r.status === "canceled" ? "text-rpg-muted line-through" : "text-rpg-gold-light"}`}>
        -{r.cost} <Icon size={12} aria-label={r.currency === "gem" ? "gemas" : "moedas"} />
      </span>
    </li>
  );
}

/** Últimos 4 resgates (painel lateral). */
export function RewardHistory({ items, loading, onViewAll }: { items: Redemption[]; loading: boolean; onViewAll: () => void }) {
  return (
    <TreasureSidePanel
      id="historico"
      title="Histórico de resgates"
      icon={<History size={16} />}
      actions={
        <button type="button" onClick={onViewAll} className="inline-flex items-center gap-1 text-xs text-rpg-blue hover:underline">
          Ver todos <ArrowRight size={12} aria-hidden />
        </button>
      }
    >
      {loading && <div className="h-20 rpg-bar animate-pulse" />}
      {!loading && items.length === 0 && <p className="text-sm text-rpg-muted py-2">Nenhum resgate ainda.</p>}
      {items.length > 0 && <ul className="divide-y divide-rpg-border/50">{items.map((r) => <Row key={r.id} r={r} />)}</ul>}
    </TreasureSidePanel>
  );
}

type Filter = "all" | RedemptionStatus;

/** Histórico completo com filtro por status. */
export function RewardHistoryModal({ open, initial = "all", rewardId, onClose }: { open: boolean; initial?: Filter; rewardId?: string | null; onClose: () => void }) {
  const [filter, setFilter] = useState<Filter>(initial);
  const q = useRedemptions(filter === "all" ? undefined : filter, 200, open);
  const list = (q.data ?? []).filter((r) => !rewardId || r.rewardId === rewardId);
  return (
    <Modal open={open} onClose={onClose} title={rewardId && list[0] ? `Histórico — ${list[0].rewardName}` : "Histórico de resgates"} size="lg">
      <RPGTabs
        label="Filtrar histórico"
        size="sm"
        value={filter}
        onChange={setFilter}
        tabs={[
          { value: "all", label: "Todos" },
          { value: "available", label: "Disponíveis" },
          { value: "used", label: "Usados" },
          { value: "canceled", label: "Cancelados" },
        ]}
      />
      <div className="mt-3">
        {q.isLoading && <div className="h-24 rpg-bar animate-pulse" />}
        {q.isError && <p className="text-sm text-rpg-red">Não foi possível carregar o histórico.</p>}
        {!q.isLoading && list.length === 0 && <p className="text-sm text-rpg-muted py-4">Nada por aqui com este filtro.</p>}
        {list.length > 0 && <ul className="divide-y divide-rpg-border/50">{list.map((r) => <Row key={r.id} r={r} showStatus />)}</ul>}
      </div>
    </Modal>
  );
}
