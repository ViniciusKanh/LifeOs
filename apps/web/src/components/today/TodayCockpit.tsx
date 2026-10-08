import { Link } from "react-router-dom";
import { CalendarCheck, FileClock } from "lucide-react";
import { Card, IconBadge } from "@/components/ui/primitives";
import { UrgencyPill } from "@/components/lifeAdmin/LifeAdminCard";
import { useLifeAdminSummary, usePeriodicReview } from "@/hooks/useLifeOs";
import { currentCycleKeys } from "@/utils/lifeOsLabels";

/** Chave do mês anterior (2026-10 → 2026-09). */
function previousMonthKey(d = new Date()): string {
  const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return currentCycleKeys(prev).month;
}

function monthName(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long" });
}

function CockpitHeader({ icon, tone, title, to, linkLabel }: { icon: React.ReactNode; tone: "blue" | "purple" | "green" | "amber"; title: string; to: string; linkLabel: string }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <div className="flex items-center gap-2 min-w-0">
        <IconBadge tone={tone} size={28} icon={icon} />
        <p className="text-sm font-semibold truncate">{title}</p>
      </div>
      <Link to={to} className="text-xs font-medium text-brand-600 dark:text-brand-500 shrink-0">
        {linkLabel} →
      </Link>
    </div>
  );
}

const skeleton = <div className="h-14 rounded-lg bg-black/[0.04] dark:bg-white/[0.05] animate-pulse" aria-busy="true" />;

/** Vencimentos, contas e manutenções que pedem atenção agora. */
function AdminAttention() {
  const { data, isLoading } = useLifeAdminSummary();
  const urgent = (data?.next ?? []).filter((i) => i.urgency === "overdue" || i.urgency === "today" || i.urgency === "soon").slice(0, 3);
  return (
    <Card className="p-4">
      <CockpitHeader icon={<FileClock size={14} />} tone="amber" title="Administração da vida" to="/administracao" linkLabel="Abrir" />
      {isLoading ? (
        skeleton
      ) : urgent.length === 0 ? (
        <p className="text-xs text-slate">Nenhum vencimento, conta ou manutenção para os próximos dias.</p>
      ) : (
        <ul className="space-y-1.5">
          {urgent.map((i) => (
            <li key={i.id}>
              <Link
                to={`/administracao?item=${i.id}`}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 -mx-2 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                <span className="text-sm truncate">{i.title}</span>
                <UrgencyPill item={i} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Lembra de fechar o mês anterior enquanto a revisão não foi salva. */
function ReviewReminder() {
  const key = previousMonthKey();
  const { review, isLoading } = usePeriodicReview("monthly", key);
  const done = Boolean(review?.savedAt);
  return (
    <Card className="p-4">
      <CockpitHeader icon={<CalendarCheck size={14} />} tone="green" title="Revisões" to="/revisoes" linkLabel="Abrir" />
      {isLoading ? (
        skeleton
      ) : done ? (
        <p className="text-xs text-slate">A revisão de {monthName(key)} está feita. A próxima fecha no início do mês que vem.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-slate">
            A revisão de <strong className="font-semibold">{monthName(key)}</strong> ainda não foi feita. Os números do mês já estão prontos.
          </p>
          <Link
            to={`/revisoes?tipo=monthly&periodo=${key}`}
            className="self-start inline-flex items-center rounded-lg bg-signal px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            Fechar {monthName(key)}
          </Link>
        </div>
      )}
    </Card>
  );
}

/**
 * Faixa de cockpit do Hoje: junta os sinais de longo prazo (vencimentos
 * e revisões) que antes ficavam espalhados em telas próprias.
 */
export function TodayCockpit() {
  return (
    <section aria-label="Cockpit do dia" className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
      <AdminAttention />
      <ReviewReminder />
    </section>
  );
}
