import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BarChart3, Crown, Moon, NotebookPen, RefreshCw, ScrollText, SkipForward } from "lucide-react";
import { RPGButton, RPGPageHeader, RPGToast } from "@/components/rpg";
import { RPGHowItWorks } from "@/components/rpg/RPGHowItWorks";
import { TavernStepper, type TavernStepDef } from "@/components/taverna/TavernStepper";
import { TavernBalanceStep } from "@/components/taverna/TavernBalanceStep";
import { TavernJournalStep } from "@/components/taverna/TavernJournalStep";
import { TavernProphecyStep } from "@/components/taverna/TavernProphecyStep";
import { TavernMissionStep } from "@/components/taverna/TavernMissionStep";
import { TavernRestStep } from "@/components/taverna/TavernRestStep";
import { fmtDay } from "@/components/taverna/tavernFormat";
import { useTavern } from "@/hooks/useTavern";

const STEPS: TavernStepDef[] = [
  { id: "balanco", label: "Balanço do dia", icon: BarChart3 },
  { id: "diario", label: "Fechar o diário", icon: NotebookPen },
  { id: "profecia", label: "Profecia de amanhã", icon: ScrollText },
  { id: "missao", label: "Primeira missão", icon: Crown },
  { id: "descanso", label: "Bom descanso", icon: Moon },
];

const SUBTITLES = [
  "O que o dia rendeu de verdade, comparado com a sua semana.",
  "Registre o que leva para amanhã — fica na entrada de hoje do Diário.",
  "O que os seus artefatos da Forja esperam de amanhã.",
  "Escolha com o que começar amanhã e fixe como missão principal.",
  "",
];

/**
 * Taverna — ritual de fim de dia num único fluxo: balanço → diário →
 * profecia → primeira missão → descanso. Os dados vêm de uma chamada só
 * (/api/tavern/summary); o diário reaproveita o fechamento do Diário.
 * Todo passo pode ser pulado; o passo atual fica na URL (?passo=).
 */
