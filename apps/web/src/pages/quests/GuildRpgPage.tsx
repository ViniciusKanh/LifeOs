import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bell, CalendarDays, Gift, History, ScrollText, Shuffle, Sparkles, Trophy } from "lucide-react";
import { RPGButton, RPGToast } from "@/components/rpg";
import { Modal } from "@/components/ui/Modal";
import { SeasonTrack } from "@/components/quests/SeasonTrack";
import { daysLeftLabel, fmtShortDay } from "@/components/quests/questFormat";
import { useQuests } from "@/hooks/useQuests";
import { useGuildHub, usePlanningActions } from "@/hooks/usePlanningHub";
import { useGamificationProfile } from "@/hooks/useGamification";
import type { Quest } from "@/services/questsService";
import { KitSection, MODULE_ART, ModuleBanner, ModuleTabs } from "@/components/rpg-modules/ModuleKit";
import { GuildCombo, GuildEvents, GuildHerald, GuildLevelPanel, QuestCard, QuestHistory, RewardChest, SmartNotices } from "@/components/guild/GuildRPG";

const TABS = ["quests", "avisos", "recompensas", "eventos", "historico"] as const;
type Tab = (typeof TABS)[number];

/**
 * Quadro de Avisos — Guilda de Quests. As quests, o progresso, a troca e o
 * resgate continuam pelas regras e rotas existentes (/gamification/quests),
 * que são idempotentes: o baú só chama o resgate oficial de cada quest.
 */
