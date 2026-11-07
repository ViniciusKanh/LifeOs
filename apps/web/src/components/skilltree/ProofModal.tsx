import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useQuery } from "@tanstack/react-query";
import { Award, CheckCircle2, ChevronDown, Coins, Loader2, ScrollText, Sparkles, XCircle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RPGButton } from "@/components/rpg";
import { SKILLS_KEY, useSkillActions } from "@/hooks/usePersonalSkills";
import { PROOF_LABEL, personalSkillsService, type ItemResult, type PersonalSkill, type Proof, type ProofItem } from "@/services/personalSkillsService";
import { FIELD, errMsg, type Notify } from "./skillShared";

const TYPE_LABEL: Record<ProofItem["type"], string> = { choice: "Múltipla escolha", open: "Discursiva", challenge: "Desafio prático" };

/**
 * Prova de nível: responder (com rascunho salvo no servidor), entregar com
 * confirmação e ver a correção. Gabarito e resposta-modelo só chegam depois
 * da entrega.
 */
export function ProofModal({ proofId, skills, onClose, onLeveled, notify }: { proofId: string; skills: PersonalSkill[]; onClose: () => void; onLeveled: (skillId: string) => void; notify: Notify }) {
  const q = useQuery({ queryKey: [...SKILLS_KEY, "prova", proofId], queryFn: () => personalSkillsService.proof(proofId), staleTime: 0 });
  const act = useSkillActions();
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<Proof | null>(null);
  const dirty = useRef(false);
  const proof = result ?? q.data ?? null;
  const open = proof?.status === "aberta";

  useEffect(() => {
    if (q.data) setAnswers(q.data.answers ?? {});
  }, [q.data]);

  // Rascunho automático a cada 20 s quando houve mudança (retomar depois sem perder nada).
  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => {
      if (!dirty.current) return;
      dirty.current = false;
      act.saveDraft.mutate({ id: proofId, answers });
    }, 20_000);
    return () => window.clearInterval(t);
  }, [open, proofId, answers, act.saveDraft]);

  const set = (id: string, v: string | number) => {
    dirty.current = true;
    setAnswers((a) => ({ ...a, [id]: v }));
  };
  const close = () => {
    if (open && dirty.current) act.saveDraft.mutate({ id: proofId, answers });
    onClose();
  };
  const unanswered = proof ? proof.items.filter((i) => answers[i.id] === undefined || (typeof answers[i.id] === "string" && !(answers[i.id] as string).trim())).length : 0;
  const submit = () =>
    act.submit.mutate(
      { id: proofId, answers },
      {
        onSuccess: (r) => {
          setConfirming(false);
          setResult(r);
          dirty.current = false;
          if (r.status === "aprovada") onLeveled(r.skillId);
        },
        onError: (e) => (setConfirming(false), notify(errMsg(e, "Não consegui entregar a prova."), "error")),
      },
    );
  const abandon = () =>
    window.confirm("Abandonar esta prova? Ela não conta como reprovação, mas as respostas serão descartadas.") &&
    act.abandon.mutate(proofId, { onSuccess: () => (notify("Prova abandonada."), onClose()), onError: (e) => notify(errMsg(e, "Não consegui abandonar."), "error") });

  const skill = proof ? skills.find((s) => s.id === proof.skillId) ?? null : null;
  const title = proof ? `Prova · ${skill?.name ?? "Habilidade"} · nível ${proof.targetLevel}` : "Prova";
  return (
    <Modal
      open
      onClose={close}
      size="lg"
      title={title}
      footer={
        proof && open ? (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={abandon} className="text-xs text-rpg-muted hover:text-rpg-red hover:underline">
              Abandonar
            </button>
            <span className="ml-auto text-xs text-rpg-muted">{unanswered ? `${unanswered} sem resposta` : "Tudo respondido"}</span>
            <RPGButton variant="secondary" onClick={() => (act.saveDraft.mutate({ id: proofId, answers }), (dirty.current = false), notify("Rascunho salvo."))} disabled={act.saveDraft.isPending}>
              Salvar rascunho
            </RPGButton>
            <RPGButton variant="primary" onClick={() => setConfirming(true)} disabled={act.submit.isPending}>
              {act.submit.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ScrollText size={14} aria-hidden />} {act.submit.isPending ? "Corrigindo…" : "Entregar prova"}
            </RPGButton>
          </div>
        ) : (
          <div className="flex justify-end">
            <RPGButton variant="secondary" onClick={close}>
              Fechar
            </RPGButton>
          </div>
        )
      }
    >
      {q.isLoading && !proof ? (
        <div className="space-y-2" aria-busy>
          <div className="h-20 animate-pulse bg-rpg-bg-2" />
          <div className="h-20 animate-pulse bg-rpg-bg-2" />
        </div>
      ) : q.isError && !proof ? (
        <p className="text-sm text-rpg-red">{errMsg(q.error, "Não consegui abrir a prova.")}</p>
      ) : proof ? (
        <div className="space-y-3">
          {open ? (
            <div className="border border-rpg-gold/40 bg-rpg-gold/5 p-2 text-xs text-rpg-text" style={{ borderRadius: 3 }}>
              <p>
                <strong className="text-rpg-gold-light">{PROOF_LABEL[proof.kind]}</strong> · nota mínima {proof.passScore}/100 · prazo até {new Date(proof.expiresAt.replace(" ", "T") + "Z").toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.
              </p>
              <p className="mt-0.5 text-rpg-muted">Questões geradas pela IA a partir do critério do nível. Objetivas são corrigidas pelo sistema; discursivas e desafios pela IA, com a rubrica mostrada em cada questão. Código não é executado — é avaliado por leitura.</p>
            </div>
          ) : (
            <ResultHeader proof={proof} />
          )}
          {proof.status === "corrigindo" && <p className="text-sm text-rpg-gold-light">Correção em andamento… atualize em instantes.</p>}
          <ol className="space-y-3">
            {proof.items.map((item, n) => (
              <ItemView key={item.id} n={n + 1} item={item} answer={answers[item.id]} onAnswer={open ? (v) => set(item.id, v) : undefined} result={proof.result?.items.find((r) => r.id === item.id) ?? null} />
            ))}
          </ol>
        </div>
      ) : null}

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        size="sm"
        title="Entregar a prova?"
        footer={
          <div className="flex justify-end gap-2">
            <RPGButton variant="ghost" onClick={() => setConfirming(false)}>
              Revisar
            </RPGButton>
            <RPGButton variant="primary" onClick={submit} disabled={act.submit.isPending}>
              {act.submit.isPending && <Loader2 size={14} className="animate-spin" aria-hidden />} Entregar
            </RPGButton>
          </div>
        }
      >
        <p className="text-sm text-rpg-text">{unanswered ? `Há ${unanswered} questão(ões) sem resposta — elas valem zero.` : "Todas as questões foram respondidas."}</p>
        <p className="mt-1 text-xs text-rpg-muted">Depois de entregue não dá para alterar. Se a correção falhar, suas respostas continuam guardadas.</p>
      </Modal>
    </Modal>
  );
}

