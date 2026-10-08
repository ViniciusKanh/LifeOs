import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Sun,
  Lightbulb,
  Heart,
  Sparkles,
  Moon,
  BookOpen,
  Check,
  Loader2,
  Save,
  ListChecks,
  Repeat,
  Droplets,
  Dumbbell,
  Flame,
  Quote,
  Award,
  CalendarDays,
  Type as TypeIcon,
  Plus,
  Camera,
  X,
  Trash2,
  Star,
  Lock,
  Mic,
  Square,
  Download,
  MoreHorizontal,
  Pencil,
  FolderInput,
  ArrowLeft,
  MapPin,
  Tag,
  Map as MapIcon,
  PenLine,
  NotebookPen,
} from "lucide-react";
import {
  useJournal,
  useJournalInsights,
  useJournalDays,
  useJournalCalendarMonth,
  useJournalCollections,
  useJournalOnThisDay,
  useJournalPin,
  useJournalDayActions,
  useJournalLocations,
  useJournalDaysByLocation,
} from "@/hooks/useJournal";
import type { JournalDaySummary, JournalCollectionInput, JournalLocationSummary } from "@/services/journalService";
import type { JournalMedia, JournalEntryLink, GeocodeResult } from "@/types";
import { JournalMediaSection } from "@/components/journal/JournalMediaSection";
import { SpotlightSlider, type SpotlightSlide } from "@/components/media/SpotlightSlider";
import { JournalAiOrganizer } from "@/components/journal/JournalAiOrganizer";
import { JournalWritingAssistant } from "@/components/journal/JournalWritingAssistant";
import { JournalDayClosing } from "@/components/journal/JournalDayClosing";
import { JournalWordCloud } from "@/components/journal/JournalWordCloud";
import { MOOD_EMOJI } from "@/utils/journalMood";
import { useQueryClient } from "@tanstack/react-query";
import { healthService } from "@/services/healthService";
import { buildJournalMoments, type JournalMoment, type JournalMomentKind } from "@/utils/journalMoments";
import type { JournalCollection } from "@/types";
import { useHabits } from "@/hooks/useHabits";
import { useAnalyticsOverview, useInsights } from "@/hooks/useAnalytics";
import { useGoals } from "@/hooks/useGoals";
import { useProjects } from "@/hooks/useProjects";
import { contextService } from "@/services/contextService";
import { DashboardInsights, type StreakHighlight } from "@/components/dashboard/DashboardInsights";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { RPGButton } from "@/components/rpg/RPGButton";
import { useTheme } from "@/hooks/useTheme";
import { RPG_SECTION_TITLE } from "@/components/rpg/rpgAssets";
import { RichTextEditor } from "@/components/journal/RichTextEditor";
import { API_URL } from "@/services/api";
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip } from "recharts";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

/* ============================================================
   Diário — inspirado no app Diário/Journal da Apple (macOS Tahoe):
   masthead com o gradiente suave do ícone do app, um painel de
   "Insights" real sobre o hábito de escrever (sequência, recorde,
   entradas, palavras — nunca inventado, sempre derivado de
   journal_entries), cartões com uma leve resposta de hover/toque, e
   seções responsivas de celular a desktop (1 coluna no mobile, até 3
   no desktop).

   Automático (sempre ao vivo de outro módulo, nunca digitado aqui):
   humor/energia/sono (Saúde), insight do dia (Copilot), insights da
   semana (Analytics — mesmo componente do Dashboard), hábitos e
   sequência (Hábitos), água, exercício, páginas lidas e livro atual
   (Biblioteca), provérbio/versículo do dia (conteúdo curado).

   Manual (o "diário" de verdade, salvo em journal_entries): intenção,
   reflexões, gratidão, cuidado comigo, desafios, revisão da noite —
   com autosave: salva sozinho ~900ms depois de parar de digitar, e
   na hora ao sair do campo ou marcar um item.
   ============================================================ */

/**
 * Conta de 0 até `value` em ~700ms — o mesmo tipo de "contador subindo"
 * que o painel Insights do Diário da Apple usa pros números de
 * streak/palavras. Um único momento orquestrado na entrada do valor
 * (não em cada hover), e pula direto pro valor final se o sistema
 * pedir "reduzir movimento".
 */
function useCountUp(value: number, durationMs = 700) {
  const [display, setDisplay] = useState(0);
  const prefersReducedMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    []
  );
  useEffect(() => {
    if (prefersReducedMotion || value === 0) {
      setDisplay(value);
      return;
    }
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(value * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs, prefersReducedMotion]);
  return display;
}

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

/**
 * "Compartilhar entrada" (Fase 16): baixa o PDF de um dia — endpoint devolve
 * binário, por isso não passa pelo wrapper JSON do api.ts. Reaproveitado
 * pelo botão do editor do dia e pelo menu do card no feed "Entradas".
 */
async function downloadJournalPdf(date: string) {
  const res = await fetch(`${API_URL}/journal/${date}/export/pdf`, { credentials: "include" });
  if (!res.ok) throw new Error("Falha ao gerar PDF.");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `diario-${date}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
const AUTOSAVE_DELAY_MS = 900;

const SELF_CARE_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "meditar", label: "Meditar / respirar" },
  { key: "exercicio", label: "Fazer exercício" },
  { key: "ler", label: "Ler algo" },
  { key: "evitar_redes", label: "Evitar redes sociais em excesso" },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, delta: number) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function formatHeaderDate(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

function fmtMinutes(min: number) {
  if (min <= 0) return "0min";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h <= 0) return `${m}min`;
  return m > 0 ? `${h}h${m}min` : `${h}h`;
}

/** Escapa texto simples antes de inserir como HTML — usado ao inserir a frase de um "momento" (Fase 5) na reflexão do dia. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function SectionCard({
  icon,
  title,
  subtitle,
  children,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`p-4 sm:p-5 border-t-2 border-t-cat-pink/40 flex flex-col transition-all duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md motion-safe:active:scale-[0.99] ${className ?? ""}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-cat-pink shrink-0">{icon}</span>
        <p className="text-sm font-semibold">{title}</p>
      </div>
      {subtitle ? <p className="text-xs text-slate italic mb-3">{subtitle}</p> : <div className="mb-3" />}
      <div className="flex-1">{children}</div>
    </Card>
  );
}

