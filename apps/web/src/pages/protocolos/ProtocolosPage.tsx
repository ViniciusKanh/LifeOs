import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BookOpen, CheckCircle2, History, ListChecks, ListOrdered, Play, Plus, ScrollText, SearchX } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RPGButton, RPGToast } from "@/components/rpg";
import { TreasureSidePanel } from "@/components/treasure/TreasureSidePanel";
import { ProtocolHero } from "@/components/protocols/ProtocolHero";
import { ProtocolFilters } from "@/components/protocols/ProtocolFilters";
import { ProtocolCard } from "@/components/protocols/ProtocolCard";
import { ProtocolActionList, ProtocolDetail, ProtocolRunsList } from "@/components/protocols/ProtocolDetail";
import { ProtocolExecutionModal } from "@/components/protocols/ProtocolExecutionModal";
import { ProtocolWizard } from "@/components/protocols/ProtocolWizard";
import { RPGHowItWorks, type HowItWorksStep } from "@/components/rpg/RPGHowItWorks";
import { useProtocolRuns, useProtocols } from "@/hooks/useProtocols";
import { useWide } from "@/hooks/useWide";
import type { Protocol } from "@/services/protocolsService";
import { filterProtocols, matchesProtocol, sortProtocols, type ProtocolFilter, type ProtocolSort } from "@/utils/protocolDisplay";

const HOW_IT_WORKS: HowItWorksStep[] = [
  { icon: ListOrdered, tone: "blue", title: "Escolha ou monte uma rotina", text: "Use um modelo pronto (ex.: “Dormi mal”, “Início da semana”) ou crie o seu com os passos na ordem que você faria." },
  { icon: Play, tone: "purple", title: "Use quando o momento chegar", text: "Clique em “Usar agora”, confira os passos e desmarque o que não quiser. O LifeOS pode até lembrar você na hora certa." },
  { icon: CheckCircle2, tone: "green", title: "Menos decisões, mais ação", text: "O LifeOS faz a parte dele (cria tarefas, adia o que não cabe, agenda lembretes) e você marca o resto. Tudo fica no seu histórico." },
];

const FILTER_IDS: ProtocolFilter[] = ["all", "mine", "templates", "used", "recent", "favorites"];

/**
 * Protocolos: respostas prontas para situações recorrentes. Gatilhos só
 * sugerem; executar sempre passa por preview + seleção individual.
 * Templates globais nunca são editados — o usuário trabalha numa cópia.
 */
