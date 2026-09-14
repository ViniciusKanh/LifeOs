import { useState } from "react";
import { BookOpen, ClipboardList, Flame, Library, ListChecks, Lock, Plus, Rocket, Target, Timer, Trash2, Trophy, X } from "lucide-react";
import { useAchievements } from "@/hooks/useAchievements";
import { useCustomAchievements } from "@/hooks/useCustomAchievements";
import { Button, Card, EmptyState, Field } from "@/components/ui/primitives";
import type { Achievement, CustomAchievement } from "@/types";

const ICONS: Record<string, typeof Trophy> = {
  ListChecks,
  Rocket,
  Flame,
  BookOpen,
  Library,
  Timer,
  ClipboardList,
  Target,
  Trophy,
};

function AchievementCard({ achievement }: { achievement: Achievement }) {
  const Icon = (achievement.icon && ICONS[achievement.icon]) || Trophy;
  const unlocked = !!achievement.unlockedAt;

  return (
    <Card className={`p-5 flex flex-col gap-3 ${unlocked ? "" : "opacity-70"}`}>
      <div className="flex items-start justify-between">
        <span
          className={`w-11 h-11 rounded-xl2 flex items-center justify-center ${
            unlocked ? "bg-gradient-to-br from-brand-500 to-signal text-white shadow-glow-brand" : "bg-black/[0.04] dark:bg-white/[0.06] text-slate"
          }`}
        >
          {unlocked ? <Icon size={20} /> : <Lock size={18} />}
        </span>
        {unlocked && (
          <span className="text-[10px] font-semibold text-brand-700 dark:text-brand-100 bg-brand-50 dark:bg-brand-700/20 rounded-full px-2 py-1">
            Destravada
          </span>
        )}
      </div>
      <div>
        <p className="font-display font-semibold text-base">{achievement.title}</p>
        <p className="text-xs text-slate mt-0.5">{achievement.description}</p>
      </div>
      {!unlocked && achievement.threshold ? (
        <div>
          <div className="h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-500 to-signal"
              style={{ width: `${achievement.progress}%` }}
            />
          </div>
          <p className="text-[11px] text-slate mt-1.5">{achievement.progress}% do caminho</p>
        </div>
      ) : unlocked ? (
        <p className="text-[11px] text-slate">
          Desde {new Date(achievement.unlockedAt!).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).replace(".", "")}
        </p>
      ) : null}
    </Card>
  );
}

/** Card de um troféu customizado — mesmo visual do catálogo fixo, mas com ícone livre (emoji) e botão de excluir. */
function CustomTrophyCard({ trophy, onDelete }: { trophy: CustomAchievement; onDelete: () => void }) {
  const unlocked = !!trophy.unlockedAt;
  return (
    <Card className={`p-5 flex flex-col gap-3 relative group ${unlocked ? "" : "opacity-70"}`}>
      <button
        onClick={onDelete}
        aria-label={`Excluir troféu ${trophy.title}`}
        className="absolute top-3 right-3 text-slate/50 hover:text-drop transition-colors opacity-0 group-hover:opacity-100"
      >
        <Trash2 size={14} />
      </button>
      <div className="flex items-start justify-between pr-6">
        <span
          className={`w-11 h-11 rounded-xl2 flex items-center justify-center text-xl ${
            unlocked ? "bg-gradient-to-br from-brand-500 to-signal shadow-glow-brand" : "bg-black/[0.04] dark:bg-white/[0.06]"
          }`}
        >
          {unlocked ? trophy.icon : <Lock size={18} className="text-slate" />}
        </span>
        {unlocked && (
          <span className="text-[10px] font-semibold text-brand-700 dark:text-brand-100 bg-brand-50 dark:bg-brand-700/20 rounded-full px-2 py-1">
            Destravada
          </span>
        )}
      </div>
      <div>
        <p className="font-display font-semibold text-base">{trophy.title}</p>
        {trophy.description && <p className="text-xs text-slate mt-0.5">{trophy.description}</p>}
      </div>
      {!unlocked ? (
        <div>
          <div className="h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-signal" style={{ width: `${trophy.progress}%` }} />
          </div>
          <p className="text-[11px] text-slate mt-1.5">{trophy.progress}% do caminho</p>
        </div>
      ) : (
        <p className="text-[11px] text-slate">
          Desde {new Date(trophy.unlockedAt!).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).replace(".", "")}
        </p>
      )}
    </Card>
  );
}

