import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { BarChart3, Compass, GitCompare, Loader2, PenLine, Plus, Send, Sparkles, Swords, TrendingDown } from "lucide-react";
import { RPGButton } from "@/components/rpg";
import { Tag } from "@/components/forge3/ForgeShared";
import type { JourneyReview, ReviewAdvice, ReviewAdvisorMode } from "@/services/journeyReviewService";
import { Delta, FIELD, KIND_LABEL, KIND_TONE, REVIEWS_ART, fmtIndicator } from "./ReviewShared";

const MODES: Array<[ReviewAdvisorMode, string, ReactNode]> = [
  ["analyze", "Analisar período", <BarChart3 key="i" size={13} />],
  ["reflection", "Rascunho da reflexão", <PenLine key="i" size={13} />],
  ["bottlenecks", "Gargalos", <TrendingDown key="i" size={13} />],
  ["plan", "Plano do próximo ciclo", <Compass key="i" size={13} />],
  ["missions", "Gerar missões", <Swords key="i" size={13} />],
  ["compare", "Comparar períodos", <GitCompare key="i" size={13} />],
];
const STATUS_TEXT: Record<string, string> = { ok: "IA ativa", indisponivel: "Regras locais", erro: "IA falhou · regras", dados_insuficientes: "Poucos dados" };

