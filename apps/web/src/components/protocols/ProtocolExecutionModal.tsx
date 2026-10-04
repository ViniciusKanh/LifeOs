import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import clsx from "clsx";
import { Modal } from "@/components/ui/Modal";
import { RPGBadge, RPGButton } from "@/components/rpg";
import { rpgFieldClass } from "@/components/rpg/rpgAssets";
import { protocolsService, type ActionMode, type Protocol, type ProtocolRun, type StepPreview } from "@/services/protocolsService";
import { newRequestId } from "@/utils/requestId";
import { MODE_UI } from "@/utils/protocolDisplay";

const GROUPS: Array<{ mode: ActionMode; title: string }> = [
  { mode: "auto", title: "Automáticas" },
  { mode: "suggested", title: "Sugeridas" },
  { mode: "manual", title: "Manuais" },
];

type TaskRef = { id: string; title: string; priority?: string };
const asTasks = (v: unknown): TaskRef[] => (Array.isArray(v) ? v.filter((t): t is TaskRef => !!t && typeof t === "object" && "id" in t && "title" in t) : []);

/** Detalhe do que a ação vai mudar — o usuário vê antes de confirmar. */
function StepDetails({ step, taskId, onTask }: { step: StepPreview; taskId: string | null; onTask: (id: string) => void }) {
  const d = step.details;
  if (step.actionType === "SET_DAILY_PRIORITY") {
    const candidates = asTasks(d.candidates);
    if (candidates.length === 0) return null;
    return (
      <label className="mt-2 block">
        <span className="text-[11px] text-rpg-muted">Missão principal de hoje</span>
        <select className={clsx(rpgFieldClass, "mt-1")} style={{ borderRadius: 3 }} value={taskId ?? ""} onChange={(e) => onTask(e.target.value)}>
          {candidates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title} {t.priority ? `· ${t.priority}` : ""}
            </option>
          ))}
        </select>
      </label>
    );
  }
  const tasks = asTasks(d.tasks);
  if (tasks.length > 0)
    return (
      <div className="mt-1.5 text-[11px] text-rpg-muted">
        {typeof d.before === "number" && typeof d.after === "number" && (
          <p>
            Carga do dia: {d.before}% → {d.after}%
          </p>
        )}
        <p>Vai para amanhã: {tasks.map((t) => t.title).join(", ")}</p>
      </div>
    );
  if (Array.isArray(d.items) && d.items.length > 0)
    return (
      <ul className="mt-1.5 list-disc pl-4 text-[11px] text-rpg-muted">
        {(d.items as string[]).map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    );
  return null;
}

const STATUS_ICON = {
  completed: <CheckCircle2 size={15} className="text-rpg-green shrink-0" aria-label="Feito" />,
  pending: <CircleDashed size={15} className="text-rpg-orange shrink-0" aria-label="Pendente" />,
  skipped: <CircleDashed size={15} className="text-rpg-muted shrink-0" aria-label="Não selecionado" />,
  failed: <XCircle size={15} className="text-rpg-red shrink-0" aria-label="Falhou" />,
};

/**
 * Execução em duas etapas: preview (o servidor calcula o efeito real de cada
 * ação) → confirmação com seleção individual. Ações sugeridas só alteram
 * dados quando marcadas; nada roda em segundo plano.
 */