const ICON_CHOICES = ["🏆", "🔥", "⭐", "💎", "🚀", "🎯", "⚡", "🥇", "📚", "💪"];

function CreateTrophyModal({
  metrics,
  onClose,
  onCreate,
}: {
  metrics: { value: string; label: string }[];
  onClose: () => void;
  onCreate: (input: { title: string; description?: string; icon: string; metric: string; threshold: number }) => Promise<unknown>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("🏆");
  const [metric, setMetric] = useState(metrics[0]?.value ?? "tasks_completed_in_day");
  const [threshold, setThreshold] = useState("5");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const thresholdNum = Number(threshold);
    if (!title.trim() || !Number.isFinite(thresholdNum) || thresholdNum <= 0) return;
    setSaving(true);
    setError(null);
    try {
      await onCreate({ title: title.trim(), description: description.trim() || undefined, icon, metric, threshold: Math.round(thresholdNum) });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar o troféu.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl p-5 bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold">Novo troféu</p>
          <button onClick={onClose} className="text-slate">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">
          <Field label="Nome do desafio" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Dia produtivo" />
          <Field
            label="Descrição (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: Conclua 5 tarefas no mesmo dia"
          />
          <div>
            <label className="text-xs text-slate">Ícone</label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {ICON_CHOICES.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setIcon(opt)}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg border ${
                    icon === opt ? "border-brand-500 bg-brand-50 dark:bg-brand-700/20" : "border-paper-border dark:border-ink-border"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-slate">O que precisa acontecer</label>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              className="w-full mt-1.5 rounded-xl px-3 py-2.5 text-sm bg-paper dark:bg-ink border border-paper-border dark:border-ink-border outline-none"
            >
              {metrics.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <Field
            label="Limite para destravar"
            type="number"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            placeholder="5"
          />
          {error && <p className="text-xs text-drop bg-drop/10 rounded-lg px-3 py-2.5">{error}</p>}
          <Button onClick={handleSubmit} disabled={saving || !title.trim()} className="w-full">
            {saving ? "Criando..." : "Criar troféu"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ConquistasPage() {
  const { achievements, unlocked, isLoading } = useAchievements();
  const { trophies, unlockedCount, metrics, isLoading: trophiesLoading, create, remove } = useCustomAchievements();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-5xl mx-auto space-y-8">
      <div>
        <p className="font-display font-bold text-2xl tracking-tight">Conquistas</p>
        <p className="text-sm text-slate mt-1">
          {unlocked.length} de {achievements.length} destravadas — sempre calculadas a partir dos seus dados reais, nunca marcadas à mão.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate">Carregando…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {achievements.map((a) => (
            <AchievementCard key={a.id} achievement={a} />
          ))}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="font-display font-semibold text-lg">Meus troféus</p>
            <p className="text-xs text-slate mt-0.5">
              {trophies.length > 0
                ? `${unlockedCount} de ${trophies.length} destravados — desafios que você mesmo criou.`
                : "Cadastre seus próprios desafios, como um troféu de PlayStation ou Xbox."}
            </p>
          </div>
          <Button onClick={() => setModalOpen(true)}>
            <Plus size={15} /> Novo troféu
          </Button>
        </div>

        {trophiesLoading ? (
          <p className="text-sm text-slate">Carregando…</p>
        ) : trophies.length === 0 ? (
          <EmptyState
            title="Nenhum troféu customizado ainda"
            description='Crie um desafio como "concluir 5 tarefas no dia" ou "30 minutos de foco no dia" e ele destrava sozinho quando você bater a meta.'
            ctaLabel="Criar troféu"
            onCta={() => setModalOpen(true)}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {trophies.map((t) => (
              <CustomTrophyCard key={t.id} trophy={t} onDelete={() => remove(t.id)} />
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <CreateTrophyModal metrics={metrics} onClose={() => setModalOpen(false)} onCreate={(input) => create(input)} />
      )}
    </div>
  );
}