/** Chip compacto de estatística do dia — usado na faixa de resumo automático do masthead. */
function StatChip({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl px-3 py-2 bg-white/70 dark:bg-white/[0.06] min-w-0">
      <span className={tone}>{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-bold leading-tight truncate">{value}</p>
        <p className="text-[10px] text-slate leading-tight truncate">{label}</p>
      </div>
    </div>
  );
}

/** Formata segundos como m:ss — usado no cronômetro de gravação e na duração das notas de voz salvas. */
function formatDuration(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * "Notas de voz" (Fase 13 do Diário — Apple Journal): grava áudio direto no
 * navegador (MediaRecorder) e anexa à entrada do dia, junto com as fotos.
 * Sem suporte do navegador, a seção avisa e some — nunca quebra a tela.
 */
function JournalAudioSection({
  media,
  onAdd,
  onRemove,
  isUploading,
}: {
  media: JournalMedia[];
  onAdd: (dataUri: string, durationSeconds: number) => void;
  onRemove: (mediaId: string) => void;
  isUploading: boolean;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);

  const supported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
  const canAddMore = media.length < 12;

  const stopStream = () => {
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const durationSeconds = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === "string") onAdd(reader.result, durationSeconds);
        };
        reader.readAsDataURL(blob);
        stopStream();
      };
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      recorder.start();
      setIsRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch {
      setError("Não foi possível acessar o microfone.");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setIsRecording(false);
  };

  useEffect(() => () => stopStream(), []);

  if (!supported) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {isRecording ? (
          <button
            type="button"
            onClick={stopRecording}
            className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold bg-signal text-white hover:bg-signal/90 active:scale-95 transition-all"
          >
            <Square size={14} className="fill-current" />
            Parar ({formatDuration(elapsed)})
          </button>
        ) : (
          <button
            type="button"
            onClick={startRecording}
            disabled={isUploading || !canAddMore}
            className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold border border-paper-border dark:border-ink-border text-cat-pink hover:bg-cat-pink/10 active:scale-95 transition-all disabled:opacity-50"
          >
            {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Mic size={14} />}
            Gravar nota de voz
          </button>
        )}
      </div>
      {error && <p className="text-xs text-rose-500">{error}</p>}
      {!canAddMore && <p className="text-xs text-slate">Limite de itens de mídia do dia atingido.</p>}

      {media.length > 0 && (
        <div className="space-y-2">
          {media.map((item) => (
            <div key={item.id} className="flex items-center gap-2 rounded-lg border border-paper-border dark:border-ink-border px-3 py-2">
              <audio controls src={item.dataUri} className="h-8 flex-1 min-w-0" />
              <span className="text-[11px] text-slate shrink-0">{item.durationSeconds ? formatDuration(item.durationSeconds) : ""}</span>
              <button type="button" onClick={() => onRemove(item.id)} className="text-slate hover:text-signal shrink-0" aria-label="Excluir nota de voz">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Localização, etiquetas e vínculos do dia (Fase 17 — protótipo Apple
 * Journal): busca real de local via /api/context/geocode (mesma API já
 * usada em Contexto do Dia — sem custo, sem chave), etiquetas livres
 * digitadas pelo usuário, e vínculo do dia a um projeto/meta real (nunca
 * lista fictícia). Cada bloco só salva o que o usuário efetivamente
 * escolheu — nunca inventa localização, tag ou vínculo.
 */
function LocationTagsLinksSection({
  locationLabel,
  tags,
  links,
  onSetLocation,
  onClearLocation,
  onChangeTags,
  onAddLink,
  onRemoveLink,
}: {
  locationLabel: string;
  tags: string[];
  links: JournalEntryLink[];
  onSetLocation: (label: string, lat: number, lng: number) => void;
  onClearLocation: () => void;
  onChangeTags: (tags: string[]) => void;
  onAddLink: (targetType: "project" | "goal", targetId: string) => void;
  onRemoveLink: (linkId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const { goals } = useGoals();
  const { projects } = useProjects();
  const [linkTarget, setLinkTarget] = useState("");

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setIsSearching(true);
      contextService
        .geocode(query.trim())
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setIsSearching(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  const addTag = () => {
    const value = tagDraft.trim();
    if (!value || tags.includes(value)) {
      setTagDraft("");
      return;
    }
    onChangeTags([...tags, value]);
    setTagDraft("");
  };

  const linkableOptions = [
    ...goals.map((g) => ({ type: "goal" as const, id: g.id, label: `🎯 ${g.title}` })),
    ...projects.map((p) => ({ type: "project" as const, id: p.id, label: `📁 ${p.name}` })),
  ].filter((opt) => !links.some((l) => l.targetType === opt.type && l.targetId === opt.id));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div>
        <p className="text-xs font-medium text-slate mb-1.5 flex items-center gap-1.5">
          <MapPin size={12} /> Onde você está?
        </p>
        {locationLabel ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full bg-cat-blue/10 text-cat-blue">
            {locationLabel}
            <button type="button" onClick={onClearLocation} aria-label="Remover localização">
              <X size={11} />
            </button>
          </span>
        ) : (
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar cidade ou lugar…"
              className="w-full rounded-xl px-3 py-2 text-xs bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border focus:border-cat-pink transition-colors"
            />
            {isSearching && <Loader2 size={12} className="animate-spin absolute right-2.5 top-2.5 text-slate" />}
            {results.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-xl border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised shadow-lg overflow-hidden">
                {results.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      const label = [r.name, r.region, r.country].filter(Boolean).join(", ");
                      onSetLocation(label, r.latitude, r.longitude);
                      setQuery("");
                      setResults([]);
                    }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    {[r.name, r.region, r.country].filter(Boolean).join(", ")}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-slate mb-1.5 flex items-center gap-1.5">
          <Tag size={12} /> Etiquetas
        </p>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full bg-cat-purple/10 text-cat-purple">
              #{tag}
              <button type="button" onClick={() => onChangeTags(tags.filter((t) => t !== tag))} aria-label={`Remover etiqueta ${tag}`}>
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
        <input
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          onBlur={addTag}
          placeholder="Digite e pressione Enter…"
          className="w-full rounded-xl px-3 py-2 text-xs bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border focus:border-cat-pink transition-colors"
        />
      </div>

      <div>
        <p className="text-xs font-medium text-slate mb-1.5 flex items-center gap-1.5">
          <FolderInput size={12} /> Vincular a projeto/meta
        </p>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {links.map((link) => {
            const opt = link.targetType === "goal" ? goals.find((g) => g.id === link.targetId) : projects.find((p) => p.id === link.targetId);
            const label = opt ? (link.targetType === "goal" ? `🎯 ${(opt as { title: string }).title}` : `📁 ${(opt as { name: string }).name}`) : "…";
            return (
              <span key={link.id} className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full bg-cat-green/10 text-cat-green">
                {label}
                <button type="button" onClick={() => onRemoveLink(link.id)} aria-label="Remover vínculo">
                  <X size={10} />
                </button>
              </span>
            );
          })}
        </div>
        {linkableOptions.length > 0 && (
          <div className="flex gap-1.5">
            <select
              value={linkTarget}
              onChange={(e) => setLinkTarget(e.target.value)}
              className="flex-1 min-w-0 rounded-xl px-2 py-2 text-xs bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border focus:border-cat-pink transition-colors"
            >
              <option value="">Selecionar…</option>
              {linkableOptions.map((opt) => (
                <option key={`${opt.type}:${opt.id}`} value={`${opt.type}:${opt.id}`}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!linkTarget}
              onClick={() => {
                const [type, id] = linkTarget.split(":");
                if (type === "project" || type === "goal") onAddLink(type, id);
                setLinkTarget("");
              }}
              className="shrink-0 rounded-xl px-3 py-2 text-xs font-semibold bg-cat-pink/10 text-cat-pink hover:bg-cat-pink/20 disabled:opacity-40 transition-colors"
            >
              <Plus size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Ícone e rótulo curto de cada tipo de momento (Fase 5) — o texto completo só aparece ao inserir na reflexão. */
const MOMENT_META: Record<JournalMomentKind, { icon: React.ReactNode; label: string }> = {
  tasks: { icon: <Check size={12} />, label: "Tarefas concluídas" },
  habits: { icon: <Repeat size={12} />, label: "Hábitos mantidos" },
  water: { icon: <Droplets size={12} />, label: "Água" },
  exercise: { icon: <Dumbbell size={12} />, label: "Exercício" },
  reading: { icon: <BookOpen size={12} />, label: "Leitura" },
};

/**
 * "Sugestões de hoje" (Fase 5 — Momentos): chips derivados de dados reais
 * de outros módulos no dia. Tocar insere a frase pronta na reflexão —
 * assim a integração entre módulos vira texto no Diário sem o usuário
 * precisar redigitar o que já registrou em outro lugar.
 */
function JournalMomentsRow({ moments, addedIds, onInsert }: { moments: JournalMoment[]; addedIds: Set<string>; onInsert: (moment: JournalMoment) => void }) {
  if (moments.length === 0) return null;
  return (
    <div className="rounded-2xl border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised p-3 sm:p-4 mb-4 rpg:rpg-panel">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={14} className="text-cat-purple" />
        <p className="text-xs font-semibold">Sugestões de hoje</p>
        <p className="text-[11px] text-slate italic">toque para adicionar ao texto do dia</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {moments.map((moment) => {
          const added = addedIds.has(moment.id);
          const meta = MOMENT_META[moment.kind];
          return (
            <button
              key={moment.id}
              type="button"
              disabled={added}
              onClick={() => onInsert(moment)}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors motion-safe:active:scale-95 ${
                added
                  ? "border-transparent bg-cat-purple/10 text-cat-purple/60 cursor-default"
                  : "border-paper-border dark:border-ink-border hover:border-cat-purple hover:text-cat-purple"
              }`}
            >
              {meta.icon}
              {meta.label}
              {added && <Check size={12} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type FormState = {
  /** "Como foi meu dia" — texto corrido. */
  thoughts: string;
  gratitude: string[];
  selfCare: string[];
  selfCareOther: string;
  nightTakeaway: string;
  journalIds: string[];
  locationLabel: string;
  locationLat: number | null;
  locationLng: number | null;
  tags: string[];
};

const EMPTY_FORM: FormState = {
  thoughts: "",
  gratitude: ["", "", ""],
  selfCare: [],
  selfCareOther: "",
  nightTakeaway: "",
  journalIds: [],
  locationLabel: "",
  locationLat: null,
  locationLng: null,
  tags: [],
};

/**
 * Editor imersivo de um dia — o antigo `DiarioPage` inteiro, agora
 * "encaixado" dentro da navegação por abas (Entradas/Insights/Calendário):
 * data e navegação de dia continuam controladas aqui, mas `date` vem do
 * componente pai pra permitir abrir um dia direto do feed ou do calendário.
 */
function DiaryDayEditor({ date, setDate, onBack }: { date: string; setDate: React.Dispatch<React.SetStateAction<string>>; onBack: () => void }) {
  const {
    entry,
    isLoading,
    save,
    isSaving,
    addMedia,
    isAddingMedia,
    addAudioMedia,
    isAddingAudioMedia,
    updateMedia,
    removeMedia,
    assistWriting,
    isAssistingWriting,
    suggestOrganization,
    isSuggestingOrganization,
    applyOrganization,
    isApplyingOrganization,
    clearOrganization,
    toggleFavorite,
    isTogglingFavorite,
    deleteEntry,
    isDeletingEntry,
    addLink,
    removeLink,
  } = useJournal(date);
  const { habits, summaryByHabitId } = useHabits();
  const { overview } = useAnalyticsOverview(14);
  const { insights: lifeInsights } = useInsights(30);
  const { insights } = useJournalInsights();
  const { isRpg } = useTheme();
  // No RPG, "Insights da semana" só aparece com dado suficiente (sem textos de "registre mais").
  const hasWeekInsights = !!lifeInsights?.bestWeekday || (lifeInsights?.sleepVsNextDayProductivity.pairs ?? 0) >= 7;
  const { collections } = useJournalCollections();
  const streakCount = useCountUp(insights?.currentStreak ?? 0);
  const longestCount = useCountUp(insights?.longestStreak ?? 0);
  const entriesCount = useCountUp(insights?.totalEntries ?? 0);
  const wordsCount = useCountUp(insights?.totalWords ?? 0);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [justSaved, setJustSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sincroniza o form local com a entrada carregada — só quando ela muda de
  // fato (troca de dia ou primeiro load), nunca sobrescrevendo o que o
  // usuário está digitando no meio de uma sessão de edição.
  useEffect(() => {
    if (!entry) return;
    setForm({
      thoughts: entry.thoughts ?? "",
      gratitude: [0, 1, 2].map((i) => entry.gratitude[i] ?? ""),
      selfCare: entry.selfCare,
      selfCareOther: entry.selfCareOther ?? "",
      nightTakeaway: entry.nightTakeaway ?? "",
      journalIds: entry.journalIds,
      locationLabel: entry.locationLabel ?? "",
      locationLat: entry.locationLat,
      locationLng: entry.locationLng,
      tags: entry.tags,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.date]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (justSavedTimer.current) clearTimeout(justSavedTimer.current);
    };
  }, []);

  const persistNow = (state: FormState) => {
    save({
      thoughts: state.thoughts || null,
      gratitude: state.gratitude.filter((g) => g.trim().length > 0),
      selfCare: state.selfCare,
      selfCareOther: state.selfCareOther || null,
      nightTakeaway: state.nightTakeaway || null,
      journalIds: state.journalIds,
      locationLabel: state.locationLabel || null,
      locationLat: state.locationLat,
      locationLng: state.locationLng,
      tags: state.tags,
    }).catch(() => undefined);
  };

  /** Digitação: atualiza na hora e agenda o autosave (~900ms sem digitar) — é assim que o diário "escreve sozinho" no banco. */
  const updateField = (patch: Partial<FormState>) => {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persistNow(next), AUTOSAVE_DELAY_MS);
      return next;
    });
  };

  /** Saída do campo ou toggle (checkbox/humor da noite): salva imediatamente, sem esperar o debounce. */
  const saveNow = (patch: Partial<FormState> = {}) => {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      persistNow(next);
      return next;
    });
  };

  /** Estrela do masthead: marca/desmarca o dia como favorito (Fase 6) — funciona mesmo num dia ainda sem nenhum texto escrito. */
  const handleToggleFavorite = () => {
    toggleFavorite(!(entry?.isFavorite ?? false)).catch(() => undefined);
  };

  /** Excluir este dia (Fase 8 — privacidade/exclusão): apaga texto, fotos e vínculos com diários; sem confirmação explícita, sem exclusão. */
  const handleDeleteEntry = () => {
    if (!confirm("Excluir esta entrada? Todo o texto e as fotos deste dia serão apagados permanentemente.")) return;
    deleteEntry()
      .then(() => onBack())
      .catch(() => undefined);
  };

  const [isExportingPdf, setIsExportingPdf] = useState(false);

  /** "Compartilhar entrada" (Fase 16): baixa um PDF só desta entrada, pra compartilhar ou imprimir. */
  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    try {
      await downloadJournalPdf(date);
    } catch {
      setPhotoError("Não foi possível exportar o PDF desta entrada.");
    } finally {
      setIsExportingPdf(false);
    }
  };

  /** Botão "Salvar" explícito do masthead: força salvar tudo agora (o autosave já cobre isso, mas o usuário pediu um botão pra confirmar que os dados foram gravados). */
  const saveAllNow = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    persistNow(form);
    if (justSavedTimer.current) clearTimeout(justSavedTimer.current);
    setJustSaved(true);
    justSavedTimer.current = setTimeout(() => setJustSaved(false), 2200);
  };

  const [photoError, setPhotoError] = useState<string | null>(null);

  const moments = useMemo(() => (entry ? buildJournalMoments(entry.auto) : []), [entry]);
  const addedMomentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const moment of moments) {
      if (form.thoughts.includes(escapeHtml(moment.text))) ids.add(moment.id);
    }
    return ids;
  }, [moments, form.thoughts]);

  /** Acrescenta parágrafos (HTML já seguro) ao fim de um campo de texto rico e salva na hora. */
  const appendHtml = (field: "thoughts" | "nightTakeaway", html: string) => {
    const current = form[field];
    const trimmed = current.trim();
    const isEmpty = trimmed.length === 0 || trimmed === "<p></p>";
    saveNow({ [field]: isEmpty ? html : `${current}${html}` } as Partial<FormState>);
  };

  /** Texto puro da IA → parágrafos HTML escapados (uma quebra dupla = novo parágrafo). */
  const toParagraphs = (text: string) =>
    text
      .split(/\n{2,}|\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${escapeHtml(p)}</p>`)
      .join("");

  /** Insere a frase pronta do momento como um novo parágrafo no texto do dia e salva na hora. */
  const handleInsertMoment = (moment: JournalMoment) => appendHtml("thoughts", `<p>${escapeHtml(moment.text)}</p>`);

  const queryClient = useQueryClient();
  /** Humor do fechamento vai para Saúde (mood_entries) — fonte única de humor/energia no LifeOS. */
  const registerMood = async (mood: number, energy: number) => {
    const nowIso = new Date().toISOString();
    // Fora do dia corrente (ou à noite, quando o UTC já virou), ancora no meio do dia escolhido.
    const recordedAt = nowIso.slice(0, 10) === date ? nowIso : `${date}T12:00:00.000Z`;
    await healthService.addMood({ mood, energy, recordedAt });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["journal"] }),
      queryClient.invalidateQueries({ queryKey: ["health"] }),
      queryClient.invalidateQueries({ queryKey: ["analytics"] }),
    ]);
  };

  const combinedSelfCare = useMemo(() => {
    const auto = entry?.auto.autoSelfCare ?? [];
    return new Set([...auto, ...form.selfCare]);
  }, [entry, form.selfCare]);

  const toggleSelfCare = (key: string) => {
    // itens auto-marcados por hábito real de hoje não podem ser desmarcados aqui —
    // desmarcar exigiria desfazer o check-in do hábito, o que é feito em Hábitos.
    if ((entry?.auto.autoSelfCare ?? []).includes(key)) return;
    const has = form.selfCare.includes(key);
    saveNow({ selfCare: has ? form.selfCare.filter((k) => k !== key) : [...form.selfCare, key] });
  };

  /** Marca/desmarca a que diário(s) o dia pertence — salva na hora, igual a um toggle de checkbox. */
  const toggleJournalCollection = (id: string) => {
    const has = form.journalIds.includes(id);
    saveNow({ journalIds: has ? form.journalIds.filter((j) => j !== id) : [...form.journalIds, id] });
  };

  const streakHighlight: StreakHighlight | null = useMemo(() => {
    let best: StreakHighlight | null = null;
    for (const h of habits) {
      const s = summaryByHabitId.get(h.id)?.currentStreak ?? 0;
      if (s > 0 && (!best || s > best.streak)) best = { habitName: h.name, streak: s };
    }
    return best;
  }, [habits, summaryByHabitId]);

  const currentWeekday = new Date(`${date}T00:00:00`).getDay();
  const book = entry?.auto.currentBook;
  const auto = entry?.auto;

  return (
    <div className="w-full px-3 sm:px-4 md:px-8 py-4 sm:py-6 md:py-8">
      {/* Masthead — inspirado no app Diário/Journal da Apple: gradiente suave do
          ícone do app, navegação de dia limpa, e um painel de Insights reais
          sobre o hábito de escrever (sequência, recorde, entradas, palavras) */}
      <div className="mb-5 sm:mb-6 rounded-2xl border border-paper-border dark:border-ink-border bg-gradient-to-br from-cat-pink/15 via-cat-purple/[0.06] to-transparent p-4 sm:p-6 sm:pt-5 rpg:rpg-panel rpg:border-rpg-pink/50 rpg:p-4 sm:rpg:p-6">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={onBack}
              className="hidden sm:flex items-center gap-1 text-xs text-slate hover:text-cat-pink font-medium transition-colors pr-1"
            >
              <ChevronLeft size={14} />
              Entradas
            </button>
            <button
              onClick={() => setDate((d) => addDays(d, -1))}
              className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center border border-paper-border dark:border-ink-border hover:bg-black/[0.03] dark:hover:bg-white/[0.05] transition-colors"
              aria-label="Dia anterior"
            >
              <ChevronLeft size={15} />
            </button>
          </div>
          <div className="text-center min-w-0">
            {isRpg && <p className="font-pixel text-[10px] uppercase tracking-wider text-rpg-gold mb-1">Diário</p>}
            <p className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-cat-pink truncate leading-none rpg:font-rpg rpg:text-rpg-pink">{isRpg ? "Crônica da Jornada" : "Diário"}</p>
            <p className="text-[11px] sm:text-xs text-slate mt-1.5 capitalize truncate">{formatHeaderDate(date)}</p>
          </div>
          <button
            onClick={() => setDate((d) => addDays(d, 1))}
            disabled={date >= todayIso()}
            className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center border border-paper-border dark:border-ink-border hover:bg-black/[0.03] dark:hover:bg-white/[0.05] transition-colors disabled:opacity-30"
            aria-label="Próximo dia"
          >
            <ChevronRight size={15} />
          </button>
        </div>

        {collections.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5 mb-4">
            {collections.map((col) => {
              const active = form.journalIds.includes(col.id);
              return (
                <button
                  key={col.id}
                  onClick={() => toggleJournalCollection(col.id)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                    active ? COLLECTION_COLOR_CLASSES[col.color ?? "pink"] : "bg-black/[0.04] dark:bg-white/[0.06] text-slate hover:text-inherit"
                  }`}
                >
                  {col.icon && <span>{col.icon}</span>}
                  {col.name}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3 mb-4">
          <div className="flex items-center gap-1.5 sm:gap-2">
            {WEEKDAYS.map((w, i) => (
              <span
                key={i}
                className={`w-6 h-6 rounded-full text-[10px] font-semibold flex items-center justify-center transition-colors ${
                  i === currentWeekday ? "bg-cat-pink text-white" : "text-slate border border-paper-border dark:border-ink-border"
                }`}
              >
                {w}
              </span>
            ))}
          </div>
          {date !== todayIso() && (
            <button onClick={() => setDate(todayIso())} className="text-xs text-cat-pink font-medium underline underline-offset-2">
              Voltar para hoje
            </button>
          )}

          <div className="flex items-center gap-2.5 ml-auto">
            <span
              className="flex items-center gap-1 text-[11px] text-slate"
              title={isSaving ? "Salvando…" : justSaved ? "Salvo!" : "Salvo automaticamente"}
            >
              {isSaving ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Check size={12} className={justSaved ? "text-growth" : "text-slate/60"} />
              )}
              {/* Em telas estreitas o rótulo de status some (fica só o ícone com o mesmo
                  texto em title) pra abrir espaço pros botões de excluir/favoritar/salvar
                  sem empurrar a linha das bolinhas dos dias da semana para o overflow. */}
              <span className="hidden sm:inline">{isSaving ? "Salvando…" : justSaved ? "Salvo!" : "Salvo automaticamente"}</span>
            </span>
            <button
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              aria-label="Exportar esta entrada em PDF"
              title="Compartilhar / exportar PDF"
              className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center border border-paper-border dark:border-ink-border text-slate hover:text-cat-pink hover:bg-black/[0.03] dark:hover:bg-white/[0.05] transition-all disabled:opacity-50"
            >
              {isExportingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            </button>
            <button
              onClick={handleDeleteEntry}
              disabled={isDeletingEntry}
              aria-label="Excluir esta entrada"
              className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center border border-paper-border dark:border-ink-border text-slate hover:text-red-500 hover:bg-black/[0.03] dark:hover:bg-white/[0.05] transition-all disabled:opacity-50"
            >
              <Trash2 size={14} />
            </button>
            <button
              onClick={handleToggleFavorite}
              disabled={isTogglingFavorite}
              aria-label={entry?.isFavorite ? "Remover dos favoritos" : "Marcar como favorito"}
              aria-pressed={entry?.isFavorite ?? false}
              className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center border transition-all disabled:opacity-50 ${
                entry?.isFavorite
                  ? "border-amber-300 bg-amber-50 text-amber-500 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-400"
                  : "border-paper-border dark:border-ink-border text-slate hover:text-amber-500 hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
              }`}
            >
              <Star size={14} className={entry?.isFavorite ? "fill-current" : undefined} />
            </button>
            <button
              onClick={saveAllNow}
              disabled={isSaving}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold bg-cat-pink text-white hover:bg-cat-pink/90 active:scale-95 transition-all disabled:opacity-50 shadow-sm"
            >
              <Save size={13} />
              Salvar
            </button>
          </div>
        </div>

        {/* Insights — o mesmo tipo de painel do Diário da Apple, mas 100% derivado
            de journal_entries reais (nunca inventado): sequência atual, recorde,
            total de entradas e de palavras escritas. */}
        {insights && (insights.totalEntries > 0 || insights.currentStreak > 0) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <StatChip icon={<Flame size={14} />} label="Sequência atual" value={`${streakCount} ${streakCount === 1 ? "dia" : "dias"}`} tone="text-signal" />
            <StatChip icon={<Award size={14} />} label="Recorde" value={`${longestCount} ${longestCount === 1 ? "dia" : "dias"}`} tone="text-cat-purple" />
            <StatChip icon={<CalendarDays size={14} />} label="Entradas" value={`${entriesCount}`} tone="text-cat-blue" />
            <StatChip icon={<TypeIcon size={14} />} label="Palavras" value={wordsCount.toLocaleString("pt-BR")} tone="text-cat-green" />
          </div>
        )}

        {auto && (
          <>
            {isRpg && <p className={`mb-2 text-xs ${RPG_SECTION_TITLE}`}>Estado do dia</p>}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              <StatChip icon={<ListChecks size={14} />} label="Tarefas" value={`${auto.tasksToday.done}/${auto.tasksToday.total}`} tone="text-cat-blue" />
              <StatChip icon={<Repeat size={14} />} label="Hábitos" value={`${auto.habitsToday.done}/${auto.habitsToday.total}`} tone="text-cat-green" />
              <StatChip icon={<Droplets size={14} />} label="Água" value={`${(auto.waterMl / 1000).toFixed(1)}L`} tone="text-cat-blue" />
              <StatChip icon={<Dumbbell size={14} />} label="Exercício" value={fmtMinutes(auto.exerciseMinutes)} tone="text-cat-green" />
              <StatChip icon={<BookOpen size={14} />} label="Leitura" value={`${auto.reading.pages}pág.`} tone="text-cat-pink" />
            </div>
            <p className="text-sm sm:text-base text-[#3a3430] dark:text-[#EDEBE4]/90 mt-4 text-center leading-relaxed">
              {auto.summary}
            </p>
          </>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-slate">Carregando…</p>
      ) : (
        <div className="space-y-4">
          {isRpg ? (
            hasWeekInsights && (
              <section aria-label="Insights da semana">
                <p className={`mb-2 text-xs ${RPG_SECTION_TITLE}`}>Insights da semana</p>
                <DashboardInsights insights={lifeInsights} changePct={overview?.changePct ?? null} streak={streakHighlight} />
              </section>
            )
          ) : (
            <DashboardInsights insights={lifeInsights} changePct={overview?.changePct ?? null} streak={streakHighlight} />
          )}

          <JournalMomentsRow moments={moments} addedIds={addedMomentIds} onInsert={handleInsertMoment} />

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <SectionCard
              icon={<PenLine size={16} />}
              title="Como foi meu dia"
              subtitle="Escreva do seu jeito, corrido — sem perguntas prontas"
              className="sm:col-span-2 xl:col-span-3"
            >
              <div className="space-y-3">
                <RichTextEditor
                  value={form.thoughts}
                  onChange={(v) => updateField({ thoughts: v })}
                  onBlur={() => saveNow()}
                  placeholder="Querido diário, hoje…"
                  minHeightClass="min-h-[260px]"
                />
                <JournalWritingAssistant
                  onAssist={(notes) => assistWriting(notes)}
                  isLoading={isAssistingWriting}
                  onInsertDraft={(text) => appendHtml("thoughts", toParagraphs(text))}
                  onInsertQuestion={(q) => appendHtml("thoughts", `<p><strong>${escapeHtml(q)}</strong></p><p></p>`)}
                  onUseTakeaway={(t) => appendHtml("nightTakeaway", `<p>${escapeHtml(t)}</p>`)}
                />
              </div>
            </SectionCard>

            <div className="sm:col-span-2 xl:col-span-3">
              <JournalDayClosing
                auto={auto}
                legacyNightMood={entry?.nightMood ?? null}
                takeaway={form.nightTakeaway}
                onTakeawayChange={(v) => updateField({ nightTakeaway: v })}
                onTakeawayBlur={() => saveNow()}
                onRegisterMood={registerMood}
              />
            </div>

            <SectionCard icon={<Camera size={16} />} title="Fotos, vídeos e documentos" subtitle="Cada mídia guarda a história que você contar sobre ela" className="xl:col-span-3">
              <JournalMediaSection
                media={entry?.media ?? []}
                onUpload={(input) => addMedia(input)}
                onUpdate={(mediaId, patch) => updateMedia({ mediaId, ...patch })}
                onRemove={(mediaId) => removeMedia(mediaId).catch(() => undefined)}
              />
              {photoError && <p className="text-xs text-drop mt-2">{photoError}</p>}
            </SectionCard>

            <SectionCard icon={<Sparkles size={16} />} title="Organização do dia" subtitle="O Gemini agrupa seus textos por temas — você confirma antes de salvar" className="xl:col-span-3">
              <JournalAiOrganizer
                saved={entry?.ai ?? null}
                media={entry?.media ?? []}
                onSuggest={() => suggestOrganization()}
                onApply={async (input) => {
                  const updated = await applyOrganization(input);
                  // As etiquetas escolhidas entram no form local, senão o próximo autosave as sobrescreveria.
                  setForm((prev) => ({ ...prev, tags: updated.tags }));
                }}
                onClear={() => clearOrganization()}
                isSuggesting={isSuggestingOrganization}
                isApplying={isApplyingOrganization}
              />
            </SectionCard>

            <SectionCard icon={<Mic size={16} />} title="Notas de voz" subtitle="Registre um pensamento falado" className="xl:col-span-3">
              <JournalAudioSection
                media={(entry?.media ?? []).filter((m) => m.kind === "audio")}
                onAdd={(dataUri, durationSeconds) => addAudioMedia({ dataUri, durationSeconds }).catch(() => undefined)}
                onRemove={(mediaId) => removeMedia(mediaId).catch(() => undefined)}
                isUploading={isAddingAudioMedia}
              />
            </SectionCard>

            <SectionCard icon={<MapPin size={16} />} title="Localização, etiquetas e vínculos" subtitle="Onde você estava, o que marcar e o que este dia conecta" className="xl:col-span-3">
              <LocationTagsLinksSection
                locationLabel={form.locationLabel}
                tags={form.tags}
                links={entry?.links ?? []}
                onSetLocation={(label, lat, lng) => saveNow({ locationLabel: label, locationLat: lat, locationLng: lng })}
                onClearLocation={() => saveNow({ locationLabel: "", locationLat: null, locationLng: null })}
                onChangeTags={(tags) => saveNow({ tags })}
                onAddLink={(targetType, targetId) => addLink({ targetType, targetId }).catch(() => undefined)}
                onRemoveLink={(linkId) => removeLink(linkId).catch(() => undefined)}
              />
            </SectionCard>

            <SectionCard
              icon={<Quote size={16} />}
              title={auto?.dailyQuote.kind === "versiculo" ? "Versículo do dia" : "Provérbio do dia"}
              subtitle="Uma pausa para reflexão"
            >
              {auto?.dailyQuote ? (
                <blockquote className="flex flex-col gap-2">
                  <p className="italic text-[15px] leading-relaxed text-[#3a3430] dark:text-[#EDEBE4]/90">
                    “{auto.dailyQuote.text}”
                  </p>
                  <footer className="text-[11px] text-cat-pink font-semibold not-italic">— {auto.dailyQuote.source}</footer>
                </blockquote>
              ) : (
                <p className="text-xs text-slate">Carregando reflexão do dia…</p>
              )}
            </SectionCard>

            <SectionCard icon={<Lightbulb size={16} />} title="Insight do dia" subtitle="Gerado pelo LifeOS Copilot a partir dos seus dados reais">
              {entry?.auto.insightText ? (
                <p className="text-sm">{entry.auto.insightText}</p>
              ) : (
                <p className="text-xs text-slate">
                  Ainda não há insight gerado para hoje.{" "}
                  <Link to="/dashboard" className="text-cat-pink font-medium">
                    Gerar no Dashboard →
                  </Link>
                </p>
              )}
            </SectionCard>

            <SectionCard icon={<Heart size={16} />} title="Gratidão" subtitle="Hoje sou grato por:">
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <input
                    key={i}
                    value={form.gratitude[i]}
                    onChange={(e) => updateField({ gratitude: form.gratitude.map((g, gi) => (gi === i ? e.target.value : g)) })}
                    onBlur={() => saveNow()}
                    placeholder={`${i + 1}.`}
                    className="w-full rounded-xl px-3 py-2 text-sm bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border focus:border-cat-pink transition-colors"
                  />
                ))}
              </div>
            </SectionCard>

            <SectionCard icon={<Sparkles size={16} />} title="Cuidado comigo" subtitle="O que posso fazer para manter minha mente tranquila hoje?">
              <div className="space-y-1.5">
                {SELF_CARE_OPTIONS.map((opt) => {
                  const isAuto = (entry?.auto.autoSelfCare ?? []).includes(opt.key);
                  const checked = combinedSelfCare.has(opt.key);
                  return (
                    <button
                      key={opt.key}
                      onClick={() => toggleSelfCare(opt.key)}
                      className="w-full flex items-center gap-2.5 text-left rounded-lg px-1.5 py-1 hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
                    >
                      <span
                        className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-all duration-150 motion-safe:active:scale-90 ${
                          checked
                            ? "bg-cat-pink border-cat-pink text-white scale-100"
                            : "border-paper-border dark:border-ink-border scale-90"
                        }`}
                      >
                        {checked && <Check size={11} className="motion-safe:animate-check-pop" />}
                      </span>
                      <span className="text-xs">{opt.label}</span>
                      {isAuto && <span className="text-[10px] text-cat-pink ml-auto shrink-0">hábito de hoje</span>}
                    </button>
                  );
                })}
                <input
                  value={form.selfCareOther}
                  onChange={(e) => updateField({ selfCareOther: e.target.value })}
                  onBlur={() => saveNow()}
                  placeholder="Outro…"
                  className="w-full mt-1 rounded-xl px-3 py-2 text-xs bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border focus:border-cat-pink transition-colors"
                />
              </div>
            </SectionCard>

            {book && (
              <SectionCard icon={<BookOpen size={16} />} title="Leitura atual" subtitle="Registrado na Biblioteca">
                <div className="flex gap-3">
                  {book.coverUrl ? (
                    <img src={book.coverUrl} alt={book.title} className="w-10 h-[60px] object-cover rounded-md shrink-0 border border-paper-border dark:border-ink-border" />
                  ) : (
                    <div className="w-10 h-[60px] rounded-md shrink-0 bg-cat-pink/10 flex items-center justify-center">
                      <BookOpen size={16} className="text-cat-pink" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{book.title}</p>
                    {book.author && <p className="text-xs text-slate truncate">{book.author}</p>}
                    {entry.auto.reading.minutes > 0 && (
                      <p className="text-[11px] text-slate mt-1">
                        {fmtMinutes(entry.auto.reading.minutes)} lidos hoje · {entry.auto.reading.pages} páginas
                      </p>
                    )}
                  </div>
                </div>
              </SectionCard>
            )}

            {streakHighlight && (
              <SectionCard icon={<Flame size={16} />} title="Sequência em destaque" subtitle="Seu hábito mais consistente agora">
                <div className="flex items-center gap-2.5">
                  <Flame size={20} className="text-signal" />
                  <div>
                    <p className="text-sm font-semibold">{streakHighlight.habitName}</p>
                    <p className="text-xs text-slate">{streakHighlight.streak} dias seguidos</p>
                  </div>
                </div>
                <Link to="/habitos" className="text-xs text-cat-pink font-medium mt-2 inline-block">
                  Ver hábitos →
                </Link>
              </SectionCard>
            )}

          </div>
        </div>
      )}
    </div>
  );
}

type ViewKey = "feed" | "insights" | "calendar" | "places" | "collections";

const TABS: Array<{ key: ViewKey; label: string }> = [
  { key: "feed", label: "Entradas" },
  { key: "insights", label: "Insights" },
  { key: "calendar", label: "Calendário" },
  { key: "places", label: "Lugares" },
  { key: "collections", label: "Diários" },
];

function TabBar({ active, onChange }: { active: ViewKey; onChange: (t: ViewKey) => void }) {
  return (
    <div role="tablist" aria-label="Seções do Diário" className="flex items-center gap-1 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] p-1 w-fit max-w-full overflow-x-auto rpg:rpg-panel rpg:p-1">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={active === tab.key}
          onClick={() => onChange(tab.key)}
          className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
            active === tab.key ? "bg-white dark:bg-ink-raised text-cat-pink shadow-sm rpg:bg-rpg-pink/20" : "text-slate hover:text-inherit"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

const COLLECTION_COLOR_CLASSES: Record<string, string> = {
  pink: "bg-cat-pink/15 text-cat-pink",
  blue: "bg-cat-blue/15 text-cat-blue dark:text-cat-blue-dark",
  purple: "bg-cat-purple/15 text-cat-purple dark:text-cat-purple-dark",
  green: "bg-cat-green/15 text-cat-green dark:text-cat-green-dark",
  teal: "bg-cat-teal/15 text-cat-teal dark:text-cat-teal-dark",
};

/** Chips de filtro por diário (coleção) — "Todos" + um chip por diário criado; usado em Entradas e Calendário. */
function JournalFilterChips({
  collections,
  active,
  onChange,
}: {
  collections: JournalCollection[];
  active: string | null;
  onChange: (id: string | null) => void;
}) {
  if (collections.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-4">
      <button
        onClick={() => onChange(null)}
        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
          active === null ? "bg-cat-pink text-white" : "bg-black/[0.04] dark:bg-white/[0.06] text-slate hover:text-inherit"
        }`}
      >
        Todos
      </button>
      {collections.map((col) => (
        <button
          key={col.id}
          onClick={() => onChange(col.id)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${
            active === col.id ? "bg-cat-pink text-white" : "bg-black/[0.04] dark:bg-white/[0.06] text-slate hover:text-inherit"
          }`}
        >
          {col.icon && <span>{col.icon}</span>}
          {col.name}
        </button>
      ))}
    </div>
  );
}

function formatCardDate(date: string) {
  const d = new Date(`${date}T00:00:00`);
  const today = todayIso();
  const yesterday = addDays(today, -1);
  if (date === today) return "Hoje";
  if (date === yesterday) return "Ontem";
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}

/** Ícone/emoji central de um card sem foto — usa o humor real do dia quando existe; cai num ícone neutro quando não há humor registrado. Nunca inventa humor. */
function EntryCardMoodGlyph({ day }: { day: JournalDaySummary }) {
  if (day.mood) return <span className="text-3xl leading-none">{MOOD_EMOJI[day.mood.mood - 1]}</span>;
  return <BookOpen size={24} className="text-cat-pink/70" />;
}

/** Abre o visualizador do feed com todas as fotos carregadas do dia, já no índice clicado. */
type FeedPhotoOpener = (photos: string[], index: number) => void;

/** Primeira frase do texto do dia, para o título do slide (nunca inventa texto). */
function firstSentence(text: string | null | undefined, max = 80) {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const sentence = clean.split(/(?<=[.!?])\s/)[0];
  return sentence.length > max ? `${sentence.slice(0, max - 1)}…` : sentence;
}

/**
 * Mídia do card do feed — slider em destaque (mesmo componente do editor
 * do dia, em tamanho compacto). Sempre fotos reais da entrada; não aparece
 * se o dia não tiver foto. Os cliques no slider não abrem o editor do card.
 */
function EntryCardMedia({ day, onOpenLightbox }: { day: JournalDaySummary; onOpenLightbox: FeedPhotoOpener }) {
  const [index, setIndex] = useState(0);
  const photos = day.photos;
  const slides = useMemo<SpotlightSlide[]>(() => {
    const extra = day.photoCount > photos.length ? ` · ${day.photoCount} no dia` : "";
    const title = firstSentence(day.preview) ?? "Momentos do dia";
    return photos.map((src, i) => ({ id: `${day.date}-${i}`, kind: "image", src, eyebrow: `${formatCardDate(day.date)}${extra}`, title }));
  }, [photos, day.date, day.photoCount, day.preview]);
  if (photos.length === 0) return null;
  return (
    <div className="mb-3" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <SpotlightSlider
        size="compact"
        slides={slides}
        index={index}
        onIndexChange={setIndex}
        onOpen={(slide) => onOpenLightbox(photos, Math.max(0, slides.findIndex((x) => x.id === slide.id)))}
        className="aspect-[16/9]"
      />
    </div>
  );
}

/** Estrela clicável do card — favorita/desfavorita o dia direto no feed, sem abrir o editor. */
function EntryFavoriteToggle({ isFavorite, onToggle }: { isFavorite: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? "Remover dos favoritos" : "Marcar como favorito"}
      className="p-1.5 rounded-lg text-slate hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0"
    >
      <Star size={15} className={isFavorite ? "text-amber-500 fill-current" : undefined} />
    </button>
  );
}

/**
 * Menu "⋯" do card no feed — Editar, Mover para diário (lista real dos
 * diários existentes), Adicionar etiquetas, Vincular a projeto/meta
 * (lista real do usuário), Alterar data, Exportar PDF e Excluir. Fecha
 * ao clicar fora, no mesmo padrão do ProfileMenu do topbar.
 */
function EntryCardMenu({
  day,
  collections,
  onEdit,
  onExport,
  onMove,
  onDelete,
  onSetTags,
  onAddLink,
  onMoveDate,
}: {
  day: JournalDaySummary;
  collections: JournalCollection[];
  onEdit: () => void;
  onExport: () => void;
  onMove: (journalIds: string[]) => void;
  onDelete: () => void;
  onSetTags: (tags: string[]) => void;
  onAddLink: (targetType: "project" | "goal", targetId: string) => void;
  onMoveDate: (newDate: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [subView, setSubView] = useState<"move" | "tags" | "link" | "date" | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [dateDraft, setDateDraft] = useState(day.date);
  const [linkTarget, setLinkTarget] = useState("");
  const { goals } = useGoals();
  const { projects } = useProjects();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSubView(null);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const addTag = () => {
    const value = tagDraft.trim();
    if (!value || day.tags.includes(value)) {
      setTagDraft("");
      return;
    }
    onSetTags([...day.tags, value]);
    setTagDraft("");
  };

  const linkableOptions = [
    ...goals.map((g) => ({ type: "goal" as const, id: g.id, label: `🎯 ${g.title}` })),
    ...projects.map((p) => ({ type: "project" as const, id: p.id, label: `📁 ${p.name}` })),
  ];

  return (
    <div className="relative shrink-0" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Mais opções"
        className="p-1.5 rounded-lg text-slate hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-64 rounded-xl shadow-xl border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised overflow-hidden z-40 py-1">
          {subView === null && (
            <>
              <button
                onClick={() => {
                  setOpen(false);
                  onEdit();
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
              >
                <Pencil size={14} /> Editar
              </button>
              {collections.length > 0 && (
                <button onClick={() => setSubView("move")} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5">
                  <FolderInput size={14} /> Mover para diário
                </button>
              )}
              <button onClick={() => setSubView("tags")} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5">
                <Tag size={14} /> Adicionar etiquetas
              </button>
              {linkableOptions.length > 0 && (
                <button onClick={() => setSubView("link")} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5">
                  <MapPin size={14} /> Vincular a projeto/meta
                </button>
              )}
              <button onClick={() => setSubView("date")} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5">
                <CalendarDays size={14} /> Alterar data
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  onExport();
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
              >
                <Download size={14} /> Exportar PDF
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
              >
                <Trash2 size={14} /> Excluir
              </button>
            </>
          )}

          {subView === "move" && (
            <>
              <button onClick={() => setSubView(null)} className="w-full flex items-center gap-2 px-3.5 py-2 text-xs text-slate hover:bg-black/5 dark:hover:bg-white/5">
                <ArrowLeft size={12} /> Voltar
              </button>
              {collections.map((c) => {
                const active = day.journalIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => onMove(active ? day.journalIds.filter((id) => id !== c.id) : [...day.journalIds, c.id])}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        active ? "bg-cat-pink border-cat-pink" : "border-paper-border dark:border-ink-border"
                      }`}
                    >
                      {active && <Check size={11} className="text-white" />}
                    </span>
                    {c.icon} {c.name}
                  </button>
                );
              })}
            </>
          )}

          {subView === "tags" && (
            <div className="px-3.5 py-2">
              <button onClick={() => setSubView(null)} className="flex items-center gap-2 text-xs text-slate hover:text-inherit mb-2">
                <ArrowLeft size={12} /> Voltar
              </button>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {day.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full bg-cat-purple/10 text-cat-purple">
                    #{tag}
                    <button onClick={() => onSetTags(day.tags.filter((t) => t !== tag))} aria-label={`Remover etiqueta ${tag}`}>
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
              <input
                autoFocus
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                onBlur={addTag}
                placeholder="Digite e pressione Enter…"
                className="w-full rounded-lg px-2.5 py-1.5 text-xs bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border focus:border-cat-pink transition-colors"
              />
            </div>
          )}

          {subView === "link" && (
            <div className="px-3.5 py-2">
              <button onClick={() => setSubView(null)} className="flex items-center gap-2 text-xs text-slate hover:text-inherit mb-2">
                <ArrowLeft size={12} /> Voltar
              </button>
              <div className="flex gap-1.5">
                <select
                  value={linkTarget}
                  onChange={(e) => setLinkTarget(e.target.value)}
                  className="flex-1 min-w-0 rounded-lg px-2 py-1.5 text-xs bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border focus:border-cat-pink transition-colors"
                >
                  <option value="">Selecionar…</option>
                  {linkableOptions.map((opt) => (
                    <option key={`${opt.type}:${opt.id}`} value={`${opt.type}:${opt.id}`}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  disabled={!linkTarget}
                  onClick={() => {
                    const [type, id] = linkTarget.split(":");
                    if (type === "project" || type === "goal") onAddLink(type, id);
                    setOpen(false);
                    setSubView(null);
                  }}
                  className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-cat-pink/10 text-cat-pink hover:bg-cat-pink/20 disabled:opacity-40 transition-colors"
                >
                  <Plus size={13} />
                </button>
              </div>
            </div>
          )}

          {subView === "date" && (
            <div className="px-3.5 py-2">
              <button onClick={() => setSubView(null)} className="flex items-center gap-2 text-xs text-slate hover:text-inherit mb-2">
                <ArrowLeft size={12} /> Voltar
              </button>
              <div className="flex gap-1.5">
                <input
                  type="date"
                  value={dateDraft}
                  max={todayIso()}
                  onChange={(e) => setDateDraft(e.target.value)}
                  className="flex-1 min-w-0 rounded-lg px-2 py-1.5 text-xs bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border focus:border-cat-pink transition-colors"
                />
                <button
                  disabled={dateDraft === day.date}
                  onClick={() => {
                    onMoveDate(dateDraft);
                    setOpen(false);
                    setSubView(null);
                  }}
                  className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-cat-pink/10 text-cat-pink hover:bg-cat-pink/20 disabled:opacity-40 transition-colors"
                >
                  <Check size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Um card do feed "Entradas" — memória editorial de um dia real: mídia
 * (quando existe), texto e uma linha de contexto discreta, sempre só com
 * os dados que existem de verdade. Sem foto, ganha um selo de humor/ícone
 * pra não ficar um card vazio; o dia de hoje ganha um leve destaque.
 */
function EntryCard({
  day,
  collections,
  isToday,
  onOpen,
  onOpenLightbox,
  onToggleFavorite,
  onMove,
  onExport,
  onDelete,
  onSetTags,
  onAddLink,
  onMoveDate,
}: {
  day: JournalDaySummary;
  collections: JournalCollection[];
  isToday: boolean;
  onOpen: () => void;
  onOpenLightbox: FeedPhotoOpener;
  onToggleFavorite: () => void;
  onMove: (journalIds: string[]) => void;
  onExport: () => void;
  onDelete: () => void;
  onSetTags: (tags: string[]) => void;
  onAddLink: (targetType: "project" | "goal", targetId: string) => void;
  onMoveDate: (newDate: string) => void;
}) {
  const dayCollections = collections.filter((c) => day.journalIds.includes(c.id));
  const hasMedia = day.photos.length > 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen();
      }}
      className={`w-full text-left cursor-pointer rounded-2xl border bg-paper-raised dark:bg-ink-raised p-4 sm:p-5 shadow-card dark:shadow-card-dark transition-all duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md motion-safe:active:scale-[0.99] rpg:rpg-panel rpg:p-4 sm:rpg:p-5 ${
        isToday ? "border-cat-pink/40 ring-1 ring-cat-pink/15 rpg:border-rpg-pink/60" : "border-paper-border dark:border-ink-border"
      }`}
    >
      <EntryCardMedia day={day} onOpenLightbox={onOpenLightbox} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 flex items-start gap-3">
          {!hasMedia && (
            <span className="shrink-0 w-11 h-11 rounded-full bg-cat-pink/10 flex items-center justify-center mt-0.5">
              <EntryCardMoodGlyph day={day} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold capitalize">{formatCardDate(day.date)}</p>
              {hasMedia && day.mood && <span className="text-base leading-none shrink-0">{MOOD_EMOJI[day.mood.mood - 1]}</span>}
            </div>
            <p className={`text-sm text-slate leading-relaxed mt-1 ${hasMedia ? "line-clamp-2" : "line-clamp-4"}`}>{day.preview}</p>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <EntryFavoriteToggle isFavorite={day.isFavorite} onToggle={onToggleFavorite} />
          <EntryCardMenu
            day={day}
            collections={collections}
            onEdit={onOpen}
            onExport={onExport}
            onMove={onMove}
            onDelete={onDelete}
            onSetTags={onSetTags}
            onAddLink={onAddLink}
            onMoveDate={onMoveDate}
          />
        </div>
      </div>
      {dayCollections.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2.5">
          {dayCollections.map((c) => (
            <span key={c.id} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${COLLECTION_COLOR_CLASSES[c.color ?? "pink"]}`}>
              {c.icon} {c.name}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[11px] text-slate">
        <span className="flex items-center gap-1">
          <TypeIcon size={11} />
          {day.wordCount} palavras
        </span>
        {day.photoCount > 0 && (
          <span className="flex items-center gap-1">
            <Camera size={11} />
            {day.photoCount} {day.photoCount === 1 ? "foto" : "fotos"}
          </span>
        )}
        {day.gratitudeCount > 0 && (
          <span className="flex items-center gap-1">
            <Heart size={11} />
            {day.gratitudeCount} gratidão
          </span>
        )}
        {day.selfCareCount > 0 && (
          <span className="flex items-center gap-1">
            <Sparkles size={11} />
            {day.selfCareCount} cuidado comigo
          </span>
        )}
        {day.nightMood != null && !day.mood && (
          <span className="flex items-center gap-1">
            <Moon size={11} />
            {day.nightMood}/5 à noite
          </span>
        )}
        {day.locationLabel && (
          <span className="flex items-center gap-1">
            <MapPin size={11} />
            {day.locationLabel}
          </span>
        )}
      </div>
      {day.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {day.tags.map((tag) => (
            <span key={tag} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-cat-purple/10 text-cat-purple">
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Aba "Entradas" — feed cronológico real (só dias com conteúdo escrito), mais recente primeiro. */
/** Quantos anos separam duas datas YYYY-MM-DD (aproximação por ano de calendário, suficiente pra rótulo). */
function yearsAgo(date: string) {
  const d = new Date(`${date}T00:00:00`);
  const today = new Date(`${todayIso()}T00:00:00`);
  return today.getFullYear() - d.getFullYear();
}

/**
 * "Lembranças" (Fase 10 — On This Day do Apple Journal): entradas reais de
 * anos anteriores no mesmo dia/mês de hoje. Só aparece quando existe pelo
 * menos uma lembrança real — nunca inventa nada nem mostra sem dado.
 */
function OnThisDaySection({ onOpenDay }: { onOpenDay: (date: string) => void }) {
  const { items, isLoading } = useJournalOnThisDay();
  if (isLoading || items.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 mb-2 text-sm font-semibold text-cat-pink">
        <Sparkles size={14} />
        Lembranças
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory">
        {items.map((day) => (
          <button
            key={day.date}
            onClick={() => onOpenDay(day.date)}
            className="snap-start shrink-0 w-56 text-left rounded-2xl border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised p-3.5 shadow-card dark:shadow-card-dark rpg:rpg-panel rpg:p-3.5 transition-all duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md motion-safe:active:scale-[0.99]"
          >
            <div className="flex items-center gap-2 mb-1">
              <CalendarDays size={12} className="text-cat-pink shrink-0" />
              <p className="text-[11px] font-medium text-cat-pink">
                Há {yearsAgo(day.date)} {yearsAgo(day.date) === 1 ? "ano" : "anos"}
              </p>
              {day.mood && <span className="text-sm leading-none shrink-0">{MOOD_EMOJI[day.mood.mood - 1]}</span>}
            </div>
            <p className="text-xs font-semibold capitalize mb-1">{formatCardDate(day.date)}</p>
            <p className="text-xs text-slate leading-relaxed line-clamp-3">{day.preview}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Agrupamento do feed por proximidade — "Hoje"/"Ontem" já ficam claros no
 * próprio card (formatCardDate), então só "Esta semana"/"Anteriores" viram
 * um cabeçalho de seção visível, evitando repetir "Hoje" duas vezes.
 */
function feedGroupKey(date: string): "hoje" | "ontem" | "semana" | "antigas" {
  const diffDays = Math.round((new Date(`${todayIso()}T00:00:00`).getTime() - new Date(`${date}T00:00:00`).getTime()) / 86_400_000);
  if (diffDays <= 0) return "hoje";
  if (diffDays === 1) return "ontem";
  if (diffDays <= 6) return "semana";
  return "antigas";
}
const FEED_GROUP_LABEL: Partial<Record<ReturnType<typeof feedGroupKey>, string>> = { semana: "Esta semana", antigas: "Anteriores" };

/**
 * Faixa compacta de Insights reais acima do feed — só sequência, total de
 * entradas e de palavras (sempre vindos de useJournalInsights, os mesmos
 * números da aba Insights). Nunca um dashboard grande aqui.
 */
function FeedInsightsStrip({ onOpenInsights }: { onOpenInsights: () => void }) {
  const { insights, isLoading } = useJournalInsights();
  if (isLoading || !insights || insights.totalEntries === 0) return null;
  return (
    <button
      onClick={onOpenInsights}
      className="w-full flex items-center justify-between gap-3 rounded-xl bg-cat-pink/5 dark:bg-cat-pink/10 px-4 py-2.5 mb-4 text-left hover:bg-cat-pink/10 transition-colors"
    >
      <div className="flex items-center gap-4 text-xs font-medium text-slate flex-wrap">
        <span className="flex items-center gap-1.5">
          <Flame size={13} className="text-signal" />
          {insights.currentStreak} {insights.currentStreak === 1 ? "dia" : "dias"} de sequência
        </span>
        <span className="flex items-center gap-1.5">
          <CalendarDays size={13} className="text-cat-blue" />
          {insights.totalEntries} {insights.totalEntries === 1 ? "entrada" : "entradas"}
        </span>
        <span className="flex items-center gap-1.5">
          <TypeIcon size={13} className="text-cat-green" />
          {insights.totalWords.toLocaleString("pt-BR")} palavras
        </span>
      </div>
      <span className="text-xs font-semibold text-cat-pink whitespace-nowrap shrink-0">Ver Insights →</span>
    </button>
  );
}

/** Visualizador em tela cheia do feed: o mesmo slider, grande, com Esc para fechar. */
function FeedPhotoViewer({ photos, startIndex, onClose }: { photos: string[]; startIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(startIndex);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);
  const slides: SpotlightSlide[] = photos.map((src, i) => ({ id: `viewer-${i}`, kind: "image", src, eyebrow: "Diário", title: `Foto ${i + 1} de ${photos.length}` }));
  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label="Fotos do dia">
      <button onClick={onClose} aria-label="Fechar" className="absolute top-4 right-4 z-10 text-white/80 hover:text-white p-2">
        <X size={22} />
      </button>
      <div className="w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
        <SpotlightSlider slides={slides} index={index} onIndexChange={setIndex} className="h-[60vh] sm:h-[75vh]" />
      </div>
    </div>
  );
}

function JournalFeedTab({
  onOpenDay,
  onOpenInsights,
  collections,
  journalFilter,
  onChangeFilter,
}: {
  onOpenDay: (date: string) => void;
  onOpenInsights: () => void;
  collections: JournalCollection[];
  journalFilter: string | null;
  onChangeFilter: (id: string | null) => void;
}) {
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [lightbox, setLightbox] = useState<{ photos: string[]; index: number } | null>(null);
  const { days, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useJournalDays(journalFilter ?? undefined, favoritesOnly);
  const { toggleFavorite, moveToJournals, deleteEntry, setTags, moveDate, addLink } = useJournalDayActions();
  const today = todayIso();
  const hasTodayEntry = days.some((d) => d.date === today);

  const handleDelete = (date: string) => {
    if (!confirm("Excluir esta entrada? Todo o texto e as fotos deste dia serão apagados permanentemente.")) return;
    deleteEntry(date).catch(() => undefined);
  };

  let lastGroup: ReturnType<typeof feedGroupKey> | null = null;

  return (
    <div className="w-full">
      <FeedInsightsStrip onOpenInsights={onOpenInsights} />
      <OnThisDaySection onOpenDay={onOpenDay} />
      <div className="flex flex-wrap items-center gap-1.5 mb-1">
        <button
          onClick={() => setFavoritesOnly((v) => !v)}
          aria-pressed={favoritesOnly}
          className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            favoritesOnly ? "bg-amber-400 text-white" : "bg-black/[0.04] dark:bg-white/[0.06] text-slate hover:text-inherit"
          }`}
        >
          <Star size={11} className={favoritesOnly ? "fill-current" : undefined} />
          Favoritos
        </button>
      </div>
      <JournalFilterChips collections={collections} active={journalFilter} onChange={onChangeFilter} />
      {journalFilter && (
        <div className="mb-3">
          <JournalWordCloud collections={collections} onOpenDay={onOpenDay} fixedJournalId={journalFilter} compact />
        </div>
      )}
      {isLoading ? (
        <p className="text-sm text-slate">Carregando…</p>
      ) : days.length === 0 ? (
        <EmptyState
          title={favoritesOnly ? "Nenhum dia favoritado ainda" : journalFilter ? "Nenhuma entrada neste diário ainda" : "Seu diário está esperando a primeira entrada"}
          description="Escreva como foi o seu dia, do seu jeito — o LifeOS guarda tudo com data e monta seus Insights a partir disso."
          ctaLabel="Escrever hoje"
          onCta={() => onOpenDay(todayIso())}
        />
      ) : (
        <div className="space-y-3">
          {!hasTodayEntry && !favoritesOnly && !journalFilter && (
            <button
              onClick={() => onOpenDay(today)}
              className="w-full text-left rounded-2xl border border-dashed border-cat-pink/30 bg-cat-pink/5 dark:bg-cat-pink/10 p-4 sm:p-5 hover:bg-cat-pink/10 transition-colors flex items-center gap-3 rpg:rpg-panel rpg:border-dashed rpg:border-rpg-pink/60 rpg:p-4 sm:rpg:p-5"
            >
              <span className="shrink-0 w-11 h-11 rounded-full bg-cat-pink/15 flex items-center justify-center">
                <Plus size={18} className="text-cat-pink" />
              </span>
              <div>
                <p className="text-sm font-semibold rpg:font-pixel rpg:uppercase rpg:tracking-wide rpg:text-rpg-pink">Continuar escrevendo</p>
                <p className="text-xs text-slate mt-0.5">Você ainda não escreveu nada hoje.</p>
              </div>
            </button>
          )}
          {days.map((day) => {
            const group = feedGroupKey(day.date);
            const label = FEED_GROUP_LABEL[group];
            const showHeader = group !== lastGroup && !!label;
            lastGroup = group;
            return (
              <div key={day.date}>
                {showHeader && <p className="text-xs font-semibold text-slate uppercase tracking-wide mb-2 mt-1">{label}</p>}
                <EntryCard
                  day={day}
                  collections={collections}
                  isToday={day.date === today}
                  onOpen={() => onOpenDay(day.date)}
                  onOpenLightbox={(photos, index) => setLightbox({ photos, index })}
                  onToggleFavorite={() => toggleFavorite({ date: day.date, isFavorite: !day.isFavorite }).catch(() => undefined)}
                  onMove={(journalIds) => moveToJournals({ date: day.date, journalIds }).catch(() => undefined)}
                  onExport={() => downloadJournalPdf(day.date).catch(() => undefined)}
                  onDelete={() => handleDelete(day.date)}
                  onSetTags={(tags) => setTags({ date: day.date, tags }).catch(() => undefined)}
                  onAddLink={(targetType, targetId) => addLink({ date: day.date, targetType, targetId }).catch(() => undefined)}
                  onMoveDate={(newDate) => moveDate({ date: day.date, newDate }).catch(() => undefined)}
                />
              </div>
            );
          })}
          {hasNextPage && (
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="w-full text-center text-sm text-cat-pink font-medium py-3 hover:underline disabled:opacity-50"
            >
              {isFetchingNextPage ? "Carregando…" : "Carregar mais"}
            </button>
          )}
        </div>
      )}
      {lightbox && <FeedPhotoViewer photos={lightbox.photos} startIndex={lightbox.index} onClose={() => setLightbox(null)} />}
    </div>
  );
}

/** Aba "Insights" — as mesmas métricas reais do masthead, em destaque, com contagem animada. */
function JournalInsightsTab({ collections, onOpenDay }: { collections: JournalCollection[]; onOpenDay: (date: string) => void }) {
  const { insights, isLoading } = useJournalInsights();
  const streakCount = useCountUp(insights?.currentStreak ?? 0);
  const longestCount = useCountUp(insights?.longestStreak ?? 0);
  const entriesCount = useCountUp(insights?.totalEntries ?? 0);
  const wordsCount = useCountUp(insights?.totalWords ?? 0);

  if (isLoading) return <p className="text-sm text-slate">Carregando…</p>;

  if (!insights || insights.totalEntries === 0) {
    return (
      <EmptyState
        title="Ainda sem Insights"
        description="Assim que você escrever sua primeira entrada, sua sequência, recorde, total de entradas e de palavras aparecem aqui — sempre derivados do que você realmente escreveu."
        ctaLabel="Escrever hoje"
        onCta={() => undefined}
      />
    );
  }

  const tiles: Array<{ icon: React.ReactNode; label: string; value: string; tone: string }> = [
    { icon: <Flame size={20} />, label: "Sequência atual", value: `${streakCount} ${streakCount === 1 ? "dia" : "dias"}`, tone: "text-signal" },
    { icon: <Award size={20} />, label: "Recorde", value: `${longestCount} ${longestCount === 1 ? "dia" : "dias"}`, tone: "text-cat-purple" },
    { icon: <CalendarDays size={20} />, label: "Entradas escritas", value: `${entriesCount}`, tone: "text-cat-blue" },
    { icon: <TypeIcon size={20} />, label: "Palavras escritas", value: wordsCount.toLocaleString("pt-BR"), tone: "text-cat-green" },
    { icon: <BookOpen size={20} />, label: "Palavras por entrada", value: `${insights.avgWordsPerEntry}`, tone: "text-cat-teal" },
    ...(insights.bestWeekday
      ? [{ icon: <Sun size={20} />, label: "Dia que mais escreve", value: insights.bestWeekday, tone: "text-cat-pink" }]
      : []),
  ];

  return (
    <div className="w-full space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <Card key={t.label} className="p-4 sm:p-5 flex flex-col items-start gap-2 transition-all duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md">
            <span className={t.tone}>{t.icon}</span>
            <p className="text-2xl font-bold leading-none">{t.value}</p>
            <p className="text-xs text-slate">{t.label}</p>
          </Card>
        ))}
      </div>

      <JournalWordCloud collections={collections} onOpenDay={onOpenDay} />

      {/* Correlação real com humor (Saúde) — só aparece com amostra suficiente
          em ambos os grupos (ver getJournalInsights); nunca uma métrica
          inventada, e o texto deixa claro que é uma correlação, não causa. */}
      {insights.moodCorrelation && (
        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <Heart size={16} className="text-cat-pink" />
            <p className="text-sm font-semibold">Humor e o hábito de escrever</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-cat-pink/10 p-3">
              <p className="text-2xl font-bold text-cat-pink leading-none">{insights.moodCorrelation.onWritingDays}/5</p>
              <p className="text-[11px] text-slate mt-1">
                Humor médio em dias que você escreveu ({insights.moodCorrelation.sampleSize.writingDays} dias)
              </p>
            </div>
            <div className="rounded-xl bg-black/[0.03] dark:bg-white/[0.05] p-3">
              <p className="text-2xl font-bold leading-none">{insights.moodCorrelation.onOtherDays}/5</p>
              <p className="text-[11px] text-slate mt-1">
                Humor médio nos demais dias ({insights.moodCorrelation.sampleSize.otherDays} dias)
              </p>
            </div>
          </div>
          <p className="text-[11px] text-slate mt-3">
            Correlação, não causa: baseado no humor real registrado em Saúde nos mesmos dias das suas entradas.
          </p>
        </Card>
      )}
    </div>
  );
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Aba "Calendário" — grade do mês com pontinho nos dias que têm entrada real; clicar abre o dia. */
function JournalCalendarTab({
  onOpenDay,
  collections,
  journalFilter,
  onChangeFilter,
}: {
  onOpenDay: (date: string) => void;
  collections: JournalCollection[];
  journalFilter: string | null;
  onChangeFilter: (id: string | null) => void;
}) {
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const { days: markedDays, isLoading } = useJournalCalendarMonth(month, journalFilter ?? undefined);
  const marked = useMemo(() => new Set(markedDays), [markedDays]);

  const [year, monthNum] = month.split("-").map(Number);
  const monthIndex = monthNum - 1;
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const total = daysInMonth(year, monthIndex);
  const monthLabel = new Date(year, monthIndex, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const today = todayIso();

  const changeMonth = (delta: number) => {
    const d = new Date(year, monthIndex + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const cells: Array<{ day: number; date: string } | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= total; d++) {
    cells.push({ day: d, date: `${year}-${String(monthNum).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
  }

  return (
    <div className="max-w-md">
      <JournalFilterChips collections={collections} active={journalFilter} onChange={onChangeFilter} />
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => changeMonth(-1)} className="w-8 h-8 rounded-lg flex items-center justify-center border border-paper-border dark:border-ink-border hover:bg-black/[0.03] dark:hover:bg-white/[0.05]" aria-label="Mês anterior">
          <ChevronLeft size={15} />
        </button>
        <p className="text-sm font-semibold capitalize">{monthLabel}</p>
        <button onClick={() => changeMonth(1)} disabled={month >= today.slice(0, 7)} className="w-8 h-8 rounded-lg flex items-center justify-center border border-paper-border dark:border-ink-border hover:bg-black/[0.03] dark:hover:bg-white/[0.05] disabled:opacity-30" aria-label="Próximo mês">
          <ChevronRight size={15} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1.5">
        {WEEKDAYS.map((w, i) => (
          <p key={i} className="text-center text-[10px] text-slate font-semibold">
            {w}
          </p>
        ))}
      </div>
      <div className={`grid grid-cols-7 gap-1 ${isLoading ? "opacity-50" : ""}`}>
        {cells.map((cell, i) =>
          cell ? (
            <button
              key={cell.date}
              onClick={() => onOpenDay(cell.date)}
              disabled={cell.date > today}
              className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-xs transition-colors disabled:opacity-30 ${
                cell.date === today ? "bg-cat-pink text-white font-semibold" : "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
              }`}
            >
              {cell.day}
              {marked.has(cell.date) && <span className={`w-1 h-1 rounded-full ${cell.date === today ? "bg-white" : "bg-cat-pink"}`} />}
            </button>
          ) : (
            <div key={`empty-${i}`} />
          )
        )}
      </div>
    </div>
  );
}


/**
 * Calendário mensal compacto (Fase 17 — sidebar do feed "Entradas" no
 * desktop): mesmos dados reais do mês (useJournalCalendarMonth) da aba
 * "Calendário", só que menor e sem filtro, pra caber ao lado do feed.
 */
function MiniCalendarWidget({ onOpenDay }: { onOpenDay: (date: string) => void }) {
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const { days: markedDays } = useJournalCalendarMonth(month);
  const marked = useMemo(() => new Set(markedDays), [markedDays]);

  const [year, monthNum] = month.split("-").map(Number);
  const monthIndex = monthNum - 1;
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const total = daysInMonth(year, monthIndex);
  const monthLabel = new Date(year, monthIndex, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const today = todayIso();

  const changeMonth = (delta: number) => {
    const d = new Date(year, monthIndex + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const cells: Array<{ day: number; date: string } | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= total; d++) {
    cells.push({ day: d, date: `${year}-${String(monthNum).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => changeMonth(-1)} className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-black/[0.04] dark:hover:bg-white/[0.06]" aria-label="Mês anterior">
          <ChevronLeft size={13} />
        </button>
        <p className="text-xs font-semibold capitalize">{monthLabel}</p>
        <button
          onClick={() => changeMonth(1)}
          disabled={month >= today.slice(0, 7)}
          className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-black/[0.04] dark:hover:bg-white/[0.06] disabled:opacity-30"
          aria-label="Próximo mês"
        >
          <ChevronRight size={13} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {WEEKDAYS.map((w, i) => (
          <p key={i} className="text-center text-[9px] text-slate font-semibold">
            {w.slice(0, 1)}
          </p>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((cell, i) =>
          cell ? (
            <button
              key={cell.date}
              onClick={() => onOpenDay(cell.date)}
              disabled={cell.date > today}
              className={`aspect-square rounded-md flex flex-col items-center justify-center text-[10px] transition-colors disabled:opacity-30 ${
                cell.date === today ? "bg-cat-pink text-white font-semibold" : "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
              }`}
            >
              {cell.day}
              {marked.has(cell.date) && <span className={`w-0.5 h-0.5 rounded-full ${cell.date === today ? "bg-white" : "bg-cat-pink"}`} />}
            </button>
          ) : (
            <div key={`empty-${i}`} />
          )
        )}
      </div>
    </Card>
  );
}

/** Lista "Meus diários" (Fase 17 — sidebar): reaproveita useJournalCollections, com contagem real de entradas. */
function MyJournalsWidget({ collections, onOpenCollections }: { collections: JournalCollection[]; onOpenCollections: () => void }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-xs font-semibold">Meus diários</p>
        <button onClick={onOpenCollections} className="text-[11px] font-medium text-cat-pink hover:underline">
          Ver todos
        </button>
      </div>
      {collections.length === 0 ? (
        <p className="text-[11px] text-slate">Nenhum diário criado ainda.</p>
      ) : (
        <div className="space-y-1.5 mb-2.5">
          {collections.slice(0, 6).map((c) => (
            <div key={c.id} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 min-w-0 truncate">
                {c.icon ?? "📔"} {c.name}
              </span>
              <span className="text-slate shrink-0 ml-2">{c.entry_count ?? 0}</span>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={onOpenCollections}
        className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-cat-pink border border-dashed border-cat-pink/30 rounded-lg py-1.5 hover:bg-cat-pink/5 transition-colors"
      >
        <Plus size={12} /> Novo diário
      </button>
    </Card>
  );
}

/** Gráfico compacto real de entradas por mês (últimos 6 meses) — Fase 17, sidebar do feed. */
function EntriesByMonthChart() {
  const { insights } = useJournalInsights();
  if (!insights || insights.entriesByMonth.every((m) => m.count === 0)) return null;
  const data = insights.entriesByMonth.map((m) => ({
    label: new Date(`${m.month}-01T00:00:00`).toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
    count: m.count,
  }));
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold mb-3">Entradas por mês</p>
      <div className="h-28">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ fontSize: 11 }} />
            <Bar dataKey="count" fill="#EC4899" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

/**
 * Sidebar do feed "Entradas" no desktop (Fase 17 — protótipo Apple
 * Journal): calendário mensal, "Meus diários" e um gráfico compacto —
 * só aparece em telas largas (lg+), nunca no mobile/tablet.
 */
function DiarioSidebar({ collections, onOpenDay, onOpenCollections }: { collections: JournalCollection[]; onOpenDay: (date: string) => void; onOpenCollections: () => void }) {
  return (
    <aside className="hidden lg:flex lg:flex-col gap-4 w-[280px] xl:w-[320px] 2xl:w-[360px] shrink-0">
      <MiniCalendarWidget onOpenDay={onOpenDay} />
      <MyJournalsWidget collections={collections} onOpenCollections={onOpenCollections} />
      <EntriesByMonthChart />
    </aside>
  );
}

/** Pino customizado (círculo rosa) do mapa de "Lugares" — evita depender dos assets de ícone padrão do Leaflet (quebram com bundlers). */
function placePinIcon(count: number) {
  return L.divIcon({
    className: "",
    html: `<div style="background:#EC4899;color:white;border-radius:9999px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;box-shadow:0 2px 6px rgba(0,0,0,0.25);border:2px solid white;">${count}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

/**
 * Aba "Lugares" (Fase 17 — protótipo Apple Journal): locais reais onde o
 * usuário escreveu, agrupados por texto de localização, com mapa
 * (Leaflet + OpenStreetMap, sem custo/chave) quando há coordenadas reais,
 * e a lista de entradas daquele local ao selecionar um.
 */
function JournalPlacesTab({ onOpenDay }: { onOpenDay: (date: string) => void }) {
  const { items: locations, isLoading } = useJournalLocations();
  const [selected, setSelected] = useState<string | null>(null);
  const { items: daysAtLocation } = useJournalDaysByLocation(selected);

  const withCoords = locations.filter((l): l is JournalLocationSummary & { lat: number; lng: number } => l.lat != null && l.lng != null);
  const center: [number, number] = withCoords.length > 0 ? [withCoords[0].lat, withCoords[0].lng] : [-14.235, -51.925];

  if (isLoading) return <p className="text-sm text-slate">Carregando…</p>;

  if (locations.length === 0) {
    return (
      <EmptyState
        title="Nenhum local registrado ainda"
        description="Adicione uma localização real ao escrever uma entrada (seção Localização, etiquetas e vínculos) e ela aparece aqui, com um mapa dos seus lugares."
        ctaLabel="Escrever hoje"
        onCta={() => onOpenDay(todayIso())}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      <div className="space-y-3">
        {withCoords.length > 0 && (
          <Card className="p-0 overflow-hidden">
            <div className="h-72">
              <MapContainer center={center} zoom={4} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
                <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {withCoords.map((loc) => (
                  <Marker key={loc.label} position={[loc.lat, loc.lng]} icon={placePinIcon(loc.count)} eventHandlers={{ click: () => setSelected(loc.label) }}>
                    <Popup>
                      <strong>{loc.label}</strong>
                      <br />
                      {loc.count} {loc.count === 1 ? "entrada" : "entradas"}
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          </Card>
        )}

        {selected && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <MapPin size={14} className="text-cat-pink" /> Entradas em {selected}
              </p>
              <button onClick={() => setSelected(null)} className="text-xs text-slate hover:text-inherit">
                Fechar
              </button>
            </div>
            <div className="space-y-2">
              {daysAtLocation.map((day) => (
                <button
                  key={day.date}
                  onClick={() => onOpenDay(day.date)}
                  className="w-full text-left rounded-xl border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised p-3 hover:-translate-y-0.5 hover:shadow-md transition-all"
                >
                  <p className="text-xs font-semibold capitalize">{formatCardDate(day.date)}</p>
                  <p className="text-xs text-slate line-clamp-2 mt-0.5">{day.preview}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-slate mb-2 flex items-center gap-1.5">
          <MapIcon size={13} /> Todos os locais
        </p>
        <div className="space-y-1.5">
          {locations.map((loc) => (
            <button
              key={loc.label}
              onClick={() => setSelected(loc.label)}
              className={`w-full flex items-center justify-between gap-2 text-left rounded-xl border px-3 py-2 text-xs transition-colors ${
                selected === loc.label ? "border-cat-pink bg-cat-pink/5" : "border-paper-border dark:border-ink-border hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
              }`}
            >
              <span className="flex items-center gap-1.5 min-w-0 truncate">
                <MapPin size={12} className="shrink-0 text-cat-pink" />
                <span className="truncate">{loc.label}</span>
              </span>
              <span className="text-slate shrink-0">{loc.count}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const COLLECTION_COLOR_OPTIONS: Array<{ value: "pink" | "blue" | "purple" | "green" | "teal"; label: string }> = [
  { value: "pink", label: "Rosa" },
  { value: "blue", label: "Azul" },
  { value: "purple", label: "Roxo" },
  { value: "green", label: "Verde" },
  { value: "teal", label: "Turquesa" },
];

/** Formulário compacto de criar/editar um diário — mesmo componente pros dois casos. */
function JournalCollectionForm({
  initial,
  onSubmit,
  onCancel,
  isSaving,
}: {
  initial?: JournalCollection;
  onSubmit: (input: JournalCollectionInput) => void;
  onCancel?: () => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "");
  const [color, setColor] = useState<"pink" | "blue" | "purple" | "green" | "teal">(initial?.color ?? "pink");
  const [description, setDescription] = useState(initial?.description ?? "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSubmit({ name: name.trim(), icon: icon.trim() || null, color, description: description.trim() || null });
        if (!initial) {
          setName("");
          setIcon("");
          setDescription("");
        }
      }}
      className="flex flex-col gap-2.5"
    >
      <div className="flex gap-2">
        <input
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          placeholder="🦋"
          maxLength={4}
          className="w-14 shrink-0 text-center rounded-xl px-2 py-2 text-lg bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border focus:border-cat-pink transition-colors"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do diário (ex.: Viagens)"
          className="flex-1 rounded-xl px-3 py-2 text-sm bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border focus:border-cat-pink transition-colors"
        />
      </div>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Descrição (opcional)"
        className="w-full rounded-xl px-3 py-2 text-xs bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border focus:border-cat-pink transition-colors"
      />
      <div className="flex items-center gap-1.5">
        {COLLECTION_COLOR_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setColor(opt.value)}
            aria-label={opt.label}
            className={`w-6 h-6 rounded-full ${COLLECTION_COLOR_CLASSES[opt.value]} ${
              color === opt.value ? "ring-2 ring-offset-2 ring-cat-pink dark:ring-offset-ink-raised" : ""
            }`}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isSaving || !name.trim()}
          className="rounded-lg px-3.5 py-1.5 text-xs font-semibold bg-cat-pink text-white hover:bg-cat-pink/90 active:scale-95 transition-all disabled:opacity-50"
        >
          {initial ? "Salvar" : "Criar diário"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-xs text-slate hover:text-inherit">
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

/** Aba "Diários" — gerenciar as coleções (criar, editar, arquivar). Arquivar nunca apaga entradas já vinculadas. */
const JOURNAL_UNLOCK_KEY = "lifeos_journal_unlocked";

/**
 * Cartão de configuração do bloqueio de privacidade do Diário (Fase 12):
 * definir/trocar/remover o PIN. O PIN é exclusivo do Diário, independente
 * da senha da conta, e nunca é salvo em texto puro (bcrypt no backend).
 */
function JournalPinSettingsCard() {
  const { hasPin, isLoading, setPin, isSettingPin, removePin, isRemovingPin } = useJournalPin();
  const [mode, setMode] = useState<"idle" | "set" | "remove">("idle");
  const [pinInput, setPinInput] = useState("");
  const [confirmInput, setConfirmInput] = useState("");
  const [currentInput, setCurrentInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setMode("idle");
    setPinInput("");
    setConfirmInput("");
    setCurrentInput("");
    setError(null);
  };

  const handleSetPin = () => {
    if (!/^\d{4,8}$/.test(pinInput)) return setError("O PIN deve ter de 4 a 8 dígitos.");
    if (pinInput !== confirmInput) return setError("Os PINs não coincidem.");
    setPin(pinInput)
      .then(() => {
        sessionStorage.setItem(JOURNAL_UNLOCK_KEY, "1");
        reset();
      })
      .catch(() => setError("Não foi possível salvar o PIN."));
  };

  const handleRemovePin = () => {
    removePin(currentInput)
      .then(() => {
        sessionStorage.removeItem(JOURNAL_UNLOCK_KEY);
        reset();
      })
      .catch(() => setError("PIN incorreto."));
  };

  if (isLoading) return null;

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-1">
        <Lock size={15} className="text-cat-pink" />
        <p className="text-sm font-semibold">Bloqueio de privacidade</p>
      </div>
      <p className="text-xs text-slate mb-3">
        {hasPin ? "Seu Diário está protegido por PIN — só abre nesta sessão depois de digitado." : "Peça um PIN antes de abrir o Diário, independente da senha da sua conta."}
      </p>

      {mode === "idle" && (
        <button
          onClick={() => setMode(hasPin ? "remove" : "set")}
          className="text-xs font-medium text-cat-pink hover:underline"
        >
          {hasPin ? "Remover PIN" : "Definir PIN"}
        </button>
      )}

      {mode === "set" && (
        <div className="space-y-2">
          <input
            type="password"
            inputMode="numeric"
            placeholder="Novo PIN (4 a 8 dígitos)"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 8))}
            className="w-full rounded-lg border border-paper-border dark:border-ink-border bg-transparent px-3 py-2 text-sm"
          />
          <input
            type="password"
            inputMode="numeric"
            placeholder="Confirme o PIN"
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value.replace(/\D/g, "").slice(0, 8))}
            className="w-full rounded-lg border border-paper-border dark:border-ink-border bg-transparent px-3 py-2 text-sm"
          />
          {error && <p className="text-xs text-signal">{error}</p>}
          <div className="flex gap-2">
            <button onClick={handleSetPin} disabled={isSettingPin} className="text-xs font-semibold text-white bg-cat-pink rounded-lg px-3 py-1.5 disabled:opacity-50">
              Salvar
            </button>
            <button onClick={reset} className="text-xs text-slate">Cancelar</button>
          </div>
        </div>
      )}

      {mode === "remove" && (
        <div className="space-y-2">
          <input
            type="password"
            inputMode="numeric"
            placeholder="PIN atual"
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value.replace(/\D/g, "").slice(0, 8))}
            className="w-full rounded-lg border border-paper-border dark:border-ink-border bg-transparent px-3 py-2 text-sm"
          />
          {error && <p className="text-xs text-signal">{error}</p>}
          <div className="flex gap-2">
            <button onClick={handleRemovePin} disabled={isRemovingPin} className="text-xs font-semibold text-white bg-signal rounded-lg px-3 py-1.5 disabled:opacity-50">
              Remover
            </button>
            <button onClick={reset} className="text-xs text-slate">Cancelar</button>
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * Portão de privacidade do Diário (Fase 12): se houver PIN definido e a
 * sessão ainda não desbloqueou (sessionStorage — some ao fechar a aba),
 * pede o PIN antes de mostrar qualquer conteúdo real do Diário.
 */
function JournalPinGate({ children }: { children: React.ReactNode }) {
  const { hasPin, isLoading, verifyPin, isVerifyingPin } = useJournalPin();
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(JOURNAL_UNLOCK_KEY) === "1");
  const [pinInput, setPinInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return null;
  if (!hasPin || unlocked) return <>{children}</>;

  const handleUnlock = () => {
    verifyPin(pinInput)
      .then((res) => {
        if (res.valid) {
          sessionStorage.setItem(JOURNAL_UNLOCK_KEY, "1");
          setUnlocked(true);
        } else {
          setError("PIN incorreto.");
        }
      })
      .catch(() => setError("Não foi possível verificar o PIN."));
  };

  return (
    <div className="mx-auto max-w-sm px-4 py-16 sm:py-24 text-center">
      <div className="w-12 h-12 rounded-2xl bg-cat-pink/10 text-cat-pink flex items-center justify-center mx-auto mb-4">
        <Lock size={20} />
      </div>
      <p className="text-lg font-semibold mb-1">Diário bloqueado</p>
      <p className="text-sm text-slate mb-5">Digite seu PIN para continuar.</p>
      <input
        type="password"
        inputMode="numeric"
        autoFocus
        placeholder="PIN"
        value={pinInput}
        onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 8))}
        onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
        className="w-full text-center text-lg tracking-widest rounded-lg border border-paper-border dark:border-ink-border bg-transparent px-3 py-2.5 mb-2"
      />
      {error && <p className="text-xs text-signal mb-2">{error}</p>}
      <button
        onClick={handleUnlock}
        disabled={isVerifyingPin || pinInput.length < 4}
        className="w-full text-sm font-semibold text-white bg-cat-pink rounded-lg px-3 py-2.5 disabled:opacity-50"
      >
        Desbloquear
      </button>
    </div>
  );
}

function JournalCollectionsTab() {
  const { collections, isLoading, create, update, remove, isSaving } = useJournalCollections();
  const [editingId, setEditingId] = useState<string | null>(null);

  if (isLoading) return <p className="text-sm text-slate">Carregando…</p>;

  return (
    <div className="w-full grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-4 items-start">
      <div className="space-y-4">
      <JournalPinSettingsCard />

      <Card className="p-4 sm:p-5">
        <p className="text-sm font-semibold mb-3">Novo diário</p>
        <JournalCollectionForm onSubmit={(input) => create(input)} isSaving={isSaving} />
      </Card>
      </div>

      {collections.length === 0 ? (
        <p className="text-sm text-slate">
          Nenhum diário criado ainda — todas as suas entradas aparecem juntas em "Entradas" até você organizar por diário.
        </p>
      ) : (
        <div className="space-y-2.5">
          {collections.map((col) =>
            editingId === col.id ? (
              <Card key={col.id} className="p-4 sm:p-5">
                <JournalCollectionForm
                  initial={col}
                  isSaving={isSaving}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(input) => {
                    update({ id: col.id, input });
                    setEditingId(null);
                  }}
                />
              </Card>
            ) : (
              <Card key={col.id} className="p-3.5 sm:p-4 flex items-center gap-3">
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 ${COLLECTION_COLOR_CLASSES[col.color ?? "pink"]}`}>
                  {col.icon || "📔"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{col.name}</p>
                  {col.description && <p className="text-xs text-slate truncate">{col.description}</p>}
                </div>
                <button onClick={() => setEditingId(col.id)} className="text-xs text-cat-pink font-medium shrink-0">
                  Editar
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Arquivar "${col.name}"? As entradas já vinculadas continuam existindo, só não aparecem mais como um diário ativo.`)) {
                      remove(col.id);
                    }
                  }}
                  className="text-xs text-slate hover:text-signal shrink-0"
                >
                  Arquivar
                </button>
              </Card>
            )
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Diário — ponto de entrada da tela: navegação por abas no espírito do
 * app Diário da Apple (Entradas / Insights / Calendário), todas 100%
 * derivadas de journal_entries reais. "Entradas" é o feed cronológico
 * (a home passa a ser sobre memória, não sobre um dashboard de métricas);
 * abrir um dia — pelo feed, pelo calendário ou por "+ Nova entrada" —
 * leva ao editor imersivo do dia (DiaryDayEditor, o antigo Diário).
 */
export function DiarioPage() {
  return (
    <JournalPinGate>
      <DiarioPageContent />
    </JournalPinGate>
  );
}

function DiarioPageContent() {
  const { isRpg } = useTheme();
  const [view, setView] = useState<ViewKey | "day">("feed");
  const [date, setDate] = useState(todayIso());
  const [journalFilter, setJournalFilter] = useState<string | null>(null);
  const { collections } = useJournalCollections();
  const [searchParams, setSearchParams] = useSearchParams();

  const openDay = (d: string) => {
    setDate(d);
    setView("day");
  };

  // Deep-link "?date=YYYY-MM-DD" (ex.: resultado da busca global) — abre o
  // dia pedido uma vez e limpa o parâmetro da URL em seguida.
  useEffect(() => {
    const requested = searchParams.get("date");
    if (requested) {
      openDay(requested);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("date");
        return next;
      }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  if (view === "day") {
    return <DiaryDayEditor date={date} setDate={setDate} onBack={() => setView("feed")} />;
  }

  return (
    <div className="w-full px-3 sm:px-4 md:px-8 py-4 sm:py-6 md:py-8">
      {isRpg ? (
        <PageHeader
          banner="diario"
          tone="pink"
          icon={<NotebookPen size={24} />}
          title="Diário"
          subtitle="Crônicas da sua jornada — reflita sobre os momentos do seu dia."
          actions={
            <RPGButton variant="pink" onClick={() => openDay(todayIso())}>
              <Plus size={15} /> Nova entrada
            </RPGButton>
          }
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <p className="text-2xl sm:text-3xl font-bold tracking-tight text-cat-pink">Diário</p>
            <p className="text-xs sm:text-sm text-slate mt-0.5">Reflita sobre os momentos do seu dia.</p>
          </div>
          <button
            onClick={() => openDay(todayIso())}
            className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold bg-cat-pink text-white hover:bg-cat-pink/90 active:scale-95 transition-all shadow-sm"
          >
            <Plus size={15} />
            Nova entrada
          </button>
        </div>
      )}

      <div className="mb-5">
        <TabBar active={view} onChange={setView} />
      </div>

      {view === "feed" && (
        <div className="flex flex-col lg:flex-row gap-4 items-start">
          <div className="flex-1 min-w-0 w-full">
            <JournalFeedTab
              onOpenDay={openDay}
              onOpenInsights={() => setView("insights")}
              collections={collections}
              journalFilter={journalFilter}
              onChangeFilter={setJournalFilter}
            />
          </div>
          <DiarioSidebar collections={collections} onOpenDay={openDay} onOpenCollections={() => setView("collections")} />
        </div>
      )}
      {view === "insights" && <JournalInsightsTab collections={collections} onOpenDay={openDay} />}
      {view === "calendar" && (
        <JournalCalendarTab onOpenDay={openDay} collections={collections} journalFilter={journalFilter} onChangeFilter={setJournalFilter} />
      )}
      {view === "places" && <JournalPlacesTab onOpenDay={openDay} />}
      {view === "collections" && <JournalCollectionsTab />}
    </div>
  );
}
