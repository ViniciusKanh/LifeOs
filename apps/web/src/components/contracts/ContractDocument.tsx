import type { ReactNode } from "react";
import clsx from "clsx";
import { FolderKanban, ScrollText, Sparkles, Target } from "lucide-react";
import { difficultyLabel } from "@/services/gamificationService";
import type { Difficulty } from "@/types";

/** Uma obrigação (tarefa) listada no documento. */
export interface DocObligation {
  title: string;
  description?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  estimateMinutes?: number | null;
  done?: boolean;
}

export interface ContractDocData {
  /** Número curto do contrato (ex.: id). Ausente na minuta ainda não firmada. */
  number?: string | null;
  title: string;
  description: string | null;
  objective: string | null;
  why: string | null;
  rewardText: string | null;
  stakes: string | null;
  startDate: string | null;
  dueDate: string | null;
  weeklyHours: number | null;
  difficulty: Difficulty;
  goalTitle?: string | null;
  projectName?: string | null;
  bonus?: { xp: number; coins: number } | null;
  aiGenerated?: boolean;
  obligations?: DocObligation[];
  signerName: string;
  /** Data da assinatura (criação do contrato). Ausente = minuta aguardando assinatura. */
  signedAt?: string | null;
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

/** "2026-10-22" → "22/10/2026". */
export function brDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : null;
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.slice(0, 10).split("-").map(Number);
  const [by, bm, bd] = b.slice(0, 10).split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

function Clause({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h4 className="font-rpg text-[13px] font-bold uppercase tracking-wide text-rpg-ink">
        Cláusula {ROMAN[n] ?? n + 1} — {title}
      </h4>
      <div className="mt-1 text-sm leading-relaxed text-rpg-ink/90">{children}</div>
    </section>
  );
}

/**
 * O contrato como documento: pergaminho com preâmbulo, cláusulas numeradas,
 * obrigações datadas e assinatura com selo. Só exibe — quem edita é o modal
 * de criação. Cláusulas vazias simplesmente não aparecem (nada inventado).
 */
export function ContractDocument({ data, compact = false, className }: { data: ContractDocData; compact?: boolean; className?: string }) {
  const clauses: Array<{ title: string; body: ReactNode }> = [];
  if (data.why) clauses.push({ title: "Da motivação", body: <p>{data.why}</p> });
  if (data.description) clauses.push({ title: "Do objeto", body: <p className="whitespace-pre-line">{data.description}</p> });
  if (data.objective) clauses.push({ title: "Do critério de cumprimento", body: <p>Este contrato estará cumprido quando: <strong>{data.objective}</strong></p> });

  const start = brDate(data.startDate);
  const due = brDate(data.dueDate);
  if (start || due || data.weeklyHours) {
    const span = data.startDate && data.dueDate ? daysBetween(data.startDate, data.dueDate) : null;
    clauses.push({
      title: "Da vigência e dedicação",
      body: (
        <p>
          {start && due ? (
            <>
              Vigora de <strong>{start}</strong> a <strong>{due}</strong>
              {span !== null && span >= 0 ? ` (${span} dia${span === 1 ? "" : "s"})` : ""}.
            </>
          ) : due ? (
            <>
              Vigora até <strong>{due}</strong>.
            </>
          ) : start ? (
            <>
              Vigora a partir de <strong>{start}</strong>, sem prazo final definido.
            </>
          ) : null}{" "}
          {data.weeklyHours ? (
            <>
              O signatário se compromete a dedicar <strong>{data.weeklyHours} h por semana</strong>.
            </>
          ) : null}{" "}
          Nível de dificuldade: <strong>{difficultyLabel(data.difficulty)}</strong>.
        </p>
      ),
    });
  }

  if (data.obligations?.length) {
    clauses.push({
      title: "Das obrigações",
      body: (
        <ol className="mt-1 space-y-1.5">
          {data.obligations.map((o, i) => {
            const os = brDate(o.startDate);
            const od = brDate(o.dueDate);
            return (
              <li key={i} className="grid grid-cols-[1.6rem_minmax(0,1fr)] gap-1">
                <span className="font-pixel text-xs text-rpg-ink/70 tabular-nums">{i + 1}.</span>
                <span className={clsx(o.done && "line-through opacity-60")}>
                  <span className="font-semibold">{o.title}</span>
                  {(os || od || o.estimateMinutes) && (
                    <span className="block text-[11px] text-rpg-ink/70">
                      {os && od && os !== od ? `${os} → ${od}` : od ? `até ${od}` : os ? `a partir de ${os}` : ""}
                      {o.estimateMinutes ? `${os || od ? " · " : ""}~${o.estimateMinutes >= 60 ? `${Math.round((o.estimateMinutes / 60) * 10) / 10} h` : `${o.estimateMinutes} min`}` : ""}
                    </span>
                  )}
                  {!compact && o.description && <span className="block text-[12px] text-rpg-ink/75">{o.description}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      ),
    });
  }

  if (data.goalTitle || data.projectName) {
    clauses.push({
      title: "Dos vínculos",
      body: (
        <ul className="space-y-0.5">
          {data.goalTitle && (
            <li className="flex items-start gap-1.5 [&>svg]:mt-1 [&>svg]:shrink-0">
              <Target size={13} aria-hidden /> <span>Contribui para a meta <strong>{data.goalTitle}</strong>.</span>
            </li>
          )}
          {data.projectName && (
            <li className="flex items-start gap-1.5 [&>svg]:mt-1 [&>svg]:shrink-0">
              <FolderKanban size={13} aria-hidden /> <span>Faz parte do projeto <strong>{data.projectName}</strong>.</span>
            </li>
          )}
        </ul>
      ),
    });
  }

  if (data.rewardText || data.bonus) {
    clauses.push({
      title: "Da recompensa",
      body: (
        <p>
          {data.rewardText && <>Ao cumprir, o signatário se concede: <strong>{data.rewardText}</strong>. </>}
          {data.bonus && (
            <>
              O LifeOS paga o bônus de <strong>+{data.bonus.xp} XP</strong> e <strong>+{data.bonus.coins} moedas</strong>, além do XP de cada tarefa.
            </>
          )}
        </p>
      ),
    });
  }
  if (data.stakes) clauses.push({ title: "Do não cumprimento", body: <p>Se o prazo vencer sem o critério atingido: {data.stakes}</p> });

  return (
    <article className={clsx("rpg-parchment px-5 py-5 sm:px-8 sm:py-7", className)} aria-label={`Contrato: ${data.title}`}>
      <header className="text-center">
        <p className="font-pixel text-[10px] uppercase tracking-[0.25em] text-rpg-ink/70">
          Contrato de compromisso pessoal{data.number ? ` · Nº ${data.number.slice(0, 6).toUpperCase()}` : ""}
        </p>
        <h3 className="mt-2 font-rpg text-xl sm:text-2xl font-bold leading-tight text-rpg-ink">{data.title}</h3>
        <div className="mx-auto mt-3 h-px w-2/3 bg-rpg-ink/30" aria-hidden />
      </header>

      <p className="mt-4 text-sm leading-relaxed text-rpg-ink/90">
        Pelo presente instrumento, <strong>{data.signerName}</strong> firma consigo mesmo o compromisso descrito abaixo, que passa a valer como uma missão
        acompanhada pelo LifeOS{data.aiGenerated ? ", redigida com apoio do LifeOS Copilot e revisada pelo signatário" : ""}.
      </p>

      <div className={clsx("mt-4", compact ? "space-y-2.5" : "space-y-3.5")}>
        {clauses.length === 0 ? (
          <p className="text-sm italic text-rpg-ink/70">Preencha o objetivo e as cláusulas para ver o contrato completo.</p>
        ) : (
          clauses.map((c, i) => (
            <Clause key={c.title} n={i} title={c.title}>
              {c.body}
            </Clause>
          ))
        )}
      </div>

      <footer className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-[12rem] flex-1">
          {data.signedAt ? (
            <p className="font-rpg text-lg italic text-rpg-ink" aria-label={`Assinado por ${data.signerName}`}>
              {data.signerName}
            </p>
          ) : (
            <p className="text-sm italic text-rpg-ink/60">Aguardando sua assinatura</p>
          )}
          <div className="h-px w-full max-w-xs bg-rpg-ink/50" aria-hidden />
          <p className="mt-1 text-[11px] text-rpg-ink/70">{data.signedAt ? `Signatário · firmado em ${brDate(data.signedAt)}` : "Signatário"}</p>
        </div>
        <span
          className="relative inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-rpg-red/80 bg-rpg-red/70 text-rpg-parchment shadow-rpg"
          aria-hidden
          title={data.signedAt ? "Selo do contrato" : undefined}
        >
          {data.aiGenerated ? <Sparkles size={22} /> : <ScrollText size={22} />}
        </span>
      </footer>
    </article>
  );
}
