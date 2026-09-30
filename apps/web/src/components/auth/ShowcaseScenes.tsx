import { motion } from "motion/react";
import { Check, ImageIcon, Sparkles } from "lucide-react";

/**
 * Cenas animadas do painel de apresentação — uma por etapa do ciclo.
 * São ilustrações do que o LifeOS faz (conteúdo institucional da tela
 * pública), não dados de um usuário: por isso não trazem números reais.
 * Cada cena remonta ao trocar de etapa (key), então a animação sempre
 * recomeça do início quando o usuário clica numa ponta.
 */

const spring = { type: "spring" as const, stiffness: 260, damping: 20 };

/** Planejar — prioridades do dia sendo marcadas uma a uma. */
function PlanScene() {
  const items = ["Revisar metas", "3 prioridades", "Bloco de foco"];
  return (
    <div className="w-full space-y-2.5 px-2">
      {items.map((label, i) => (
        <motion.div
          key={label}
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...spring, delay: 0.1 + i * 0.15 }}
          className="flex items-center gap-2.5 rounded-xl bg-white/20 px-3 py-2"
        >
          <motion.span
            initial={{ backgroundColor: "rgba(255,255,255,0)", scale: 0.8 }}
            animate={{ backgroundColor: "rgba(255,255,255,1)", scale: 1 }}
            transition={{ delay: 0.7 + i * 0.35, duration: 0.25 }}
            className="w-5 h-5 rounded-md border-2 border-white flex items-center justify-center text-[#1e88ff]"
          >
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...spring, delay: 0.8 + i * 0.35 }}>
              <Check size={12} strokeWidth={3} />
            </motion.span>
          </motion.span>
          <span className="text-[12px] font-semibold">{label}</span>
        </motion.div>
      ))}
    </div>
  );
}

/** Executar — um cartão atravessa o Kanban de "A fazer" até "Feito". */
function ExecuteScene() {
  const cols = ["A fazer", "Fazendo", "Feito"];
  return (
    <div className="relative w-[168px] h-[120px] grid grid-cols-3 gap-1.5">
      {cols.map((c) => (
        <div key={c} className="rounded-xl bg-white/15 pt-1.5 px-1">
          <p className="text-[9px] font-bold uppercase tracking-wide text-center text-white/80">{c}</p>
          <div className="mt-1.5 h-4 rounded-md bg-white/25" />
        </div>
      ))}
      {/* Largura fixa (168px, 3 colunas de 52px + gaps de 6px): o cartão anda em pixels exatos. */}
      <motion.div
        className="absolute top-[52px] left-[3px] w-[46px] h-7 rounded-lg bg-white shadow-lg flex items-center px-1.5 gap-1"
        initial={{ x: 0 }}
        animate={{ x: [0, 58, 116] }}
        transition={{ duration: 2.2, times: [0, 0.5, 1], ease: "easeInOut", delay: 0.3 }}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[#12b76a] shrink-0" />
        <span className="h-1.5 flex-1 rounded-full bg-[#1e88ff]/40" />
      </motion.div>
    </div>
  );
}

/** Registrar — fotos do Diário caem e a "história" é escrita embaixo. */
function RecordScene() {
  return (
    <div className="w-full flex flex-col items-center gap-3">
      <div className="relative w-[140px] h-[70px]">
        {[-12, 4, 16].map((rot, i) => (
          <motion.div
            key={rot}
            initial={{ y: -40, opacity: 0, rotate: 0 }}
            animate={{ y: 0, opacity: 1, rotate: rot }}
            transition={{ ...spring, delay: i * 0.18 }}
            className="absolute top-0 w-[58px] h-[66px] rounded-lg bg-white p-1 shadow-lg"
            style={{ left: i * 40 }}
          >
            <div className="w-full h-[44px] rounded bg-gradient-to-br from-[#19d3e0] to-[#8b5cf6] flex items-center justify-center">
              <ImageIcon size={14} className="text-white/90" />
            </div>
          </motion.div>
        ))}
      </div>
      <div className="w-[150px] space-y-1.5">
        {[1, 0.8, 0.55].map((w, i) => (
          <motion.div key={i} className="h-1.5 rounded-full bg-white/85 origin-left" initial={{ scaleX: 0 }} animate={{ scaleX: w }} transition={{ delay: 0.7 + i * 0.25, duration: 0.5 }} />
        ))}
      </div>
    </div>
  );
}

/** Medir — anel do Life Score enchendo com as dimensões em barras. */
function MeasureScene() {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-3">
      <svg width={74} height={74} className="-rotate-90 shrink-0" aria-hidden>
        <circle cx={37} cy={37} r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={7} />
        <motion.circle
          cx={37}
          cy={37}
          r={r}
          fill="none"
          stroke="#fff"
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * 0.28 }}
          transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="flex items-end gap-1.5 h-[70px]">
        {[0.45, 0.7, 0.55, 0.9, 0.65].map((h, i) => (
          <motion.span key={i} className="w-2.5 rounded-t-md bg-white" style={{ opacity: 0.55 + i * 0.09 }} initial={{ height: 0 }} animate={{ height: `${h * 100}%` }} transition={{ ...spring, delay: 0.2 + i * 0.1 }} />
        ))}
      </div>
    </div>
  );
}

/** Melhorar — linha de tendência subindo e o Copilot sugerindo o ajuste. */
function ImproveScene() {
  const d = "M 6 70 C 30 66, 40 48, 62 50 S 96 26, 118 22 S 142 10, 150 8";
  return (
    <div className="relative w-[156px] h-[90px]">
      <svg width={156} height={80} viewBox="0 0 156 80" aria-hidden className="overflow-visible">
        <motion.path d={d} fill="none" stroke="#fff" strokeWidth={3.5} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.3, ease: "easeInOut" }} />
        <motion.circle cx={150} cy={8} r={6} fill="#fff" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...spring, delay: 1.2 }} />
      </svg>
      <motion.span
        initial={{ opacity: 0, y: 10, scale: 0.8 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ ...spring, delay: 1.4 }}
        className="absolute left-0 bottom-0 inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-[#7c4df0] shadow-lg"
      >
        <Sparkles size={11} /> Copilot sugere
      </motion.span>
    </div>
  );
}

export const SHOWCASE_SCENES = [PlanScene, ExecuteScene, RecordScene, MeasureScene, ImproveScene];
