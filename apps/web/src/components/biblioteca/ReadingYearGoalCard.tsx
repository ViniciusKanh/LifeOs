import { useEffect, useState } from "react";
import { Pencil, Target } from "lucide-react";
import { Button, Card, IconBadge } from "@/components/ui/primitives";
import { Modal, FormRow, inputClass } from "@/components/ui/Modal";
import { RPG_SECTION_TITLE } from "@/components/rpg/rpgAssets";
import { useReadingYear } from "@/hooks/useReadingYear";
import type { PaceStatus, TargetProgress } from "@/services/readingYearService";
import { Chip, SkeletonBlock, errorMessage } from "@/components/grimorio/grimoireUi";

const PACE: Record<PaceStatus, { label: string; tone: "green" | "blue" | "orange" | "slate" }> = {
  adiantado: { label: "Adiantado", tone: "green" },
  no_ritmo: { label: "No ritmo", tone: "blue" },
  atrasado: { label: "Atrasado", tone: "orange" },
  sem_dados: { label: "Começando", tone: "slate" },
};
const fmt = (n: number) => n.toLocaleString("pt-BR");

function TargetRow({ label, unit, p, perDayUnit }: { label: string; unit: string; p: TargetProgress; perDayUnit: string }) {
  const pace = PACE[p.status];
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold">{label}</span>
        <Chip tone={pace.tone}>{pace.label}</Chip>
      </div>
      <p className="mt-1 text-sm">
        <span className="font-display font-bold text-lg rpg:font-pixel">{fmt(p.done)}</span>
        <span className="text-slate"> / {fmt(p.target)} {unit}</span>
      </p>
      <div
        className="mt-1 h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border rpg:h-3 rpg:rounded-sm rpg:border-2 rpg:border-black/60 rpg:bg-rpg-bg"
        role="progressbar"
        aria-label={`${label}: ${p.pct}% da meta`}
        aria-valuenow={p.pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-cat-pink rpg:rounded-none rpg:bg-rpg-pink" style={{ width: `${p.pct}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-slate">
        Esperado até hoje: {fmt(Math.round(p.expectedByNow))}
        {p.projected != null && <> · projeção no ritmo atual: {fmt(p.projected)}</>}
        {p.remainingPerDay != null && p.remainingPerDay > 0 && (
          <>
            {" "}
            · faltam ~{perDayUnit === "semana" ? fmt(Math.round(p.remainingPerDay * 7 * 10) / 10) : fmt(Math.ceil(p.remainingPerDay))}/{perDayUnit}
          </>
        )}
      </p>
    </div>
  );
}

/**
 * Meta anual de leitura (livros e/ou páginas). Progresso, ritmo e projeção
 * vêm do servidor, calculados de livros concluídos e sessões de leitura reais.
 */
export function ReadingYearGoalCard() {
  const { data, isLoading, isError, refetch, saveGoal, removeGoal } = useReadingYear();
  const [open, setOpen] = useState(false);
  const [books, setBooks] = useState("");
  const [pages, setPages] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !data) return;
    setBooks(data.goal?.booksTarget ? String(data.goal.booksTarget) : "");
    setPages(data.goal?.pagesTarget ? String(data.goal.pagesTarget) : "");
    setError(null);
  }, [open, data]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;
    const b = books.trim() ? Number(books) : null;
    const p = pages.trim() ? Number(pages) : null;
    if (b == null && p == null) return setError("Defina ao menos uma meta: livros ou páginas.");
    if ((b != null && (!Number.isInteger(b) || b < 1 || b > 1000)) || (p != null && (!Number.isInteger(p) || p < 1 || p > 1_000_000))) {
      return setError("Use números inteiros positivos (até 1.000 livros / 1.000.000 páginas).");
    }
    try {
      await saveGoal.mutateAsync({ year: data.year, booksTarget: b, pagesTarget: p });
      setOpen(false);
    } catch (err) {
      setError(errorMessage(err, "Não foi possível salvar a meta."));
    }
  };

  const remove = async () => {
    if (!data) return;
    try {
      await removeGoal.mutateAsync(data.year);
      setOpen(false);
    } catch (err) {
      setError(errorMessage(err, "Não foi possível remover a meta."));
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <IconBadge tone="pink" size={30} icon={<Target size={14} />} />
          <p className={`text-sm font-semibold ${RPG_SECTION_TITLE}`}>Meta de {data?.year ?? new Date().getFullYear()}</p>
        </div>
        {data?.goal && (
          <button className="p-1.5 rounded-lg text-slate hover:bg-black/[0.04] dark:hover:bg-white/[0.06]" aria-label="Editar meta anual de leitura" onClick={() => setOpen(true)}>
            <Pencil size={14} />
          </button>
        )}
      </div>
      {isLoading ? (
        <SkeletonBlock className="h-20" />
      ) : isError || !data ? (
        <p className="text-xs text-slate" role="alert">
          Não foi possível carregar a meta.{" "}
          <button className="underline" onClick={() => void refetch()}>
            Tentar de novo
          </button>
        </p>
      ) : !data.goal ? (
        <div>
          <p className="text-xs text-slate">
            Neste ano: {fmt(data.booksFinished)} {data.booksFinished === 1 ? "livro concluído" : "livros concluídos"} e {fmt(data.pagesRead)} páginas registradas em sessões.
          </p>
          <Button variant="secondary" className="mt-3 w-full" onClick={() => setOpen(true)}>
            <Target size={14} aria-hidden /> Definir meta anual
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {data.books && <TargetRow label="Livros" unit="livros" p={data.books} perDayUnit="semana" />}
          {data.pages && <TargetRow label="Páginas" unit="páginas" p={data.pages} perDayUnit="dia" />}
          {!data.books && <p className="text-[11px] text-slate">{fmt(data.booksFinished)} livros concluídos no ano.</p>}
          {!data.pages && <p className="text-[11px] text-slate">{fmt(data.pagesRead)} páginas registradas no ano.</p>}
          <p className="text-[10px] text-slate">Dia {data.dayOfYear} de {data.daysInYear}. Páginas contam só sessões de leitura registradas.</p>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title={`Meta de leitura de ${data?.year ?? ""}`}
        footer={
          <>
            {data?.goal && (
              <Button variant="ghost" className="mr-auto text-drop" onClick={() => void remove()} disabled={removeGoal.isPending}>
                Remover meta
              </Button>
            )}
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="reading-goal-form" disabled={saveGoal.isPending}>
              Salvar
            </Button>
          </>
        }
      >
        <form id="reading-goal-form" onSubmit={submit} className="space-y-4" noValidate>
          <FormRow label="Livros no ano" htmlFor="goal-books" hint="Deixe vazio para não acompanhar.">
            <input id="goal-books" type="number" inputMode="numeric" min={1} max={1000} className={inputClass} value={books} onChange={(e) => setBooks(e.target.value)} />
          </FormRow>
          <FormRow label="Páginas no ano" htmlFor="goal-pages" hint="Somadas das sessões de leitura registradas.">
            <input id="goal-pages" type="number" inputMode="numeric" min={1} max={1000000} className={inputClass} value={pages} onChange={(e) => setPages(e.target.value)} />
          </FormRow>
          {error && (
            <p role="alert" className="text-xs text-drop rpg:text-rpg-red">
              {error}
            </p>
          )}
        </form>
      </Modal>
    </Card>
  );
}
