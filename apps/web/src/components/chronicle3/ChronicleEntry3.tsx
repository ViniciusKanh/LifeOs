import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import {
  Award,
  BookOpen,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Droplets,
  Feather,
  Flame,
  Heart,
  Lightbulb,
  ListChecks,
  Loader2,
  MapPin,
  Mic,
  Moon,
  PenLine,
  Plus,
  Quote,
  RefreshCw,
  Save,
  Smile,
  Sparkles,
  Star,
  Tags,
  Trash2,
  Trophy,
  Undo2,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import type { Editor } from "@tiptap/react";
import type { JournalEntry, JournalMedia } from "@/types";
import { RPGBadge, RPGButton, RPGProgressBar } from "@/components/rpg";
import { RichTextEditor } from "@/components/journal/RichTextEditor";
import { useChronicleEntryActions, useChronicleEntryMeta } from "@/hooks/useChronicleEntry";
import type { ScribeAction, ScribeResult } from "@/services/chronicleEntryService";
import { taskService } from "@/services/taskService";
import { MOOD_EMOJI } from "@/utils/journalMood";
import { VoiceNotes } from "./VoiceNotes";

const ART = "/assets/rpg/modules/diary3";
const R = { borderRadius: 4 };

/** Campos do formulário do dia que a Entrada 3.0 lê/escreve (mesmo estado do editor clássico). */
export interface EntryForm {
  thoughts: string;
  gratitude: string[];
  selfCare: string[];
  selfCareOther: string;
  nightTakeaway: string;
  closingReflection: string;
  closingLearning: string;
  closingPending: string;
  locationLabel: string;
  tags: string[];
}

/** Contexto vindo do editor do Diário: mesma lógica de salvamento, conflito e rascunho. */
export interface EntryCtx {
  date: string;
  goToDate: (d: string) => void;
  onBack: () => void;
  isToday: boolean;
  entry: JournalEntry | null | undefined;
  isLoading: boolean;
  isSaving: boolean;
  justSaved: boolean;
  form: EntryForm;
  updateField: (patch: Partial<EntryForm>) => void;
  saveNow: (patch?: Partial<EntryForm>) => void;
  saveAllNow: () => void;
  flushPendingSave: () => Promise<void>;
  conflict: boolean;
  resolveConflict: (keepMine: boolean) => void;
  draftFound: boolean;
  recoverDraft: () => void;
  discardDraft: () => void;
  toggleFavorite: () => void;
  isTogglingFavorite: boolean;
  deleteEntry: () => void;
  exportPdf: () => void;
  isExportingPdf: boolean;
  writingMode: boolean;
  setWritingMode: (v: boolean) => void;
  selfCareOptions: Array<{ key: string; label: string }>;
  combinedSelfCare: Set<string>;
  autoSelfCare: string[];
  toggleSelfCare: (key: string) => void;
  registerMood: (mood: number, energy: number, stress?: number | null, note?: string | null) => Promise<void>;
  addAudio: (dataUri: string, durationSeconds: number) => Promise<unknown>;
  removeMedia: (id: string) => void;
  isAddingAudio: boolean;
  streakHighlight: { habitName: string; streak: number } | null;
  /** Componentes já existentes reaproveitados (mesmas regras e permissões). */
  slots: { organizer: ReactNode; media: ReactNode; location: ReactNode; dayState: ReactNode; labNote: ReactNode; weekInsights: ReactNode; moments: ReactNode };
  photoError: string | null;
}

const PROMPTS = ["Como me senti hoje?", "O que aprendi?", "Qual foi o desafio?", "Do que me orgulho?", "O que me fez bem?", "Pelo que sou grato?", "O que faria diferente?", "Quem fez meu dia melhor?"];
const ENERGY = [1, 2, 3, 4, 5];
const MOOD_NAMES = ["Muito mal", "Mal", "Neutro", "Bem", "Muito bem"];
const ICON = { pen: PenLine, water: Droplets, book: BookOpen, mood: Smile } as const;

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const toHtml = (text: string) =>
  text
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join("");
const countWords = (html: string) => {
  const plain = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").trim();
  return plain ? plain.split(/\s+/).length : 0;
};
const longDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
const shift = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00`);
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
};

function Panel({ id, num, icon, title, subtitle, meta, children, className }: { id?: string; num?: string; icon: ReactNode; title: string; subtitle?: string; meta?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-t` : undefined} className={clsx("min-w-0 scroll-mt-4 border-2 border-rpg-gold/50 bg-rpg-panel p-3 sm:p-4", className)} style={R}>
      <div className="mb-2 flex min-w-0 items-start gap-2">
        {num && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-rpg-gold/70 font-rpg text-sm font-bold text-rpg-gold" style={{ borderRadius: 3 }} aria-hidden>
            {num}
          </span>
        )}
        <span className="mt-1 shrink-0 text-rpg-pink" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={id ? `${id}-t` : undefined} tabIndex={-1} className="font-rpg text-sm font-bold uppercase tracking-wide text-rpg-gold-light">
            {title}
          </h2>
          {subtitle && <p className="text-[11px] italic text-rpg-muted">{subtitle}</p>}
        </div>
        {meta}
      </div>
      {children}
    </section>
  );
}

/* ═════════════════════════ Escriba Arcano ═════════════════════════ */

const ACTIONS: Array<{ a: ScribeAction; label: string }> = [
  { a: "summary", label: "Resumo" },
  { a: "review", label: "Revisar texto" },
  { a: "organize", label: "Organizar" },
  { a: "title", label: "Sugerir título" },
  { a: "moments", label: "Destacar momentos" },
  { a: "learnings", label: "Aprendizados" },
  { a: "tasks", label: "Extrair tarefas" },
  { a: "tags", label: "Sugerir tags" },
  { a: "expand", label: "Perguntas para aprofundar" },
];