function ResultHeader({ proof }: { proof: Proof }) {
  const passed = proof.status === "aprovada";
  if (proof.status === "expirada")
    return <p className="border border-rpg-border p-2 text-sm text-rpg-muted" style={{ borderRadius: 3 }}>Prova expirada ou abandonada — não conta como reprovação.</p>;
  if (!proof.result) return null;
  return (
    <div className={clsx("flex flex-wrap items-center gap-3 border-2 p-3", passed ? "border-rpg-green/70 bg-rpg-green/10" : "border-rpg-red/60 bg-rpg-red/10")} style={{ borderRadius: 4 }} role="status">
      <span className={clsx("flex h-16 w-16 shrink-0 flex-col items-center justify-center border-2 bg-rpg-bg font-rpg", passed ? "border-rpg-green text-rpg-green" : "border-rpg-red text-rpg-red")} style={{ borderRadius: 999 }}>
        <span className="text-2xl font-bold leading-none">{proof.score}</span>
        <span className="text-[10px]">/100</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className={clsx("flex items-center gap-1.5 font-rpg text-lg font-bold", passed ? "text-rpg-green" : "text-rpg-red")}>
          {passed ? <Award size={18} aria-hidden /> : <XCircle size={18} aria-hidden />} {passed ? `Nível ${proof.targetLevel} comprovado!` : "Ainda não foi desta vez"}
        </p>
        <p className="text-xs text-rpg-text">{proof.result.summary}</p>
        {proof.result.reward && (
          <p className="mt-1 flex items-center gap-2 text-xs font-semibold text-rpg-gold-light">
            <Sparkles size={12} aria-hidden /> +{proof.result.reward.xp} XP <Coins size={12} aria-hidden /> +{proof.result.reward.coins} moedas
          </p>
        )}
      </div>
    </div>
  );
}

