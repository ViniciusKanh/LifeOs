import type { LegalDoc } from "@/content/legal";

/** Renderiza um documento legal (seções com parágrafos, listas e tabelas) de forma legível e acessível. */
export function LegalDocument({ doc, compact = false }: { doc: LegalDoc; compact?: boolean }) {
  return (
    <article className={compact ? "space-y-5" : "space-y-8"}>
      <p className="text-[15px] leading-relaxed text-slate">{doc.summary}</p>
      {doc.sections.map((s) => (
        <section key={s.id} id={s.id} className="scroll-mt-24">
          <h2 className={`font-display font-bold tracking-tight ${compact ? "text-base" : "text-lg sm:text-xl"} mb-2.5`}>{s.title}</h2>
          {s.paragraphs?.map((p, i) => (
            <p key={i} className="text-sm leading-relaxed mb-2.5">
              {p}
            </p>
          ))}
          {s.bullets && (
            <ul className="space-y-1.5 mb-2.5">
              {s.bullets.map((b, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                  <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-[#1e88ff] shrink-0" aria-hidden />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
          {s.table && (
            <div className="overflow-x-auto rounded-xl border border-paper-border dark:border-ink-border">
              <table className="w-full text-sm">
                <thead className="bg-paper dark:bg-ink">
                  <tr>
                    {s.table.head.map((h) => (
                      <th key={h} className="text-left font-semibold px-3 py-2.5 text-xs uppercase tracking-wide text-slate">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.table.rows.map((row, i) => (
                    <tr key={i} className="border-t border-paper-border dark:border-ink-border align-top">
                      {row.map((cell, j) => (
                        <td key={j} className={`px-3 py-2.5 leading-relaxed ${j === 0 ? "font-medium min-w-[150px]" : "min-w-[180px]"}`}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </article>
  );
}
