import { useState } from "react";
import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { RPGButton, RPGTabs, RPGToast, rpgButtonClass } from "@/components/rpg";
import { RPG_TONE_TEXT } from "@/components/rpg/rpgAssets";
import { CharacterBuildHero } from "@/components/character-build/CharacterBuildHero";
import { CharacterArchetypeCard } from "@/components/character-build/CharacterArchetypeCard";
import { CharacterAttributeCard } from "@/components/character-build/CharacterAttributeCard";
import { CharacterBuildRadar } from "@/components/character-build/CharacterBuildRadar";
import { BuildComparison, CharacterBuildInsights } from "@/components/character-build/CharacterBuildInsights";
import { ApplyPlanModal, CharacterEvolutionPlan } from "@/components/character-build/CharacterEvolutionPlan";
import { DesiredBuildModal } from "@/components/character-build/DesiredBuildModal";
import { ArchetypeRanking, BuildComparisons, BuildEvolutionView, BuildRecommendations } from "@/components/character-build/BuildTabViews";
import { useBuild } from "@/hooks/useBuild";
import type { BuildOverview } from "@/services/buildService";
import { ATTR_UI } from "@/utils/codexDisplay";

type Tab = "overview" | "attributes" | "archetype" | "desired" | "evolution" | "recommendations" | "comparisons";
const TABS: Array<{ value: Tab; label: string }> = [
  { value: "overview", label: "Visão Geral" },
  { value: "attributes", label: "Atributos" },
  { value: "archetype", label: "Arquétipo" },
  { value: "desired", label: "Build Desejada" },
  { value: "evolution", label: "Evolução" },
  { value: "recommendations", label: "Recomendações" },
  { value: "comparisons", label: "Comparações" },
];