function ItemView({ n, item, answer, onAnswer, result }: { n: number; item: ProofItem; answer: string | number | undefined; onAnswer?: (v: string | number) => void; result: ItemResult | null }) {
  const [showModel, setShowModel] = useState(false);
  const name = `q-${item.id}`;
  return (
    <li className="rpg-panel p-3">
      <p className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-rpg-muted">
        Questão {n} · {TYPE_LABEL[item.type]}
        {result && <span className={clsx("ml-auto tabular-nums", result.score >= 70 ? "text-rpg-green" : "text-rpg-red")}>{result.score}/100</span>}
      </p>
      <p className="whitespace-pre-wrap text-sm text-rpg-text">{item.prompt}</p>
      {item.type === "choice" ? (
        <fieldset className="mt-2 space-y-1">
          <legend className="sr-only">Alternativas da questão {n}</legend>
          {item.options?.map((o, i) => {
            const chosen = answer === i;
            const correct = item.answerIndex === i;
            return (
              <label
                key={i}
                className={clsx(
                  "flex cursor-pointer items-start gap-2 border px-2 py-1.5 text-sm",
                  result ? (correct ? "border-rpg-green/70 bg-rpg-green/10" : chosen ? "border-rpg-red/60 bg-rpg-red/10" : "border-rpg-border") : chosen ? "border-rpg-gold bg-rpg-gold/10" : "border-rpg-border hover:border-rpg-gold/50",
                  !onAnswer && "cursor-default",
                )}
                style={{ borderRadius: 3 }}
              >
                <input type="radio" name={name} checked={chosen} disabled={!onAnswer} onChange={() => onAnswer?.(i)} className="mt-0.5 accent-[rgb(var(--rpg-gold))]" />
                <span className="flex-1 text-rpg-text">{o}</span>
                {result && correct && <CheckCircle2 size={14} className="mt-0.5 text-rpg-green" aria-label="alternativa correta" />}
              </label>
            );
          })}
        </fieldset>
      ) : (
        <>
          {item.rubric?.length ? (
            <ul className="mt-1.5 list-inside list-disc text-[11px] text-rpg-muted" aria-label="Critérios de correção">
              {item.rubric.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : null}
          <textarea
            aria-label={`Resposta da questão ${n}`}
            value={typeof answer === "string" ? answer : ""}
            onChange={(e) => onAnswer?.(e.target.value)}
            readOnly={!onAnswer}
            rows={item.type === "challenge" ? 9 : 4}
            maxLength={6000}
            spellCheck={item.format !== "codigo"}
            className={clsx(FIELD, "mt-2", item.format === "codigo" && "font-mono text-[12.5px]")}
            placeholder={item.format === "codigo" ? "Escreva o código aqui…" : "Sua resposta…"}
          />
        </>
      )}
      {result && (
        <div className="mt-2 border-t border-rpg-border pt-2 text-xs">
          {result.feedback && <p className="text-rpg-text">{result.feedback}</p>}
          {result.gaps.length > 0 && <p className="mt-0.5 text-rpg-orange">Faltou: {result.gaps.join(" · ")}</p>}
          {item.type !== "choice" && item.expected && (
            <button type="button" onClick={() => setShowModel((x) => !x)} className="mt-1 flex items-center gap-1 font-semibold text-rpg-blue hover:underline" aria-expanded={showModel}>
              <ChevronDown size={12} className={clsx(showModel && "rotate-180")} aria-hidden /> Resposta-modelo
            </button>
          )}
          {showModel && <pre className="mt-1 whitespace-pre-wrap border border-rpg-border bg-rpg-bg-2 p-2 font-mono text-[11.5px] text-rpg-text" style={{ borderRadius: 3 }}>{item.expected}</pre>}
        </div>
      )}
    </li>
  );
}