export function ProtocolExecutionModal({
  protocol,
  onClose,
  executing,
  onExecute,
  onStep,
}: {
  protocol: Protocol | null;
  onClose: () => void;
  executing: boolean;
  onExecute: (ref: string, body: { requestId: string; steps: Array<{ ref: string; selected: boolean; taskId?: string | null }> }) => Promise<ProtocolRun>;
  onStep: (runId: string, stepRef: string, status: "completed" | "skipped") => Promise<ProtocolRun>;
}) {
  const navigate = useNavigate();
  const ref = protocol?.ref ?? null;
  const preview = useQuery({ queryKey: ["protocols", "preview", ref], queryFn: () => protocolsService.preview(ref as string), enabled: !!ref, staleTime: 0, gcTime: 0 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [taskId, setTaskId] = useState<string | null>(null);
  const [run, setRun] = useState<ProtocolRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Mesmo requestId durante a janela aberta: clique duplo não executa duas vezes.
  const requestId = useMemo(() => (ref ? newRequestId() : ""), [ref]);

  const steps = useMemo(() => preview.data?.steps ?? [], [preview.data]);
  useEffect(() => {
    setRun(null);
    setError(null);
  }, [ref]);
  useEffect(() => {
    setSelected(new Set(steps.filter((s) => s.defaultSelected && !s.noop).map((s) => s.ref)));
    const prio = steps.find((s) => s.actionType === "SET_DAILY_PRIORITY");
    setTaskId(typeof prio?.details.suggested === "string" ? prio.details.suggested : null);
  }, [steps]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const confirm = async () => {
    if (!ref) return;
    setError(null);
    try {
      const r = await onExecute(ref, { requestId, steps: steps.map((s) => ({ ref: s.ref, selected: selected.has(s.ref), taskId: s.actionType === "SET_DAILY_PRIORITY" ? taskId : undefined })) });
      setRun(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível executar o protocolo.");
    }
  };
  const mark = async (stepRef: string, status: "completed" | "skipped") => {
    if (!run) return;
    try {
      setRun(await onStep(run.id, stepRef, status));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível atualizar o passo.");
    }
  };

  const title = run ? "Protocolo executado" : `Executar: ${protocol?.name ?? ""}`;
  const footer = run ? (
    <>
      {run.navigate && (
        <RPGButton
          variant="secondary"
          onClick={() => {
            onClose();
            navigate(run.navigate as string);
          }}
        >
          Ir para a próxima tela <ArrowRight size={14} aria-hidden />
        </RPGButton>
      )}
      <RPGButton variant="gold" onClick={onClose}>
        Fechar
      </RPGButton>
    </>
  ) : (
    <>
      <RPGButton variant="secondary" onClick={onClose}>
        Cancelar
      </RPGButton>
      <RPGButton variant="gold" onClick={() => void confirm()} disabled={executing || selected.size === 0 || preview.isLoading}>
        {executing ? "Executando…" : `Executar ${selected.size} ${selected.size === 1 ? "ação selecionada" : "ações selecionadas"}`}
      </RPGButton>
    </>
  );

  return (
    <Modal open={!!protocol} onClose={onClose} title={title} size="lg" footer={footer}>
      {preview.isLoading && <div className="h-48 rpg-bar animate-pulse" aria-label="Calculando prévia" />}
      {preview.isError && <p className="text-sm text-rpg-red">Não foi possível calcular a prévia. Tente novamente.</p>}

      {!run && steps.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-rpg-muted">Revise o que cada ação fará hoje. Desmarque o que não quiser — nada é alterado antes de você confirmar.</p>
          {GROUPS.map((g) => {
            const list = steps.filter((s) => s.mode === g.mode);
            if (list.length === 0) return null;
            return (
              <section key={g.mode} aria-label={g.title}>
                <p className="flex items-center gap-2 font-pixel text-[10px] uppercase tracking-[0.14em] text-rpg-gold">
                  {g.title} <span className="normal-case tracking-normal font-sans text-[11px] text-rpg-muted">— {MODE_UI[g.mode].hint}</span>
                </p>
                <ul className="mt-2 space-y-2">
                  {list.map((s) => (
                    <li key={s.ref} className={clsx("border bg-rpg-bg-2/60 p-3", selected.has(s.ref) ? "border-rpg-gold/70" : "border-rpg-border/60", s.noop && "opacity-60")} style={{ borderRadius: 3 }}>
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input type="checkbox" className="mt-1 accent-rpg-gold" checked={selected.has(s.ref)} disabled={s.noop} onChange={() => toggle(s.ref)} />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5 text-sm text-rpg-text">
                            {s.title}
                            <RPGBadge tone={MODE_UI[s.mode].tone}>{s.actionLabel}</RPGBadge>
                            {s.optional && <span className="text-[11px] text-rpg-muted">opcional</span>}
                          </span>
                          {s.summary && <span className="block text-xs text-rpg-text/80 mt-0.5">{s.summary}</span>}
                        </span>
                      </label>
                      <div className="pl-7">
                        <StepDetails step={s} taskId={taskId} onTask={setTaskId} />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {run && (
        <div className="space-y-3">
          <p className="text-sm text-rpg-text">
            {run.replayed ? "Esta execução já tinha sido registrada — nada foi repetido." : "Pronto! Veja o que foi feito e marque os passos manuais quando concluir."}
          </p>
          <ul className="space-y-2">
            {run.steps.map((s) => (
              <li key={s.ref} className="flex items-start gap-2 border border-rpg-border/60 bg-rpg-bg-2/60 p-2.5 text-sm" style={{ borderRadius: 3 }}>
                {STATUS_ICON[s.status]}
                <span className="min-w-0 flex-1">
                  <span className="block text-rpg-text">{s.title}</span>
                  {typeof s.result.message === "string" && <span className="block text-[11px] text-rpg-muted">{s.result.message}</span>}
                </span>
                {s.status === "pending" && (
                  <span className="flex shrink-0 gap-2 text-xs">
                    <button type="button" className="text-rpg-green hover:underline" onClick={() => void mark(s.ref, "completed")}>
                      Feito
                    </button>
                    <button type="button" className="text-rpg-muted hover:underline" onClick={() => void mark(s.ref, "skipped")}>
                      Pular
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && (
        <p className="mt-3 text-xs text-rpg-red" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
