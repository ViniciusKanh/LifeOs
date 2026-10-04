import { useMemo, useState } from "react";
import { BarChart3, BookOpen, Flag, Gem, Globe2, LayoutGrid, Repeat, Shield, ScrollText, Swords, Trophy } from "lucide-react";
import { RPGButton, RPGPanel, RPGTabs, RPGToast } from "@/components/rpg";
import { CodexHero } from "@/components/codex/CodexHero";
import { CodexAttributesHeader } from "@/components/codex/CodexAttributesHeader";
import { CodexAttributeCard } from "@/components/codex/CodexAttributeCard";
import { CodexSynergyBar } from "@/components/codex/CodexSynergyBar";
import { CodexSidebar, type CodexSelection } from "@/components/codex/CodexSidebar";
import { CodexItemModal } from "@/components/codex/CodexItemModal";
import { CodexAttributeDetail } from "@/components/codex/CodexAttributeDetail";
import { CodexUnlockOverlay } from "@/components/codex/CodexUnlockOverlay";
import { CodexAchievements, CodexClasses, CodexContracts, CodexLifeAreas, CodexMilestones, CodexMissions, CodexOverview, CodexRelics } from "@/components/codex/CodexTabs";
import { useCodex } from "@/hooks/useCodex";
import type { AttributeKey, Codex } from "@/services/codexService";
import { Link } from "react-router-dom";

type Tab = "overview" | "attributes" | "classes" | "achievements" | "milestones" | "contracts" | "missions" | "relics" | "areas";
const TABS: Array<{ value: Tab; label: string; icon: JSX.Element }> = [
  { value: "overview", label: "Visão Geral", icon: <LayoutGrid size={15} /> },
  { value: "attributes", label: "Atributos", icon: <BarChart3 size={15} /> },
  { value: "classes", label: "Classes da Rotina", icon: <Shield size={15} /> },
  { value: "achievements", label: "Conquistas", icon: <Trophy size={15} /> },
  { value: "milestones", label: "Marcos", icon: <Flag size={15} /> },
  { value: "contracts", label: "Contratos", icon: <Repeat size={15} /> },
  { value: "missions", label: "Missões", icon: <Swords size={15} /> },
  { value: "relics", label: "Relíquias", icon: <Gem size={15} /> },
  { value: "areas", label: "Áreas da Vida", icon: <Globe2 size={15} /> },
];

/** Busca real no Códex: atributos, classes, títulos, relíquias, descobertas e conhecimentos carregados. */
function searchCodex(codex: Codex, q: string) {
  const t = q.trim().toLowerCase();
  if (t.length < 2) return [];
  const hit = (...xs: Array<string | null | undefined>) => xs.some((x) => x?.toLowerCase().includes(t));
  return [
    ...codex.attributes.filter((a) => hit(a.label, a.description)).map((a) => ({ type: "Atributo", label: a.label, tab: "attributes" as Tab })),
    ...codex.classes.filter((c) => hit(c.name, c.description)).map((c) => ({ type: "Classe", label: c.name, tab: "classes" as Tab })),
    ...codex.titles.filter((x) => hit(x.name, x.description)).map((x) => ({ type: "Título", label: x.name, tab: "classes" as Tab })),
    ...codex.relics.filter((x) => hit(x.name, x.description, x.obtainedBy)).map((x) => ({ type: "Relíquia", label: x.name, tab: "relics" as Tab })),
    ...codex.discoveries.filter((x) => hit(x.title, x.description, x.category)).map((x) => ({ type: "Descoberta", label: x.title, tab: "overview" as Tab })),
    ...codex.knowledge.filter((x) => hit(x.title, x.summary, x.category)).map((x) => ({ type: "Conhecimento", label: x.title, tab: "overview" as Tab })),
  ].slice(0, 12);
}