export function TavernaPage() {
  const [params, setParams] = useSearchParams();
  const fromUrl = STEPS.findIndex((s) => s.id === params.get("passo"));
  const [step, setStep] = useState(fromUrl >= 0 ? fromUrl : 0);
  const [visited, setVisited] = useState<Set<number>>(() => new Set([fromUrl >= 0 ? fromUrl : 0]));
  const [journalClosed, setJournalClosed] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const { data, isLoading, isError, refetch, isFetching, pin } = useTavern();

  const go = useCallback(
    (i: number) => {
      const next = Math.min(STEPS.length - 1, Math.max(0, i));
      setStep(next);
      setVisited((v) => new Set(v).add(next));
      setParams((prev) => {
        const p = new URLSearchParams(prev);
        p.set("passo", STEPS[next].id);
        return p;
      }, { replace: true });
    },
    [setParams],
  );

  // A cada troca de passo o foco vai para o título (leitores de tela anunciam o passo novo).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [step]);

  const onPin = async (taskId: string, setDueTomorrow: boolean) => {
    const r = await pin.mutateAsync({ taskId, setDueTomorrow });
    setToast({ text: `Missão principal de amanhã: ${r.task.title}${r.dueDateChanged ? " (prazo movido para amanhã)" : ""}.`, tone: "success" });
  };
  const onJournalSaved = useCallback((closed: boolean) => setJournalClosed(closed), []);

  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div className="w-full px-4 md:px-6 lg:px-8 py-6 space-y-4">
      <RPGPageHeader
        banner="revisoes"
        size="md"
        eyebrow="Fim do dia"
        title="Taverna"
        subtitle="Puxe uma cadeira: feche o dia com o que aconteceu de verdade e deixe a primeira missão de amanhã pronta."
        footnote={data ? fmtDay(data.today) : undefined}
      />

      <RPGHowItWorks
        storageKey="lifeos-taverna-como-funciona"
        steps={[
          { icon: BarChart3, title: "Veja o balanço", text: "XP, missões, hábitos e Saúde de hoje, comparados com a média da semana.", tone: "blue" },
          { icon: ScrollText, title: "Consulte a profecia", text: "Seus artefatos da Forja estimam amanhã a partir dos registros de hoje.", tone: "purple" },
          { icon: Crown, title: "Escolha a missão", text: "Fixe a primeira missão de amanhã — só grava quando você confirma.", tone: "gold" },
        ]}
      />

      <TavernStepper steps={STEPS} current={step} visited={visited} onSelect={go} />

      <section aria-labelledby="taverna-passo-titulo" className="space-y-4">
        {!last && (
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="min-w-0">
              <p className="font-pixel text-[11px] uppercase tracking-[0.14em] text-rpg-gold">
                Passo {step + 1} de {STEPS.length}
              </p>
              <h2 id="taverna-passo-titulo" ref={headingRef} tabIndex={-1} className="rpg-title text-xl font-bold outline-none sm:text-2xl">
                {current.label}
              </h2>
              <p className="text-sm text-rpg-muted">{SUBTITLES[step]}</p>
            </div>
            {data && (
              <RPGButton variant="ghost" onClick={() => void refetch()} disabled={isFetching} aria-label="Atualizar dados da Taverna">
                <RefreshCw size={14} className={isFetching ? "animate-spin motion-reduce:animate-none" : undefined} aria-hidden /> Atualizar
              </RPGButton>
            )}
          </div>
        )}
        {last && (
          <h2 id="taverna-passo-titulo" ref={headingRef} tabIndex={-1} className="sr-only">
            {current.label}
          </h2>
        )}

        {isLoading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Carregando o balanço do dia">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="rpg-panel h-24 animate-pulse motion-reduce:animate-none" />
              ))}
            </div>
            <div className="rpg-panel h-48 animate-pulse motion-reduce:animate-none" />
          </div>
        ) : isError || !data ? (
          <div className="rpg-panel rpg-panel-danger p-4" role="alert">
            <p className="text-sm text-rpg-text">Não foi possível abrir a Taverna agora.</p>
            <RPGButton variant="secondary" className="mt-3" onClick={() => void refetch()}>
              <RefreshCw size={14} aria-hidden /> Tentar de novo
            </RPGButton>
          </div>
        ) : (
          <>
            {current.id === "balanco" && <TavernBalanceStep balance={data.balance} />}
            {current.id === "diario" && <TavernJournalStep date={data.today} onSaved={onJournalSaved} />}
            {current.id === "profecia" && <TavernProphecyStep prophecies={data.prophecy.prophecies} />}
            {current.id === "missao" && <TavernMissionStep data={data} pinning={pin.isPending} onPin={onPin} />}
            {current.id === "descanso" && <TavernRestStep data={data} journalClosed={journalClosed} />}
          </>
        )}
      </section>

      {!last && (
        <nav aria-label="Navegação entre passos" className="flex items-center justify-between gap-2 border-t border-rpg-border/70 pt-3 pr-16 sm:pr-20">
          <RPGButton variant="ghost" onClick={() => go(step - 1)} disabled={step === 0}>
            <ArrowLeft size={14} aria-hidden /> <span className="hidden sm:inline">Anterior</span>
            <span className="sr-only sm:hidden">Passo anterior</span>
          </RPGButton>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <RPGButton variant="ghost" onClick={() => go(step + 1)}>
                <SkipForward size={14} aria-hidden /> Pular
              </RPGButton>
            )}
            <RPGButton variant="primary" onClick={() => go(step + 1)}>
              {step === STEPS.length - 2 ? "Encerrar o dia" : "Continuar"} <ArrowRight size={14} aria-hidden />
            </RPGButton>
          </div>
        </nav>
      )}

      <RPGToast message={toast?.text ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}
