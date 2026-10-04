import { useState } from "react";
import clsx from "clsx";
import { AlertTriangle, Coins, Database, Lightbulb, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { RPGBadge, RPGButton, RPGTabs } from "@/components/rpg";
import { useRewards } from "@/hooks/useGamification";
import { REWARD_CATEGORIES, gamificationService, type AICategory, type LimitPeriod, type RewardRarity, type RewardSuggestion, type SuggestInput } from "@/services/gamificationService";
import { LIMIT_LABEL, RARITY, RARITY_ORDER, rewardArtUrl } from "@/utils/treasureDisplay";

const field = "w-full px-2.5 py-2 text-sm bg-rpg-bg-2 text-rpg-text border border-rpg-border focus:border-rpg-gold outline-none placeholder:text-rpg-muted/70";
const MAX = 400;

type Draft = RewardSuggestion & { picked: boolean; key: string };

/**
 * "Criar recompensas com Gemini": a IA só SUGERE. O usuário revisa, edita,
 * marca e confirma; só então as recompensas são persistidas. O painel
 * separa dado real (resumo enviado), inferência/sugestão (motivo da IA).
 */
export function AIRewardGeneratorModal({ onClose, onDone, onManual }: { onClose: () => void; onDone: (msg: string) => void; onManual: () => void }) {
  const { createBatch } = useRewards(true);
  const suggest = useMutation({ mutationFn: (input: SuggestInput) => gamificationService.suggestRewards(input) });
  const [mode, setMode] = useState<"quick" | "custom">("quick");
  const [freeTime, setFreeTime] = useState("");
  const [wishes, setWishes] = useState("");
  const [leisureTime, setLeisureTime] = useState("");
  const [categories, setCategories] = useState<AICategory[]>([]);
  const [items, setItems] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    setError(null);
    try {
      const input: SuggestInput =
        mode === "quick"
          ? { mode, categories: categories.length ? categories : undefined }
          : { mode, freeTime: freeTime.trim() || undefined, wishes: wishes.trim() || undefined, leisureTime: leisureTime.trim() || undefined, categories: categories.length ? categories : undefined };
      const r = await suggest.mutateAsync(input);
      setItems(r.suggestions.map((s, i) => ({ ...s, picked: !s.similarTo, key: `${i}-${s.name}` })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível gerar sugestões agora.");
    }
  };

  const edit = (key: string, patch: Partial<Draft>) => setItems((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const chosen = items.filter((i) => i.picked && i.name.trim());

  const save = async () => {
    if (chosen.length === 0) return;
    setError(null);
    try {
      const r = await createBatch.mutateAsync(
        chosen.map((s) => ({
          name: s.name.trim(),
          description: s.description,
          category: s.category,
          rarity: s.rarity,
          currency: "coin",
          cost: Math.max(1, Math.round(s.cost)),
          limitPeriod: s.limitPeriod,
          art: s.art,
          isAiGenerated: true,
        })),
      );
      onDone(r.skipped.length ? `${r.created} recompensa(s) adicionada(s). Ignoradas por já existirem: ${r.skipped.join(", ")}.` : `${r.created} recompensa(s) adicionada(s) ao Tesouro.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar as recompensas.");
    }
  };

  const toggleCat = (c: AICategory) => setCategories((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
  const basedOn = suggest.data?.basedOn;

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title="✨ Criar recompensas com Gemini"
      footer={
        items.length > 0 ? (
          <>
            <RPGButton variant="ghost" className="mr-auto" onClick={() => setItems([])}>
              <RotateCcw size={13} aria-hidden /> Gerar de novo
            </RPGButton>
            <RPGButton variant="ghost" onClick={onClose}>
              Cancelar
            </RPGButton>
            <RPGButton variant="gold" onClick={save} disabled={chosen.length === 0 || createBatch.isPending}>
              {createBatch.isPending ? "Salvando…" : `Adicionar selecionadas ao Tesouro (${chosen.length})`}
            </RPGButton>
          </>
        ) : (
          <>
            <RPGButton variant="ghost" onClick={onClose}>
              Cancelar
            </RPGButton>
            <RPGButton variant="primary" onClick={ask} disabled={suggest.isPending}>
              <Wand2 size={14} aria-hidden /> {suggest.isPending ? "Gerando…" : "Gerar sugestões"}
            </RPGButton>
          </>
        )
      }
    >
      {items.length === 0 ? (
        <div className="space-y-4">
          <p className="text-sm text-rpg-text/90">
            Conte como gosta de descansar e se divertir. O LifeOS criará sugestões de recompensas equilibradas com base na sua rotina.
          </p>
          <RPGTabs
            label="Modo de geração"
            size="sm"
            value={mode}
            onChange={setMode}
            tabs={[
              { value: "quick", label: "Sugestão rápida", icon: <Sparkles size={13} /> },
              { value: "custom", label: "Personalizado", icon: <Lightbulb size={13} /> },
            ]}
          />
          {mode === "quick" ? (
            <p className="text-xs text-rpg-muted">
              Usa só um resumo: nível, saldo, média de moedas, nomes das recompensas que você já tem e as categorias que mais resgata. Nada do diário, saúde ou e-mail é enviado.
            </p>
          ) : (
            <div className="space-y-3">
              {[
                ["ai-free", "O que você gosta de fazer no tempo livre?", freeTime, setFreeTime, "Ex.: jogar, ler mangá, cozinhar, caminhar no parque"],
                ["ai-wish", "Que tipos de recompensa gostaria de ganhar?", wishes, setWishes, "Ex.: momentos de descanso, comidas especiais, sair com amigos"],
              ].map(([id, label, value, setter, ph]) => (
                <label key={id as string} htmlFor={id as string} className="block text-xs text-rpg-muted">
                  {label as string}
                  <textarea
                    id={id as string}
                    rows={2}
                    maxLength={MAX}
                    className={`${field} mt-1 resize-none`}
                    style={{ borderRadius: 3 }}
                    value={value as string}
                    onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                    placeholder={ph as string}
                  />
                </label>
              ))}
              <label htmlFor="ai-leisure" className="block text-xs text-rpg-muted">
                Quanto tempo normalmente possui para lazer?
                <input id="ai-leisure" maxLength={120} className={`${field} mt-1`} style={{ borderRadius: 3 }} value={leisureTime} onChange={(e) => setLeisureTime(e.target.value)} placeholder="Ex.: 1h por dia e uma tarde no fim de semana" />
              </label>
            </div>
          )}
          <fieldset>
            <legend className="text-xs text-rpg-muted">Categorias preferidas (opcional)</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {REWARD_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={categories.includes(c.id)}
                  onClick={() => toggleCat(c.id)}
                  className={clsx("px-2.5 py-1 text-xs border", categories.includes(c.id) ? "border-rpg-gold text-rpg-gold-light bg-rpg-gold/10" : "border-rpg-border text-rpg-muted")}
                  style={{ borderRadius: 3 }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </fieldset>
          {suggest.isPending && (
            <div className="grid gap-2 sm:grid-cols-2" aria-label="Gerando sugestões">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="rpg-panel h-24 animate-pulse" />
              ))}
            </div>
          )}
          {error && (
            <div role="alert" className="border border-rpg-red/50 bg-rpg-red/10 p-3 text-sm" style={{ borderRadius: 3 }}>
              <p className="flex items-center gap-2 text-rpg-red">
                <AlertTriangle size={14} aria-hidden /> {error}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <RPGButton variant="secondary" onClick={ask} disabled={suggest.isPending}>
                  Tentar novamente
                </RPGButton>
                <RPGButton variant="ghost" onClick={onManual}>
                  Criar manualmente
                </RPGButton>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {basedOn && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-rpg-muted">
              <RPGBadge tone="blue" icon={<Database size={10} aria-hidden />}>
                Dado real
              </RPGBadge>
              Nível {basedOn.level} · saldo {basedOn.balance} · {basedOn.coinsLast30Days} moedas em 30 dias (média {basedOn.avgCoinsPerDay.toLocaleString("pt-BR")}/dia)
            </p>
          )}
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {items.map((s) => (
              <li key={s.key} className={clsx("rpg-panel p-2.5 space-y-2", s.picked && "rpg-panel-gold")}>
                <div className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1.5" checked={s.picked} onChange={(e) => edit(s.key, { picked: e.target.checked })} aria-label={`Selecionar ${s.name}`} />
                  <img src={rewardArtUrl(s.art)} alt="" aria-hidden className="pixelated w-14 h-9 object-cover border border-rpg-bronze shrink-0" style={{ borderRadius: 2 }} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <input className={field} style={{ borderRadius: 3 }} value={s.name} maxLength={80} onChange={(e) => edit(s.key, { name: e.target.value })} aria-label="Nome" />
                    <input className={`${field} text-xs`} style={{ borderRadius: 3 }} value={s.description ?? ""} maxLength={300} onChange={(e) => edit(s.key, { description: e.target.value })} aria-label="Descrição" />
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  <label className="text-[10px] text-rpg-muted">
                    Custo
                    <span className="relative block">
                      <Coins size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-rpg-gold" aria-hidden />
                      <input type="number" min={1} max={500} className={`${field} pl-6 font-pixel`} style={{ borderRadius: 3 }} value={s.cost} onChange={(e) => edit(s.key, { cost: Math.max(1, Math.min(500, Number(e.target.value) || 1)) })} />
                    </span>
                  </label>
                  <label className="text-[10px] text-rpg-muted">
                    Categoria
                    <select className={field} style={{ borderRadius: 3 }} value={s.category} onChange={(e) => edit(s.key, { category: e.target.value as AICategory })}>
                      {REWARD_CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[10px] text-rpg-muted">
                    Raridade
                    <select className={field} style={{ borderRadius: 3 }} value={s.rarity} onChange={(e) => edit(s.key, { rarity: e.target.value as RewardRarity })}>
                      {RARITY_ORDER.map((r) => (
                        <option key={r} value={r}>
                          {RARITY[r].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[10px] text-rpg-muted">
                    Limite
                    <select className={field} style={{ borderRadius: 3 }} value={s.limitPeriod} onChange={(e) => edit(s.key, { limitPeriod: e.target.value as LimitPeriod })}>
                      {(Object.keys(LIMIT_LABEL) as LimitPeriod[]).map((p) => (
                        <option key={p} value={p}>
                          {LIMIT_LABEL[p]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {s.reason && (
                  <p className="text-[11px] text-rpg-muted">
                    <RPGBadge tone="purple" icon={<Sparkles size={9} aria-hidden />} className="mr-1">
                      Sugestão da IA
                    </RPGBadge>
                    {s.reason}
                  </p>
                )}
                {s.similarTo && (
                  <p className="flex items-center gap-1 text-[11px] text-rpg-orange">
                    <AlertTriangle size={11} aria-hidden /> Você já possui uma recompensa parecida: {s.similarTo}.
                  </p>
                )}
              </li>
            ))}
          </ul>
          {error && (
            <p role="alert" className="text-xs text-rpg-red">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