export function ProtocolosPage() {
  const { data, isLoading, isError, refetch, create, update, remove, clone, favorite, execute, updateRunStep, cancelRun } = useProtocols();
  const runs = useProtocolRuns();
  const wide = useWide();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<ProtocolFilter>("all");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<ProtocolSort>("relevance");
  const [query, setQuery] = useState("");
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [running, setRunning] = useState<Protocol | null>(null);
  const [wizard, setWizard] = useState<{ open: boolean; editing: Protocol | null }>({ open: false, editing: null });
  const [deleting, setDeleting] = useState<Protocol | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);

  const all = useMemo(() => data?.protocols ?? [], [data?.protocols]);
  const categories = data?.catalog.categories;
  const catLabel = useCallback((id: string) => categories?.find((c) => c.id === id)?.label ?? id, [categories]);
  const counts = useMemo(() => Object.fromEntries(FILTER_IDS.map((f) => [f, filterProtocols(all, f).length])) as Record<ProtocolFilter, number>, [all]);
  const visible = useMemo(
    () => sortProtocols(filterProtocols(all, filter).filter((p) => (category === "all" || p.category === category) && matchesProtocol(p, query, catLabel)), sort),
    [all, filter, category, query, sort, catLabel],
  );
  const selected = all.find((p) => p.ref === selectedRef) ?? all.find((p) => p.ref === data?.featured) ?? visible[0] ?? null;
  const mineCount = counts.mine;

  // Atalho vindo da tela Hoje: ?executar=<ref> abre direto a prévia (nunca executa sozinho).
  useEffect(() => {
    const ref = params.get("executar");
    if (!ref || all.length === 0) return;
    const p = all.find((x) => x.ref === ref);
    if (p) {
      setSelectedRef(p.ref);
      setRunning(p);
    }
    params.delete("executar");
    setParams(params, { replace: true });
  }, [params, setParams, all]);

  const fail = (e: unknown, fallback: string) => setToast({ msg: e instanceof Error ? e.message : fallback, tone: "error" });
  const select = (p: Protocol) => {
    setSelectedRef(p.ref);
    if (!wide) setSheetOpen(true);
  };
  const toggleFavorite = (p: Protocol) => favorite.mutate({ ref: p.ref, favorite: !p.favorite }, { onError: (e) => fail(e, "Não foi possível favoritar.") });
  const doClone = (p: Protocol) =>
    clone.mutate(p.ref.replace(/^t:/, ""), {
      onSuccess: (c) => {
        setSelectedRef(c.ref);
        setToast({ msg: `“${c.name}” agora está em Meus Protocolos.`, tone: "success" });
      },
      onError: (e) => fail(e, "Não foi possível adicionar o template."),
    });

  const detailProps = selected && {
    protocol: selected,
    categoryLabel: catLabel(selected.category),
    onExecute: () => setRunning(selected),
    onEdit: () => setWizard({ open: true, editing: selected }),
    onClone: () => doClone(selected),
    onFavorite: () => toggleFavorite(selected),
    onDelete: () => setDeleting(selected),
    busy: clone.isPending || remove.isPending,
  };
  const emptyAll = !isLoading && !isError && all.length === 0;
  const emptyMine = filter === "mine" && mineCount === 0;

  const grimoire = (
    <div className="rpg-panel rpg-panel-gold flex flex-col items-center text-center gap-3 py-10 px-4">
      <BookOpen size={36} className="text-rpg-gold" aria-hidden />
      <p className="font-pixel text-xs uppercase tracking-[0.16em] text-rpg-gold">Você ainda não tem protocolos seus</p>
      <p className="text-sm text-rpg-muted max-w-md">
        Pense numa situação que se repete — acordar, começar a semana, um dia de prova — e liste o que você costuma fazer nela. Ou comece copiando um modelo pronto e ajustando ao seu jeito.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <RPGButton variant="gold" onClick={() => setWizard({ open: true, editing: null })}>
          <Plus size={14} aria-hidden /> Criar protocolo
        </RPGButton>
        <RPGButton variant="secondary" onClick={() => setFilter("templates")}>
          <ScrollText size={14} aria-hidden /> Ver modelos prontos
        </RPGButton>
      </div>
    </div>
  );

  return (
    <div className="w-full px-4 md:px-6 lg:px-8 py-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px] items-start">
        <div className="space-y-4 min-w-0">
          <ProtocolHero onCreate={() => setWizard({ open: true, editing: null })} />
          <RPGHowItWorks storageKey="lifeos:protocolos:como-funciona" steps={HOW_IT_WORKS} />
          {isError ? (
            <div className="rpg-panel p-6 text-center">
              <p className="text-sm text-rpg-red">Não foi possível carregar os protocolos.</p>
              <RPGButton variant="secondary" className="mt-3" onClick={() => refetch()}>
                Tentar novamente
              </RPGButton>
            </div>
          ) : (
            <>
              {!emptyAll && (
                <ProtocolFilters
                  filter={filter}
                  onFilter={setFilter}
                  counts={counts}
                  category={category}
                  onCategory={setCategory}
                  categories={data?.catalog.categories ?? []}
                  sort={sort}
                  onSort={setSort}
                  query={query}
                  onQuery={setQuery}
                />
              )}
              {isLoading && (
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" aria-label="Carregando protocolos">
                  {Array.from({ length: 8 }, (_, i) => (
                    <div key={i} className="rpg-panel h-80 animate-pulse" />
                  ))}
                </div>
              )}
              {(emptyAll || emptyMine) && grimoire}
              {!isLoading && !emptyAll && !emptyMine && visible.length === 0 && (
                <div className="rpg-panel flex flex-col items-center text-center gap-2 py-8">
                  <SearchX size={28} className="text-rpg-muted" aria-hidden />
                  <p className="text-sm text-rpg-muted">Nenhum protocolo com esses filtros.</p>
                  <RPGButton
                    variant="ghost"
                    onClick={() => {
                      setFilter("all");
                      setCategory("all");
                      setQuery("");
                    }}
                  >
                    Limpar filtros
                  </RPGButton>
                </div>
              )}
              {visible.length > 0 && (
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {visible.map((p) => (
                    <ProtocolCard
                      key={p.ref}
                      protocol={p}
                      categoryLabel={catLabel(p.category)}
                      selected={selected?.ref === p.ref}
                      onSelect={() => select(p)}
                      onFavorite={() => toggleFavorite(p)}
                      onExecute={() => setRunning(p)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <aside className="space-y-4 min-w-0" aria-label="Protocolo em destaque e execuções">
          {wide && (
            <TreasureSidePanel id="protocolo-destaque" title={selectedRef ? "Protocolo selecionado" : "Protocolo em destaque"} icon={<ScrollText size={16} />}>
              {isLoading && <div className="h-64 rpg-bar animate-pulse" />}
              {!isLoading && !detailProps && <p className="text-sm text-rpg-muted py-2">Toque num protocolo para ver para que serve e o passo a passo.</p>}
              {detailProps && <ProtocolDetail {...detailProps} />}
            </TreasureSidePanel>
          )}
          {selected && wide && (
            <TreasureSidePanel id="protocolo-acoes" title="Passo a passo" icon={<ListChecks size={16} />}>
              <ProtocolActionList protocol={selected} />
            </TreasureSidePanel>
          )}
          <TreasureSidePanel id="protocolo-execucoes" title="Seus últimos usos" icon={<History size={16} />} defaultOpen={wide}>
            {runs.isLoading ? (
              <div className="h-24 rpg-bar animate-pulse" />
            ) : (
              <ProtocolRunsList
                runs={runs.data ?? []}
                busy={updateRunStep.isPending || cancelRun.isPending}
                onStep={(runId, stepRef, status) => updateRunStep.mutate({ runId, stepRef, status }, { onSuccess: () => void runs.refetch(), onError: (e) => fail(e, "Não foi possível atualizar o passo.") })}
                onCancel={(runId) => cancelRun.mutate(runId, { onSuccess: () => void runs.refetch(), onError: (e) => fail(e, "Não foi possível encerrar a execução.") })}
              />
            )}
          </TreasureSidePanel>
          <figure className="rpg-panel rpg-panel-gold overflow-hidden">
            <img src="/assets/rpg/protocols-quote.webp" alt="" aria-hidden loading="lazy" decoding="async" className="pixelated w-full h-28 object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
            <figcaption className="px-4 py-2.5 text-center text-sm italic text-rpg-gold-light/90 font-rpg">“Pequenos protocolos criam grandes jornadas.”</figcaption>
          </figure>
        </aside>
      </div>

      {!wide && (
        <Modal open={sheetOpen && !!detailProps} onClose={() => setSheetOpen(false)} title="Protocolo">
          {detailProps && (
            <div className="space-y-4">
              <ProtocolDetail
                {...detailProps}
                onExecute={() => {
                  setSheetOpen(false);
                  detailProps.onExecute();
                }}
                onEdit={() => {
                  setSheetOpen(false);
                  detailProps.onEdit();
                }}
                onDelete={() => {
                  setSheetOpen(false);
                  detailProps.onDelete();
                }}
              />
              <section aria-label="Passo a passo" className="border-t border-rpg-border/60 pt-3">
                <h3 className="mb-2 font-pixel text-[10px] uppercase tracking-[0.14em] text-rpg-gold">Passo a passo</h3>
                <ProtocolActionList protocol={detailProps.protocol} />
              </section>
            </div>
          )}
        </Modal>
      )}

      <ProtocolExecutionModal
        protocol={running}
        onClose={() => {
          setRunning(null);
          void runs.refetch();
        }}
        executing={execute.isPending}
        onExecute={(ref, body) => execute.mutateAsync({ ref, ...body })}
        onStep={(runId, stepRef, status) => updateRunStep.mutateAsync({ runId, stepRef, status })}
      />
      {data && (
        <ProtocolWizard
          open={wizard.open}
          editing={wizard.editing}
          catalog={data.catalog}
          saving={create.isPending || update.isPending}
          onClose={() => setWizard({ open: false, editing: null })}
          onSave={async (input) => {
            const p = wizard.editing ? await update.mutateAsync({ ref: wizard.editing.ref, input }) : await create.mutateAsync(input);
            setSelectedRef(p.ref);
            setToast({ msg: wizard.editing ? "Protocolo atualizado." : `Protocolo “${p.name}” criado.`, tone: "success" });
          }}
        />
      )}
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Excluir protocolo"
        size="sm"
        footer={
          <>
            <RPGButton variant="secondary" onClick={() => setDeleting(null)}>
              Cancelar
            </RPGButton>
            <RPGButton
              variant="danger"
              disabled={remove.isPending}
              onClick={() =>
                deleting &&
                remove.mutate(deleting.ref, {
                  onSuccess: () => {
                    setToast({ msg: `“${deleting.name}” foi excluído.`, tone: "success" });
                    setSelectedRef(null);
                    setDeleting(null);
                  },
                  onError: (e) => fail(e, "Não foi possível excluir."),
                })
              }
            >
              Excluir
            </RPGButton>
          </>
        }
      >
        <p className="text-sm text-rpg-text">
          Excluir “{deleting?.name}”? O histórico de usos e tudo que ele já criou (tarefas, hábitos, lembretes) continuam intactos.
        </p>
      </Modal>
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}
