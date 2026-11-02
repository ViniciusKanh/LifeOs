import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import clsx from "clsx";
import { BarChart3, BookOpen, Database, Layers, Loader2, Plus, Repeat, Search, Trophy, Wand2, Zap } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useTheme } from "@/hooks/useTheme";
import { useGrimoireDecks, useGrimoireHub, useGrimoireMutations, useGrimoireQueue, useGrimoireStats } from "@/hooks/useGrimoire";
import { grimoireService, type DeckInput, type GrimoireDeck, type OracleRec } from "@/services/grimoireService";
import { AIGeneratorModal } from "@/components/grimorio/AIGeneratorModal";
import { DeckCardsPanel } from "@/components/grimorio/DeckCardsPanel";
import { DeckFormModal } from "@/components/grimorio/DeckFormModal";
import { GrimoireStatsPanel } from "@/components/grimorio/GrimoireStatsPanel";
import { StudySession } from "@/components/grimorio/StudySession";
import { InlineToast, errorMessage, selectClass } from "@/components/grimorio/grimoireUi";
import { GrimoireDeckTome, masteryOf } from "@/components/grimorio/grimoireTomes";
import {
  ArcaneLibrary,
  AutoQueuePanel,
  ConsistencyCalendar,
  DomainMap,
  FlowExplainer,
  GrimoireAchievements,
  GrimoireBanner,
  ImportModal,
  IndicatorsRow,
  OraclePanel,
  RecentSpells,
  RitualPanel,
  SuggestionsModal,
} from "@/components/grimorio/GrimoireHub";
import { AutomationsPanel } from "@/components/automations/AutomationsPanel";

type Tab = "baralhos" | "biblioteca" | "automacoes" | "estatisticas" | "conquistas";
type QueueCards = NonNullable<ReturnType<typeof useGrimoireQueue>["data"]>["cards"];

const TABS: Array<{ value: Tab; label: string; icon: typeof Layers }> = [
  { value: "baralhos", label: "Baralhos", icon: Layers },
  { value: "biblioteca", label: "Biblioteca Arcana", icon: Database },
  { value: "automacoes", label: "Automações", icon: Zap },
  { value: "estatisticas", label: "Estatísticas", icon: BarChart3 },
  { value: "conquistas", label: "Conquistas", icon: Trophy },
];

/** Cartão "a reforçar" — mesma regra do servidor (REINFORCE_RULE em grimoireService.ts). */
const isReinforce = (c: { isNew: boolean; lapses: number; ease: number; reinforce?: boolean }) => c.reinforce ?? (!c.isNew && (c.lapses >= 1 || c.ease <= 2.1));

/**
 * Grimório 2.0 — central de estudos com repetição espaçada (SM-2), ritual
 * diário em etapas, biblioteca de importações, automações reais, oráculo e
 * estatísticas. Atalhos por URL: ?disciplina=&curso=&nome=, ?baralho=, ?livro=, ?aba=.
 */