function Scribe({ ctx, consent, setConsent, notify }: { ctx: EntryCtx; consent: boolean; setConsent: (v: boolean) => void; notify: (m: string, err?: boolean) => void }) {
  const { scribe } = useChronicleEntryActions(ctx.date);
  const [res, setRes] = useState<ScribeResult | null>(null);
  const [picked, setPicked] = useState<boolean[]>([]);
  const [undo, setUndo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ask = async (a: ScribeAction) => {
    if (!consent) return;
    await ctx.flushPendingSave();
    try {
      const r = await scribe.mutateAsync(a);
      setRes(r);
      setPicked(r.items.map(() => true));
    } catch (err) {
      notify(err instanceof Error ? err.message : "O Escriba não respondeu.", true);
    }
  };
  const chosen = res ? res.items.filter((_, i) => picked[i]) : [];
  const append = (html: string) => ctx.saveNow({ thoughts: (ctx.form.thoughts.trim() && ctx.form.thoughts !== "<p></p>" ? ctx.form.thoughts : "") + html });
  const apply = async () => {
    if (!res) return;
    setBusy(true);
    try {
      switch (res.action) {
        case "review":
        case "organize":
          if (res.text) {
            setUndo(ctx.form.thoughts);
            ctx.saveNow({ thoughts: toHtml(res.text) });
            notify("Texto substituído. Use “Desfazer” para voltar ao original.");
          }
          break;
        case "summary":
          if (res.text) append(`<blockquote><p><strong>Resumo:</strong> ${esc(res.text)}</p></blockquote>`);
          break;
        case "title":
          if (res.text) {
            setUndo(ctx.form.thoughts);
            ctx.saveNow({ thoughts: `<h2>${esc(res.text)}</h2>${ctx.form.thoughts}` });
          }
          break;
        case "moments":
          append(`<p><strong>Momentos-chave</strong></p><ul>${chosen.map((m) => `<li><p>${esc(m)}</p></li>`).join("")}</ul>`);
          break;
        case "learnings":
          ctx.saveNow({ closingLearning: [ctx.form.closingLearning.trim(), ...chosen].filter(Boolean).join("\n") });
          notify("Aprendizados levados ao fechamento do dia.");
          break;
        case "expand":
          append(chosen.map((q) => `<h3>${esc(q)}</h3><p></p>`).join(""));
          break;
        case "tags":
          ctx.saveNow({ tags: [...new Set([...ctx.form.tags, ...chosen.map((t) => t.toLowerCase().slice(0, 40))])].slice(0, 15) });
          notify("Etiquetas adicionadas ao dia.");
          break;
        case "tasks":
          for (const t of chosen) await taskService.create({ title: t.slice(0, 200), description: `Extraída da crônica de ${ctx.date.split("-").reverse().join("/")}.`, dueDate: null });
          notify(`${chosen.length} missão(ões) criada(s) a partir da crônica.`);
          break;
      }
      setRes(null);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Não foi possível aplicar.", true);
    } finally {
      setBusy(false);
    }
  };
  const applyLabel: Record<ScribeAction, string> = {
    review: "Substituir pelo texto revisado",
    organize: "Substituir pelo texto organizado",
    summary: "Inserir resumo no fim",
    title: "Usar como título",
    moments: "Inserir momentos selecionados",
    learnings: "Levar ao fechamento",
    expand: "Inserir perguntas no texto",
    tags: "Adicionar etiquetas",
    tasks: "Criar missões selecionadas",
  };
  return (
    <div className="space-y-2">
      <label className="flex items-start gap-2 border border-rpg-purple/50 bg-rpg-purple/5 p-2 text-[11px] text-rpg-text/90" style={{ borderRadius: 3 }}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-[rgb(var(--rpg-purple))]" />
        <span>
          Autorizo enviar o texto desta crônica ao Gemini enquanto esta tela estiver aberta. O Escriba só sugere: o original fica intacto até você aprovar. Fotos, áudios e documentos não são enviados por aqui.
        </span>
      </label>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ações do Escriba Arcano">
        {ACTIONS.map((x) => (
          <button key={x.a} type="button" disabled={!consent || scribe.isPending} onClick={() => void ask(x.a)} className="flex min-h-[34px] items-center gap-1 border border-rpg-border bg-rpg-bg-2 px-2 text-[11px] font-semibold text-rpg-text hover:border-rpg-purple disabled:opacity-40" style={{ borderRadius: 3 }}>
            {scribe.isPending && scribe.variables === x.a ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} className="text-rpg-purple" />} {x.label}
          </button>
        ))}
      </div>
      {undo !== null && (
        <button type="button" className="flex items-center gap-1 text-[11px] text-rpg-blue hover:underline" onClick={() => (ctx.saveNow({ thoughts: undo }), setUndo(null), notify("Texto original restaurado."))}>
          <Undo2 size={12} aria-hidden /> Desfazer a última alteração do Escriba
        </button>
      )}
      {res && (
        <div className="space-y-2 border-2 border-rpg-purple/60 bg-rpg-bg-2 p-2" style={{ borderRadius: 3 }} role="region" aria-label="Prévia do Escriba">
          <div className="flex items-center gap-1.5">
            <RPGBadge tone="purple" icon={<Sparkles size={9} aria-hidden />}>
              Prévia do Escriba (sugestão da IA)
            </RPGBadge>
            <button type="button" className="ml-auto text-rpg-muted hover:text-rpg-text" aria-label="Descartar prévia" onClick={() => setRes(null)}>
              <X size={14} />
            </button>
          </div>
          {res.text && <p className="max-h-60 overflow-y-auto whitespace-pre-wrap text-sm text-rpg-text">{res.text}</p>}
          {res.items.length > 0 && (
            <ul className="space-y-1">
              {res.items.map((it, i) => (
                <li key={i}>
                  <label className="flex items-start gap-2 text-sm text-rpg-text">
                    <input type="checkbox" checked={picked[i] ?? false} onChange={(e) => setPicked((p) => p.map((v, j) => (j === i ? e.target.checked : v)))} className="mt-1 accent-[rgb(var(--rpg-gold))]" />
                    {it}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {res.items.length === 0 && !res.text && <p className="text-xs text-rpg-muted">Nada encontrado para esta ação.</p>}
          <div className="flex flex-wrap gap-2">
            <RPGButton variant="gold" className="min-h-[34px] text-xs" disabled={busy || (res.items.length > 0 && chosen.length === 0) || (!res.text && res.items.length === 0)} onClick={() => void apply()}>
              <Check size={12} aria-hidden /> {applyLabel[res.action]}
            </RPGButton>
            <RPGButton variant="ghost" className="min-h-[34px] text-xs" onClick={() => setRes(null)}>
              Descartar
            </RPGButton>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═════════════════════════ Estado emocional (Saúde) ═════════════════════════ */

function MoodCheckin({ ctx, notify }: { ctx: EntryCtx; notify: (m: string, err?: boolean) => void }) {
  const reg = ctx.entry?.auto.mood ?? null;
  const [mood, setMood] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [stress, setStress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [again, setAgain] = useState(false);
  const save = async () => {
    if (!mood || !energy) return;
    setSaving(true);
    try {
      await ctx.registerMood(mood, energy, stress, "Fechamento do dia (Diário)");
      notify("Estado emocional registrado em Saúde.");
      setAgain(false);
      setMood(null);
      setEnergy(null);
      setStress(null);
    } catch {
      notify("Não foi possível registrar em Saúde.", true);
    } finally {
      setSaving(false);
    }
  };
  if (reg && !again)
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-rpg-text">
        <span className="text-2xl" aria-hidden>
          {MOOD_EMOJI[reg.mood - 1]}
        </span>
        <span>
          Humor {reg.mood}/5 · energia {reg.energy}/5{reg.stress != null ? ` · estresse ${reg.stress}/5` : ""} <span className="text-[11px] text-rpg-muted">(registrado em Saúde)</span>
        </span>
        <button type="button" className="text-[11px] text-rpg-blue hover:underline" onClick={() => setAgain(true)}>
          Registrar o estado final do dia
        </button>
      </div>
    );
  const Scale = ({ label, value, set, icons }: { label: string; value: number | null; set: (n: number) => void; icons?: string[] }) => (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-[11px] text-rpg-muted">{label}</legend>
      <div className="flex gap-1">
        {ENERGY.map((n) => (
          <button key={n} type="button" aria-pressed={value === n} onClick={() => set(n)} className={clsx("flex h-10 min-w-[40px] flex-1 items-center justify-center border-2 text-sm", value === n ? "border-rpg-pink bg-rpg-pink/15 text-rpg-text" : "border-rpg-border text-rpg-muted hover:text-rpg-text")} style={{ borderRadius: 3 }} aria-label={`${label} ${n} de 5${icons ? ` (${MOOD_NAMES[n - 1]})` : ""}`}>
            {icons ? <span className="text-lg">{icons[n - 1]}</span> : n}
          </button>
        ))}
      </div>
    </fieldset>
  );
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <Scale label="Humor" value={mood} set={setMood} icons={MOOD_EMOJI} />
        <Scale label="Energia" value={energy} set={setEnergy} />
        <Scale label="Estresse (opcional)" value={stress} set={setStress} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <RPGButton variant="pink" className="min-h-[36px] text-xs" disabled={!mood || !energy || saving} onClick={() => void save()}>
          {saving ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Heart size={12} aria-hidden />} Registrar em Saúde
        </RPGButton>
        <span className="text-[11px] text-rpg-muted">Fonte única de humor e energia do LifeOS — nada é gravado no Diário em duplicidade.</span>
      </div>
    </div>
  );
}

/* ═════════════════════════ Tela ═════════════════════════ */

/**
 * Entrada do Diário 3.0 — Crônica Pessoal. Reaproveita toda a lógica do editor
 * (autosave, conflito entre dispositivos, rascunho local, mídia protegida por
 * login) e acrescenta capítulos, meta de escrita, Escriba Arcano com prévia e
 * consentimento, notas de voz 3.0, fechamento completo e painéis do dia.
 */
export function ChronicleEntry3({ ctx }: { ctx: EntryCtx }) {
  const meta = useChronicleEntryMeta(ctx.date).data;
  const { setGoal, transcribe, toGrimoire } = useChronicleEntryActions(ctx.date);
  const [consent, setConsent] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [goalEdit, setGoalEdit] = useState<string | null>(null);
  const [toast, setToast] = useState<{ m: string; err?: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [transcript, setTranscript] = useState<{ text: string } | null>(null);
  const [promptPage, setPromptPage] = useState(0);
  const notify = (m: string, err?: boolean) => {
    setToast({ m, err });
    window.setTimeout(() => setToast(null), 3500);
  };
  const f = ctx.form;
  const e = ctx.entry;
  const auto = e?.auto;
  const words = useMemo(() => countWords(f.thoughts), [f.thoughts]);
  const goal = meta?.writingGoal ?? 300;
  const gratitudeFilled = f.gratitude.filter((g) => g.trim()).length;
  const audio = (e?.media ?? []).filter((m) => m.kind === "audio");
  const visual = (e?.media ?? []).filter((m) => m.kind !== "audio").length;
  const closingFilled = !!(f.closingReflection.trim() || f.closingLearning.trim() || f.closingPending.trim() || countWords(f.nightTakeaway) > 0 || auto?.mood);
  const sections = [
    { id: "c3-relato", label: "Relato", done: words > 0 },
    { id: "c3-momentos", label: "Momentos", done: !!e?.ai },
    { id: "c3-gratidao", label: "Gratidão", done: gratitudeFilled > 0 },
    { id: "c3-gratidao", label: "Cuidado", done: ctx.combinedSelfCare.size > 0 || !!f.selfCareOther.trim() },
    { id: "c3-midias", label: "Mídias", done: visual > 0 },
    { id: "c3-voz", label: "Voz", done: audio.length > 0 },
    { id: "c3-fechamento", label: "Fechamento", done: closingFilled },
    { id: "c3-lugar", label: "Lugar e tags", done: !!f.locationLabel || f.tags.length > 0 || (e?.links.length ?? 0) > 0 },
  ];
  const sectionsDone = sections.filter((s) => s.done).length;
  const ch = meta?.chapter;
  const nodes = ch?.chapterSpan ? Math.min(10, ch.chapterSpan) : 10;
  const filledNodes = ch ? Math.round((ch.pct / 100) * nodes) : 0;

  const insertPrompt = (q: string) => {
    if (editor) {
      editor.chain().focus("end").insertContent(`<h3>${esc(q)}</h3><p></p>`).run();
    } else ctx.saveNow({ thoughts: `${f.thoughts}<h3>${esc(q)}</h3><p></p>` });
  };
  const setGratitude = (i: number, v: string) => ctx.updateField({ gratitude: f.gratitude.map((g, j) => (j === i ? v : g)) });
  const visiblePrompts = PROMPTS.slice((promptPage * 4) % PROMPTS.length, ((promptPage * 4) % PROMPTS.length) + 4);
  const goTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    document.getElementById(`${id}-t`)?.focus({ preventScroll: true });
  };

  const stat = (icon: ReactNode, label: string, value: ReactNode, tone: string) => (
    <div className="flex min-w-0 items-center gap-2 border-2 border-rpg-border bg-rpg-bg/70 px-2.5 py-2" style={R}>
      <span className={clsx("shrink-0 [&>svg]:h-5 [&>svg]:w-5", tone)} aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] text-rpg-muted">{label}</p>
        <p className={clsx("truncate font-rpg text-base font-bold leading-tight tabular-nums", tone)}>{value}</p>
      </div>
    </div>
  );

  return (
    <div className="w-full space-y-3 px-3 py-4 sm:px-4 md:px-6 md:py-6">
      {/* ── Cabeçalho épico ── */}
      <header className="relative overflow-hidden border-2 border-rpg-gold/60 bg-gradient-to-br from-[#1b1036] via-[#2a1450] to-[#120a24]" style={R}>
        <img src={`${ART}/banner-hero.webp`} alt="" aria-hidden className="pixelated absolute bottom-0 left-0 hidden h-full w-auto opacity-90 sm:block" />
        <img src={`${ART}/banner-castle.webp`} alt="" aria-hidden className="pixelated absolute bottom-0 right-0 h-full w-auto opacity-80" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-rpg-bg/20 to-rpg-bg/80" aria-hidden />
        <div className="relative flex flex-col items-center gap-1 px-3 pb-3 pt-4 text-center">
          <div className="flex w-full items-center justify-between gap-2">
            <button type="button" onClick={ctx.onBack} className="flex items-center gap-1 text-xs text-rpg-text/80 hover:text-rpg-gold-light">
              <ChevronLeft size={14} aria-hidden /> Entradas
            </button>
            <span className="flex items-center gap-1 text-[11px] text-rpg-text/80" aria-live="polite">
              {ctx.isSaving ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Check size={12} className={ctx.justSaved ? "text-rpg-green" : "text-rpg-muted"} aria-hidden />}
              {ctx.isSaving ? "Salvando…" : ctx.justSaved ? "Salvo!" : "Salvando automaticamente"}
            </span>
          </div>
          <p className="font-pixel text-[10px] uppercase tracking-[0.3em] text-rpg-gold">Diário</p>
          <h1 className="rpg-title text-2xl font-bold text-rpg-pink sm:text-4xl">Crônica da Jornada</h1>
          {ch && (
            <p className="text-sm text-rpg-gold-light">
              Capítulo {ch.roman} — {ch.title}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={() => ctx.goToDate(meta?.prevDate ?? shift(ctx.date, -1))} className="p-1.5 text-rpg-text hover:text-rpg-gold-light" aria-label={meta?.prevDate ? "Entrada anterior" : "Dia anterior"} title={meta?.prevDate ? `Entrada anterior (${meta.prevDate.split("-").reverse().join("/")})` : "Dia anterior"}>
              <ChevronLeft size={18} />
            </button>
            <p className="text-sm capitalize text-rpg-text">{longDate(ctx.date)}</p>
            <button
              type="button"
              disabled={ctx.isToday && !meta?.nextDate}
              onClick={() => ctx.goToDate(meta?.nextDate ?? shift(ctx.date, 1))}
              className="p-1.5 text-rpg-text hover:text-rpg-gold-light disabled:opacity-30"
              aria-label={meta?.nextDate ? "Próxima entrada" : "Próximo dia"}
            >
              <ChevronRight size={18} />
            </button>
            {!ctx.isToday && (
              <button type="button" onClick={() => ctx.goToDate(meta?.today ?? new Date().toISOString().slice(0, 10))} className="text-[11px] text-rpg-blue underline">
                Hoje
              </button>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
            <RPGButton variant="ghost" className="min-h-[34px] px-2 text-xs" onClick={ctx.exportPdf} disabled={ctx.isExportingPdf} aria-label="Exportar PDF desta entrada">
              {ctx.isExportingPdf ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Exportar
            </RPGButton>
            <RPGButton variant="ghost" className={clsx("min-h-[34px] px-2 text-xs", e?.isFavorite && "text-rpg-gold")} onClick={ctx.toggleFavorite} disabled={ctx.isTogglingFavorite} aria-pressed={e?.isFavorite ?? false}>
              <Star size={13} className={e?.isFavorite ? "fill-current" : undefined} /> {e?.isFavorite ? "Favorita" : "Favoritar"}
            </RPGButton>
            {confirmDelete ? (
              <span className="flex items-center gap-1 text-[11px] text-rpg-text" role="alert">
                Excluir texto, fotos e áudios deste dia?
                <RPGButton variant="danger" className="min-h-[30px] px-2 text-xs" onClick={ctx.deleteEntry}>
                  Excluir
                </RPGButton>
                <RPGButton variant="ghost" className="min-h-[30px] px-2 text-xs" onClick={() => setConfirmDelete(false)}>
                  Cancelar
                </RPGButton>
              </span>
            ) : (
              <RPGButton variant="ghost" className="min-h-[34px] px-2 text-xs" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={13} /> Excluir
              </RPGButton>
            )}
            <RPGButton variant="pink" className="min-h-[34px] px-3 text-xs" onClick={ctx.saveAllNow} disabled={ctx.isSaving}>
              <Save size={13} /> Salvar
            </RPGButton>
          </div>
        </div>
        <div className="relative grid grid-cols-2 gap-2 border-t border-rpg-gold/30 bg-rpg-bg/60 p-2 sm:grid-cols-3 lg:grid-cols-6">
          <div className="flex items-center justify-center gap-1 border-2 border-rpg-gold/70 bg-rpg-bg/70 px-2 py-1 text-center" style={R}>
            <Award size={18} className="text-rpg-gold" aria-hidden />
            <div>
              <p className="font-pixel text-[9px] uppercase text-rpg-gold">Dia</p>
              <p className="font-rpg text-xl font-bold leading-none text-rpg-gold-light">{meta?.journeyDay ?? "—"}</p>
              <p className="text-[9px] text-rpg-muted">da jornada</p>
            </div>
          </div>
          {stat(<Flame />, "Sequência atual", `${meta?.cronista.streak ?? 0} dias`, "text-rpg-orange")}
          {stat(<Trophy />, "Recorde", `${meta?.cronista.bestStreak ?? 0} dias`, "text-rpg-gold-light")}
          {stat(<BookOpen />, "Palavras escritas", (meta?.cronista.totalWords ?? 0).toLocaleString("pt-BR"), "text-rpg-pink")}
          {stat(<Zap />, "XP da reflexão", `+${meta?.reflectionXp ?? 0} XP`, "text-rpg-purple")}
          {stat(<ListChecks />, "Seções concluídas", `${sectionsDone}/${sections.length} (${Math.round((sectionsDone / sections.length) * 100)}%)`, "text-rpg-green")}
        </div>
      </header>

      {ctx.conflict && (
        <div role="alert" className="flex flex-wrap items-center gap-2 border-2 border-rpg-orange bg-rpg-orange/10 p-2 text-sm text-rpg-text" style={R}>
          <span className="min-w-0 flex-1">Esta crônica foi alterada em outro dispositivo. O salvamento automático foi pausado para não sobrescrever nada.</span>
          <RPGButton variant="secondary" className="min-h-[32px] text-xs" onClick={() => ctx.resolveConflict(false)}>
            Carregar a versão salva
          </RPGButton>
          <RPGButton variant="ghost" className="min-h-[32px] text-xs" onClick={() => ctx.resolveConflict(true)}>
            Manter a minha
          </RPGButton>
        </div>
      )}
      {ctx.draftFound && !ctx.conflict && (
        <div role="status" className="flex flex-wrap items-center gap-2 border-2 border-rpg-pink/70 bg-rpg-pink/10 p-2 text-sm text-rpg-text" style={R}>
          <span className="min-w-0 flex-1">Encontramos um rascunho não salvo deste dia.</span>
          <RPGButton variant="pink" className="min-h-[32px] text-xs" onClick={ctx.recoverDraft}>
            Recuperar
          </RPGButton>
          <RPGButton variant="ghost" className="min-h-[32px] text-xs" onClick={ctx.discardDraft}>
            Descartar
          </RPGButton>
        </div>
      )}

      {/* ── Progresso do capítulo ── */}
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex flex-wrap items-center gap-3 border-2 border-rpg-gold/50 bg-rpg-panel p-3" style={R} aria-label="Progresso do capítulo">
          <p className="flex items-center gap-1.5 font-rpg text-sm font-bold text-rpg-gold-light">
            <BookOpen size={16} aria-hidden /> Progresso do capítulo
          </p>
          <ol className="flex min-w-[200px] flex-1 items-center gap-1" aria-hidden>
            {Array.from({ length: nodes }, (_, i) => (
              <li key={i} className="flex flex-1 items-center">
                <span className={clsx("block h-3 w-3 rotate-45 border", i < filledNodes ? "border-rpg-pink bg-rpg-pink shadow-[0_0_6px_rgba(236,72,153,.7)]" : "border-rpg-border bg-rpg-bg")} />
                {i < nodes - 1 && <span className={clsx("h-0.5 flex-1", i < filledNodes - 1 ? "bg-rpg-pink" : "bg-rpg-border")} />}
              </li>
            ))}
          </ol>
          <p className="text-[11px] text-rpg-muted">
            {ch ? (ch.next ? `${ch.daysInChapter} de ${ch.chapterSpan} dias · ${ch.pct}%` : "Capítulo final alcançado") : "…"}
          </p>
        </section>
        <section className="flex items-center gap-2 border-2 border-rpg-gold/50 bg-rpg-panel p-3" style={R} aria-label="Próximo capítulo">
          <img src={`${ART}/relic.webp`} alt="" aria-hidden className="pixelated h-10 w-auto" />
          <div className="min-w-0 text-[11px] leading-tight">
            <p className="font-rpg text-sm font-bold text-rpg-gold-light">{ch?.next ? `Próximo: ${ch.next.title}` : "Mestre das Crônicas"}</p>
            <p className="text-rpg-muted">{ch?.next ? `Faltam ${ch.next.missing} dia(s) com crônica. Contam dias escritos, nunca palavras.` : "Você chegou ao último capítulo da escrita."}</p>
          </div>
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Modo do editor">
        <nav aria-label="Seções da crônica" className="flex flex-1 flex-wrap gap-1">
          {!ctx.writingMode &&
            sections.map((s, i) => (
              <button key={`${s.label}-${i}`} type="button" onClick={() => goTo(s.id)} className={clsx("border px-2 py-0.5 text-[10px]", s.done ? "border-rpg-green/60 text-rpg-green" : "border-rpg-border text-rpg-muted hover:text-rpg-text")} style={{ borderRadius: 3 }}>
                {s.done ? "✓ " : ""}
                {s.label}
              </button>
            ))}
        </nav>
        <button type="button" aria-pressed={ctx.writingMode} onClick={() => ctx.setWritingMode(true)} className={clsx("border-2 px-2.5 py-1 text-xs font-semibold", ctx.writingMode ? "border-rpg-gold text-rpg-gold-light" : "border-rpg-border text-rpg-muted")} style={{ borderRadius: 3 }}>
          Modo Escrita
        </button>
        <button type="button" aria-pressed={!ctx.writingMode} onClick={() => ctx.setWritingMode(false)} className={clsx("border-2 px-2.5 py-1 text-xs font-semibold", !ctx.writingMode ? "border-rpg-gold text-rpg-gold-light" : "border-rpg-border text-rpg-muted")} style={{ borderRadius: 3 }}>
          Crônica Completa
        </button>
      </div>

      {ctx.isLoading ? (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]" aria-busy="true" aria-label="Carregando a crônica">
          <div className="rpg-panel h-[380px] animate-pulse" />
          <div className="rpg-panel hidden h-[380px] animate-pulse xl:block" />
        </div>
      ) : (
        <div className={clsx("grid items-start gap-3", !ctx.writingMode && "xl:grid-cols-[minmax(0,1fr)_340px]")}>
          <div className="min-w-0 space-y-3">
            {/* I — Como foi meu dia */}
            <Panel
              id="c3-relato"
              num="I"
              icon={<Feather size={16} />}
              title="Como foi meu dia"
              subtitle="Escreva do seu jeito, corrido — sem perguntas prontas. Esta é a sua crônica de hoje."
              meta={<span className="shrink-0 text-[11px] text-rpg-muted">{words.toLocaleString("pt-BR")} palavra(s)</span>}
            >
              {ctx.slots.moments}
              <RichTextEditor rich value={f.thoughts} onChange={(v) => ctx.updateField({ thoughts: v })} onBlur={() => ctx.saveNow()} placeholder="Querido diário, hoje…" minHeightClass="min-h-[240px]" onReady={setEditor} />
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="flex items-center gap-1 text-[11px] font-semibold text-rpg-gold-light">
                  <Sparkles size={12} aria-hidden /> Inspirações de escrita
                </span>
                {visiblePrompts.map((q) => (
                  <button key={q} type="button" onClick={() => insertPrompt(q)} className="border border-rpg-border bg-rpg-bg-2 px-2 py-1 text-[11px] text-rpg-text hover:border-rpg-pink" style={{ borderRadius: 999 }}>
                    {q}
                  </button>
                ))}
                <button type="button" onClick={() => setPromptPage((p) => p + 1)} className="p-1 text-rpg-muted hover:text-rpg-text" aria-label="Outras inspirações">
                  <RefreshCw size={13} />
                </button>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="flex min-w-0 items-center gap-2 border border-rpg-border bg-rpg-bg-2/60 p-2" style={{ borderRadius: 3 }}>
                  <PenLine size={18} className="shrink-0 text-rpg-gold" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="font-semibold text-rpg-text">Meta de escrita</span>
                      {goalEdit === null ? (
                        <button type="button" className="text-rpg-blue hover:underline" onClick={() => setGoalEdit(String(goal))}>
                          {goal} palavras {meta?.writingGoalIsDefault ? "(padrão)" : ""} · alterar
                        </button>
                      ) : (
                        <span className="flex items-center gap-1">
                          <input type="number" min={50} max={5000} step={50} value={goalEdit} onChange={(ev) => setGoalEdit(ev.target.value)} className="w-20 border border-rpg-border bg-rpg-bg px-1 py-0.5 text-[11px] text-rpg-text" aria-label="Meta de palavras" />
                          <button
                            type="button"
                            className="text-rpg-green"
                            onClick={() =>
                              void setGoal
                                .mutateAsync(Math.min(5000, Math.max(50, Math.round(Number(goalEdit) || 300))))
                                .then(() => (setGoalEdit(null), notify("Meta de escrita salva.")))
                                .catch(() => notify("Não foi possível salvar a meta.", true))
                            }
                          >
                            salvar
                          </button>
                        </span>
                      )}
                      <span className="ml-auto tabular-nums text-rpg-muted">
                        {words.toLocaleString("pt-BR")} / {goal}
                      </span>
                    </div>
                    <RPGProgressBar className="mt-1" label="Meta de escrita" showLabel={false} value={Math.min(words, goal)} max={goal} tone="pink" />
                  </div>
                </div>
                <RPGButton variant="primary" className="min-h-[44px]" onClick={() => goTo("c3-momentos")}>
                  <Wand2 size={14} aria-hidden /> Escrever com IA
                </RPGButton>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-rpg-muted">
                <Smile size={13} className="text-rpg-pink" aria-hidden />
                {auto?.mood ? (
                  <span>
                    Humor de hoje em Saúde: <span className="text-base">{MOOD_EMOJI[auto.mood.mood - 1]}</span> {auto.mood.mood}/5 · energia {auto.mood.energy}/5
                  </span>
                ) : (
                  <span>Sem humor registrado hoje.</span>
                )}
                <button type="button" className="text-rpg-blue hover:underline" onClick={() => goTo("c3-fechamento")}>
                  {auto?.mood ? "Atualizar no fechamento" : "Registrar no fechamento"}
                </button>
              </div>
            </Panel>

            {!ctx.writingMode && (
              <>
                {/* II — Momentos e organização */}
                <Panel id="c3-momentos" num="II" icon={<Sparkles size={16} />} title="Momentos e organização" subtitle="O Escriba Arcano lê o seu texto só com a sua autorização e devolve sempre uma prévia.">
                  <Scribe ctx={ctx} consent={consent} setConsent={setConsent} notify={notify} />
                  <details className="mt-3 border-t border-rpg-border/60 pt-2">
                    <summary className="cursor-pointer text-xs font-semibold text-rpg-gold-light">Organização completa com fotos (título, resumo, destaques e categorias salvos)</summary>
                    <div className="mt-2">{ctx.slots.organizer}</div>
                  </details>
                </Panel>

                {/* III — Gratidão e cuidado */}
                <Panel id="c3-gratidao" num="III" icon={<Heart size={16} />} title="Gratidão e cuidado" subtitle="Pelo que sou grato hoje — e o que fiz para manter a mente tranquila.">
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_110px]">
                    <fieldset className="min-w-0">
                      <legend className="mb-1 text-[11px] text-rpg-muted">Hoje sou grato por:</legend>
                      <ol className="space-y-1.5">
                        {f.gratitude.map((g, i) => (
                          <li key={i} className="flex items-center gap-1.5">
                            <span className="w-4 text-right font-pixel text-[10px] text-rpg-gold">{i + 1}.</span>
                            <input value={g} onChange={(ev) => setGratitude(i, ev.target.value)} onBlur={() => ctx.saveNow()} maxLength={300} className="min-h-[38px] w-full border border-rpg-border bg-rpg-bg-2 px-2 text-sm text-rpg-text outline-none focus:border-rpg-pink" style={{ borderRadius: 3 }} aria-label={`Gratidão ${i + 1}`} />
                            {f.gratitude.length > 3 && (
                              <button type="button" onClick={() => ctx.saveNow({ gratitude: f.gratitude.filter((_, j) => j !== i) })} className="p-1 text-rpg-muted hover:text-rpg-red" aria-label={`Remover gratidão ${i + 1}`}>
                                <X size={13} />
                              </button>
                            )}
                          </li>
                        ))}
                      </ol>
                      {f.gratitude.length < 10 && (
                        <button type="button" onClick={() => ctx.updateField({ gratitude: [...f.gratitude, ""] })} className="mt-1 flex items-center gap-1 text-[11px] text-rpg-blue hover:underline">
                          <Plus size={12} aria-hidden /> Adicionar mais
                        </button>
                      )}
                    </fieldset>
                    <fieldset className="min-w-0">
                      <legend className="mb-1 text-[11px] text-rpg-muted">Cuidado comigo</legend>
                      <ul className="space-y-1">
                        {ctx.selfCareOptions.map((o) => {
                          const checked = ctx.combinedSelfCare.has(o.key);
                          const isAuto = ctx.autoSelfCare.includes(o.key);
                          return (
                            <li key={o.key}>
                              <label className="flex min-h-[34px] items-center gap-2 text-sm text-rpg-text">
                                <input type="checkbox" checked={checked} disabled={isAuto} onChange={() => ctx.toggleSelfCare(o.key)} className="accent-[rgb(var(--rpg-pink))]" />
                                {o.label}
                                {isAuto && <span className="ml-auto text-[10px] text-rpg-pink">hábito de hoje</span>}
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                      <input value={f.selfCareOther} onChange={(ev) => ctx.updateField({ selfCareOther: ev.target.value })} onBlur={() => ctx.saveNow()} placeholder="Outro…" maxLength={300} className="mt-1 min-h-[36px] w-full border border-rpg-border bg-rpg-bg-2 px-2 text-xs text-rpg-text outline-none focus:border-rpg-pink" style={{ borderRadius: 3 }} aria-label="Outro cuidado comigo" />
                    </fieldset>
                    <img src={`${ART}/lotus.webp`} alt="" aria-hidden className="pixelated hidden h-auto w-full self-center md:block" />
                  </div>
                </Panel>

                {/* IV — Mídias */}
                <Panel id="c3-midias" num="IV" icon={<Camera size={16} />} title="Fotos, vídeos e documentos" subtitle="Cada mídia guarda a história que você contar sobre ela. Arquivos ficam protegidos pelo seu login." meta={<span className="text-[11px] text-rpg-muted">{visual} mídia(s)</span>}>
                  {ctx.slots.media}
                  {ctx.photoError && (
                    <p className="mt-1 text-xs text-rpg-red" role="alert">
                      {ctx.photoError}
                    </p>
                  )}
                </Panel>

                {/* V — Notas de voz */}
                <Panel id="c3-voz" num="V" icon={<Mic size={16} />} title="Notas de voz" subtitle="Registre um pensamento falado, uma ideia ou um desabafo." meta={<span className="text-[11px] text-rpg-muted">{audio.length} nota(s)</span>}>
                  <VoiceNotes
                    media={audio}
                    onAdd={ctx.addAudio}
                    onRemove={ctx.removeMedia}
                    isUploading={ctx.isAddingAudio}
                    aiAllowed={consent}
                    onTranscribe={async (m: JournalMedia) => {
                      try {
                        const r = await transcribe.mutateAsync(m.id);
                        setTranscript(r.text ? { text: r.text } : null);
                        if (!r.text) notify("Nenhuma fala compreensível encontrada.");
                      } catch (err) {
                        notify(err instanceof Error ? err.message : "Não foi possível transcrever.", true);
                      }
                    }}
                  />
                  {!consent && audio.length > 0 && <p className="mt-1 text-[10px] text-rpg-muted">Para transcrever com IA, marque a autorização na seção II (Escriba).</p>}
                  {transcript && (
                    <div className="mt-2 space-y-1.5 border-2 border-rpg-purple/60 bg-rpg-bg-2 p-2" style={{ borderRadius: 3 }}>
                      <RPGBadge tone="purple">Transcrição (prévia da IA)</RPGBadge>
                      <p className="whitespace-pre-wrap text-sm text-rpg-text">{transcript.text}</p>
                      <div className="flex gap-2">
                        <RPGButton variant="gold" className="min-h-[32px] text-xs" onClick={() => (ctx.saveNow({ thoughts: `${f.thoughts}<blockquote>${toHtml(transcript.text)}</blockquote>` }), setTranscript(null), notify("Transcrição inserida no relato."))}>
                          Inserir no relato
                        </RPGButton>
                        <RPGButton variant="ghost" className="min-h-[32px] text-xs" onClick={() => setTranscript(null)}>
                          Descartar
                        </RPGButton>
                      </div>
                    </div>
                  )}
                </Panel>

                {/* VI — Fechamento do dia */}
                <Panel id="c3-fechamento" num="VI" icon={<Moon size={16} />} title="Fechamento do dia" subtitle="Estado emocional final, reflexão, aprendizado, pendência e intenção para amanhã.">
                  <div className="space-y-3">
                    <MoodCheckin ctx={ctx} notify={notify} />
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="block text-[11px] text-rpg-muted">
                        Reflexão final
                        <textarea rows={3} value={f.closingReflection} onChange={(ev) => ctx.updateField({ closingReflection: ev.target.value })} onBlur={() => ctx.saveNow()} maxLength={4000} className="mt-1 w-full border border-rpg-border bg-rpg-bg-2 p-2 text-sm text-rpg-text outline-none focus:border-rpg-pink" style={{ borderRadius: 3 }} placeholder="Como termino este dia?" />
                      </label>
                      <label className="block text-[11px] text-rpg-muted">
                        Aprendizado do dia
                        <textarea rows={3} value={f.closingLearning} onChange={(ev) => ctx.updateField({ closingLearning: ev.target.value })} onBlur={() => ctx.saveNow()} maxLength={4000} className="mt-1 w-full border border-rpg-border bg-rpg-bg-2 p-2 text-sm text-rpg-text outline-none focus:border-rpg-pink" style={{ borderRadius: 3 }} placeholder="O que levo de lição?" />
                        {f.closingLearning.trim().length >= 5 && (
                          <button
                            type="button"
                            className="mt-1 flex items-center gap-1 text-[11px] text-rpg-purple hover:underline"
                            disabled={toGrimoire.isPending}
                            onClick={() =>
                              void toGrimoire
                                .mutateAsync(f.closingLearning)
                                .then((r) => notify(r.added ? "Cartão sugerido na fila de aprovação do Grimório." : "Esse aprendizado já está no Grimório."))
                                .catch((err: unknown) => notify(err instanceof Error ? err.message : "Erro", true))
                            }
                          >
                            <Lightbulb size={12} aria-hidden /> Sugerir como cartão do Grimório
                          </button>
                        )}
                      </label>
                      <label className="block text-[11px] text-rpg-muted">
                        Pendência
                        <textarea rows={2} value={f.closingPending} onChange={(ev) => ctx.updateField({ closingPending: ev.target.value })} onBlur={() => ctx.saveNow()} maxLength={2000} className="mt-1 w-full border border-rpg-border bg-rpg-bg-2 p-2 text-sm text-rpg-text outline-none focus:border-rpg-pink" style={{ borderRadius: 3 }} placeholder="O que ficou para depois?" />
                        {f.closingPending.trim().length >= 3 && (
                          <button
                            type="button"
                            className="mt-1 flex items-center gap-1 text-[11px] text-rpg-blue hover:underline"
                            onClick={() =>
                              void taskService
                                .create({ title: f.closingPending.trim().split("\n")[0]!.slice(0, 200), description: `Pendência registrada no Diário em ${ctx.date.split("-").reverse().join("/")}.`, dueDate: shift(ctx.date, 1) })
                                .then(() => notify("Missão criada para amanhã a partir da pendência."))
                                .catch(() => notify("Não foi possível criar a missão.", true))
                            }
                          >
                            <ListChecks size={12} aria-hidden /> Criar missão para amanhã
                          </button>
                        )}
                      </label>
                      <div className="text-[11px] text-rpg-muted">
                        O que levo para amanhã (intenção)
                        <div className="mt-1">
                          <RichTextEditor value={f.nightTakeaway} onChange={(v) => ctx.updateField({ nightTakeaway: v })} onBlur={() => ctx.saveNow()} placeholder="Amanhã quero…" minHeightClass="min-h-[70px]" />
                        </div>
                      </div>
                    </div>
                  </div>
                </Panel>

                {ctx.slots.weekInsights && (
                  <Panel icon={<Sparkles size={16} />} title="Insights da semana" subtitle="Só aparece aqui o que os seus dados realmente mostram — sem números inventados.">
                    {ctx.slots.weekInsights}
                  </Panel>
                )}
              </>
            )}
          </div>

          {!ctx.writingMode && (
            <aside className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-1" aria-label="Contexto do dia">
              <div className="relative">
                {ctx.slots.dayState}
                <img src={`${ART}/lantern.webp`} alt="" aria-hidden className="pixelated pointer-events-none absolute bottom-2 right-2 hidden h-12 w-auto opacity-80 xl:block" />
              </div>
              <Panel id="c3-lugar" icon={<MapPin size={16} />} title="Lugar, tags e vínculos" subtitle="Onde você estava, o que marcar e o que este dia conecta. Nada é localizado automaticamente.">
                {ctx.slots.location}
                {f.tags.length > 0 && (
                  <p className="mt-1 flex items-center gap-1 text-[10px] text-rpg-muted">
                    <Tags size={11} aria-hidden /> {f.tags.length} etiqueta(s)
                  </p>
                )}
              </Panel>
              {auto?.currentBook && (
                <Panel icon={<BookOpen size={16} />} title="Leitura atual" subtitle="Registrado na Biblioteca">
                  <Link to="/biblioteca" className="flex gap-2.5 hover:brightness-110">
                    {auto.currentBook.coverUrl ? <img src={auto.currentBook.coverUrl} alt="" className="h-16 w-11 shrink-0 border border-rpg-border object-cover" /> : <span className="flex h-16 w-11 shrink-0 items-center justify-center border border-rpg-border text-rpg-pink"><BookOpen size={16} /></span>}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-rpg-text">{auto.currentBook.title}</span>
                      {auto.currentBook.author && <span className="block truncate text-[11px] text-rpg-muted">{auto.currentBook.author}</span>}
                      <span className="block text-[11px] text-rpg-muted">{auto.reading.minutes > 0 ? `${auto.reading.minutes} min · ${auto.reading.pages} pág. hoje` : "Sem leitura registrada hoje"}</span>
                    </span>
                  </Link>
                </Panel>
              )}
              {ctx.streakHighlight && (
                <Panel icon={<Flame size={16} />} title="Sequência em destaque" subtitle="Seu hábito mais consistente agora">
                  <div className="flex items-center gap-2">
                    <img src={`${ART}/flower.webp`} alt="" aria-hidden className="pixelated h-10 w-auto" />
                    <div>
                      <p className="text-sm font-semibold text-rpg-text">{ctx.streakHighlight.habitName}</p>
                      <p className="text-[11px] text-rpg-muted">{ctx.streakHighlight.streak} dias seguidos</p>
                    </div>
                  </div>
                  <Link to="/habitos" className="mt-1 inline-block text-[11px] text-rpg-blue hover:underline">
                    Ver hábitos →
                  </Link>
                </Panel>
              )}
              {auto?.dailyQuote && (
                <Panel icon={<Quote size={16} />} title={auto.dailyQuote.kind === "versiculo" ? "Versículo do dia" : "Provérbio do dia"} subtitle="Uma pausa para reflexão">
                  <blockquote className="text-sm italic text-rpg-text">“{auto.dailyQuote.text}”</blockquote>
                  <p className="mt-1 text-[11px] font-semibold text-rpg-pink">— {auto.dailyQuote.source}</p>
                </Panel>
              )}
              <Panel icon={<Lightbulb size={16} />} title="Insights do dia" subtitle="Calculados a partir dos seus registros">
                {meta?.insights.length ? (
                  <ul className="space-y-1.5">
                    {meta.insights.map((i) => {
                      const I = ICON[i.icon];
                      return (
                        <li key={i.text} className="flex gap-2 text-[12px] text-rpg-text/90">
                          <I size={14} className="mt-0.5 shrink-0 text-rpg-gold" aria-hidden /> {i.text}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-[11px] text-rpg-muted">Ainda não há dados suficientes hoje para comparar (escrita, água, leitura ou humor).</p>
                )}
                {auto?.insightText && <p className="mt-2 border-t border-rpg-border/60 pt-1.5 text-[11px] text-rpg-muted">Copilot: {auto.insightText}</p>}
              </Panel>
              <Panel icon={<Award size={16} />} title="Conquista do Cronista" subtitle={meta?.achievement?.unlocked ? "Desbloqueada hoje" : "A mais próxima de desbloquear"}>
                {meta?.achievement ? (
                  <div className="flex items-center gap-2.5">
                    <img src={`${ART}/trophy-book.webp`} alt="" aria-hidden className="pixelated h-14 w-auto" />
                    <div className="min-w-0">
                      <p className="font-rpg font-bold text-rpg-gold-light">{meta.achievement.title}</p>
                      <p className="text-[11px] text-rpg-muted">{meta.achievement.description}</p>
                      {!meta.achievement.unlocked && <RPGProgressBar className="mt-1" label="Progresso" showLabel={false} value={Math.min(meta.achievement.current, meta.achievement.threshold)} max={Math.max(1, meta.achievement.threshold)} tone="gold" />}
                      <p className="mt-0.5 font-pixel text-[10px] text-rpg-purple">
                        +{meta.achievement.reward.xp} XP · +{meta.achievement.reward.coins} 🪙 {meta.achievement.unlocked ? "recebidos" : `· ${meta.achievement.current}/${meta.achievement.threshold}`}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-rpg-muted">Todas as conquistas do Cronista já foram desbloqueadas.</p>
                )}
              </Panel>
              {ctx.slots.labNote}
            </aside>
          )}
        </div>
      )}
      {toast && (
        <div role="status" className={clsx("fixed bottom-4 left-1/2 z-50 -translate-x-1/2 border-2 px-3 py-2 text-sm shadow-lg", toast.err ? "border-rpg-red bg-rpg-bg-2 text-rpg-red" : "border-rpg-green bg-rpg-bg-2 text-rpg-text")} style={R}>
          {toast.m}
        </div>
      )}
    </div>
  );
}
