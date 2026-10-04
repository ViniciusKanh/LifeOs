import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Map, Repeat, SquareCheckBig } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RPGButton, RPGPanel } from "@/components/rpg";
import type { BuildOverview, PlanAction } from "@/services/buildService";

/** Plano de evolução (até 3 blocos): melhora os maiores gaps e mantém o ponto forte. */
export function CharacterEvolutionPlan({ plan, onApply }: { plan: BuildOverview["plan"]; onApply: () => void }) {
  const hasActions = plan.some((p) => p.actions.some((a) => a.item.kind !== "open"));
  return (
    <RPGPanel title="Plano de evolução" icon={<Map size={15} />} variant="gold">
      {plan.length === 0 ? (
        <p className="text-sm text-rpg-muted">Sua build está alinhada à meta. Continue registrando para manter o ritmo.</p>
      ) : (
        <ol className="grid gap-3 md:grid-cols-3">
          {plan.map((p, i) => (
            <li key={p.title} className="border border-rpg-border/70 bg-rpg-bg-2/60 p-3" style={{ borderRadius: 3 }}>
              <p className="font-pixel text-[10px] uppercase tracking-[0.12em] text-rpg-gold">
                {i + 1}. {p.kind === "maintain" ? "Manter" : "Melhorar"}
              </p>
              <p className="mt-1 font-semibold text-sm text-rpg-text">{p.title}</p>
              <ul className="mt-2 space-y-1 text-xs text-rpg-text/85 list-disc pl-4">
                {p.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
      {hasActions && (
        <RPGButton variant="gold" className="mt-3 w-full sm:w-auto" onClick={onApply}>
          Aplicar plano à jornada <ArrowRight size={14} aria-hidden />
        </RPGButton>
      )}
    </RPGPanel>
  );
}

const describe = (a: PlanAction) =>
  a.item.kind === "habit" ? `Hábito · ${a.item.frequency === "daily" ? "diário" : `${a.item.targetCount}x por semana`}` : a.item.kind === "task" ? `Tarefa · prioridade ${a.item.priority}` : `Abrir ${a.item.path}`;

/**
 * Preview do plano: nada é criado sem marcação individual. Itens "open"
 * são só atalhos de navegação e nunca entram no envio.
 */
export function ApplyPlanModal({
  open,
  onClose,
  plan,
  applying,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  plan: BuildOverview["plan"];
  applying: boolean;
  onConfirm: (ids: string[]) => Promise<void>;
}) {
  const actions = plan.flatMap((p) => p.actions);
  const creatable = actions.filter((a) => a.item.kind !== "open");
  const links = actions.filter((a): a is PlanAction & { item: { kind: "open"; path: string } } => a.item.kind === "open");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open]);
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Aplicar plano à jornada"
      footer={
        <>
          <RPGButton variant="secondary" onClick={onClose}>
            Cancelar
          </RPGButton>
          <RPGButton variant="gold" disabled={selected.size === 0 || applying} onClick={() => void onConfirm([...selected])}>
            {applying ? "Criando…" : `Criar ${selected.size} ${selected.size === 1 ? "item" : "itens"}`}
          </RPGButton>
        </>
      }
    >
      <p className="text-sm text-rpg-muted">Marque o que deve virar hábito ou tarefa. Itens iguais aos que você já tem são ignorados.</p>
      <ul className="mt-3 space-y-2">
        {creatable.map((a) => (
          <li key={a.id}>
            <label className="flex items-start gap-3 border border-rpg-border/70 bg-rpg-bg-2/60 p-3 cursor-pointer has-[:checked]:border-rpg-gold" style={{ borderRadius: 3 }}>
              <input type="checkbox" className="mt-1 accent-rpg-gold" checked={selected.has(a.id)} onChange={() => toggle(a.id)} />
              {a.item.kind === "habit" ? <Repeat size={16} className="text-rpg-green shrink-0 mt-0.5" aria-hidden /> : <SquareCheckBig size={16} className="text-rpg-blue shrink-0 mt-0.5" aria-hidden />}
              <span className="min-w-0">
                <span className="block text-sm text-rpg-text">{a.label}</span>
                <span className="block text-[11px] text-rpg-muted">{describe(a)}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {links.length > 0 && (
        <div className="mt-4">
          <p className="font-pixel text-[10px] uppercase tracking-[0.12em] text-rpg-gold">Atalhos (só navegação)</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {links.map((a) => (
              <li key={a.id}>
                <Link to={a.item.path} className="inline-flex items-center gap-1 text-xs text-rpg-blue underline-offset-2 hover:underline" onClick={onClose}>
                  {a.label} <ArrowRight size={12} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
