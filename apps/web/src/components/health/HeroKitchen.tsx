import { useCallback, useState } from "react";
import clsx from "clsx";
import { Barcode, Beef, Camera, ChevronLeft, ChevronRight, Flame, History, PenLine, Search, Target, Trash2, UtensilsCrossed, Wheat, Droplet } from "lucide-react";
import { RPGButton, RPGProgressBar, RPGToast } from "@/components/rpg";
import { EmptyNote, INPUT, R, Spinner, errMsg, fmtDay } from "@/components/adventures/AdventureKit";
import { IntegrationBanner, XpChip } from "@/components/integrations/IntegrationKit";
import { BarcodeScanner, barcodeScanSupported } from "@/components/health/BarcodeScanner";
import { useNutrition, useNutritionActions } from "@/hooks/usePersonalIntegrations";
import { personalIntegrations } from "@/services/personalIntegrationsService";
import type { FoodProduct, MealType, NutritionOverview } from "@/services/personalIntegrationsService";

const MEALS: Array<{ key: MealType; label: string; icon: string }> = [
  { key: "cafe", label: "Café da manhã", icon: "☀️" },
  { key: "almoco", label: "Almoço", icon: "🍲" },
  { key: "lanche", label: "Lanche", icon: "🍎" },
  { key: "jantar", label: "Jantar", icon: "🌙" },
  { key: "ceia", label: "Ceia", icon: "🫖" },
];

/** Sugestão do tipo de refeição pela hora (o usuário pode trocar). */
function mealByHour(): MealType {
  const h = new Date().getHours();
  return h < 10 ? "cafe" : h < 15 ? "almoco" : h < 18 ? "lanche" : h < 22 ? "jantar" : "ceia";
}
const shift = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
const f1 = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));
const scale = (per100: number | null, g: number) => (per100 == null ? null : (per100 * g) / 100);

function MacroBar({ label, value, goal, unit, tone, icon }: { label: string; value: number | null; goal: number | null; unit: string; tone: "orange" | "green" | "gold" | "blue"; icon: React.ReactNode }) {
  if (goal) return <RPGProgressBar value={value ?? 0} max={goal} tone={tone} label={`${label}`} valueLabel={`${f1(value)} / ${goal} ${unit}`} />;
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="flex items-center gap-1 text-rpg-muted">
        {icon} {label}
      </span>
      <span className="font-semibold tabular-nums text-rpg-text">
        {f1(value)} {unit}
      </span>
    </div>
  );
}

/** Mini gráfico de proteína dos últimos 14 dias contra a meta (dado real; vazio = sem registro). */
function ProteinHistory({ history, goal }: { history: NutritionOverview["history"]; goal: number | null }) {
  const max = Math.max(goal ?? 0, ...history.map((h) => h.protein ?? 0), 1);
  return (
    <div className="relative flex h-20 items-end gap-1" role="list" aria-label="Proteína nos últimos 14 dias">
      {goal && <span className="pointer-events-none absolute inset-x-0 border-t border-dashed border-rpg-green/70" style={{ bottom: `${(goal / max) * 100}%` }} aria-hidden />}
      {history.map((h) => {
        const label = h.meals ? `${fmtDay(h.day)}: ${f1(h.protein)} g de proteína, ${h.meals} refeição(ões)` : `${fmtDay(h.day)}: sem registro`;
        return (
          <span key={h.day} role="listitem" title={label} aria-label={label} className="flex h-full flex-1 items-end">
            <span className={clsx("w-full", !h.meals ? "h-0.5 bg-rpg-border" : goal && (h.protein ?? 0) >= goal ? "bg-rpg-green" : "bg-rpg-blue/70")} style={h.meals ? { height: `${Math.max(4, ((h.protein ?? 0) / max) * 100)}%`, borderRadius: 2 } : { borderRadius: 2 }} />
          </span>
        );
      })}
    </div>
  );
}

/**
 * Cozinha do Herói (Saúde) — refeições por código de barras (Open Food Facts)
 * ou à mão. Números vêm só do que o produto informa ou do que o usuário digita.
 */
