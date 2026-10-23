import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { HandHeart, Inbox, MailWarning, RefreshCw, Send, ShieldCheck, Users } from "lucide-react";
import { RPGButton, RPGPageHeader, RPGPanel, RPGTabs, RPGToast } from "@/components/rpg";
import { RPGHowItWorks } from "@/components/rpg/RPGHowItWorks";
import { GuildInviteCard, GuildOwnedGroup, GuildSharedCard } from "@/components/guild/GuildCards";
import { useGuildOverview } from "@/hooks/useGuild";
import type { GuildOwnerShare } from "@/services/guildService";

type Tab = "comigo" | "compartilhei";

/**
 * Guilda — parceiros de compromisso (salão da guilda). "Comigo": convites
 * recebidos e o resumo dos compromissos que acompanho. "Que compartilhei":
 * quem acompanha meus contratos/metas, testemunhos recebidos e revogação.
 * Todo dado exibido vem do servidor; o parceiro nunca recebe dados privados.
 */
export function GuildaPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("aba") === "compartilhei" ? "compartilhei" : "comigo";
  const [toast, setToast] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const { data, isLoading, isError, refetch, isFetching, respond, leave, revoke, cheer } = useGuildOverview();

  const notify = (text: string, tone: "success" | "error" = "success") => setToast({ text, tone });
  const fail = (err: unknown, fallback: string) => notify(err instanceof Error ? err.message : fallback, "error");

  const setTab = (t: Tab) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (t === "comigo") p.delete("aba");
      else p.set("aba", t);
      return p;
    }, { replace: true });

  // Agrupa por item para o dono ver "quem acompanha cada compromisso".
  const ownedGroups = useMemo(() => {
    const map = new Map<string, { key: string; title: string; entityType: GuildOwnerShare["entityType"]; shares: GuildOwnerShare[] }>();
    for (const s of data?.myShares ?? []) {
      const key = `${s.entityType}:${s.entityId}`;
      const g = map.get(key) ?? { key, title: s.entityTitle ?? "Item removido", entityType: s.entityType, shares: [] };
      g.shares.push(s);
      map.set(key, g);
    }
    return [...map.values()];
  }, [data?.myShares]);

  const pendingCount = data?.invites.length ?? 0;

  return (
    <div className="w-full px-4 md:px-6 lg:px-8 py-6 space-y-4">
      <RPGPageHeader
        banner="reino"
        size="md"
        eyebrow="Parceiros de compromisso"
        title="Salão da Guilda"
        subtitle="Chame alguém de confiança para acompanhar um contrato ou meta. Ele vê só o resumo e deixa testemunhos — nada além disso."
      />

      <RPGHowItWorks
        storageKey="lifeos-guilda-como-funciona"
        steps={[
          { icon: Send, title: "Chame um parceiro", text: "Nos detalhes do contrato ou da meta, convide pelo e-mail da conta LifeOS.", tone: "gold" },
          { icon: ShieldCheck, title: "Só o resumo", text: "O parceiro vê título, progresso, prazo e sequência. Tarefas e anotações continuam suas.", tone: "blue" },
          { icon: HandHeart, title: "Testemunhos", text: "Ele confirma seu avanço (1 testemunho por dia) e manda incentivos.", tone: "purple" },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <RPGTabs<Tab>
          label="Seções da Guilda"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "comigo", label: pendingCount > 0 ? `Comigo (${pendingCount})` : "Comigo", icon: <Inbox size={14} /> },
            { value: "compartilhei", label: "Que compartilhei", icon: <Users size={14} /> },
          ]}
        />
        {data && (
          <RPGButton variant="ghost" onClick={() => void refetch()} disabled={isFetching} aria-label="Atualizar a Guilda">
            <RefreshCw size={14} aria-hidden className={isFetching ? "animate-spin motion-reduce:animate-none" : undefined} /> Atualizar
          </RPGButton>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2" aria-busy="true" aria-label="Carregando a Guilda">
          {Array.from({ length: 4 }, (_, i) => <div key={i} className="rpg-panel h-40 animate-pulse motion-reduce:animate-none" />)}
        </div>
      ) : isError || !data ? (
        <div className="rpg-panel rpg-panel-danger p-4" role="alert">
          <p className="text-sm text-rpg-text">Não foi possível abrir o salão da Guilda agora.</p>
          <RPGButton variant="secondary" className="mt-3" onClick={() => void refetch()}>
            <RefreshCw size={14} aria-hidden /> Tentar de novo
          </RPGButton>
        </div>
      ) : tab === "comigo" ? (
        <div role="tabpanel" aria-label="Comigo" className="space-y-4">
          {!data.emailVerified && (
            <div className="rpg-panel p-3 flex items-start gap-2 text-sm text-rpg-text" role="status">
              <MailWarning size={16} aria-hidden className="mt-0.5 shrink-0 text-rpg-orange" />
              Confirme seu e-mail para ver convites da Guilda — é assim que provamos que o convite é seu.
            </div>
          )}

          {data.invites.length > 0 && (
            <RPGPanel title={`Convites (${data.invites.length})`} icon={<Send size={14} aria-hidden />} variant="gold">
              <ul className="grid gap-3 md:grid-cols-2">
                {data.invites.map((inv) => (
                  <GuildInviteCard
                    key={inv.id}
                    invite={inv}
                    busy={respond.isPending}
                    onRespond={(accept) =>
                      respond.mutate(
                        { id: inv.id, accept },
                        {
                          onSuccess: () => notify(accept ? `Você entrou na guilda de ${inv.ownerName}.` : "Convite recusado."),
                          onError: (e) => fail(e, "Não foi possível responder ao convite."),
                        },
                      )
                    }
                  />
                ))}
              </ul>
            </RPGPanel>
          )}

          <RPGPanel title="Compromissos que acompanho" icon={<HandHeart size={14} aria-hidden />}>
            {data.sharedWithMe.length === 0 ? (
              <p className="text-sm text-rpg-muted py-4 text-center">
                Ninguém chamou você para acompanhar um compromisso ainda. Quando aceitar um convite, o resumo aparece aqui.
              </p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {data.sharedWithMe.map((item) => (
                  <GuildSharedCard
                    key={item.id}
                    item={item}
                    cheerMax={data.limits.cheerTextMax}
                    busy={cheer.isPending || leave.isPending}
                    onCheer={async (kind, text) => {
                      try {
                        await cheer.mutateAsync({ id: item.id, kind, text });
                        notify(kind === "testemunho" ? "Testemunho registrado. O dono foi avisado." : "Incentivo enviado!");
                      } catch (e) {
                        fail(e, "Não foi possível enviar.");
                        throw e;
                      }
                    }}
                    onLeave={async () => {
                      try {
                        await leave.mutateAsync(item.id);
                        notify("Você deixou de acompanhar este compromisso.");
                      } catch (e) {
                        fail(e, "Não foi possível sair.");
                      }
                    }}
                  />
                ))}
              </ul>
            )}
          </RPGPanel>
        </div>
      ) : (
        <div role="tabpanel" aria-label="Que compartilhei" className="space-y-4">
          {ownedGroups.length === 0 ? (
            <RPGPanel>
              <div className="py-6 text-center space-y-2">
                <p className="text-sm text-rpg-text">Você ainda não chamou nenhum parceiro.</p>
                <p className="text-xs text-rpg-muted">Abra um contrato ou uma meta e use “Chamar parceiro”.</p>
                <div className="flex flex-wrap justify-center gap-2 pt-1">
                  <Link to="/contratos" className="rpg-btn rpg-btn-secondary">Ver contratos</Link>
                  <Link to="/metas" className="rpg-btn rpg-btn-secondary">Ver metas</Link>
                </div>
              </div>
            </RPGPanel>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {ownedGroups.map((g) => (
                <GuildOwnedGroup
                  key={g.key}
                  title={g.title}
                  entityType={g.entityType}
                  shares={g.shares}
                  busy={revoke.isPending}
                  onRevoke={async (id) => {
                    try {
                      await revoke.mutateAsync(id);
                      notify("Acesso revogado. O parceiro não vê mais este item.");
                    } catch (e) {
                      fail(e, "Não foi possível revogar.");
                    }
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      <RPGToast message={toast?.text ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}
