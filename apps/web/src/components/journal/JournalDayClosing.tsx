import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { BedDouble, Check, Loader2, Moon, Sunrise, Zap } from "lucide-react";
import type { JournalAutoData } from "@/types";
import { Card } from "@/components/ui/primitives";
import { RichTextEditor } from "@/components/journal/RichTextEditor";
import { ProvenanceBadge } from "@/components/experiments/AiThinking";
import { MOOD_EMOJI, MOOD_LABEL } from "@/utils/journalMood";

function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h <= 0) return `${m}min`;
  return m > 0 ? `${h}h${m}min` : `${h}h`;
}

/**
 * Fechamento do dia. Humor, energia e sono vêm SEMPRE de Saúde (fonte única):
 * se ainda não houver humor no dia, o registro rápido grava em mood_entries,
 * não no diário. O único campo escrito aqui é "O que levo para amanhã".
 */
export function JournalDayClosing({
  auto,
  legacyNightMood,
  takeaway,
  onTakeawayChange,
  onTakeawayBlur,
  onRegisterMood,
}: {
  auto: JournalAutoData | undefined;
  /** night_mood antigo, anotado no diário antes da integração com Saúde. */
  legacyNightMood: number | null;
  takeaway: string;
  onTakeawayChange: (html: string) => void;
  onTakeawayBlur: () => void;
  onRegisterMood: (mood: number, energy: number) => Promise<unknown>;
}) {
  const [mood, setMood] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registered = auto?.mood ?? null;
  const sleep = auto?.sleep ?? null;

  const register = async () => {
    if (!mood || !energy) return;
    setSaving(true);
    setError(null);
    try {
      await onRegisterMood(mood, energy);
      setMood(null);
      setEnergy(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível registrar em Saúde.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4 sm:p-5 border-t-2 border-t-cat-purple/40">
      <div className="flex items-center gap-2 mb-4">
        <Moon size={16} className="text-cat-purple" />
        <p className="text-sm font-semibold">Fechamento do dia</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-3">
          <div className="flex items-center gap-1.5">
            <ProvenanceBadge kind="dado" />
            <span className="text-[11px] text-slate">Registrado em Saúde</span>
          </div>

          {registered ? (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
              <span className="text-4xl leading-none" aria-hidden>{MOOD_EMOJI[registered.mood - 1]}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {MOOD_LABEL[registered.mood - 1]} <span className="text-slate font-normal">· humor {registered.mood}/5</span>
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <Zap size={12} className="text-cat-pink shrink-0" aria-hidden />
                  <div className="flex gap-1 flex-1 max-w-[160px]" aria-label={`Energia ${registered.energy} de 5`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span key={n} className={`h-2 flex-1 rounded-full ${n <= registered.energy ? "bg-cat-pink" : "bg-paper-border dark:bg-ink-border"}`} />
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="rounded-xl border border-dashed border-paper-border dark:border-ink-border p-3">
              <p className="text-xs text-slate mb-2">Como você termina o dia? Fica salvo em Saúde.</p>
              {legacyNightMood != null && (
                <p className="text-[11px] text-slate mb-2">
                  Anotado no diário (registro antigo): {MOOD_EMOJI[legacyNightMood - 1]} {legacyNightMood}/5
                </p>
              )}
              <div className="flex justify-between gap-1 mb-3" role="radiogroup" aria-label="Humor">
                {MOOD_EMOJI.map((emoji, i) => (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={mood === i + 1}
                    aria-label={MOOD_LABEL[i]}
                    onClick={() => setMood(i + 1)}
                    className={`flex flex-col items-center gap-0.5 rounded-xl px-1.5 py-1 transition-all ${
                      mood === i + 1 ? "bg-cat-purple/12 scale-110" : mood ? "opacity-40 hover:opacity-80" : "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                    }`}
                  >
                    <span className="text-2xl leading-none">{emoji}</span>
                    <span className="text-[10px] text-slate">{MOOD_LABEL[i]}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[11px] text-slate w-14 shrink-0">Energia</span>
                <div className="flex gap-1.5 flex-1" role="radiogroup" aria-label="Energia">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={energy === n}
                      aria-label={`Energia ${n}`}
                      onClick={() => setEnergy(n)}
                      className={`h-7 flex-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                        energy != null && n <= energy ? "bg-cat-pink text-white border-cat-pink" : "border-paper-border dark:border-ink-border"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={register}
                disabled={!mood || !energy || saving}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold bg-cat-purple text-white hover:bg-cat-purple/90 disabled:opacity-40 transition-all"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                Registrar em Saúde
              </button>
              {error && <p className="text-xs text-drop mt-2" role="alert">{error}</p>}
            </div>
          )}

          <div className="flex items-center gap-2 text-sm">
            <BedDouble size={15} className="text-cat-blue shrink-0" aria-hidden />
            {sleep?.durationMinutes || sleep?.qualityScore ? (
              <span>
                Sono {sleep.durationMinutes ? fmtMinutes(sleep.durationMinutes) : ""}
                {sleep.qualityScore ? <span className="text-slate"> · qualidade {sleep.qualityScore}/5</span> : null}
              </span>
            ) : (
              <span className="text-xs text-slate">
                Sem sono registrado.{" "}
                <Link to="/saude" className="text-cat-pink font-medium">Registrar em Saúde →</Link>
              </span>
            )}
          </div>
        </div>

        <div>
          <p className="text-xs text-slate mb-2 flex items-center gap-1.5">
            <Sunrise size={13} className="text-signal" aria-hidden /> O que levo para amanhã?
          </p>
          <RichTextEditor
            value={takeaway}
            onChange={onTakeawayChange}
            onBlur={onTakeawayBlur}
            placeholder="Um aprendizado, uma pendência, algo para lembrar…"
            minHeightClass="min-h-[120px]"
          />
        </div>
      </div>
    </Card>
  );
}
