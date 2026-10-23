import { useState, type ReactNode } from "react";
import { CalendarDays, Gift, RefreshCw, ScrollText, Shuffle, Sparkles, Trophy } from "lucide-react";
import { RPGBadge, RPGButton, RPGPageHeader, RPGPanel, RPGToast } from "@/components/rpg";
import { RPGHowItWorks } from "@/components/rpg/RPGHowItWorks";
import { Modal } from "@/components/ui/Modal";
import { QuestScroll } from "@/components/quests/QuestScroll";
import { SeasonTrack } from "@/components/quests/SeasonTrack";
import { daysLeftLabel, fmtShortDay } from "@/components/quests/questFormat";
import { useQuests } from "@/hooks/useQuests";
import { useTheme } from "@/hooks/useTheme";
import type { Quest } from "@/services/questsService";

function QuestList({ quests, children }: { quests: Quest[]; children: (q: Quest) => ReactNode }) {
  if (quests.length === 0) return <p className="text-sm text-rpg-muted">Nenhuma quest neste período.</p>;
  return <ul className="grid gap-2 md:grid-cols-3">{quests.map(children)}</ul>;
}

/**
 * Quadro de Quests — 3 diárias e 3 semanais sorteadas a partir do que você
 * realmente usa, com meta no seu ritmo recente. Progresso sempre dos dados
 * reais; resgatar concede XP bônus. Abaixo, a Temporada do mês.
 */
export function QuestsPage() {
  const { isRpg } = useTheme();
  const { data, isLoading, isError, refetch, isFetching, claim, reroll } = useQuests();
  const [toast, setToast] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [confirmReroll, setConfirmReroll] = useState<Quest | null>(null);

  const fail = (e: unknown, fallback: string) => setToast({ text: e instanceof Error ? e.message : fallback, tone: "error" });

  const onClaim = async (q: Quest) => {
    try {
      const r = await claim.mutateAsync(q.id);
      if (r.replayed) setToast({ text: "Essa recompensa já tinha sido resgatada.", tone: "success" });
      else if (r.bonusXp > 0) setToast({ text: `+${r.xp} XP e +${r.bonusXp} XP de bônus: todas as diárias cumpridas!`, tone: "success" });
      // No RPG o feedback global já anuncia o XP (com som e "+XP" no botão).
      else if (!isRpg) setToast({ text: `+${r.xp} XP resgatados.`, tone: "success" });
    } catch (e) {
      fail(e, "Não foi possível resgatar a recompensa.");
    }
  };

  const doReroll = async () => {
    if (!confirmReroll) return;
    const q = confirmReroll;
    setConfirmReroll(null);
    try {
      const r = await reroll.mutateAsync(q.id);
      setToast({ text: `Nova quest: ${r.quest.title}`, tone: "success" });
    } catch (e) {
      fail(e, "Não foi possível trocar a quest.");
    }
  };

  return (
    <div className="w-full px-4 md:px-6 lg:px-8 py-6 space-y-4">
      <RPGPageHeader
        banner="missoes"
        size="md"
        eyebrow={isRpg ? "Guilda" : "Gamificação"}
        title="Quadro de Quests"
        subtitle={isRpg ? "Pergaminhos novos todo dia e toda semana — metas no seu ritmo, cumpridas com o que você registra de verdade." : "Desafios diários e semanais no seu ritmo, medidos pelos seus registros reais."}
        actions={
          data && (
            <RPGButton variant="ghost" onClick={() => void refetch()} disabled={isFetching} aria-label="Atualizar o progresso das quests">
              <RefreshCw size={14} className={isFetching ? "animate-spin motion-reduce:animate-none" : undefined} aria-hidden /> Atualizar
            </RPGButton>
          )
        }
      />

      <RPGHowItWorks
        storageKey="lifeos-quests-como-funciona"
        steps={[
          { icon: ScrollText, title: "Sorteio no seu ritmo", text: "As quests usam só os módulos que você usou nos últimos 30 dias, com meta pela sua média recente.", tone: "blue" },
          { icon: Gift, title: "Cumpra e resgate", text: "O progresso vem das missões, treinos, leituras, hábitos e diário reais. Concluiu? Resgate o XP.", tone: "gold" },
          { icon: Shuffle, title: "Reset e troca", text: "Diárias renovam à meia-noite do seu fuso; semanais na segunda. Você pode trocar 1 diária por dia.", tone: "purple" },
        ]}
      />

      {isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Carregando o Quadro de Quests">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="rpg-panel h-40 animate-pulse motion-reduce:animate-none" />
          ))}
        </div>
      ) : isError || !data ? (
        <div className="rpg-panel rpg-panel-danger p-4" role="alert">
          <p className="text-sm text-rpg-text">Não foi possível abrir o Quadro de Quests agora.</p>
          <RPGButton variant="secondary" className="mt-3" onClick={() => void refetch()}>
            <RefreshCw size={14} aria-hidden /> Tentar de novo
          </RPGButton>
        </div>
      ) : (
        <>
          <RPGPanel
            title="Quests diárias"
            icon={<CalendarDays size={14} />}
            actions={
              <span className="text-[11px] text-rpg-muted">
                {data.daily.rerollsLeft > 0 ? "1 troca disponível hoje" : "Troca de hoje usada"}
              </span>
            }
          >
            <QuestList quests={data.daily.quests}>
              {(q) => (
                <QuestScroll
                  key={q.id}
                  quest={q}
                  onClaim={onClaim}
                  onReroll={setConfirmReroll}
                  claiming={claim.isPending && claim.variables === q.id}
                  rerolling={reroll.isPending && reroll.variables === q.id}
                />
              )}
            </QuestList>
            <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-rpg-muted">
              <Sparkles size={13} className="text-rpg-gold-light" aria-hidden />
              Resgate as {data.daily.bonus.total} diárias para ganhar +{data.daily.bonus.xp} XP de bônus.
              {data.daily.bonus.claimed ? (
                <RPGBadge tone="green">Bônus recebido</RPGBadge>
              ) : (
                <RPGBadge tone="muted">
                  {data.daily.bonus.completed}/{data.daily.bonus.total} resgatadas
                </RPGBadge>
              )}
            </p>
          </RPGPanel>

          <RPGPanel
            title="Quests semanais"
            icon={<Trophy size={14} />}
            actions={<span className="text-[11px] text-rpg-muted">{daysLeftLabel(data.weekly.daysLeft, fmtShortDay(data.weekly.to))}</span>}
          >
            <QuestList quests={data.weekly.quests}>{(q) => <QuestScroll key={q.id} quest={q} onClaim={onClaim} claiming={claim.isPending && claim.variables === q.id} />}</QuestList>
          </RPGPanel>

          <SeasonTrack season={data.season} />
        </>
      )}

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
        <p className="text-sm">
          “{confirmReroll?.title}” sai do quadro e outra quest diária entra no lugar. Você tem 1 troca por dia — não dá para desfazer.
        </p>
      </Modal>

      <RPGToast message={toast?.text ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}

