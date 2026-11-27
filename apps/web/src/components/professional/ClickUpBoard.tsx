import { useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { AlertTriangle, CalendarClock, CheckCircle2, ExternalLink, FolderKanban, Loader, ScrollText, Settings2, Swords } from "lucide-react";
import { RPGToast } from "@/components/rpg";
import { EmptyNote, INPUT, R, StatTile, errMsg } from "@/components/adventures/AdventureKit";
import { IntegrationBanner, KeyConnectForm, SyncBar, XpChip } from "@/components/integrations/IntegrationKit";
import { useClickUp, useClickUpActions, useClickUpTeams } from "@/hooks/usePersonalIntegrations";
import { useProjects } from "@/hooks/useProjects";

const PRIORITY_STRIPE: Record<string, string> = { Alta: "bg-rpg-red", Média: "bg-rpg-gold", Baixa: "bg-rpg-blue" };

function dueLabel(due: string | null, today: string): { text: string; tone: string } {
  if (!due) return { text: "Sem prazo", tone: "text-rpg-muted" };
  const diff = Math.round((Date.parse(`${due}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  if (diff < 0) return { text: `Atrasada ${-diff} dia(s)`, tone: "text-rpg-red" };
  if (diff === 0) return { text: "Vence hoje", tone: "text-rpg-orange" };
  if (diff === 1) return { text: "Vence amanhã", tone: "text-rpg-gold" };
  return { text: `Em ${diff} dias`, tone: "text-rpg-muted" };
}

/**
 * Quadro do ClickUp (Profissional) — tarefas atribuídas a você no ClickUp
 * viram missões de um projeto profissional do LifeOS. Concluir no ClickUp
 * conclui aqui (com o XP normal de missão); nada é escrito no ClickUp.
 */
export function ClickUpBoard() {
  const q = useClickUp();
  const a = useClickUpActions();
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);
  const notify = (msg: string, tone: "success" | "error" = "success") => setToast({ msg, tone });
  const [showSettings, setShowSettings] = useState(false);
  const teams = useClickUpTeams(showSettings && !!q.data?.connected);
  const { projects } = useProjects();
  const proProjects = projects.filter((p) => p.kind === "professional" && !p.archived_at);
  const o = q.data;

  const syncMsg = (r: { created: number; completed: number; updated: number; complete: boolean }) =>
    notify(`${r.created} contrato(s) novo(s), ${r.updated} atualizado(s)${r.completed ? `, ${r.completed} concluído(s) com XP` : ""}.${r.complete ? "" : " Há mais tarefas: sincronize de novo."}`);

  return (
    <section className="rpg-panel relative mb-4 overflow-hidden p-4" aria-label="Quadro do ClickUp">
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
      <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(123,104,238,0.25),transparent_70%)]" aria-hidden />
      <IntegrationBanner
        icon={<ScrollText size={22} />}
        tone="purple"
        title="Quadro do ClickUp"
        subtitle="Suas tarefas do trabalho viram contratos da guilda, com prazo e prioridade, sem digitar duas vezes."
        right={
          o?.connected ? (
            <button type="button" onClick={() => setShowSettings((v) => !v)} className="flex items-center gap-1 border border-rpg-border px-2 py-1 text-xs text-rpg-muted hover:text-rpg-text" style={R} aria-expanded={showSettings}>
              <Settings2 size={13} aria-hidden /> Ajustes
            </button>
          ) : null
        }
      />
      {q.isLoading ? (
        <div className="h-40 animate-pulse bg-rpg-bg-2" style={R} />
      ) : q.isError || !o ? (
        <p className="text-sm text-rpg-red" role="alert">
          Não foi possível ler o ClickUp.
        </p>
      ) : !o.connected ? (
        <div className="grid [&>*]:min-w-0 gap-4 lg:grid-cols-2">
          <KeyConnectForm
            service="ClickUp"
            placeholder="pk_12345678_XXXXXXXXXXXXXXXXXXXXXXXX"
            minLength={12}
            pattern={/^pk_[A-Za-z0-9_]+$/}
            patternHint="O token pessoal do ClickUp começa com pk_."
            link={{ href: "https://app.clickup.com/settings/apps", text: "Abrir ClickUp → Settings → Apps" }}
            busy={a.connect.isPending}
            onSubmit={(key) =>
              a.connect.mutate(key, {
                onSuccess: (r) => (r.sync.ok ? syncMsg(r.sync) : notify(`Conectado ao ${r.team.name}, mas a importação falhou: ${r.sync.error}`, "error")),
                onError: (e) => notify(errMsg(e, "Não foi possível conectar o ClickUp."), "error"),
              })
            }
            steps={[
              <>No ClickUp, clique no seu avatar → <b>Settings → Apps</b>.</>,
              <>Em <b>API Token</b>, clique em <b>Generate</b> e copie o token (começa com <code>pk_</code>).</>,
              <>Cole aqui. Só as tarefas <b>atribuídas a você</b> entram; o LifeOS nunca escreve no ClickUp.</>,
            ]}
          />
          <div className="space-y-2 border border-dashed border-rpg-purple/50 p-3 text-xs text-rpg-muted" style={R}>
            <p className="font-rpg text-sm font-bold text-rpg-purple">Como funciona o quadro</p>
            <p>As tarefas entram num projeto profissional (“ClickUp · seu Workspace”) e aparecem em Missões, Agenda, Conselho de Guerra e nos indicadores do Profissional.</p>
            <p>Prioridade urgente/alta vira Alta, normal vira Média e baixa vira Baixa. O prazo vem do ClickUp.</p>
            <p>
              Fechou no ClickUp? A missão é concluída aqui com o <b className="text-rpg-text">XP normal de missão</b> e dano no Chefe da Semana.
            </p>
            <p>Conquistas: Contratado da Guilda (10) e Veterano dos Contratos (100).</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {showSettings && (
            <div className="grid [&>*]:min-w-0 gap-2 border border-rpg-border bg-rpg-bg-2/60 p-3 sm:grid-cols-2" style={R}>
              <label className="space-y-1 text-xs text-rpg-muted">
                Workspace do ClickUp
                <select
                  value={o.connection?.team?.id ?? ""}
                  onChange={(e) => a.settings.mutate({ teamId: e.target.value }, { onSuccess: () => notify("Workspace trocado. Sincronize para importar."), onError: (err) => notify(errMsg(err, "Não foi possível trocar."), "error") })}
                  className={INPUT + " w-full py-1 text-xs"}
                  style={R}
                >
                  {!teams.data && o.connection?.team && <option value={o.connection.team.id}>{o.connection.team.name}</option>}
                  {teams.data?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs text-rpg-muted">
                Projeto do LifeOS que recebe as tarefas
                <select
                  value={o.connection?.project?.id ?? ""}
                  onChange={(e) => a.settings.mutate({ projectId: e.target.value || null }, { onSuccess: () => notify("Próximas tarefas novas irão para esse projeto."), onError: (err) => notify(errMsg(err, "Não foi possível salvar."), "error") })}
                  className={INPUT + " w-full py-1 text-xs"}
                  style={R}
                >
                  <option value="">Criar “ClickUp · Workspace” automaticamente</option>
                  {proProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <div className="grid [&>*]:min-w-0 grid-cols-2 gap-2 md:grid-cols-5">
            <StatTile icon={<FolderKanban size={14} />} tone="text-rpg-purple" value={o.counts.open} label="Contratos abertos" />
            <StatTile icon={<Loader size={14} />} tone="text-rpg-blue" value={o.counts.doing} label="Em andamento" />
            <StatTile icon={<AlertTriangle size={14} />} tone={o.counts.overdue ? "text-rpg-red" : "text-rpg-muted"} value={o.counts.overdue} label="Atrasados" />
            <StatTile icon={<CalendarClock size={14} />} tone="text-rpg-gold" value={o.counts.dueWeek} label="Vencem em 7 dias" />
            <StatTile icon={<Swords size={14} />} tone="text-rpg-green" value={o.counts.doneWeek} label="Concluídos (7 dias)" hint={<XpChip xp={o.xpTotal} className="mt-1" />} />
          </div>
          <div className="grid [&>*]:min-w-0 gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div>
              <p className="mb-2 text-xs font-semibold text-rpg-text">Próximos contratos</p>
              {o.upcoming.length === 0 ? (
                <EmptyNote>Nenhuma tarefa aberta atribuída a você. Quadro limpo!</EmptyNote>
              ) : (
                <ul className="space-y-1.5">
                  {o.upcoming.map((t) => {
                    const d = dueLabel(t.dueDate, o.today);
                    return (
                      <li key={t.id} className="rpg-tile flex items-stretch gap-2 overflow-hidden p-0">
                        <span className={clsx("w-1 shrink-0", PRIORITY_STRIPE[t.priority] ?? "bg-rpg-muted")} aria-label={`Prioridade ${t.priority}`} />
                        <div className="min-w-0 flex-1 py-2">
                          <p className="truncate text-sm font-semibold text-rpg-text" title={t.title}>
                            {t.title}
                          </p>
                          <p className="flex flex-wrap gap-x-2 text-[11px] text-rpg-muted">
                            <span className={d.tone}>{d.text}</span>
                            {t.list && <span>· {t.list}</span>}
                            {t.clickupStatus && <span className="uppercase">· {t.clickupStatus}</span>}
                          </p>
                        </div>
                        {t.url && (
                          <a href={t.url} target="_blank" rel="noreferrer noopener" className="flex items-center px-3 text-rpg-blue hover:bg-rpg-bg-2" aria-label={`Abrir “${t.title}” no ClickUp`}>
                            <ExternalLink size={14} aria-hidden />
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-rpg-text">Concluídos recentemente</p>
              {o.recentDone.length === 0 ? (
                <EmptyNote>Os contratos que você fechar aparecem aqui.</EmptyNote>
              ) : (
                <ul className="space-y-1">
                  {o.recentDone.map((t) => (
                    <li key={t.id} className="flex items-start gap-1.5 text-xs">
                      <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-rpg-green" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-rpg-text" title={t.title}>
                        {t.title}
                      </span>
                      <span className="shrink-0 text-rpg-muted">{new Date(t.completedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
                    </li>
                  ))}
                </ul>
              )}
              {o.connection?.project && (
                <Link to="/tarefas" className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-rpg-blue">
                  <FolderKanban size={12} aria-hidden /> Ver em Missões ({o.connection.project.name})
                </Link>
              )}
            </div>
          </div>
          <SyncBar
            status={o.connection?.lastSyncStatus ?? null}
            lastSyncAt={o.connection?.lastSyncAt ?? null}
            error={o.connection?.lastSyncError ?? null}
            busy={a.sync.isPending}
            onSync={() => a.sync.mutate(undefined, { onSuccess: syncMsg, onError: (e) => notify(errMsg(e, "Falha ao sincronizar o ClickUp."), "error") })}
            onDisconnect={() => a.disconnect.mutate(undefined, { onSuccess: () => notify("ClickUp desconectado. As tarefas importadas continuam no LifeOS.") })}
            disconnecting={a.disconnect.isPending}
            keepNote="As tarefas já importadas continuam no LifeOS."
          />
          <p className="text-[11px] text-rpg-muted">
            {o.connection?.username ? `Conta ${o.connection.username}` : "Conta ClickUp"} · Workspace {o.connection?.team?.name ?? "—"} · sincroniza também uma vez por dia automaticamente.
          </p>
        </div>
      )}
    </section>
  );
}
