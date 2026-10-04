import { Coins, Crown, Database } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RPGBadge, RPGButton, RPGProgressBar } from "@/components/rpg";
import { useCodexActions } from "@/hooks/useCodex";
import { useRpgPreferences } from "@/hooks/useRpgPreferences";
import { CONFIDENCE_LABEL, RARITY, relicSrc, timeAgo } from "@/utils/codexDisplay";
import type { CodexSelection } from "./CodexSidebar";

const fmt = (at: string | null) => (at ? new Date(at.includes("T") ? at : `${at.replace(" ", "T")}Z`).toLocaleDateString("pt-BR") : "—");

/** Detalhe de descoberta (com evidência), relíquia, título (equipar) ou conhecimento (ler/desbloquear). */
export function CodexItemModal({ selection, onClose, onToast }: { selection: CodexSelection | null; onClose: () => void; onToast: (m: string, tone?: "success" | "error") => void }) {
  const { buy } = useCodexActions();
  const { prefs, update } = useRpgPreferences();
  if (!selection) return null;
  const s = selection;
  const title = s.kind === "knowledge" ? s.item.title : s.kind === "discovery" ? s.item.title : s.item.name;

  return (
    <Modal open onClose={onClose} title={title} size="md">
      {s.kind === "discovery" && (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-1.5">
            <RPGBadge tone="gold">{s.item.category}</RPGBadge>
            <RPGBadge tone="muted">{CONFIDENCE_LABEL[s.item.confidence]}</RPGBadge>
            <RPGBadge tone="muted">{timeAgo(s.item.discoveredAt)}</RPGBadge>
          </div>
          <p className="text-rpg-text">{s.item.description}</p>
          <div className="rpg-panel p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-rpg-blue"><Database size={13} aria-hidden /> Evidência (dado real)</p>
            <ul className="mt-1 space-y-0.5 text-xs text-rpg-muted">
              {s.item.evidence.metric && <li>Métrica: {String(s.item.evidence.metric)}</li>}
              {s.item.evidence.from && <li>Período: {String(s.item.evidence.from).split("-").reverse().join("/")} a {String(s.item.evidence.to).split("-").reverse().join("/")}</li>}
              {s.item.evidence.sample != null && <li>Amostra: {String(s.item.evidence.sample)}</li>}
              <li>Fonte: {s.item.source}</li>
            </ul>
          </div>
        </div>
      )}

      {s.kind === "relic" && (
        <div className="flex flex-col sm:flex-row gap-4 text-sm">
          <img src={relicSrc(s.item.id)} alt={s.item.name} className={`pixelated w-32 h-32 object-contain self-center border-2 border-rpg-gold/60 bg-rpg-bg p-2 ${s.item.unlocked ? "" : "grayscale opacity-40"}`} style={{ borderRadius: 4 }} />
          <div className="min-w-0 space-y-2">
            <RPGBadge tone={RARITY[s.item.rarity].tone}>{RARITY[s.item.rarity].label}</RPGBadge>
            <p className="text-rpg-text">{s.item.description}</p>
            <p className="text-xs text-rpg-muted">Como obter: {s.item.obtainedBy}</p>
            {s.item.unlocked ? <p className="text-xs text-rpg-green">Obtida em {fmt(s.item.unlockedAt)}</p> : <RPGProgressBar tone="purple" label="Progresso" value={Math.round(s.item.progress * 100)} />}
            <p className="text-[11px] text-rpg-muted">Relíquias são colecionáveis: não dão XP, moedas nem bônus.</p>
          </div>
        </div>
      )}

      {s.kind === "title" && (
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <Crown size={20} className="text-rpg-gold-light" aria-hidden />
            <RPGBadge tone={RARITY[s.item.rarity].tone}>{RARITY[s.item.rarity].label}</RPGBadge>
          </div>
          <p className="text-rpg-text">{s.item.description}</p>
          {s.item.unlocked ? (
            <RPGButton
              variant="gold"
              disabled={prefs.title === s.item.id}
              onClick={() => {
                update({ title: s.item.id });
                onToast(`Título equipado: ${s.item.name}`);
                onClose();
              }}
            >
              {prefs.title === s.item.id ? "Equipado" : "Equipar"}
            </RPGButton>
          ) : (
            <RPGProgressBar tone="purple" label="Progresso até o título" value={Math.round(s.item.progress * 100)} />
          )}
          <p className="text-[11px] text-rpg-muted">Títulos são cosméticos e aparecem na sua ficha e no Painel do Herói.</p>
        </div>
      )}

      {s.kind === "knowledge" && (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-1.5">
            <RPGBadge tone="blue">{s.item.category}</RPGBadge>
            {s.item.unlocked && <RPGBadge tone="green">Desbloqueado {fmt(s.item.unlockedAt)}</RPGBadge>}
          </div>
          <p className="text-rpg-muted">{s.item.summary}</p>
          {s.item.content ? (
            <ol className="list-decimal pl-5 space-y-1.5 text-rpg-text">
              {s.item.content.map((c) => <li key={c}>{c}</li>)}
            </ol>
          ) : s.item.unlock.type === "coins" ? (
            <RPGButton
              variant="primary"
              disabled={buy.isPending}
              onClick={async () => {
                try {
                  await buy.mutateAsync(s.item.id);
                  onToast(`Conhecimento desbloqueado: ${s.item.title}`);
                  onClose();
                } catch (e) {
                  onToast(e instanceof Error ? e.message : "Não foi possível desbloquear.", "error");
                }
              }}
            >
              <Coins size={14} aria-hidden /> Desbloquear por {s.item.unlock.cost} moedas
            </RPGButton>
          ) : (
            <>
              <RPGProgressBar tone="blue" label={`Requer ${s.item.unlock.min} XP no atributo`} value={Math.round(s.item.progress * 100)} />
              <p className="text-[11px] text-rpg-muted">Libera sozinho ao atingir o XP — o XP nunca é gasto.</p>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
