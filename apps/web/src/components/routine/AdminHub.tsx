import { useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { AlertTriangle, Bell, CalendarClock, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Crown, FileText, Gift, HelpCircle, Paperclip, Repeat, RotateCcw, ShieldAlert, Wrench } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RPGBadge, RPGButton, RPGProgressBar } from "@/components/rpg";
import { IndicatorCard, KitSection, MODULE_ART } from "@/components/rpg-modules/ModuleKit";
import { useRoutineActions } from "@/hooks/useRoutineHubs";
import type { AdminHub, AdminUrgency } from "@/services/routineHubService";
import { ProgressRing, R, fmtDay, nf } from "./RoutineShared";

const ART = `${MODULE_ART}/admin`;
/** Dinheiro real — sempre com a moeda explícita, nunca confundido com moedas do LifeOS. */
export const money = (v: number | null, currency = "BRL") => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency }));
const URG: Record<AdminUrgency, { label: string; tone: "red" | "orange" | "green" | "muted" | "blue"; dot: string }> = {
  overdue: { label: "Vencido", tone: "red", dot: "bg-rpg-red" },
  today: { label: "Vence hoje", tone: "orange", dot: "bg-rpg-orange" },
  soon: { label: "Próximo", tone: "orange", dot: "bg-rpg-orange" },
  ok: { label: "Em dia", tone: "green", dot: "bg-rpg-green" },
  no_date: { label: "Sem data", tone: "muted", dot: "bg-rpg-border" },
};

export function AdminIndicators({ hub }: { hub: AdminHub }) {
  const i = hub.indicators;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
      <IndicatorCard icon={<AlertTriangle size={22} />} label="Atrasados" value={i.overdue} hint="precisam de atenção" tone="red" />
      <IndicatorCard icon={<CalendarClock size={22} />} label="Vencem em breve" value={i.soon} hint="dentro do lembrete" tone="orange" />
      <IndicatorCard icon={<CheckCircle2 size={22} />} label="Em dia" value={i.ok} tone="green" />
      <IndicatorCard icon={<FileText size={22} />} label="Com arquivo" value={i.withFile} hint="documento guardado" tone="blue" />
      <IndicatorCard icon={<Bell size={22} />} label="Lembretes ativos" value={i.remindersActive} tone="purple" />
      <IndicatorCard icon={<ShieldAlert size={22} />} label="Críticos" value={i.critical} hint="vencidos ou alta prioridade" tone="red" />
      <IndicatorCard icon={<Wrench size={22} />} label="Próx. manutenção" value={i.nextMaintenance ? fmtDay(i.nextMaintenance.dueDate) : "—"} hint={i.nextMaintenance?.title} tone="orange" />
      <IndicatorCard icon={<Crown size={22} />} label="Ordem" value={hub.order ? `${hub.order.score}%` : "—"} hint={hub.order ? "índice do reino" : "sem registros"} tone="gold" />
    </div>
  );
}

