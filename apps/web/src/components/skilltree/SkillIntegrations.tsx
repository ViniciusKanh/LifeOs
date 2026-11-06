import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ScrollText, Sparkles } from "lucide-react";
import { RPGButton } from "@/components/rpg";
import { Modal } from "@/components/ui/Modal";
import { useSkillEffects } from "@/hooks/useSkillTree";
import { taskService } from "@/services/taskService";
import { planningHubService } from "@/services/planningHubService";
import { errMsg } from "./skillShared";

/**
 * Pontos de integração da Árvore com outros módulos. Cada um só aparece quando o
 * efeito correspondente está ativo (lista vinda do servidor) — sem efeito, nada muda.
 */

/** Hoje → Cronômetro de foco: rituais desbloqueados viram atalhos de um clique. */
export function SkillFocusPresets({ onPick }: { onPick: (p: { mode: "pomodoro" | "block" | "free"; minutes: number; label: string }) => void }) {
  const { data } = useSkillEffects();
  const list = data?.focusPresets ?? [];
  if (!list.length) return null;
  return (
    <div>
      <p className="mb-1 flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide text-rpg-gold-light">
        <Sparkles size={11} aria-hidden /> Rituais da Árvore
      </p>
      <div className="flex flex-wrap gap-1.5">
        {list.map((p) => (
          <button key={p.key} type="button" onClick={() => onPick(p)} title={p.hint} className="min-h-[32px] border border-rpg-gold/60 bg-rpg-gold/10 px-2 text-[11px] font-semibold text-rpg-gold-light hover:bg-rpg-gold/20" style={{ borderRadius: 3 }}>
            {p.label} · {p.minutes}′
          </button>
        ))}
      </div>
    </div>
  );
}

/** Missões → modelos de missão desbloqueados (cria pela rota oficial de tarefas). */
export function SkillMissionTemplatesButton({ notify }: { notify: (m: string, tone?: "success" | "error") => void }) {
  const { data } = useSkillEffects();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const list = data?.missionTemplates ?? [];
  if (!list.length) return null;
  const create = async (m: (typeof list)[number]) => {
    setBusy(m.key);
    try {
      const t = await taskService.create({ title: m.title, description: m.description, priority: m.priority, difficulty: m.difficulty, estimateMinutes: m.estimateMinutes, status: "A Fazer" });
      if (m.steps.length) await planningHubService.addSubtasks(t.id, m.steps);
      for (const k of [["tasks"], ["missions3"]]) void qc.invalidateQueries({ queryKey: k });
      notify(`Missão criada a partir do modelo: “${m.title}”.`);
      setOpen(false);
    } catch (e) {
      notify(errMsg(e, "Não consegui criar a missão."), "error");
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <RPGButton variant="secondary" onClick={() => setOpen(true)} title="Modelos liberados pela Árvore de Habilidades">
        <ScrollText size={15} aria-hidden /> Modelos ({list.length})
      </RPGButton>
      <Modal open={open} onClose={() => setOpen(false)} title="Modelos de missão da Árvore" size="lg">
        <ul className="grid gap-2 sm:grid-cols-2">
          {list.map((m) => (
            <li key={m.key} className="flex flex-col border border-rpg-border bg-rpg-bg-2/70 p-2" style={{ borderRadius: 3 }}>
              <p className="text-sm font-bold text-rpg-text">{m.title}</p>
              <p className="text-[11px] text-rpg-muted">{m.description}</p>
              <p className="mt-1 text-[10.5px] text-rpg-muted">
                {m.steps.length} etapas · {m.estimateMinutes} min · {m.priority} · de {m.skill}
              </p>
              <RPGButton variant="primary" className="mt-2" disabled={!!busy} onClick={() => void create(m)}>
                {busy === m.key ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null} Criar missão
              </RPGButton>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-rpg-muted">
          Mais modelos surgem ao evoluir a <Link to="/arvore-habilidades" className="text-rpg-gold-light hover:underline">Árvore de Habilidades</Link>. A recompensa da missão continua sendo a do motor oficial.
        </p>
      </Modal>
    </>
  );
}

/** Diário → perguntas extras desbloqueadas (somadas às inspirações padrão). */
export function useSkillDiaryPrompts(): string[] {
  const { data } = useSkillEffects();
  return useMemo(() => [...new Set((data?.diaryPrompts ?? []).flatMap((p) => p.prompts))], [data]);
}
