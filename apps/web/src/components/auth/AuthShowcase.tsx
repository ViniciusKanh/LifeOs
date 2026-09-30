import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BarChart3, CalendarCheck2, FolderKanban, HeartPulse, NotebookPen, Sparkles, Target } from "lucide-react";
import { LogoMark } from "./LogoMark";
import { SHOWCASE_SCENES } from "./ShowcaseScenes";

/**
 * Painel de apresentação ao lado do login/cadastro, com a identidade do
 * logo: gradiente ciano → azul → violeta e o símbolo animado ao centro,
 * com o ciclo do produto orbitando em volta. Conteúdo institucional —
 * nenhum dado de usuário (a tela é pública).
 */
// Cada etapa tem a sua cena animada e um insight diferente sobre o app.
const CYCLE = [
  { label: "Planejar", insight: "O LifeOS sugere o próximo melhor passo do dia a partir de prazo, prioridade e esforço.", icon: Target },
  { label: "Executar", insight: "Kanban, Gantt e documentos no mesmo projeto — anexos das tarefas viram os documentos dele.", icon: FolderKanban },
  { label: "Registrar", insight: "Cada foto do Diário guarda a sua história, e o Gemini organiza o dia por temas.", icon: NotebookPen },
  { label: "Medir", insight: "O Life Score usa só dados reais: um módulo que você não usa nunca derruba a sua nota.", icon: BarChart3 },
  { label: "Melhorar", insight: "Weekly Review e Experimentos mostram, com dados, o que realmente funciona para você.", icon: Sparkles },
];

const INTRO_MS = 3200;
const STEP_MS = 4200;
const PAUSE_AFTER_CLICK_MS = 12000;

const MODULES = [
  { icon: CalendarCheck2, label: "Hoje e Agenda" },
  { icon: FolderKanban, label: "Projetos e documentos" },
  { icon: NotebookPen, label: "Diário com IA" },
  { icon: HeartPulse, label: "Saúde e hábitos" },
];

export function AuthShowcase() {
  const reduce = useReducedMotion();
  // -1 = abertura com o símbolo do logo; depois percorre as 5 etapas.
  const [step, setStep] = useState(reduce ? 0 : -1);
  // Incrementa a cada clique: remonta a cena mesmo clicando na mesma etapa.
  const [replay, setReplay] = useState(0);
  // Depois de um clique, o ciclo automático espera um pouco para o usuário ler.
  const pausedUntil = useRef(0);

  useEffect(() => {
    if (reduce) return;
    const base = step === -1 ? INTRO_MS : STEP_MS;
    const wait = Math.max(pausedUntil.current - Date.now(), base);
    const id = setTimeout(() => setStep((s) => (s + 1) % CYCLE.length), wait);
    return () => clearTimeout(id);
  }, [step, replay, reduce]);

  const choose = (i: number) => {
    pausedUntil.current = Date.now() + PAUSE_AFTER_CLICK_MS;
    setStep(i);
    setReplay((n) => n + 1);
  };

  const R = 150;
  const box = R * 2 + 70;
  const current = step >= 0 ? CYCLE[step] : null;
  const Scene = step >= 0 ? SHOWCASE_SCENES[step] : null;

  return (
    <div className="relative h-full min-h-[640px] overflow-hidden rounded-[32px] p-8 xl:p-10 text-white flex flex-col bg-[linear-gradient(135deg,#12c3d8_0%,#1e88ff_48%,#7c4df0_100%)] shadow-[0_35px_80px_-30px_rgba(30,136,255,0.7)]">
      <span aria-hidden className="absolute inset-0 opacity-[0.12] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:22px_22px]" />
      <motion.span aria-hidden className="absolute -left-24 -top-24 w-80 h-80 rounded-full bg-white/25 blur-[80px]" animate={{ x: [0, 40, 0], y: [0, 30, 0] }} transition={{ duration: 12, repeat: Infinity }} />
      <motion.span aria-hidden className="absolute -right-24 bottom-0 w-96 h-96 rounded-full bg-[#a78bfa]/50 blur-[90px]" animate={{ x: [0, -30, 0] }} transition={{ duration: 10, repeat: Infinity }} />

      <div className="relative flex items-center gap-3">
        <LogoMark size={46} loop={false} />
        <div>
          <p className="font-display font-extrabold text-[30px] leading-none tracking-tight">
            Life<span className="text-white/80">OS</span>
          </p>
          <p className="text-sm text-white/85 mt-1">Transforme sua rotina em progresso.</p>
        </div>
      </div>

      <div className="relative flex-1 flex items-center justify-center my-4">
        <div className="relative" style={{ width: box, height: box }}>
          <svg className="absolute inset-0" viewBox={`0 0 ${box} ${box}`} aria-hidden>
            <circle cx={box / 2} cy={box / 2} r={R} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={1.5} strokeDasharray="3 8" />
          </svg>
          {/* Símbolo do logo animado, com halo */}
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.span aria-hidden className="absolute w-56 h-56 rounded-full bg-white/15 blur-2xl" animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 4, repeat: Infinity }} />
            <div className="relative w-48 h-48 rounded-[44px] bg-white/15 border border-white/30 backdrop-blur-md flex items-center justify-center shadow-[0_20px_50px_-15px_rgba(0,0,0,0.35)] overflow-hidden px-3">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${step}-${replay}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.25 }}
                  className="w-full flex items-center justify-center"
                >
                  {Scene ? <Scene /> : <LogoMark size={132} loop={false} />}
                </motion.div>
              </AnimatePresence>
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
                onClick={() => choose(i)}
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

      <div className="relative min-h-[92px]">
        <AnimatePresence mode="wait">
          {current ? (
            <motion.div
              key={`${current.label}-${replay}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="flex items-start gap-3 rounded-2xl bg-white/15 border border-white/25 backdrop-blur px-4 py-3.5"
            >
              <span className="w-9 h-9 rounded-xl bg-white text-[#1e88ff] flex items-center justify-center shrink-0">
                <current.icon size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/80 font-semibold">
                  Insight · {current.label} ({step + 1}/5)
                </p>
                <p className="text-sm font-medium leading-snug mt-1">{current.insight}</p>
              </div>
            </motion.div>
          ) : (
            <motion.p key="intro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center text-sm text-white/90 pt-4">
              Clique em uma etapa do ciclo para ver como o LifeOS ajuda.
            </motion.p>
          )}
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