/** Índice de Ordem com a metodologia sempre visível. */
export function OrderPanel({ hub }: { hub: AdminHub }) {
  const [help, setHelp] = useState(false);
  const o = hub.order;
  return (
    <section className="rpg-panel rpg-panel-gold grid items-center gap-3 p-3 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,240px)]" aria-label="Painel do Reino">
      <ProgressRing value={o?.score ?? 0} max={100} size={128} label="Índice de Ordem" tone="green">
        <span className="font-rpg text-2xl font-bold text-rpg-green tabular-nums">{o ? `${o.score}%` : "—"}</span>
        <span className="font-pixel text-[9px] uppercase text-rpg-muted">ordem</span>
      </ProgressRing>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="rpg-title text-lg font-bold">Painel do Reino</p>
          <button type="button" onClick={() => setHelp(true)} className="inline-flex min-h-[32px] items-center gap-1 text-xs text-rpg-blue hover:underline">
            <HelpCircle size={13} aria-hidden /> Como é calculado
          </button>
        </div>
        {o ? (
          <ul className="mt-1 space-y-1">
            <li><RPGProgressBar label={`Itens no prazo (${hub.orderWeights.onTime}%)`} value={o.parts.onTimePct} max={100} valueLabel={`${o.parts.onTimePct}%`} tone="green" /></li>
            <li><RPGProgressBar label={`Cobertura de lembretes (${hub.orderWeights.reminders}%)`} value={o.parts.remindersPct} max={100} valueLabel={`${o.parts.remindersPct}%`} tone="purple" /></li>
            <li><RPGProgressBar label={`Informações completas (${hub.orderWeights.completeness}%)`} value={o.parts.completePct} max={100} valueLabel={`${o.parts.completePct}%`} tone="blue" /></li>
          </ul>
        ) : (
          <p className="text-sm text-rpg-muted">Sem registros, não há índice: a ausência de itens não significa que está tudo em ordem.</p>
        )}
      </div>
      <div className="border-t border-rpg-border/60 pt-2 md:border-l md:border-t-0 md:pl-3 md:pt-0">
        <p className="font-pixel text-[10px] uppercase text-rpg-gold">Urgências</p>
        {hub.critical.length === 0 ? (
          <p className="text-sm text-rpg-green">Nenhuma pendência crítica.</p>
        ) : (
          <ul className="space-y-1">
            {hub.critical.slice(0, 4).map((c) => (
              <li key={c.id}>
                <Link to={`/administracao?item=${c.id}`} className="flex items-center gap-1.5 text-sm text-rpg-text hover:underline">
                  <AlertTriangle size={12} className="shrink-0 text-rpg-red" aria-hidden />
                  <span className="truncate">{c.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Modal open={help} onClose={() => setHelp(false)} title="Índice de Ordem — metodologia" size="sm">
        <ul className="space-y-1.5 text-sm text-rpg-text/90">
          <li><strong>{hub.orderWeights.onTime}%</strong> — itens com data que não estão vencidos.</li>
          <li><strong>{hub.orderWeights.reminders}%</strong> — itens com data que têm lembrete configurado (dias antes &gt; 0).</li>
          <li><strong>{hub.orderWeights.completeness}%</strong> — completude: documentos com arquivo, contas e assinaturas com valor, demais itens com data.</li>
          <li>Sem nenhum registro o índice fica vazio — não há como medir organização sem dados.</li>
        </ul>
        {hub.order && <p className="mt-2 text-xs text-rpg-muted">Base atual: {hub.order.basis.items} item(ns), {hub.order.basis.dated} com data.</p>}
      </Modal>
    </section>
  );
}

/** Calendário de vencimentos do mês (cores por urgência) com atalho para a Agenda. */
export function DueCalendar({ hub, month, onMonth }: { hub: AdminHub; month: string; onMonth: (m: string) => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const shift = (d: number) => {
    const [y, m] = month.split("-").map(Number);
    const n = new Date(Date.UTC(y!, m! - 1 + d, 1));
    onMonth(n.toISOString().slice(0, 7));
  };
  const first = new Date(`${month}-01T12:00:00Z`).getUTCDay();
  const pad = (first + 6) % 7;
  const total = hub.calendar.reduce((s, c) => s + c.due.length, 0);
  const sums = hub.calendar.flatMap((c) => c.due).filter((d) => d.amount != null);
  const byCurrency = sums.reduce<Record<string, number>>((acc, d) => ((acc[d.currency] = (acc[d.currency] ?? 0) + (d.amount ?? 0)), acc), {});
  const selDay = hub.calendar.find((c) => c.day === sel);
  return (
    <KitSection
      title="Calendário de vencimentos"
      icon={<CalendarDays size={16} />}
      action={
        <span className="flex items-center gap-1">
          <button type="button" onClick={() => shift(-1)} className="flex h-8 w-8 items-center justify-center text-rpg-muted" aria-label="Mês anterior"><ChevronLeft size={14} /></button>
          <span className="font-pixel text-[10px] text-rpg-text">{new Date(`${month}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}</span>
          <button type="button" onClick={() => shift(1)} className="flex h-8 w-8 items-center justify-center text-rpg-muted" aria-label="Próximo mês"><ChevronRight size={14} /></button>
        </span>
      }
    >
      <div className="mb-1 grid grid-cols-7 gap-1 text-center font-pixel text-[9px] text-rpg-muted">
        {["S", "T", "Q", "Q", "S", "S", "D"].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: pad }, (_, i) => <span key={`p${i}`} />)}
        {hub.calendar.map((c) => {
          const worst = c.due.find((d) => d.urgency === "overdue") ?? c.due.find((d) => d.urgency === "today" || d.urgency === "soon") ?? c.due[0];
          return (
            <button key={c.day} type="button" onClick={() => setSel(c.day === sel ? null : c.day)} aria-label={`${fmtDay(c.day)}: ${c.due.length} vencimento(s), ${c.done.length} resolvido(s)`} aria-pressed={sel === c.day} className={clsx("relative flex aspect-square min-h-[26px] items-center justify-center border text-[10px]", c.day === hub.today ? "border-rpg-gold text-rpg-gold-light" : "border-rpg-border text-rpg-muted", sel === c.day && "outline outline-2 outline-rpg-gold")} style={{ borderRadius: 3 }}>
              {Number(c.day.slice(8))}
              {worst && <span className={clsx("absolute bottom-0.5 h-1.5 w-1.5", URG[worst.urgency].dot)} style={{ borderRadius: 999 }} aria-hidden />}
              {c.done.length > 0 && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 bg-rpg-green" style={{ borderRadius: 999 }} aria-hidden />}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-rpg-text">
        {total} vencimento(s) no mês{Object.entries(byCurrency).map(([cur, v]) => ` · ${money(v, cur)} previsto`).join("")}
      </p>
      {selDay && (
        <ul className="mt-1.5 space-y-0.5 border-t border-rpg-border/60 pt-1.5 text-xs">
          {selDay.due.map((d) => (
            <li key={d.id}><Link to={`/administracao?item=${d.id}`} className="flex justify-between gap-2 hover:underline"><span className="truncate text-rpg-text">{d.title}</span><RPGBadge tone={URG[d.urgency].tone}>{URG[d.urgency].label}</RPGBadge></Link></li>
          ))}
          {selDay.done.map((d, i) => <li key={`d${i}`} className="text-rpg-green">✓ {d.title}</li>)}
          {!selDay.due.length && !selDay.done.length && <li className="text-rpg-muted">Nada neste dia.</li>}
        </ul>
      )}
      <Link to="/calendario" className="mt-1 inline-flex min-h-[32px] items-center text-xs text-rpg-blue hover:underline">Ver na Agenda →</Link>
    </KitSection>
  );
}

/** Próximos compromissos (cards) + resolvidos recentes com “Reabrir”. */
export function UpcomingPanel({ hub, onToast }: { hub: AdminHub; onToast: (m: string, tone?: "success" | "error") => void }) {
  const { reopen, adminMeta } = useRoutineActions();
  return (
    <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <KitSection title="Próximos vencimentos" icon={<CalendarClock size={16} />}>
        {hub.upcoming.length === 0 ? (
          <p className="text-sm text-rpg-muted">Nenhum vencimento futuro cadastrado.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {hub.upcoming.map((u) => (
              <li key={u.id} className="flex flex-col gap-1 border-2 border-rpg-border bg-rpg-bg-2/60 p-2.5" style={R}>
                <div className="flex items-start gap-2">
                  <Link to={`/administracao?item=${u.id}`} className="min-w-0 flex-1 truncate font-semibold text-rpg-text hover:underline">{u.title}</Link>
                  <RPGBadge tone={URG[u.urgency].tone}>{u.daysLeft === 0 ? "Hoje" : `Em ${u.daysLeft} d`}</RPGBadge>
                </div>
                <p className="text-[11px] text-rpg-muted">
                  {fmtDay(u.dueDate)} · {u.amount != null ? money(u.amount, u.currency) : "sem valor"} {u.recurrenceMonths ? <><Repeat size={10} className="inline" aria-hidden /> {u.recurrenceMonths === 12 ? "anual" : u.recurrenceMonths === 1 ? "mensal" : `${u.recurrenceMonths} meses`}</> : null} {u.hasFile ? <Paperclip size={10} className="inline" aria-label="com arquivo" /> : null}
                </p>
                <label className="flex items-center gap-1 text-[11px] text-rpg-muted">
                  Prioridade
                  <select className="min-h-[30px] border border-rpg-border bg-rpg-bg-2 px-1 text-[11px] text-rpg-text" style={R} defaultValue={u.priority ?? ""} onChange={(e) => adminMeta.mutate({ id: u.id, input: { priority: (e.target.value || null) as "Baixa" | "Média" | "Alta" | null } }, { onSuccess: () => onToast("Prioridade atualizada.") })}>
                    <option value="">—</option>
                    <option>Baixa</option>
                    <option>Média</option>
                    <option>Alta</option>
                  </select>
                </label>
                <Link to={`/administracao?item=${u.id}`} className="text-[11px] font-semibold text-rpg-blue hover:underline">Abrir · concluir · anexar →</Link>
              </li>
            ))}
          </ul>
        )}
      </KitSection>
      <KitSection title="Resolvidos recentemente" icon={<CheckCircle2 size={16} />}>
        {hub.recentDone.length === 0 ? (
          <p className="text-sm text-rpg-muted">Nada resolvido ainda.</p>
        ) : (
          <ul className="divide-y divide-rpg-border/50">
            {hub.recentDone.map((d, i) => (
              <li key={`${d.itemId}-${i}`} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate text-rpg-text">{d.title}</span>
                <span className={clsx("shrink-0 text-[11px]", d.late ? "text-rpg-orange" : "text-rpg-green")}>{fmtDay(d.doneAt)}{d.late ? " (atrasado)" : ""}</span>
                {i === hub.recentDone.findIndex((x) => x.itemId === d.itemId) && (
                  <button type="button" disabled={reopen.isPending} onClick={() => confirm(`Reabrir "${d.title}"? A última resolução sai do histórico.`) && reopen.mutate(d.itemId, { onSuccess: () => onToast("Item reaberto."), onError: (e) => onToast(e instanceof Error ? e.message : "Não foi possível reabrir.", "error") })} className="flex h-9 w-9 items-center justify-center text-rpg-muted hover:text-rpg-text" aria-label={`Reabrir ${d.title}`}>
                    <RotateCcw size={13} aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </KitSection>
    </div>
  );
}

export function SubscriptionsPanel({ hub }: { hub: AdminHub }) {
  const s = hub.subscriptions;
  return (
    <div className="grid items-start gap-3 lg:grid-cols-2">
      <KitSection title="Assinaturas" icon={<Repeat size={16} />}>
        <p className="mb-2 text-[11px] text-rpg-muted">Valores em dinheiro real, cadastrados por você — não têm relação com as moedas do LifeOS.</p>
        {s.items.length === 0 ? (
          <p className="text-sm text-rpg-muted">Nenhum item na categoria Assinaturas.</p>
        ) : (
          <ul className="divide-y divide-rpg-border/50">
            {s.items.map((i) => (
              <li key={i.id} className="flex items-center gap-2 py-1.5 text-sm">
                <Link to={`/administracao?item=${i.id}`} className="min-w-0 flex-1 truncate text-rpg-text hover:underline">{i.title}</Link>
                <span className="shrink-0 text-[11px] text-rpg-muted">{money(i.amount, i.currency)}{i.recurrenceMonths ? ` / ${i.recurrenceMonths === 1 ? "mês" : i.recurrenceMonths === 12 ? "ano" : `${i.recurrenceMonths} meses`}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
        {s.totals.map((t) => (
          <p key={t.currency} className="mt-2 font-semibold text-rpg-text">Previsto: {money(t.monthly, t.currency)}/mês · {money(t.yearly, t.currency)}/ano</p>
        ))}
      </KitSection>
      <KitSection title="Sem comprovante" icon={<Paperclip size={16} />}>
        {hub.missingFiles.length === 0 ? (
          <p className="text-sm text-rpg-green">Todos os documentos e contas têm arquivo.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {hub.missingFiles.map((m) => (
              <li key={m.id}><Link to={`/administracao?item=${m.id}`} className="text-rpg-text hover:underline">📎 {m.title}</Link></li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[10px] text-rpg-muted">Os arquivos ficam no seu registro (acesso só com login). Não há backup automático externo.</p>
      </KitSection>
    </div>
  );
}

/** Baú de Tranquilidade: dias seguidos sem pendência vencida; um resgate por sequência. */
export function TranquilityChest({ hub, onToast }: { hub: AdminHub; onToast: (m: string, tone?: "success" | "error") => void }) {
  const { claimChest } = useRoutineActions();
  const c = hub.chest;
  return (
    <section className="rpg-panel rpg-panel-legendary flex items-center gap-3 p-3" aria-label="Baú de Tranquilidade">
      <img src={`${ART}/chest.webp`} alt="" aria-hidden className="pixelated h-20 w-20 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="rpg-title font-bold">Baú de Tranquilidade</p>
        <p className="text-[11px] text-rpg-muted">{c.target} dias seguidos sem pendência vencida liberam +{c.xp} XP e +{c.coins} moedas (uma vez por sequência).</p>
        <RPGProgressBar className="mt-1" label="Dias em ordem" value={Math.min(c.days, c.target)} max={c.target} valueLabel={`${c.days}/${c.target} dias`} tone="purple" />
        {c.claimedTotal > 0 && <p className="mt-0.5 text-[10px] text-rpg-green">{c.claimedTotal} baú(s) já aberto(s).</p>}
      </div>
      <RPGButton variant="gold" disabled={!c.claimable || claimChest.isPending} onClick={() => claimChest.mutate(undefined, { onSuccess: (r) => onToast(r.awarded ? `Baú aberto: +${r.xp} XP e +${r.coins} moedas.` : "Este baú já foi aberto."), onError: (e) => onToast(e instanceof Error ? e.message : "Não foi possível abrir.", "error") })}>
        <Gift size={15} aria-hidden /> Abrir
      </RPGButton>
    </section>
  );
}

export const ADMIN_MEDALS = [
  { code: "adm_deadlines", img: `${ART}/medal-1.webp`, fallbackTitle: "Guardião dos Prazos" },
  { code: "adm_archivist", img: `${ART}/medal-2.webp`, fallbackTitle: "Arquivista Real" },
  { code: "adm_order", img: `${ART}/medal-3.webp`, fallbackTitle: "Mestre da Ordem" },
  { code: "adm_kingdom", img: `${ART}/medal-2.webp`, fallbackTitle: "Reino Organizado" },
  { code: "adm_consistent", img: `${ART}/medal-1.webp`, fallbackTitle: "Administrador Consistente" },
];

export { nf };
