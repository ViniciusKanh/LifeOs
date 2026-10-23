import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, Check, Heart, Loader2, NotebookPen } from "lucide-react";
import { RPGButton, RPGPanel } from "@/components/rpg";
import { rpgButtonClass } from "@/components/rpg/RPGButton";
import { JournalDayClosing } from "@/components/journal/JournalDayClosing";
import { useJournal } from "@/hooks/useJournal";
import { healthService } from "@/services/healthService";
import type { JournalUpsertInput } from "@/services/journalService";
import type { JournalEntry } from "@/types";

/**
 * O PUT do Diário substitui todos os campos manuais da entrada: reenviamos
 * o que já existe e trocamos só o "O que levo para amanhã" — assim a Taverna
 * nunca apaga a crônica, a gratidão ou o lugar escritos no Diário. A missão
 * principal (focusTaskIds) não é enviada e o backend a preserva.
 */
function payloadFrom(entry: JournalEntry | null, takeaway: string): JournalUpsertInput {
  return {
    thoughts: entry?.thoughts ?? null,
    gratitude: entry?.gratitude ?? [],
    selfCare: entry?.selfCare ?? [],
    selfCareOther: entry?.selfCareOther ?? null,
    nightTakeaway: takeaway.trim() ? takeaway : null,
    locationLabel: entry?.locationLabel ?? null,
    locationLat: entry?.locationLat ?? null,
    locationLng: entry?.locationLng ?? null,
    tags: entry?.tags ?? [],
  };
}

const hasText = (html: string | null | undefined) => !!html && html.replace(/<[^>]*>/g, "").trim().length > 0;

/** Passo 2 — Fechar o diário: reaproveita o fechamento do dia do Diário para a entrada de hoje. */
export function TavernJournalStep({ date, onSaved }: { date: string; onSaved: (saved: boolean) => void }) {
  const qc = useQueryClient();
  const { entry, isLoading, save, isSaving } = useJournal(date);
  const [takeaway, setTakeaway] = useState("");
  const [status, setStatus] = useState<"idle" | "dirty" | "saved" | "error">("idle");
  const loadedFor = useRef<string | null>(null);

  // Carrega o texto salvo uma única vez por dia (não sobrescreve o que está sendo digitado).
  useEffect(() => {
    if (!entry || loadedFor.current === entry.date) return;
    loadedFor.current = entry.date;
    setTakeaway(entry.nightTakeaway ?? "");
    if (hasText(entry.nightTakeaway)) onSaved(true);
  }, [entry, onSaved]);

  const persist = async () => {
    if (status !== "dirty") return;
    try {
      await save(payloadFrom(entry, takeaway));
      setStatus("saved");
      onSaved(hasText(takeaway));
    } catch {
      setStatus("error");
    }
  };

  const registerMood = async (mood: number, energy: number) => {
    const nowIso = new Date().toISOString();
    // Mesmo critério do Diário: fora do dia UTC corrente, ancora no meio do dia escolhido.
    const recordedAt = nowIso.slice(0, 10) === date ? nowIso : `${date}T12:00:00.000Z`;
    await healthService.addMood({ mood, energy, recordedAt });
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["journal"] }),
      qc.invalidateQueries({ queryKey: ["health"] }),
      qc.invalidateQueries({ queryKey: ["analytics"] }),
    ]);
  };

  if (isLoading) return <div className="h-64 rpg-panel animate-pulse motion-reduce:animate-none" aria-label="Carregando o diário de hoje" />;
  // Sem entrada no banco o GET devolve uma entrada vazia; null aqui só acontece quando a leitura falhou.
  if (!entry) return <p className="rpg-panel p-4 text-sm text-rpg-red" role="alert">Não foi possível carregar o diário de hoje. Tente novamente em instantes.</p>;

  const gratitude = (entry?.gratitude ?? []).filter((g) => g.trim());
  const wroteChronicle = hasText(entry?.thoughts);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <RPGPanel title="Crônica de hoje" icon={<BookOpen size={15} />}>
          {wroteChronicle ? (
            <p className="flex items-center gap-2 text-sm text-rpg-text">
              <Check size={14} className="text-rpg-green" aria-hidden /> Você já escreveu sobre o dia.
            </p>
          ) : (
            <p className="text-sm text-rpg-muted">Ainda sem crônica hoje. Se quiser contar como foi, abra o Diário.</p>
          )}
          <Link to={`/diario?date=${date}`} className={rpgButtonClass("secondary", "mt-3 inline-flex")}>
            <NotebookPen size={14} aria-hidden /> {wroteChronicle ? "Abrir no Diário" : "Escrever no Diário"}
          </Link>
        </RPGPanel>
        <RPGPanel title="Gratidão" icon={<Heart size={15} />}>
          {gratitude.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-rpg-text">
              {gratitude.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-rpg-muted">Nada anotado em gratidão hoje — dá para registrar no Diário.</p>
          )}
        </RPGPanel>
      </div>

      <JournalDayClosing
        headingId="taverna-fechamento-titulo"
        auto={entry?.auto}
        legacyNightMood={entry?.nightMood ?? null}
        takeaway={takeaway}
        onTakeawayChange={(v) => {
          setTakeaway(v);
          setStatus("dirty");
        }}
        onTakeawayBlur={() => void persist()}
        onRegisterMood={registerMood}
      />

      <div className="flex flex-wrap items-center justify-end gap-3">
        <span className="text-xs text-rpg-muted" role="status" aria-live="polite">
          {status === "saved" && "Salvo no diário de hoje."}
          {status === "dirty" && "Alterações ainda não salvas."}
          {status === "error" && <span className="text-rpg-red">Não foi possível salvar. Tente de novo.</span>}
        </span>
        <RPGButton variant="success" onClick={() => void persist()} disabled={status !== "dirty" || isSaving}>
          {isSaving ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Check size={14} aria-hidden />} Salvar no diário
        </RPGButton>
      </div>
    </div>
  );
}