/** 📜 Códex da Jornada — enciclopédia viva do personagem, feita só de dados reais. */
export function CodexPage() {
  const { data: codex, isLoading, isError, refetch } = useCodex();
  const [tab, setTab] = useState<Tab>("attributes");
  const [focusAttr, setFocusAttr] = useState<AttributeKey | null>(null);
  const [detail, setDetail] = useState<AttributeKey | null>(null);
  const [selection, setSelection] = useState<CodexSelection | null>(null);
  const [q, setQ] = useState("");
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);
  const results = useMemo(() => (codex ? searchCodex(codex, q) : []), [codex, q]);
  const strongest = codex ? [...codex.attributes].sort((a, b) => b.xp - a.xp)[0] : null;
  const shownAttr = codex?.attributes.find((a) => a.key === focusAttr) ?? strongest ?? null;

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 space-y-3">
      <CodexHero query={q} onQuery={setQ} />
      {results.length > 0 && (
        <RPGPanel title={`Resultados para “${q.trim()}”`} icon={<ScrollText size={16} />}>
          <ul className="flex flex-wrap gap-2">
            {results.map((r, i) => (
              <li key={i}>
                <button type="button" onClick={() => (setTab(r.tab), setQ(""))} className="border border-rpg-border bg-rpg-bg-2 px-2 py-1 text-xs text-rpg-text hover:border-rpg-gold" style={{ borderRadius: 3 }}>
                  <span className="text-rpg-muted">{r.type}:</span> {r.label}
                </button>
              </li>
            ))}
          </ul>
        </RPGPanel>
      )}
      {q.trim().length >= 2 && results.length === 0 && codex && <p className="text-xs text-rpg-muted">Nada encontrado no Códex para “{q.trim()}”.</p>}

      <RPGTabs label="Seções do Códex" tabs={TABS} value={tab} onChange={setTab} className="w-full" />

      {isLoading && (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(280px,27%)]" aria-busy aria-label="Carregando o Códex">
          <div className="grid gap-3 sm:grid-cols-2">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="rpg-panel h-32 animate-pulse" />)}</div>
          <div className="rpg-panel h-96 animate-pulse" />
        </div>
      )}
      {isError && (
        <RPGPanel variant="danger">
          <p className="text-sm text-rpg-text">Não foi possível carregar o Códex.</p>
          <RPGButton variant="secondary" className="mt-2" onClick={() => void refetch()}>Tentar novamente</RPGButton>
        </RPGPanel>
      )}

      {codex && !codex.hasData && (
        <RPGPanel variant="parchment">
          <div className="py-4 text-center">
            <BookOpen size={30} className="mx-auto text-rpg-ink" aria-hidden />
            <p className="mt-2 font-rpg text-lg font-bold text-rpg-ink">Seu Códex está começando a ser escrito</p>
            <p className="text-sm text-rpg-ink/80">Complete missões, cumpra contratos e registre sua jornada para revelar atributos, descobertas e marcos.</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2 text-sm">
              <Link to="/tarefas" className="rpg-btn rpg-btn-primary">Concluir uma missão</Link>
              <Link to="/habitos" className="rpg-btn rpg-btn-secondary">Cumprir um hábito</Link>
              <Link to="/diario" className="rpg-btn rpg-btn-secondary">Escrever no Diário</Link>
            </div>
          </div>
        </RPGPanel>
      )}

      {codex && (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(280px,27%)] items-start">
          <div className="space-y-3 min-w-0">
            {tab === "attributes" && (
              <>
                <CodexAttributesHeader attr={shownAttr} />
                <div className="grid gap-3 sm:grid-cols-2">
                  {codex.attributes.map((a) => (
                    <CodexAttributeCard key={a.key} attr={a} selected={shownAttr?.key === a.key} onSelect={() => setFocusAttr(a.key)} onOpen={() => setDetail(a.key)} />
                  ))}
                </div>
                <CodexSynergyBar codex={codex} />
              </>
            )}
            {tab === "overview" && <CodexOverview codex={codex} onSelect={setSelection} />}
            {tab === "classes" && <CodexClasses codex={codex} onSelect={setSelection} />}
            {tab === "achievements" && <CodexAchievements />}
            {tab === "milestones" && <CodexMilestones />}
            {tab === "contracts" && <CodexContracts />}
            {tab === "missions" && <CodexMissions />}
            {tab === "relics" && <CodexRelics codex={codex} onSelect={setSelection} />}
            {tab === "areas" && <CodexLifeAreas codex={codex} />}
          </div>
          <CodexSidebar codex={codex} onSelect={setSelection} onSeeAll={setTab} />
        </div>
      )}

      {codex && <CodexAttributeDetail attrKey={detail} codex={codex} onClose={() => setDetail(null)} />}
      <CodexItemModal selection={selection} onClose={() => setSelection(null)} onToast={(msg, tone = "success") => setToast({ msg, tone })} />
      {codex && <CodexUnlockOverlay codex={codex} />}
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}

export default CodexPage;