export function HeroKitchen() {
  const [day, setDay] = useState<string | undefined>(undefined);
  const q = useNutrition(day);
  const a = useNutritionActions();
  const o = q.data;
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);
  const notify = (msg: string, tone: "success" | "error" = "success") => setToast({ msg, tone });
  const [mode, setMode] = useState<"codigo" | "manual" | "recentes">("codigo");
  const [mealType, setMealType] = useState<MealType>(mealByHour);
  const [barcode, setBarcode] = useState("");
  const [product, setProduct] = useState<FoodProduct | null>(null);
  const [grams, setGrams] = useState("");
  const [looking, setLooking] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState({ name: "", kcal: "", protein: "", carbs: "", fat: "", grams: "" });
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [goals, setGoals] = useState({ kcal: "", protein: "" });

  const lookup = useCallback(
    async (code: string) => {
      const clean = code.replace(/\D/g, "");
      setBarcode(clean);
      if (clean.length < 6) return;
      setLooking(true);
      setProduct(null);
      try {
        const p = await personalIntegrations.nutrition.product(clean);
        setProduct(p);
        setGrams(p.servingGrams ? String(p.servingGrams) : "100");
      } catch (e) {
        notify(errMsg(e, "Produto não encontrado."), "error");
        setMode("manual");
      } finally {
        setLooking(false);
      }
    },
    // notify só muda o estado local
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const onDetected = useCallback(
    (code: string) => {
      setScanning(false);
      void lookup(code);
    },
    [lookup],
  );

  const afterAdd = (r: { xp: number; proteinGoalHit: boolean }, name: string) => {
    notify(r.proteinGoalHit ? `Meta de proteína batida! +${r.xp} XP` : r.xp ? `${name} registrado. +${r.xp} XP` : `${name} registrado.`);
  };
  const addProduct = () => {
    if (!product) return;
    const g = num(grams);
    if (!g || g <= 0) return notify("Informe a quantidade em gramas.", "error");
    a.addMeal.mutate(
      { mealType, day, barcode: product.barcode, grams: g },
      {
        onSuccess: (r) => {
          afterAdd(r, product.name);
          setProduct(null);
          setBarcode("");
        },
        onError: (e) => notify(errMsg(e, "Não foi possível registrar."), "error"),
      },
    );
  };
  const addManual = () => {
    if (!manual.name.trim()) return notify("Dê um nome para a refeição.", "error");
    a.addMeal.mutate(
      { mealType, day, name: manual.name.trim(), kcal: num(manual.kcal), proteinG: num(manual.protein), carbsG: num(manual.carbs), fatG: num(manual.fat), grams: num(manual.grams) },
      {
        onSuccess: (r) => {
          afterAdd(r, manual.name.trim());
          setManual({ name: "", kcal: "", protein: "", carbs: "", fat: "", grams: "" });
        },
        onError: (e) => notify(errMsg(e, "Não foi possível registrar."), "error"),
      },
    );
  };
  const relog = (r: NutritionOverview["recent"][number]) =>
    a.addMeal.mutate(
      r.barcode ? { mealType, day, barcode: r.barcode, grams: r.grams } : { mealType, day, name: r.name, brand: r.brand, kcal: r.kcal, proteinG: r.proteinG, carbsG: r.carbsG, fatG: r.fatG, grams: r.grams },
      { onSuccess: (res) => afterAdd(res, r.name), onError: (e) => notify(errMsg(e, "Não foi possível registrar."), "error") },
    );

  const g = num(grams) ?? 0;
  const isToday = !o || o.day === o.today;

  return (
    <section className="rpg-panel relative mt-4 overflow-hidden p-4" aria-label="Cozinha do Herói">
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
      <div className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-[radial-gradient(circle,rgba(34,197,94,0.18),transparent_70%)]" aria-hidden />
      <IntegrationBanner
        icon={<UtensilsCrossed size={22} />}
        tone="green"
        title="Cozinha do Herói"
        subtitle="Registre refeições pelo código de barras (Open Food Facts) ou à mão, com calorias e proteína."
        right={
          o ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-[11px] text-rpg-orange" title="Dias seguidos com refeição registrada">
                <Flame size={12} aria-hidden /> {o.streak} dia(s)
              </span>
              <XpChip xp={o.rewards.xpToday} />
            </div>
          ) : null
        }
      />
      {q.isLoading ? (
        <div className="h-56 animate-pulse bg-rpg-bg-2" style={R} />
      ) : q.isError || !o ? (
        <p className="text-sm text-rpg-red" role="alert">
          Não foi possível abrir a Cozinha do Herói.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* Painel do dia (no celular vem depois do registro, que é a ação principal) */}
          <div className="min-w-0 space-y-3">
            <div className="flex items-center gap-2">
              <button type="button" className="border border-rpg-border p-1 text-rpg-muted hover:text-rpg-text" style={R} onClick={() => setDay(shift(o.day, -1))} aria-label="Dia anterior">
                <ChevronLeft size={14} aria-hidden />
              </button>
              <p className="flex-1 text-center font-rpg text-sm font-bold text-rpg-text">{isToday ? "Hoje" : new Date(`${o.day}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })}</p>
              <button type="button" className="border border-rpg-border p-1 text-rpg-muted hover:text-rpg-text disabled:opacity-40" style={R} onClick={() => setDay(shift(o.day, 1) >= o.today ? undefined : shift(o.day, 1))} disabled={isToday} aria-label="Próximo dia">
                <ChevronRight size={14} aria-hidden />
              </button>
            </div>
            <div className="space-y-2 border border-rpg-green/40 bg-rpg-bg-2/60 p-3" style={R}>
              <MacroBar label="Calorias" value={o.totals.kcal} goal={o.goals.kcalGoal} unit="kcal" tone="orange" icon={<Flame size={11} />} />
              <MacroBar label="Proteína" value={o.totals.proteinG} goal={o.goals.proteinGoalG} unit="g" tone="green" icon={<Beef size={11} />} />
              <div className="grid grid-cols-2 gap-2">
                <MacroBar label="Carboidratos" value={o.totals.carbsG} goal={null} unit="g" tone="gold" icon={<Wheat size={11} />} />
                <MacroBar label="Gorduras" value={o.totals.fatG} goal={null} unit="g" tone="blue" icon={<Droplet size={11} />} />
              </div>
              {o.totals.incomplete && <p className="text-[10px] text-rpg-orange">Algumas refeições não informam todos os nutrientes: os totais podem estar abaixo do real.</p>}
              {!o.goals.proteinGoalG && <p className="text-[10px] text-rpg-muted">Defina uma meta de proteína para ganhar +{o.rewards.proteinXp} XP nos dias em que bater.</p>}
            </div>

            {o.meals.length === 0 ? (
              <EmptyNote>Nenhuma refeição registrada {isToday ? "hoje" : "nesse dia"}.</EmptyNote>
            ) : (
              <ul className="space-y-2">
                {MEALS.filter((m) => o.meals.some((x) => x.mealType === m.key)).map((m) => (
                  <li key={m.key}>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-rpg-muted">
                      {m.icon} {m.label}
                    </p>
                    <ul className="space-y-1">
                      {o.meals
                        .filter((x) => x.mealType === m.key)
                        .map((x) => (
                          <li key={x.id} className="rpg-tile flex items-center gap-2 p-2">
                            {x.imageUrl ? <img src={x.imageUrl} alt="" className="h-8 w-8 shrink-0 bg-white object-contain" style={{ borderRadius: 4 }} loading="lazy" /> : <UtensilsCrossed size={16} className="shrink-0 text-rpg-muted" aria-hidden />}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm text-rpg-text" title={x.name}>
                                {x.name}
                                {x.grams ? <span className="text-rpg-muted"> · {f1(x.grams)} g</span> : null}
                              </p>
                              <p className="text-[11px] text-rpg-muted">
                                {x.kcal != null ? `${Math.round(x.kcal)} kcal` : "kcal —"} · {x.proteinG != null ? `${f1(x.proteinG)} g prot.` : "prot. —"}
                              </p>
                            </div>
                            <button type="button" className="p-1 text-rpg-muted hover:text-rpg-red" aria-label={`Apagar ${x.name}`} onClick={() => a.removeMeal.mutate(x.id, { onError: (e) => notify(errMsg(e, "Não foi possível apagar."), "error") })}>
                              <Trash2 size={13} aria-hidden />
                            </button>
                          </li>
                        ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Registrar */}
          <div className="order-first min-w-0 space-y-3 lg:order-none">
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Tipo de refeição">
              {MEALS.map((m) => (
                <button key={m.key} type="button" role="radio" aria-checked={mealType === m.key} onClick={() => setMealType(m.key)} className={clsx("border px-2 py-1 text-xs", mealType === m.key ? "border-rpg-green bg-rpg-green/10 text-rpg-green" : "border-rpg-border text-rpg-muted")} style={R}>
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1" role="tablist" aria-label="Como registrar">
              {(
                [
                  ["codigo", "Código", Barcode],
                  ["manual", "Manual", PenLine],
                  ["recentes", "Recentes", History],
                ] as const
              ).map(([k, label, Icon]) => (
                <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)} className={clsx("flex min-w-0 flex-1 items-center justify-center gap-1 border px-1.5 py-1.5 text-xs font-semibold", mode === k ? "border-rpg-gold bg-rpg-gold/10 text-rpg-gold-light" : "border-rpg-border text-rpg-muted")} style={R}>
                  <Icon size={13} aria-hidden /> {label}
                </button>
              ))}
            </div>

            {mode === "codigo" && (
              <div className="space-y-2">
                <form
                  className="flex gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void lookup(barcode);
                  }}
                >
                  <input inputMode="numeric" value={barcode} onChange={(e) => setBarcode(e.target.value.replace(/\D/g, "").slice(0, 14))} placeholder="Ex.: 7891000100103" className={INPUT + " min-w-0 flex-1 font-mono"} style={R} aria-label="Código de barras" />
                  <RPGButton type="submit" variant="secondary" disabled={looking || barcode.length < 6} aria-label="Buscar produto">
                    {looking ? <Spinner /> : <Search size={14} aria-hidden />}
                  </RPGButton>
                  {barcodeScanSupported() && (
                    <RPGButton type="button" variant="secondary" onClick={() => setScanning(true)} aria-label="Ler com a câmera">
                      <Camera size={14} aria-hidden />
                    </RPGButton>
                  )}
                </form>
                {product ? (
                  <div className="space-y-2 border border-rpg-gold/50 bg-rpg-bg-2/60 p-3" style={R}>
                    <div className="flex items-start gap-2">
                      {product.imageUrl && <img src={product.imageUrl} alt="" className="h-14 w-14 shrink-0 bg-white object-contain" style={{ borderRadius: 4 }} />}
                      <div className="min-w-0">
                        <p className="font-semibold text-rpg-text">{product.name}</p>
                        <p className="text-[11px] text-rpg-muted">
                          {[product.brand, product.quantity].filter(Boolean).join(" · ") || "Sem marca informada"}
                          {product.servingLabel ? ` · porção ${product.servingLabel}` : ""}
                        </p>
                        <p className="text-[11px] text-rpg-muted">
                          Por 100 g: {f1(product.per100.kcal)} kcal · {f1(product.per100.protein)} g prot. · {f1(product.per100.carbs)} g carb. · {f1(product.per100.fat)} g gord.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1.5 text-xs text-rpg-muted">
                        Quantidade
                        <input inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} className={INPUT + " w-20 py-1"} style={R} aria-label="Gramas" />g
                      </label>
                      <span className="text-xs text-rpg-text">
                        = <b>{f1(scale(product.per100.kcal, g))}</b> kcal · <b>{f1(scale(product.per100.protein, g))}</b> g prot.
                      </span>
                    </div>
                    <RPGButton variant="success" className="w-full justify-center text-sm" disabled={a.addMeal.isPending} onClick={addProduct}>
                      {a.addMeal.isPending ? <Spinner /> : <UtensilsCrossed size={14} aria-hidden />} Registrar refeição
                    </RPGButton>
                  </div>
                ) : (
                  <p className="text-[11px] text-rpg-muted">Dados abertos do Open Food Facts. Se o produto não estiver lá, use “Manual”.{barcodeScanSupported() ? "" : " A leitura pela câmera funciona no celular (Chrome Android)."}</p>
                )}
              </div>
            )}

            {mode === "manual" && (
              <form
                className="grid grid-cols-2 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  addManual();
                }}
              >
                <input value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} maxLength={120} placeholder="O que você comeu?" className={INPUT + " col-span-2"} style={R} aria-label="Nome da refeição" />
                {(
                  [
                    ["kcal", "Calorias (kcal)"],
                    ["protein", "Proteína (g)"],
                    ["carbs", "Carboidratos (g)"],
                    ["fat", "Gorduras (g)"],
                    ["grams", "Peso (g, opcional)"],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="space-y-0.5 text-[11px] text-rpg-muted">
                    {label}
                    <input inputMode="decimal" value={manual[k]} onChange={(e) => setManual({ ...manual, [k]: e.target.value })} className={INPUT + " w-full py-1"} style={R} />
                  </label>
                ))}
                <RPGButton type="submit" variant="success" className="col-span-2 justify-center text-sm" disabled={a.addMeal.isPending}>
                  {a.addMeal.isPending ? <Spinner /> : <UtensilsCrossed size={14} aria-hidden />} Registrar refeição
                </RPGButton>
                <p className="col-span-2 text-[10px] text-rpg-muted">Deixe em branco o que você não sabe: o LifeOS não estima valores.</p>
              </form>
            )}

            {mode === "recentes" &&
              (o.recent.length === 0 ? (
                <EmptyNote>Seus itens mais usados aparecem aqui para registrar com um toque.</EmptyNote>
              ) : (
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {o.recent.map((r) => (
                    <li key={(r.barcode ?? "") + r.name}>
                      <button type="button" onClick={() => relog(r)} disabled={a.addMeal.isPending} className="rpg-tile flex w-full items-center gap-2 p-2 text-left hover:border-rpg-green">
                        {r.imageUrl ? <img src={r.imageUrl} alt="" className="h-8 w-8 shrink-0 bg-white object-contain" style={{ borderRadius: 4 }} loading="lazy" /> : <UtensilsCrossed size={15} className="shrink-0 text-rpg-muted" aria-hidden />}
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold text-rpg-text">{r.name}</span>
                          <span className="block text-[10px] text-rpg-muted">
                            {r.grams ? `${f1(r.grams)} g · ` : ""}
                            {r.kcal != null ? `${Math.round(r.kcal)} kcal` : "kcal —"} · {r.uses}×
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ))}

            <div className="space-y-1.5 border-t border-rpg-border pt-3">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-rpg-text">
                  <Beef size={13} className="text-rpg-green" aria-hidden /> Proteína · 14 dias
                </p>
                <button
                  type="button"
                  className="flex items-center gap-1 text-[11px] text-rpg-blue"
                  onClick={() => {
                    setGoals({ kcal: o.goals.kcalGoal ? String(o.goals.kcalGoal) : "", protein: o.goals.proteinGoalG ? String(o.goals.proteinGoalG) : "" });
                    setGoalsOpen((v) => !v);
                  }}
                  aria-expanded={goalsOpen}
                >
                  <Target size={12} aria-hidden /> Metas
                </button>
              </div>
              {goalsOpen && (
                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    a.settings.mutate(
                      { kcalGoal: num(goals.kcal) ? Math.round(num(goals.kcal)!) : null, proteinGoalG: num(goals.protein) ? Math.round(num(goals.protein)!) : null },
                      { onSuccess: () => (setGoalsOpen(false), notify("Metas salvas.")), onError: (err) => notify(errMsg(err, "Metas inválidas (kcal 500–10000, proteína 10–500 g)."), "error") },
                    );
                  }}
                >
                  <label className="text-[11px] text-rpg-muted">
                    kcal/dia
                    <input inputMode="numeric" value={goals.kcal} onChange={(e) => setGoals({ ...goals, kcal: e.target.value })} className={INPUT + " block w-24 py-1"} style={R} />
                  </label>
                  <label className="text-[11px] text-rpg-muted">
                    Proteína (g)/dia
                    <input inputMode="numeric" value={goals.protein} onChange={(e) => setGoals({ ...goals, protein: e.target.value })} className={INPUT + " block w-24 py-1"} style={R} />
                  </label>
                  <RPGButton type="submit" variant="secondary" className="text-xs" disabled={a.settings.isPending}>
                    Salvar
                  </RPGButton>
                </form>
              )}
              <ProteinHistory history={o.history} goal={o.goals.proteinGoalG} />
              <RPGProgressBar value={Math.min(o.rewards.proteinGoalDays, 7)} max={7} tone="green" label="Conquista: Força de Proteína" valueLabel={`${o.rewards.proteinGoalDays}/7 dias`} />
              <p className="text-[10px] text-rpg-muted">
                +{o.rewards.mealXp} XP por refeição (até {o.rewards.mealDailyCap} por dia, só hoje e ontem) · +{o.rewards.proteinXp} XP ao bater a meta de proteína.
              </p>
            </div>
          </div>
        </div>
      )}
      {scanning && <BarcodeScanner onDetected={onDetected} onClose={() => setScanning(false)} />}
    </section>
  );
}