/** Sem XP suficiente na janela: explica o que falta, sem inventar atributos. */
function BuildEmpty({ data }: { data: BuildOverview }) {
  return (
    <div className="rpg-panel rpg-panel-gold flex flex-col items-center text-center gap-3 py-10 px-4">
      <Compass size={36} className="text-rpg-gold" aria-hidden />
      <p className="font-pixel text-xs uppercase tracking-[0.16em] text-rpg-gold">Sua build ainda está sendo formada</p>
      <p className="text-sm text-rpg-muted max-w-lg">
        A leitura usa o XP real dos últimos {data.windowDays} dias ({data.sufficiency.windowXp} de {data.sufficiency.minWindowXp} XP mínimos). Registre algumas atividades para revelar seu padrão:
      </p>
      <ul className="grid gap-2 sm:grid-cols-2 text-left max-w-2xl w-full">
        {data.sufficiency.missing.map((m) => {
          const ui = ATTR_UI[m.key];
          return (
            <li key={m.key} className="flex items-start gap-2 border border-rpg-border/60 bg-rpg-bg-2/60 p-2.5 text-sm" style={{ borderRadius: 3 }}>
              <ui.icon size={16} className={`${RPG_TONE_TEXT[ui.tone]} shrink-0 mt-0.5`} aria-hidden />
              <span>
                <strong className="text-rpg-text">{m.label}</strong>
                <span className="block text-xs text-rpg-muted">{m.sources}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap justify-center gap-2">
        <Link to="/hoje" className={rpgButtonClass("primary")}>
          Ir para Hoje
        </Link>
        <Link to="/habitos" className={rpgButtonClass("secondary")}>
          Ver hábitos
        </Link>
      </div>
    </div>
  );
}

/**
 * Build do Personagem: leitura dos atributos (motor do Códex), arquétipo
 * mais próximo, build desejada e plano de evolução. Toda criação de
 * hábito/tarefa passa por preview e marcação individual.
 */
export function BuildPage() {
  const { data, isLoading, isError, refetch, saveDesired, resetDesired, applyPlan } = useBuild();
  const [tab, setTab] = useState<Tab>("overview");
  const [desiredOpen, setDesiredOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);

  const ready = data && data.sufficiency.enough && data.archetype;
  const sidebar = data && (
    <aside className="space-y-4 min-w-0" aria-label="Comparação e insights">
      <BuildComparison gaps={data.gaps} />
      <CharacterBuildInsights insights={data.insights} />
    </aside>
  );

  const body = () => {
    if (!data || !data.archetype) return null;
    switch (tab) {
      case "overview":
        return (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3 items-stretch">
              <CharacterArchetypeCard archetype={data.archetype} />
              <CharacterAttributeCard attributes={data.attributes} />
              <div className="md:col-span-2 2xl:col-span-1">
                <CharacterBuildRadar data={data} onAdjust={() => setDesiredOpen(true)} />
              </div>
            </div>
            <CharacterEvolutionPlan plan={data.plan} onApply={() => setPlanOpen(true)} />
          </div>
        );
      case "attributes":
        return <CharacterAttributeCard attributes={data.attributes} detailed />;
      case "archetype":
        return (
          <div className="grid gap-4 lg:grid-cols-2">
            <CharacterArchetypeCard archetype={data.archetype} />
            <ArchetypeRanking archetype={data.archetype} />
          </div>
        );
      case "desired":
        return (
          <div className="grid gap-4 lg:grid-cols-2">
            <CharacterBuildRadar data={data} onAdjust={() => setDesiredOpen(true)} />
            <CharacterEvolutionPlan plan={data.plan} onApply={() => setPlanOpen(true)} />
          </div>
        );
      case "evolution":
        return <BuildEvolutionView attributes={data.attributes} />;
      case "recommendations":
        return <BuildRecommendations recommendations={data.recommendations} onApply={() => setPlanOpen(true)} />;
      case "comparisons":
        return <BuildComparisons data={data} />;
    }
  };

  return (
    <div className="w-full px-4 md:px-6 lg:px-8 py-6 space-y-4">
      <CharacterBuildHero />
      {isError ? (
        <div className="rpg-panel p-6 text-center">
          <p className="text-sm text-rpg-red">Não foi possível carregar sua build.</p>
          <RPGButton variant="secondary" className="mt-3" onClick={() => refetch()}>
            Tentar novamente
          </RPGButton>
        </div>
      ) : isLoading || !data ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Carregando build">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="rpg-panel h-80 animate-pulse" />
          ))}
        </div>
      ) : !ready ? (
        <BuildEmpty data={data} />
      ) : (
        <>
          <RPGTabs label="Seções da build" tabs={TABS} value={tab} onChange={setTab} />
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px] items-start">
            <div className="min-w-0">{body()}</div>
            {sidebar}
          </div>
          <figure className="rpg-panel rpg-panel-gold overflow-hidden">
            <img src="/assets/rpg/build-panorama.webp" alt="" aria-hidden loading="lazy" decoding="async" className="pixelated w-full h-24 sm:h-32 lg:h-40 object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
            <figcaption className="px-4 py-2 text-center text-xs italic text-rpg-gold-light/90 font-rpg">Cada escolha registrada move sua build — a jornada continua.</figcaption>
          </figure>
        </>
      )}

      {data && (
        <>
          <DesiredBuildModal
            open={desiredOpen}
            onClose={() => setDesiredOpen(false)}
            data={data}
            saving={saveDesired.isPending || resetDesired.isPending}
            onSave={async (input) => {
              const r = await saveDesired.mutateAsync(input);
              setToast({ msg: r.warning ?? "Build desejada salva.", tone: "success" });
              return r.warning;
            }}
            onReset={async () => {
              await resetDesired.mutateAsync();
              setToast({ msg: "Build desejada restaurada para o padrão.", tone: "success" });
            }}
          />
          <ApplyPlanModal
            open={planOpen}
            onClose={() => setPlanOpen(false)}
            plan={data.plan}
            applying={applyPlan.isPending}
            onConfirm={async (ids) => {
              try {
                const r = await applyPlan.mutateAsync(ids);
                setPlanOpen(false);
                const skipped = r.skipped.length ? ` · ${r.skipped.length} já existia${r.skipped.length > 1 ? "m" : ""}` : "";
                setToast({ msg: `${r.created.length} ${r.created.length === 1 ? "item criado" : "itens criados"}${skipped}.`, tone: "success" });
              } catch (e) {
                setToast({ msg: e instanceof Error ? e.message : "Não foi possível aplicar o plano.", tone: "error" });
              }
            }}
          />
        </>
      )}
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}
