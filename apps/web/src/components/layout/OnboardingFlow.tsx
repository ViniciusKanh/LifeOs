import { useState } from "react";
import { CheckCircle2, ListChecks, Repeat, Target, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useGoals } from "@/hooks/useGoals";
import { useHabits } from "@/hooks/useHabits";
import { useTasks } from "@/hooks/useTasks";
import { Button, Card, Field } from "@/components/ui/primitives";

const STEPS = [
  {
    key: "goal",
    icon: Target,
    tone: "purple" as const,
    title: "Qual é a sua primeira meta?",
    subtitle: "Uma direção maior — o resto do LifeOS gira em torno dela.",
    placeholder: "Ex.: Concluir a pós-graduação até dezembro",
  },
  {
    key: "habit",
    icon: Repeat,
    tone: "green" as const,
    title: "Escolha um hábito para acompanhar",
    subtitle: "Algo pequeno e diário é o que mais sustenta consistência.",
    placeholder: "Ex.: Beber 2L de água",
  },
  {
    key: "task",
    icon: ListChecks,
    tone: "amber" as const,
    title: "E a primeira tarefa de hoje?",
    subtitle: "Comece pequeno — dá pra editar tudo depois.",
    placeholder: "Ex.: Organizar minha semana",
  },
] as const;

const TONE_BG: Record<string, string> = {
  purple: "from-cat-purple to-brand-500",
  green: "from-cat-green to-brand-500",
  amber: "from-signal to-signal-deep",
};

/**
 * Onboarding dos primeiros minutos: só aparece pra conta realmente
 * nova (onboarding_done = 0 no banco, controlado por PATCH /auth/me).
 * Três passos rápidos e puláveis — o objetivo é a pessoa sair com
 * pelo menos uma meta, um hábito e uma tarefa reais em vez de encarar
 * um Dashboard totalmente vazio, sem travar quem prefere pular tudo.
 */
export function OnboardingFlow() {
  const { user } = useAuth();
  const { updateProfile } = useProfile();
  const { createGoal } = useGoals();
  const { createHabit } = useHabits();
  const { createTask } = useTasks();

  const [step, setStep] = useState(0);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [dismissedLocally, setDismissedLocally] = useState(false);

  if (!user || user.onboarding_done || dismissedLocally) return null;

  const finish = () => {
    setDismissedLocally(true);
    updateProfile({ onboardingDone: true });
  };

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  const handleNext = async () => {
    const trimmed = value.trim();
    if (trimmed) {
      setSaving(true);
      try {
        if (current.key === "goal") await createGoal({ title: trimmed });
        if (current.key === "habit") await createHabit({ name: trimmed });
        if (current.key === "task") await createTask({ title: trimmed });
      } finally {
        setSaving(false);
      }
    }
    setValue("");
    if (isLast) {
      finish();
    } else {
      setStep((s) => s + 1);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <Card className="w-full max-w-md p-6 md:p-7 relative my-8">
        <button onClick={finish} className="absolute top-4 right-4 text-slate" aria-label="Pular introdução">
          <X size={18} />
        </button>

        <div className="flex items-center gap-1.5 mb-5">
          {STEPS.map((s, i) => (
            <span
              key={s.key}
              className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-gradient-to-r from-brand-500 to-signal" : "bg-black/[0.08] dark:bg-white/[0.1]"}`}
            />
          ))}
        </div>

        <div className={`w-12 h-12 rounded-xl2 bg-gradient-to-br ${TONE_BG[current.tone]} text-white flex items-center justify-center mb-4`}>
          <Icon size={22} />
        </div>

        <p className="font-display font-bold text-xl tracking-tight">{current.title}</p>
        <p className="text-sm text-slate mt-1.5 mb-5">{current.subtitle}</p>

        <Field
          label=""
          placeholder={current.placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && handleNext()}
        />

        <div className="flex items-center justify-between mt-6">
          <button onClick={finish} className="text-sm text-slate hover:underline">
            Pular por agora
          </button>
          <Button onClick={handleNext} disabled={saving}>
            {saving ? "Salvando..." : isLast ? (
              <>
                <CheckCircle2 size={15} /> Concluir
              </>
            ) : (
              "Continuar"
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
