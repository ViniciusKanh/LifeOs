import { Link } from "react-router-dom";
import { CheckSquare, Home, Moon, NotebookPen, Pin, ScrollText, Sparkles } from "lucide-react";
import { RPGPanel } from "@/components/rpg";
import { rpgButtonClass } from "@/components/rpg/RPGButton";
import type { TavernSummary } from "@/services/tavernService";
import { fmtDay, fmtNum } from "./tavernFormat";

/** Passo 5 — Encerramento: resumo do que foi feito no ritual, só com dados reais. */
export function TavernRestStep({ data, journalClosed }: { data: TavernSummary; journalClosed: boolean }) {
  const { balance: b, mission } = data;
  // Profecia de maior confiança entre as que têm probabilidade.
  const best = [...data.prophecy.prophecies].filter((p) => p.probability !== null).sort((x, y) => y.confidence - x.confidence)[0] ?? null;
  const pinned = mission.pinned[0] ?? null;
  const items = [
    { icon: Sparkles, text: `${fmtNum(b.xp.today)} XP e ${fmtNum(b.coins.today)} moedas hoje` },
    { icon: CheckSquare, text: `${b.missions.count} ${b.missions.count === 1 ? "missão concluída" : "missões concluídas"}${b.habits.total ? ` · ${b.habits.done}/${b.habits.total} hábitos` : ""}` },
    { icon: NotebookPen, text: journalClosed ? "Diário de hoje fechado" : "Diário de hoje ainda sem o “O que levo para amanhã”" },
    { icon: ScrollText, text: best ? `${best.targetLabel}: ${Math.round((best.probability ?? 0) * 100)}% de chance amanhã (inferência)` : "Sem profecia para amanhã" },
    { icon: Pin, text: pinned ? `Missão principal de amanhã: ${pinned.title}` : "Nenhuma missão principal fixada para amanhã" },
  ];
  return (
    <RPGPanel variant="gold" className="text-center" bodyClassName="px-4 py-8 sm:px-8">
      <span className="mx-auto inline-flex h-14 w-14 items-center justify-center border-2 border-rpg-gold bg-rpg-bg text-rpg-gold-light" style={{ borderRadius: 3 }} aria-hidden>
        <Moon size={26} />
      </span>
      <h2 className="rpg-title mt-4 text-2xl font-bold sm:text-3xl">Bom descanso, herói</h2>
      <p className="mt-1 text-sm text-rpg-muted">O dia está registrado. Amanhã, {fmtDay(data.tomorrow)}, a jornada continua.</p>
      <ul className="mx-auto mt-5 max-w-md space-y-2 text-left">
        {items.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-2.5 border border-rpg-border bg-rpg-bg/60 px-3 py-2 text-sm text-rpg-text" style={{ borderRadius: 3 }}>
            <Icon size={15} className="mt-0.5 shrink-0 text-rpg-gold" aria-hidden />
            <span className="min-w-0">{text}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link to="/dashboard" className={rpgButtonClass("primary")}>
          <Home size={14} aria-hidden /> Voltar ao início
        </Link>
        <Link to={`/diario?date=${data.today}`} className={rpgButtonClass("secondary")}>
          <NotebookPen size={14} aria-hidden /> Abrir o Diário
        </Link>
      </div>
    </RPGPanel>
  );
}