export function GrimorioPage() {
  const { isRpg } = useTheme();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("aba") as Tab | null;
  const [tab, setTabState] = useState<Tab>(tabParam && TABS.some((t) => t.value === tabParam) ? tabParam : "baralhos");
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(params.get("baralho"));
  const [form, setForm] = useState<{ open: boolean; deck: GrimoireDeck | null; prefill?: Partial<DeckInput> }>({ open: false, deck: null });
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBookId, setAiBookId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [study, setStudy] = useState<{ cards: QueueCards; label: string } | null>(null);
  const [confirmDeck, setConfirmDeck] = useState<GrimoireDeck | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"fila" | "dominio" | "nome" | "recentes">("fila");
  const [hardLoading, setHardLoading] = useState(false);
  const [diaryLoading, setDiaryLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  const decksQ = useGrimoireDecks({ archived: showArchived });
  const queueQ = useGrimoireQueue();
  const statsQ = useGrimoireStats();
  const hubQ = useGrimoireHub();
  const { createDeck, updateDeck, deleteDeck, review } = useGrimoireMutations();

  const decks = useMemo(() => decksQ.data ?? [], [decksQ.data]);
  const activeDecks = useMemo(() => decks.filter((d) => !d.archivedAt), [decks]);
  const selected = decks.find((d) => d.id === selectedId) ?? null;
  const queue = queueQ.data;
  const hub = hubQ.data;
  const notify = useCallback((text: string, tone: "success" | "error" = "success") => setToast({ text, tone }), []);

  const setTab = (t: Tab) => {
    setTabState(t);
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (t === "baralhos") p.delete("aba");
        else p.set("aba", t);
        return p;
      },
      { replace: true },
    );
  };

  // Atalhos vindos da Educação/Biblioteca (executados uma vez, depois limpos da URL).
  useEffect(() => {
    if (!decksQ.data) return;
    const subjectId = params.get("disciplina");
    const bookId = params.get("livro");
    if (!subjectId && !bookId) return;
    if (subjectId) {
      const existing = decksQ.data.find((d) => d.subjectId === subjectId);
      if (existing) setSelectedId(existing.id);
      else setForm({ open: true, deck: null, prefill: { name: params.get("nome") ?? "", subjectId, courseId: params.get("curso") } });
    }
    if (bookId) {
      setAiBookId(bookId);
      setAiOpen(true);
    }
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        ["disciplina", "curso", "nome", "livro"].forEach((k) => p.delete(k));
        return p;
      },
      { replace: true },
    );
  }, [decksQ.data, params, setParams]);

  /** Ritual: vencidos → novos → reforço (a ordem dentro de cada etapa vem do servidor). */
  const startRitual = (deck?: GrimoireDeck) => {
    const cards = (queue?.cards ?? []).filter((c) => !deck || c.deckId === deck.id);
    if (cards.length === 0) return notify(deck ? "Nada para revisar neste baralho hoje." : "Nada para revisar hoje.", "error");
    const ordered = [...cards.filter((c) => !c.isNew && !isReinforce(c)), ...cards.filter((c) => c.isNew), ...cards.filter((c) => isReinforce(c))];
    setStudy({ cards: ordered, label: deck ? deck.name : "Ritual de hoje" });
    window.scrollTo({ top: 0 });
  };

  const studyHard = async (deck: GrimoireDeck) => {
    setHardLoading(true);
    try {
      const cards = await grimoireService.hardCards(deck.id);
      if (cards.length === 0) return notify("Nenhum cartão difícil neste tomo. 🎉");
      setStudy({ cards, label: `Difíceis — ${deck.name}` });
      window.scrollTo({ top: 0 });
    } catch (err) {
      notify(errorMessage(err, "Não foi possível carregar os cartões difíceis."), "error");
    } finally {
      setHardLoading(false);
    }
  };

  const openDeck = (id: string) => {
    setSelectedId(id);
    setTab("baralhos");
    window.setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };

  const onOracle = async (a: NonNullable<OracleRec["action"]>) => {
    if (a.type === "study_deck" && a.deckId) {
      const d = decks.find((x) => x.id === a.deckId);
      if (d) startRitual(d);
    } else if (a.type === "open_deck" && a.deckId) openDeck(a.deckId);
    else if (a.type === "new_deck") setForm({ open: true, deck: null });
    else if (a.type === "generate_diary" && a.entryDate) {
      setDiaryLoading(true);
      try {
        const r = await grimoireService.suggestFromJournal(a.entryDate, activeDecks[0]?.id ?? null);
        notify(`${r.added} cartão(ões) do Diário na fila de aprovação.`);
        void hubQ.refetch();
        if (r.added > 0) setSuggestionsOpen(true);
      } catch (err) {
        notify(errorMessage(err, "Não foi possível gerar cartões do Diário."), "error");
      } finally {
        setDiaryLoading(false);
      }
    }
  };

  const saveDeck = async (input: DeckInput) => {
    if (form.deck) {
      await updateDeck.mutateAsync({ id: form.deck.id, patch: input });
      notify("Tomo atualizado.");
    } else {
      const created = await createDeck.mutateAsync(input);
      setSelectedId(created.id);
      notify("Novo tomo aberto.");
    }
  };

  const toggleArchive = async (deck: GrimoireDeck) => {
    try {
      await updateDeck.mutateAsync({ id: deck.id, patch: { archived: !deck.archivedAt } });
      notify(deck.archivedAt ? "Tomo restaurado." : "Tomo arquivado (sai da fila de estudo).");
      if (selectedId === deck.id && !deck.archivedAt && !showArchived) setSelectedId(null);
    } catch (err) {
      notify(errorMessage(err, "Não foi possível alterar o tomo."), "error");
    }
  };

  const removeDeck = async () => {
    if (!confirmDeck) return;
    try {
      await deleteDeck.mutateAsync(confirmDeck.id);
      if (selectedId === confirmDeck.id) setSelectedId(null);
      notify("Tomo excluído.");
      setConfirmDeck(null);
    } catch (err) {
      notify(errorMessage(err, "Não foi possível excluir o tomo."), "error");
    }
  };

  const dueByDeck = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of queue?.cards ?? []) map.set(c.deckId, (map.get(c.deckId) ?? 0) + 1);
    return map;
  }, [queue]);

  const visibleDecks = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? decks.filter((d) => [d.name, d.description, d.subjectName, d.bookTitle].some((v) => v?.toLowerCase().includes(q))) : [...decks];
    list.sort((a, b) => {
      if (sort === "nome") return a.name.localeCompare(b.name, "pt-BR");
      if (sort === "recentes") return b.createdAt.localeCompare(a.createdAt);
      if (sort === "dominio") return masteryOf(b).pct - masteryOf(a).pct;
      return (dueByDeck.get(b.id) ?? 0) - (dueByDeck.get(a.id) ?? 0) || a.name.localeCompare(b.name, "pt-BR");
    });
    return list;
  }, [decks, search, sort, dueByDeck]);

  useEffect(() => {
    if (selectedId) window.setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }, [selectedId]);

  const goAutomations = () => {
    setTab("automacoes");
    window.setTimeout(() => tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  if (study) {
    return (
      <div className="w-full px-4 py-6 md:px-8 md:py-8 space-y-4">
        <p className="font-pixel text-xs uppercase tracking-[0.14em] text-rpg-gold">✦ {study.label}</p>
        <StudySession
          cards={study.cards}
          isRpg={isRpg}
          onReview={(cardId, quality, durationMs) => review.mutateAsync({ cardId, quality, durationMs })}
          onExit={() => {
            setStudy(null);
            void hubQ.refetch();
          }}
        />
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-5 md:px-6 lg:px-8 md:py-6 space-y-4">
      <GrimoireBanner
        onGenerate={() => {
          setAiBookId(null);
          setAiOpen(true);
        }}
        onNewDeck={() => setForm({ open: true, deck: null })}
        onImport={() => setImportOpen(true)}
        onAutomations={goAutomations}
      />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          {hubQ.isLoading && <div className="rpg-panel h-36 animate-pulse" aria-busy aria-label="Carregando o ritual" />}
          {hubQ.isError && (
            <div className="rpg-panel p-4" role="alert">
              <p className="text-sm text-rpg-text">Não foi possível carregar o painel do Grimório.</p>
              <button type="button" className="rpg-btn rpg-btn-secondary mt-2" onClick={() => void hubQ.refetch()}>
                Tentar de novo
              </button>
            </div>
          )}
          {hub && <RitualPanel hub={hub} onStart={() => startRitual()} />}
          {hub && <IndicatorsRow hub={hub} />}

          <div ref={tabsRef} className="scroll-mt-4">
            <div role="tablist" aria-label="Seções do Grimório" className="-mx-4 flex gap-1 overflow-x-auto border-b-2 border-rpg-border px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
              {TABS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  role="tab"
                  type="button"
                  aria-selected={tab === value}
                  onClick={() => setTab(value)}
                  className={clsx(
                    "-mb-0.5 inline-flex min-h-[44px] shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-semibold transition-colors",
                    tab === value ? "border-rpg-gold text-rpg-gold-light" : "border-transparent text-rpg-muted hover:text-rpg-text",
                  )}
                >
                  <Icon size={15} aria-hidden /> {label}
                  {value === "biblioteca" && hub && hub.pendingSuggestions > 0 && (
                    <span className="ml-0.5 rounded-full bg-rpg-purple px-1.5 text-[10px] text-white">{hub.pendingSuggestions}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {tab === "baralhos" && (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">Buscar tomo</span>
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-rpg-muted" aria-hidden />
                  <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar tomo, disciplina ou livro…" className={`${selectClass} !pl-9`} />
                </label>
                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor="grimoire-sort">
                    Ordenar
                  </label>
                  <select id="grimoire-sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={`${selectClass} sm:!w-auto`}>
                    <option value="fila">Mais para revisar</option>
                    <option value="dominio">Maior domínio</option>
                    <option value="nome">Nome (A–Z)</option>
                    <option value="recentes">Mais recentes</option>
                  </select>
                  <label className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-xs text-rpg-muted">
                    <input type="checkbox" className="h-4 w-4" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                    Arquivados
                  </label>
                </div>
              </div>

              {decksQ.isLoading ? (
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3" aria-busy>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="rpg-panel h-44 animate-pulse" />
                  ))}
                </div>
              ) : decksQ.isError ? (
                <div className="rpg-panel p-4" role="alert">
                  <p className="text-sm">Não foi possível carregar os tomos.</p>
                  <button type="button" className="rpg-btn rpg-btn-secondary mt-2" onClick={() => void decksQ.refetch()}>
                    Tentar de novo
                  </button>
                </div>
              ) : decks.length === 0 ? (
                <div className="rpg-panel p-8 text-center">
                  <BookOpen size={32} className="mx-auto text-rpg-muted" aria-hidden />
                  <p className="rpg-title mt-3 text-lg font-bold">Seu grimório está em branco</p>
                  <p className="mx-auto mt-1 max-w-md text-sm text-rpg-muted">Crie um tomo e adicione cartões, importe um PDF/anotação ou gere sugestões com IA a partir de um texto, das notas de um livro ou do seu Diário.</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <button type="button" className="rpg-btn rpg-btn-gold inline-flex items-center gap-1" onClick={() => setForm({ open: true, deck: null })}>
                      <Plus size={15} aria-hidden /> Criar tomo
                    </button>
                    <button type="button" className="rpg-btn rpg-btn-secondary inline-flex items-center gap-1" onClick={() => setImportOpen(true)}>
                      Importar anotações
                    </button>
                  </div>
                </div>
              ) : visibleDecks.length === 0 ? (
                <div className="rpg-panel p-6 text-center text-sm text-rpg-muted">Nenhum tomo encontrado para “{search}”.</div>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                  {visibleDecks.map((d) => (
                    <li key={d.id}>
                      <GrimoireDeckTome
                        deck={d}
                        dueToday={dueByDeck.get(d.id) ?? 0}
                        today={queue?.today ?? hub?.today ?? ""}
                        selected={selectedId === d.id}
                        onOpen={() => setSelectedId(d.id === selectedId ? null : d.id)}
                        onStudy={() => startRitual(d)}
                        onEdit={() => setForm({ open: true, deck: d })}
                        onArchive={() => void toggleArchive(d)}
                        onDelete={() => setConfirmDeck(d)}
                      />
                    </li>
                  ))}
                </ul>
              )}

              <div ref={panelRef} className="scroll-mt-4 space-y-3">
                {selected && (
                  <>
                    <TomeToolbar
                      deck={selected}
                      hardLoading={hardLoading}
                      onHard={() => void studyHard(selected)}
                      onStudy={() => startRitual(selected)}
                      onGenerate={() => {
                        setAiBookId(null);
                        setAiOpen(true);
                      }}
                      onEdit={() => setForm({ open: true, deck: selected })}
                    />
                    <DeckCardsPanel key={selected.id} deck={selected} today={queue?.today ?? ""} onToast={notify} onClose={() => setSelectedId(null)} />
                  </>
                )}
              </div>
            </div>
          )}

          {tab === "biblioteca" && (
            <div className="space-y-3">
              {hub && hub.pendingSuggestions > 0 && (
                <button type="button" onClick={() => setSuggestionsOpen(true)} className="rpg-panel rpg-panel-gold flex w-full items-center gap-3 p-3 text-left">
                  <Wand2 size={18} className="text-rpg-gold" aria-hidden />
                  <span className="flex-1 text-sm text-rpg-text">{hub.pendingSuggestions} cartão(ões) sugerido(s) aguardando sua aprovação</span>
                  <span className="rpg-btn rpg-btn-gold text-xs">Revisar</span>
                </button>
              )}
              <ArcaneLibrary onImport={() => setImportOpen(true)} />
            </div>
          )}

          {tab === "automacoes" && (
            <AutomationsPanel
              module="grimoire"
              decks={activeDecks}
              title="Automações arcanas"
              intro="Fluxos que transformam seu conhecimento em estudo contínuo. Tudo que a IA propõe passa pela sua aprovação."
            />
          )}

          {tab === "estatisticas" && (
            <div className="space-y-3">
              {statsQ.data ? <GrimoireStatsPanel stats={statsQ.data} /> : statsQ.isLoading ? <div className="rpg-panel h-48 animate-pulse" /> : <p className="text-sm text-rpg-red">Não foi possível carregar as estatísticas.</p>}
              {hub && (
                <div className="grid gap-3 lg:grid-cols-2">
                  <ConsistencyCalendar hub={hub} />
                  <AccuracyByDeck hub={hub} />
                </div>
              )}
            </div>
          )}

          {tab === "conquistas" && hub && <GrimoireAchievements hub={hub} />}
        </div>

        <aside className="min-w-0 space-y-4" aria-label="Oráculo e fila automática">
          {hub && <OraclePanel hub={hub} onAction={(a) => void onOracle(a)} />}
          {diaryLoading && (
            <p className="flex items-center gap-1.5 text-xs text-rpg-muted">
              <Loader2 size={12} className="animate-spin" aria-hidden /> Lendo o Diário…
            </p>
          )}
          {hub && <AutoQueuePanel hub={hub} onReview={() => setSuggestionsOpen(true)} onRitual={() => startRitual()} />}
          <FlowExplainer />
        </aside>
      </div>

      {hub && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <RecentSpells hub={hub} />
          <DomainMap hub={hub} onOpen={openDeck} />
          <GrimoireAchievements hub={hub} compact />
        </div>
      )}

      <DeckFormModal open={form.open} deck={form.deck} prefill={form.prefill} onClose={() => setForm({ open: false, deck: null })} onSubmit={saveDeck} />
      <AIGeneratorModal
        open={aiOpen}
        decks={decks}
        defaultDeckId={selectedId}
        defaultBookId={aiBookId}
        onClose={() => setAiOpen(false)}
        onSaved={(n, name) => notify(`${n} ${n === 1 ? "cartão salvo" : "cartões salvos"} em “${name}”.`)}
      />
      <ImportModal open={importOpen} decks={activeDecks} onClose={() => setImportOpen(false)} onDone={(m) => notify(m)} />
      <SuggestionsModal open={suggestionsOpen} decks={activeDecks} onClose={() => setSuggestionsOpen(false)} onDone={(m) => notify(m)} />
      <Modal
        open={!!confirmDeck}
        onClose={() => setConfirmDeck(null)}
        size="sm"
        title="Excluir tomo?"
        footer={
          <>
            <button type="button" className="rpg-btn rpg-btn-ghost" onClick={() => setConfirmDeck(null)}>
              Cancelar
            </button>
            <button type="button" className="rpg-btn rpg-btn-danger" onClick={() => void removeDeck()} disabled={deleteDeck.isPending}>
              Excluir definitivamente
            </button>
          </>
        }
      >
        <p className="text-sm">
          “{confirmDeck?.name}” e seus {confirmDeck?.counts.total ?? 0} cartões (com o histórico de revisões) serão apagados. Se quiser só tirar da fila, prefira arquivar.
        </p>
      </Modal>
      <InlineToast message={toast?.text ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}

/** Barra de ações do tomo aberto: estudar, revisar difíceis, gerar com IA, meta vinculada e fontes. */
function TomeToolbar({ deck, hardLoading, onHard, onStudy, onGenerate, onEdit }: { deck: GrimoireDeck; hardLoading: boolean; onHard: () => void; onStudy: () => void; onGenerate: () => void; onEdit: () => void }) {
  const stats = useGrimoireStats(deck.id);
  return (
    <section className="rpg-panel rpg-panel-gold p-3" aria-label={`Tomo ${deck.name}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="rpg-title min-w-0 flex-1 truncate text-lg font-bold">📖 {deck.name}</p>
        <button type="button" onClick={onStudy} className="rpg-btn rpg-btn-gold text-xs" disabled={deck.counts.due + deck.counts.new === 0}>
          Estudar tomo
        </button>
        <button type="button" onClick={onHard} disabled={hardLoading || deck.counts.reinforce === 0} className="rpg-btn rpg-btn-secondary inline-flex items-center gap-1 text-xs">
          {hardLoading ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Repeat size={12} aria-hidden />} Revisar difíceis ({deck.counts.reinforce})
        </button>
        <button type="button" onClick={onGenerate} className="rpg-btn rpg-btn-secondary inline-flex items-center gap-1 text-xs">
          <Wand2 size={12} aria-hidden /> Gerar cartões
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-rpg-muted">
        <span>
          {deck.counts.total} cartões · {deck.counts.new} novos · {deck.counts.mature} maduros
        </span>
        {stats.data && (
          <span>
            Retenção (30d): {stats.data.retention30d == null ? `dados insuficientes (${stats.data.retentionSample}/10)` : `${stats.data.retention30d}%`} · sequência {stats.data.streak}d
          </span>
        )}
        <span>
          Meta:{" "}
          {deck.goalTitle ? (
            <span className="text-rpg-green">
              {deck.goalTitle} ({deck.goalSyncMode === "mastery" ? "pelo domínio" : deck.goalSyncMode === "study_days" ? "1 por dia de estudo" : "sem sincronizar"})
            </span>
          ) : (
            <button type="button" onClick={onEdit} className="text-rpg-gold-light underline">
              vincular a uma meta
            </button>
          )}
        </span>
      </div>
      {deck.sources.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {deck.sources.map((s, i) => (
            <li key={i}>
              {s.url ? (
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-block border border-rpg-border px-2 py-0.5 text-[11px] text-rpg-blue hover:border-rpg-gold" style={{ borderRadius: 3 }}>
                  {s.title} ↗
                </a>
              ) : (
                <span className="inline-block border border-rpg-border px-2 py-0.5 text-[11px] text-rpg-text/85" style={{ borderRadius: 3 }}>
                  {s.title}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AccuracyByDeck({ hub }: { hub: NonNullable<ReturnType<typeof useGrimoireHub>["data"]> }) {
  const rows = hub.domainMap.filter((d) => d.accuracy30d != null);
  return (
    <section className="rpg-panel p-4" aria-label="Acerto por tomo">
      <p className="rpg-title mb-2 text-base font-bold uppercase">Acerto por tomo (30 dias)</p>
      {rows.length === 0 ? (
        <p className="text-xs text-rpg-muted">Precisa de pelo menos 10 revisões de cartões aprendidos por tomo.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((d) => (
            <li key={d.deckId} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] items-center gap-2 text-sm">
              <span className="truncate text-rpg-text">{d.name}</span>
              <span className="h-2.5 border border-rpg-border bg-rpg-bg">
                <span className={clsx("block h-full", (d.accuracy30d ?? 0) >= 85 ? "bg-rpg-green" : (d.accuracy30d ?? 0) >= 70 ? "bg-rpg-gold" : "bg-rpg-red")} style={{ width: `${d.accuracy30d}%` }} />
              </span>
              <span className="w-10 text-right font-pixel text-xs tabular-nums">{d.accuracy30d}%</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default GrimorioPage;
