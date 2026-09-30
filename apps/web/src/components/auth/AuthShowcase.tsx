import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BarChart3, CalendarCheck2, FolderKanban, HeartPulse, NotebookPen, Sparkles, Target } from "lucide-react";
import { LogoMark } from "./LogoMark";

/**
 * Painel de apresentação ao lado do login/cadastro, com a identidade do
 * logo: gradiente ciano → azul → violeta e o símbolo animado ao centro,
 * com o ciclo do produto orbitando em volta. Conteúdo institucional —
 * nenhum dado de usuário (a tela é pública).
 */
const CYCLE = [
  { label: "Planejar", text: "Metas, semana e prioridades do dia num só lugar.", icon: Target },
  { label: "Executar", text: "Tarefas, projetos, Kanban e Gantt conectados.", icon: FolderKanban },
  { label: "Registrar", text: "Diário com fotos, vídeos e histórias; hábitos e saúde.", icon: NotebookPen },
  { label: "Medir", text: "Life Score, Analytics e Signals com dados reais.", icon: BarChart3 },
  { label: "Melhorar", text: "Weekly Review, experimentos e Copilot com IA.", icon: Sparkles },
];

const MODULES = [
  { icon: CalendarCheck2, label: "Hoje e Agenda" },
  { icon: FolderKanban, label: "Projetos e documentos" },
  { icon: NotebookPen, label: "Diário com IA" },
  { icon: HeartPulse, label: "Saúde e hábitos" },
];

export function AuthShowcase() {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setStep((s) => (s + 1) % CYCLE.length), 2800);
    return () => clearInterval(id);
  }, [reduce]);

  const R = 150;
  const box = R * 2 + 70;
  const current = CYCLE[step];

  return (
    <div className="relative h-full min-h-[640px] overflow-hidden rounded-[32px] p-8 xl:p-10 text-white flex flex-col bg-[linear-gradient(135deg,#12c3d8_0%,#1e88ff_48%,#7c4df0_100%)] shadow-[0_35px_80px_-30px_rgba(30,136,255,0.7)]">
      <span aria-hidden className="absolute inset-0 opacity-[0.12] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:22px_22px]" />
      <motion.span aria-hidden className="absolute -left-24 -top-24 w-80 h-80 rounded-full bg-white/25 blur-[80px]" animate={{ x: [0, 40, 0], y: [0, 30, 0] }} transition={{ duration: 12, repeat: Infinity }} />
      <motion.span aria-hidden className="absolute -right-24 bottom-0 w-96 h-96 rounded-full bg-[#a78bfa]/50 blur-[90px]" animate={{ x: [0, -30, 0] }} transition={{ duration: 10, repeat: Infinity }} />

      <div className="relative">
        <p className="font-display font-extrabold text-[30px] leading-none tracking-tight">
          Life<span className="text-white/80">OS</span>
        </p>
        <p className="text-sm text-white/85 mt-1.5">Transforme sua rotina em progresso.</p>
      </div>

      <div className="relative flex-1 flex items-center justify-center my-4">
        <div className="relative" style={{ width: box, height: box }}>
          <svg className="absolute inset-0" viewBox={`0 0 ${box} ${box}`} aria-hidden>
            <circle cx={box / 2} cy={box / 2} r={R} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={1.5} strokeDasharray="3 8" />
          </svg>
          {/* Símbolo do logo animado, com halo */}
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.span aria-hidden className="absolute w-56 h-56 rounded-full bg-white/15 blur-2xl" animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 4, repeat: Infinity }} />
            <div className="relative w-44 h-44 rounded-[44px] bg-white/15 border border-white/30 backdrop-blur-md flex items-center justify-center shadow-[0_20px_50px_-15px_rgba(0,0,0,0.35)]">
              <LogoMark size={128} />
            </div>
          </div>

          {CYCLE.map((c, i) => {
            const angle = (i / CYCLE.length) * Math.PI * 2 - Math.PI / 2;
            const x = box / 2 + Math.cos(angle) * R;
            const y = box / 2 + Math.sin(angle) * R;
            const active = i === step;
            const Icon = c.icon;
            return (
              <button
                key={c.label}
                type="button"
                onClick={() => setStep(i)}
                aria-label={c.label}
                aria-pressed={active}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1"
                style={{ left: x, top: y }}
              >
                <motion.span
                  animate={{ scale: active ? 1.15 : 1, backgroundColor: active ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.16)", color: active ? "#1e88ff" : "#ffffff" }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="w-12 h-12 rounded-2xl flex items-center justify-center border border-white/35 backdrop-blur shadow-lg"
                >
                  <Icon size={20} />
                </motion.span>
                <span className={`text-[11px] font-semibold ${active ? "text-white" : "text-white/75"}`}>{c.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative min-h-[64px] text-center">
        <AnimatePresence mode="wait">
          <motion.div key={current.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/70">Passo {step + 1} de 5 · {current.label}</p>
            <p className="text-sm font-medium mt-1.5">{current.text}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <ul className="relative grid grid-cols-2 gap-2 mt-5">
        {MODULES.map(({ icon: Icon, label }, i) => (
          <motion.li
            key={label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + i * 0.08 }}
            className="flex items-center gap-2 rounded-xl bg-white/15 border border-white/25 backdrop-blur px-3 py-2.5 text-xs font-medium"
          >
            <Icon size={15} className="shrink-0" /> {label}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
