import { useState } from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import type { EduSeries } from "@/services/cityService";
import { R } from "../CityKit";
import { fmtInt, fmtPct } from "../civic/CivicKit";

/**
 * Peças visuais da Educação (Escola Aberta): barra de ocupação de vagas, linha de modalidade
 * expansível com as séries e chips de contagem. Só apresentação — as contas vêm do servidor.
 */

/** Cor pela ocupação: quase lotado (≥ 97%) em laranja, folga grande (< 75%) em verde-água. */
const occTone = (o: number | null) => (o == null ? "bg-rpg-muted" : o >= 97 ? "bg-orange-500" : o >= 85 ? "bg-purple-500" : o >= 75 ? "bg-indigo-400" : "bg-teal-400");

/** Barra vagas × atendidos: preenchido = estudantes atendidos, vazio = vagas livres. */
export function OccupancyBar({ vagas, atendimentos, ocupacao, compact }: { vagas: number; atendimentos: number; ocupacao: number | null; compact?: boolean }) {
  const w = vagas > 0 ? Math.min(100, (atendimentos / vagas) * 100) : 0;
  return (
    <div className={clsx("relative w-full overflow-hidden border border-rpg-border bg-rpg-bg-2", compact ? "h-2" : "h-3")} style={R} role="img" aria-label={`${fmtInt(atendimentos)} atendidos de ${fmtInt(vagas)} vagas (${fmtPct(ocupacao)})`}>
      <div className={clsx("h-full transition-[width] duration-500", occTone(ocupacao))} style={{ width: `${w}%` }} />
    </div>
  );
}

export function OccupancyLegend() {
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-rpg-muted">
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-3 bg-teal-400" aria-hidden /> folga (&lt; 75%)
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-3 bg-indigo-400" aria-hidden /> 75–85%
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-3 bg-purple-500" aria-hidden /> 85–97%
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-3 bg-orange-500" aria-hidden /> quase lotado (≥ 97%)
      </span>
    </p>
  );
}

/** Tabela de séries que vira lista de cartões no celular. */
export function SeriesTable({ series, caption }: { series: EduSeries[]; caption: string }) {
  if (!series.length) return <p className="text-sm text-rpg-muted">Sem séries publicadas.</p>;
  return (
    <>
      <table className="hidden w-full text-sm md:table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-rpg-border text-left font-pixel text-[10px] uppercase text-rpg-muted">
            <th className="py-1.5 pr-2 font-normal">Série</th>
            <th className="px-2 text-right font-normal">Turmas</th>
            <th className="px-2 text-right font-normal">Vagas</th>
            <th className="px-2 text-right font-normal">Atendidos</th>
            <th className="px-2 text-right font-normal">Livres</th>
            <th className="w-[28%] pl-2 font-normal">Ocupação</th>
          </tr>
        </thead>
        <tbody>
          {series.map((s) => (
            <tr key={s.label} className="border-b border-rpg-border/50">
              <td className="py-1.5 pr-2 text-rpg-text">{s.label}</td>
              <td className="px-2 text-right tabular-nums text-rpg-text/85">{fmtInt(s.turmas)}</td>
              <td className="px-2 text-right tabular-nums text-rpg-text/85">{fmtInt(s.vagas)}</td>
              <td className="px-2 text-right tabular-nums text-rpg-text/85">{fmtInt(s.atendimentos)}</td>
              <td className={clsx("px-2 text-right tabular-nums", s.remanescentes > 0 ? "text-teal-300" : "text-rpg-muted")}>{fmtInt(s.remanescentes)}</td>
              <td className="pl-2">
                <div className="flex items-center gap-2">
                  <OccupancyBar vagas={s.vagas} atendimentos={s.atendimentos} ocupacao={s.ocupacao} compact />
                  <span className="w-12 shrink-0 text-right text-xs tabular-nums text-rpg-text/85">{fmtPct(s.ocupacao, 0)}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="space-y-2 md:hidden" aria-label={caption}>
        {series.map((s) => (
          <li key={s.label} className="border border-rpg-border bg-rpg-bg-2/60 p-2" style={R}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-sm text-rpg-text">{s.label}</span>
              <span className="shrink-0 text-xs tabular-nums text-rpg-text/85">{fmtPct(s.ocupacao, 0)}</span>
            </div>
            <div className="my-1.5">
              <OccupancyBar vagas={s.vagas} atendimentos={s.atendimentos} ocupacao={s.ocupacao} compact />
            </div>
            <p className="text-[11px] text-rpg-muted">
              {fmtInt(s.atendimentos)} atendidos · {fmtInt(s.vagas)} vagas · <span className={s.remanescentes > 0 ? "text-teal-300" : ""}>{fmtInt(s.remanescentes)} livres</span> · {fmtInt(s.turmas)} turmas
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Modalidade com totais e barra; abre a tabela de séries. */
export function ModalityRow({ m, defaultOpen = false }: { m: EduSeries & { series: EduSeries[] }; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <li className="border-2 border-rpg-border bg-rpg-panel/60" style={R}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full p-2.5 text-left hover:bg-rpg-panel-hover" aria-expanded={open}>
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-rpg text-sm font-bold text-rpg-text" title={m.label}>
            {m.label}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-rpg-text/85">{fmtPct(m.ocupacao, 1)}</span>
          <ChevronDown size={15} className={clsx("shrink-0 text-rpg-muted transition-transform", open && "rotate-180")} aria-hidden />
        </div>
        <div className="my-1.5">
          <OccupancyBar vagas={m.vagas} atendimentos={m.atendimentos} ocupacao={m.ocupacao} />
        </div>
        <p className="text-[11px] text-rpg-muted">
          {fmtInt(m.atendimentos)} atendidos de {fmtInt(m.vagas)} vagas · <span className={m.remanescentes > 0 ? "text-teal-300" : ""}>{fmtInt(m.remanescentes)} livres</span> · {fmtInt(m.turmas)} turmas
          {m.mediaTurma != null && ` · ${fmtInt(m.mediaTurma)} por turma`}
        </p>
      </button>
      {open && (
        <div className="border-t border-rpg-border p-2.5">
          <SeriesTable series={m.series} caption={`Séries de ${m.label}`} />
        </div>
      )}
    </li>
  );
}

/** Nuvem de contagens (ambientes, cargos). */
export function CountChips({ items, max = 16 }: { items: Array<{ label: string; count: number }>; max?: number }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.slice(0, max).map((it) => (
        <li key={it.label} className="inline-flex items-center gap-1.5 border border-rpg-border bg-rpg-bg-2/70 px-2 py-1 text-xs" style={R}>
          <span className="text-rpg-text/90">{it.label}</span>
          <span className="font-pixel text-[10px] tabular-nums text-rpg-gold-light">{fmtInt(it.count)}</span>
        </li>
      ))}
    </ul>
  );
}