/** Conselheiro de Revisão: interpreta números calculados no servidor; nunca grava sozinho. */
export function ReviewAdvisor({
  d,
  result,
  mode,
  busy,
  onRun,
  onInsertDraft,
  onMission,
  onUsePriority,
}: {
  d: JourneyReview;
  result: ReviewAdvice | null;
  mode: ReviewAdvisorMode | null;
  busy: boolean;
  onRun: (mode: ReviewAdvisorMode, question?: string) => void;
  onInsertDraft: (draft: Record<string, string>) => void;
  onMission: (request: string) => void;
  onUsePriority: (p: string) => void;
}) {
  const [q, setQ] = useState("");
  const labelOf = (key: string) => d.questions.find((x) => x.key === key)?.label ?? key;
  return (
    <section className="rpg-panel rpg-panel-gold overflow-hidden" aria-label="Conselheiro de Revisão">
      <header className="relative flex items-start gap-3 border-b border-rpg-border bg-gradient-to-r from-rpg-purple/25 to-transparent p-3">
        <img src={`${REVIEWS_ART}/advisor-mage.webp`} alt="" aria-hidden className="pixelated h-20 w-20 shrink-0 object-contain" />
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 font-pixel text-[13px] uppercase tracking-wider text-rpg-gold-light">
            Conselheiro de Revisão
            {result && <Tag tone={result.ai.used ? "purple" : "muted"}>{STATUS_TEXT[result.ai.status] ?? result.ai.status}</Tag>}
          </h2>
          <p className="mt-1 text-xs text-rpg-text">Analiso os números reais {d.kind === "weekly" ? "da semana" : "do período"}, aponto padrões e sugiro próximos passos. Nada é salvo sem você.</p>
        </div>
      </header>
      <div className="space-y-3 p-3">
        <div className="grid grid-cols-2 gap-1.5">
          {MODES.map(([m, label, icon]) => (
            <button
              key={m}
              onClick={() => onRun(m)}
              disabled={busy}
              aria-pressed={mode === m}
              className={clsx("flex items-center gap-1.5 border px-2 py-1.5 text-left text-[11.5px] font-semibold disabled:opacity-60", mode === m ? "border-rpg-gold bg-rpg-gold/15 text-rpg-gold-light" : "border-rpg-border bg-rpg-bg-2/70 text-rpg-text hover:border-rpg-gold/60")}
              style={{ borderRadius: 3 }}
            >
              <span className="text-rpg-purple" aria-hidden>
                {icon}
              </span>
              {label}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim().length < 3) return;
            onRun("analyze", q.trim());
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pergunte sobre o período…" maxLength={500} aria-label="Pergunta ao Conselheiro" className={clsx(FIELD, "text-xs")} style={{ borderRadius: 3 }} />
          <RPGButton variant="primary" type="submit" disabled={busy || q.trim().length < 3} aria-label="Enviar pergunta">
            <Send size={14} />
          </RPGButton>
        </form>

        {busy && (
          <p className="flex items-center gap-2 text-sm text-rpg-muted">
            <Loader2 size={15} className="animate-spin" aria-hidden /> Analisando seus registros…
          </p>
        )}
        {!busy && !result && (
          <p className="flex items-start gap-2 border border-dashed border-rpg-border p-2 text-xs text-rpg-muted" style={{ borderRadius: 3 }}>
            <Sparkles size={14} className="mt-0.5 shrink-0 text-rpg-purple" aria-hidden />
            <span>
              Escolha um modo. Cada item vem marcado como <strong className="text-rpg-blue">dado real</strong>, <strong className="text-rpg-purple">inferência</strong> ou <strong className="text-rpg-green">sugestão</strong>.
            </span>
          </p>
        )}

        {result && !busy && (
          <div className="space-y-3">
            <p className="text-[11px] text-rpg-muted">{result.ai.detail}</p>
            {result.items.length > 0 && (
              <ul className="space-y-1.5">
                {result.items.map((it, i) => (
                  <li key={i} className={clsx("border-l-2 bg-rpg-bg-2/70 py-1.5 pl-2 pr-1.5 text-[12.5px] text-rpg-text", KIND_TONE[it.kind])}>
                    <span className={clsx("mr-1.5 text-[9.5px] font-bold uppercase tracking-wide", KIND_TONE[it.kind])}>{KIND_LABEL[it.kind]}</span>
                    <span className="text-rpg-text">{it.text}</span>
                  </li>
                ))}
              </ul>
            )}
            {result.draft && Object.keys(result.draft).length > 0 && (
              <div className="border border-rpg-purple/50 bg-rpg-purple/10 p-2" style={{ borderRadius: 3 }}>
                <p className="text-xs font-semibold text-rpg-purple">Rascunho da IA (revise antes de manter)</p>
                <ul className="mt-1 space-y-1 text-[12px] text-rpg-text">
                  {Object.entries(result.draft).map(([k, v]) => (
                    <li key={k}>
                      <strong>{labelOf(k)}:</strong> {v}
                    </li>
                  ))}
                </ul>
                <RPGButton variant="secondary" className="mt-2" onClick={() => onInsertDraft(result.draft!)}>
                  <PenLine size={13} aria-hidden /> Inserir nas respostas vazias
                </RPGButton>
              </div>
            )}
            {result.missionSeeds.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-rpg-gold-light">Missões sugeridas</p>
                <ul className="space-y-1.5">
                  {result.missionSeeds.map((m, i) => (
                    <li key={i} className="border border-rpg-border bg-rpg-bg-2/70 p-2" style={{ borderRadius: 3 }}>
                      <p className="text-[12.5px] font-semibold text-rpg-text">{m.request}</p>
                      <p className="text-[11px] text-rpg-muted">{m.why}</p>
                      <button onClick={() => onMission(m.request)} className="mt-1 flex items-center gap-1 text-[11.5px] font-semibold text-rpg-purple hover:underline">
                        <Swords size={12} aria-hidden /> Transformar em missão
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {mode === "missions" && result.missionSeeds.length === 0 && <p className="text-xs text-rpg-muted">Nenhuma missão a sugerir: não há quedas relevantes nem metas sem próxima missão neste período.</p>}
            {mode === "plan" && result.priorities.length === 0 && <p className="text-xs text-rpg-muted">Sem prioridades a sugerir ainda: registre ações de melhoria ou aguarde mais dados.</p>}
            {result.priorities.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-rpg-gold-light">Prioridades sugeridas</p>
                <ul className="space-y-1">
                  {result.priorities.map((p, i) => (
                    <li key={i} className="flex items-center gap-2 text-[12.5px] text-rpg-text">
                      <span className="min-w-0 flex-1">{p}</span>
                      <button onClick={() => onUsePriority(p)} className="flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-rpg-green hover:underline">
                        <Plus size={11} aria-hidden /> Usar no plano
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.comparison && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[260px] text-xs">
                  <thead>
                    <tr className="text-left text-rpg-muted">
                      <th className="py-1 pr-2 font-normal">Indicador</th>
                      <th className="py-1 pr-2 text-right font-normal">Atual</th>
                      <th className="py-1 pr-2 text-right font-normal">Anterior</th>
                      <th className="py-1 text-right font-normal">Var.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.comparison.map((i) => (
                      <tr key={i.key} className="border-t border-rpg-border/60">
                        <td className="py-1 pr-2 text-rpg-text">{i.label}</td>
                        <td className="py-1 pr-2 text-right tabular-nums text-rpg-text">{fmtIndicator(i)}</td>
                        <td className="py-1 pr-2 text-right tabular-nums text-rpg-muted">{fmtIndicator({ ...i, value: i.previous })}</td>
                        <td className="py-1 text-right">
                          <Delta i={i} compact />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