export function GuildRpgPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.includes(params.get("aba") as Tab) ? (params.get("aba") as Tab) : "quests";
  const setTab = (t: Tab) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (t === "quests") p.delete("aba");
      else p.set("aba", t);
      return p;
    });
  const { claim, reroll } = useQuests();
  const hubQ = useGuildHub();
  const hub = hubQ.data;
  const { data: profile } = useGamificationProfile();
  const { refreshAll } = usePlanningActions();
  const [toast, setToast] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [confirmReroll, setConfirmReroll] = useState<Quest | null>(null);
  const [opening, setOpening] = useState(false);
  const fail = (e: unknown, fallback: string) => setToast({ text: e instanceof Error ? e.message : fallback, tone: "error" });

  const onClaim = async (q: Quest) => {
    try {
      const r = await claim.mutateAsync(q.id);
      setToast({ text: r.replayed ? "Essa recompensa já tinha sido resgatada." : r.bonusXp > 0 ? `+${r.xp} XP e +${r.bonusXp} XP de bônus diário!` : `+${r.xp} XP resgatados.`, tone: "success" });
      refreshAll();
    } catch (e) {
      fail(e, "Não foi possível resgatar a recompensa.");
    }
  };

  const openChest = async () => {
    if (!hub) return;
    setOpening(true);
    let xp = 0;
    try {
      // Um resgate por vez pela rota oficial (idempotente) — nada é somado aqui.
      for (const c of hub.chest.claimable) {
        const r = await claim.mutateAsync(c.id);
        if (!r.replayed) xp += r.xp + r.bonusXp;
      }
      setToast({ text: xp > 0 ? `Baú aberto: +${xp} XP!` : "As recompensas já tinham sido resgatadas.", tone: "success" });
    } catch (e) {
      fail(e, "Não foi possível abrir o baú.");
    } finally {
      setOpening(false);
      refreshAll();
    }
  };

  const doReroll = async () => {
    if (!confirmReroll) return;
    const q = confirmReroll;
    setConfirmReroll(null);
    try {
      const r = await reroll.mutateAsync(q.id);
      setToast({ text: `Nova quest: ${r.quest.title}`, tone: "success" });
      refreshAll();
    } catch (e) {
      fail(e, "Não foi possível trocar a quest.");
    }
  };

  const board = hub?.board;
  return (
    <div className="w-full space-y-4 px-4 py-5 md:px-6 md:py-6 lg:px-8">
      <ModuleBanner
        eyebrow="Guilda de quests"
        title="Quadro de Avisos"
        subtitle="Recados, desafios diários e oportunidades da sua jornada. Fique por dentro de tudo!"
        mage={`${MODULE_ART}/guild/banner-mage.webp`}
        scene={`${MODULE_ART}/guild/banner-scene.webp`}
        aside={hub ? <GuildLevelPanel hub={hub} profile={profile} /> : <div className="rpg-panel h-40 animate-pulse" aria-busy aria-label="Carregando nível" />}
      />

      <ModuleTabs
        label="Seções do Quadro de Avisos"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "quests", label: "Quests da Guilda", icon: <ScrollText size={15} /> },
          { value: "avisos", label: "Avisos", icon: <Bell size={15} /> },
          { value: "recompensas", label: "Recompensas", icon: <Gift size={15} />, badge: hub?.chest.claimable.length ?? 0 },
          { value: "eventos", label: "Eventos", icon: <CalendarDays size={15} /> },
          { value: "historico", label: "Histórico", icon: <History size={15} /> },
        ]}
      />

      {hubQ.isLoading && <div className="rpg-panel h-48 animate-pulse" aria-busy aria-label="Carregando quests" />}
      {hubQ.isError && (
        <div className="rpg-panel rpg-panel-danger p-4" role="alert">
          <p className="text-sm text-rpg-text">Não foi possível abrir o Quadro de Avisos agora.</p>
          <RPGButton variant="secondary" className="mt-2" onClick={() => void hubQ.refetch()}>
            Tentar de novo
          </RPGButton>
        </div>
      )}

      {hub && board && tab === "quests" && (
        <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-3">
            <KitSection title="Quests diárias" icon={<CalendarDays size={16} />} action={<span className="text-[11px] text-rpg-muted">{board.daily.rerollsLeft > 0 ? "1 troca disponível hoje" : "Troca de hoje usada"}</span>}>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {board.daily.quests.map((q) => (
                  <li key={q.id}>
                    <QuestCard quest={q} onClaim={(x) => void onClaim(x)} onReroll={board.daily.rerollsLeft > 0 ? setConfirmReroll : undefined} busy={claim.isPending} />
                  </li>
                ))}
              </ul>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-rpg-muted">
                <Sparkles size={13} className="text-rpg-gold-light" aria-hidden /> Resgate as {board.daily.bonus.total} diárias para +{board.daily.bonus.xp} XP de bônus ({board.daily.bonus.claimed ? "recebido" : `${board.daily.bonus.completed}/${board.daily.bonus.total}`}).
              </p>
            </KitSection>
            <KitSection title="Quests semanais" icon={<Trophy size={16} />} tone="legendary" action={<span className="text-[11px] text-rpg-muted">{daysLeftLabel(board.weekly.daysLeft, fmtShortDay(board.weekly.to))}</span>}>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {board.weekly.quests.map((q) => (
                  <li key={q.id}>
                    <QuestCard quest={q} onClaim={(x) => void onClaim(x)} busy={claim.isPending} />
                  </li>
                ))}
              </ul>
            </KitSection>
            <SeasonTrack season={board.season} />
          </div>
          <aside className="min-w-0 space-y-3" aria-label="Baú, combo e Arauto">
            <RewardChest hub={hub} onClaimAll={() => void openChest()} busy={opening || claim.isPending} />
            <GuildCombo hub={hub} />
            <GuildHerald />
          </aside>
        </div>
      )}

      {hub && tab === "avisos" && (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          <SmartNotices hub={hub} />
          <GuildHerald />
        </div>
      )}
      {hub && tab === "recompensas" && (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          <RewardChest hub={hub} onClaimAll={() => void openChest()} busy={opening || claim.isPending} />
          <GuildCombo hub={hub} />
        </div>
      )}
      {hub && tab === "eventos" && <GuildEvents hub={hub} />}
      {hub && tab === "historico" && <QuestHistory hub={hub} />}

      <Modal
        open={confirmReroll !== null}
        onClose={() => setConfirmReroll(null)}
        title="Trocar esta quest?"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <RPGButton variant="ghost" onClick={() => setConfirmReroll(null)}>
              Cancelar
            </RPGButton>
            <RPGButton variant="primary" onClick={() => void doReroll()}>
              <Shuffle size={14} aria-hidden /> Trocar
            </RPGButton>
          </div>
        }
      >
        <p className="text-sm">“{confirmReroll?.title}” sai do quadro e outra quest diária entra no lugar. Você tem 1 troca por dia — não dá para desfazer.</p>
      </Modal>
      <RPGToast message={toast?.text ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}
