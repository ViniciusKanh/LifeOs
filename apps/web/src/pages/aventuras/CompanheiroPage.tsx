import { useEffect, useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";
import { BookOpen, Code2, Droplets, Dumbbell, Footprints, Hand, Heart, History, Lock, Moon, PawPrint, Pencil, Shirt, Smile, Sparkles, Star, Trophy, UtensilsCrossed, Zap, Dribbble, ListChecks, Repeat, GraduationCap, Battery, CalendarCheck } from "lucide-react";
import { RPGButton, RPGSwitch, RPGToast } from "@/components/rpg";
import { Modal } from "@/components/ui/Modal";
import { PixelScene } from "@/components/living-world/PixelScene";
import { drawHusky, drawPetScene, type PetLook } from "@/components/living-world/engine/adventureScenes";
import { useCompanion, useCompanionActions } from "@/hooks/useAdventures";
import type { CareAction, CompanionData, PetColor, PetMood, PetSlot, RaidFamily } from "@/services/adventuresService";
import { AdventureHeader, BackToWorld, EmptyNote, INPUT, PageError, PageSkeleton, Panel, R, ago, errMsg, nf } from "@/components/adventures/AdventureKit";

type Companion = NonNullable<CompanionData["companion"]>;

const MOODS: Array<{ key: PetMood; label: string; color: string }> = [
  { key: "feliz", label: "Feliz", color: "#4FD49A" },
  { key: "focado", label: "Focado", color: "#59A9F8" },
  { key: "cansado", label: "Cansado", color: "#A875F5" },
  { key: "faminto", label: "Faminto", color: "#F2732B" },
  { key: "entediado", label: "Entediado", color: "#F1C66A" },
];
const MOOD_TEXT: Record<PetMood, string> = { feliz: "Feliz e motivado", focado: "Focado com você", cansado: "Cansado", faminto: "Com fome", entediado: "Entediado", descansando: "Descansando" };
const CARE: Array<{ key: CareAction; label: string; icon: typeof Heart; color: string; verb: string }> = [
  { key: "alimentar", label: "Alimentar", icon: UtensilsCrossed, color: "#F2732B", verb: "comeu tudo" },
  { key: "hidratar", label: "Hidratar", icon: Droplets, color: "#59A9F8", verb: "bebeu água" },
  { key: "brincar", label: "Brincar", icon: Dribbble, color: "#4FD49A", verb: "adorou brincar" },
  { key: "descansar", label: "Descansar", icon: Moon, color: "#A875F5", verb: "tirou uma soneca" },
  { key: "carinho", label: "Carinho", icon: Hand, color: "#E78FC0", verb: "abanou o rabo" },
];
const COLORS: Array<{ key: PetColor; label: string; hex: string }> = [
  { key: "cinza", label: "Cinza", hex: "#7f8a9b" },
  { key: "marrom", label: "Marrom", hex: "#9a6440" },
  { key: "branco", label: "Branco", hex: "#d7dbe4" },
  { key: "preto", label: "Preto", hex: "#3d3f4c" },
  { key: "dourado", label: "Dourado", hex: "#c99543" },
];
const SLOT_LABEL: Record<PetSlot, string> = { cabeca: "Cabeça", pescoco: "Pescoço", costas: "Costas" };
const UNLOCK_HINT: Record<string, string> = {
  coleira: "Inicial",
  lenco: "Estágio Aventureiro",
  oculos: "Traço Estudioso (leitura/estudo)",
  headset: "Traço Dev (commits)",
  faixa: "Traço Atleta (treinos)",
  mochila: "Traço Explorador (Atlas)",
  capa: "Estágio Guardião",
  coroa: "Estágio Lendário",
};
const TRAIT_MIN: Record<string, number> = { estudioso: 6, dev: 8, atleta: 4, explorador: 3 };
const TRAIT_ICON: Record<string, typeof Code2> = { estudioso: GraduationCap, dev: Code2, atleta: Dumbbell, explorador: Footprints };
const FAMILY_ICON: Record<RaidFamily, typeof Code2> = { codigo: Code2, leitura: BookOpen, estudo: GraduationCap, treinos: Dumbbell, tarefas: ListChecks, habitos: Repeat, exploracao: Footprints };
const FAMILY_TEXT: Record<RaidFamily, string> = {
  codigo: "ficou ao seu lado enquanto você programava",
  leitura: "leu com você",
  estudo: "acompanhou sua sessão de estudo",
  treinos: "treinou com você",
  tarefas: "comemorou a missão concluída",
  habitos: "viu você manter o hábito",
  exploracao: "explorou um lugar novo com você",
};

/** Miniatura do companheiro (canvas pequeno). `locked` = silhueta. */
function PetThumb({ pet, size = 56, locked = false }: { pet: PetLook; size?: number; locked?: boolean }) {
  const draw = useMemo(
    () => (canvas: HTMLCanvasElement | null) => {
      const ctx = canvas?.getContext("2d");
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawHusky(ctx, canvas.width / 2, canvas.height - 4, 1.6, pet, 0);
    },
    [pet]
  );
  return <canvas ref={draw} width={48} height={40} style={{ width: size, height: (size * 40) / 48, imageRendering: "pixelated", filter: locked ? "brightness(0) opacity(0.45)" : undefined }} aria-hidden />;
}

const levelColor = (v: number) => (v < 35 ? "#F16D75" : v < 60 ? "#F1C66A" : "#4FD49A");

/** Medidor circular de necessidade (0–100). */
function Gauge({ value, label, icon, color }: { value: number; label: string; icon: ReactNode; color?: string }) {
  const c = color ?? levelColor(value);
  const r = 15.5;
  const len = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
      <div className="relative h-16 w-16">
        <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
          <circle cx="18" cy="18" r={r} fill="none" stroke="#2a2740" strokeWidth="3.5" />
          <circle cx="18" cy="18" r={r} fill="none" stroke={c} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(value / 100) * len} ${len}`} style={{ transition: "stroke-dasharray .8s ease", filter: `drop-shadow(0 0 3px ${c})` }} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center" style={{ color: c }}>
          {icon}
        </span>
      </div>
      <span className="text-[11px] font-semibold text-rpg-text">{label}</span>
      <span className="text-[10px] tabular-nums text-rpg-muted">{value}%</span>
    </div>
  );
}

function tipFor(c: Companion) {
  const s = c.status;
  const low = [
    { v: s.fome, t: "Estou com fome... um petisco cairia bem!" },
    { v: s.hidratacao, t: "Um pouco de água para seguirmos viagem?" },
    { v: s.energia, t: "Que tal descansarmos um pouco? Amanhã rendemos mais." },
    { v: s.bemEstar, t: "Bora brincar? Ou registrar algo juntos hoje!" },
  ].sort((a, b) => a.v - b.v)[0]!;
  if (low.v < 50) return low.t;
  const top = [...c.traits].sort((a, b) => b.count - a.count)[0];
  return top && top.count > 0 ? `Gosto quando ${top.hint.toLowerCase()} faz parte da nossa rotina. Vamos manter o ritmo!` : "Manter uma rotina equilibrada de estudo, código, treino e descanso me deixa mais forte.";
}

function useNow(ms = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const PARTICLE_CSS = `@keyframes petFloat{0%{transform:translateY(0) scale(.6);opacity:0}15%{opacity:1}100%{transform:translateY(-120px) scale(1.15);opacity:0}}`;

export function CompanheiroPage() {
  const q = useCompanion();
  const a = useCompanionActions();
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [reaction, setReaction] = useState<{ action: CareAction; id: number } | null>(null);
  const notify = (msg: string, tone: "success" | "error" = "success") => setToast({ msg, tone });
  const now = useNow();
  const c = q.data?.companion;
  const pet: PetLook = c ? { color: c.color, mood: c.status.mood, stage: c.stage.index, appearance: c.appearance } : { color: "cinza", mood: "feliz", stage: 0, appearance: { pescoco: "coleira", cabeca: null, costas: null } };
  // Durante a reação o companheiro aparece feliz, mesmo se estava entediado.
  const scenePet = reaction ? { ...pet, mood: "feliz" as PetMood } : pet;
  const draw = useMemo(() => (ctx: CanvasRenderingContext2D, t: number, still: boolean) => drawPetScene(ctx, t, scenePet, { still }), [scenePet]);
  useEffect(() => {
    if (!reaction) return;
    const id = setTimeout(() => setReaction(null), 2200);
    return () => clearTimeout(id);
  }, [reaction]);

  if (q.isError) return <PageError what="o Companheiro" onRetry={() => void q.refetch()} />;
  if (!q.data) return <PageSkeleton />;
  if (!q.data.adopted || !c) return <AdoptView onAdopt={(b) => a.adopt.mutate(b, { onSuccess: () => notify(`${b.name} chegou à Vila!`), onError: (e) => notify(errMsg(e, "Não foi possível adotar."), "error") })} busy={a.adopt.isPending} toast={toast} clearToast={() => setToast(null)} />;

  const care = (k: CareAction) =>
    a.care.mutate(k, {
      onSuccess: () => {
        setReaction({ action: k, id: Date.now() });
        notify(`${c.name} ${CARE.find((x) => x.key === k)?.verb}!`);
      },
      onError: (e) => notify(errMsg(e, "Não foi possível agora."), "error"),
    });
  const moodColor = MOODS.find((m) => m.key === c.status.mood)?.color ?? "#A875F5";
  const careDoneCount = CARE.filter((x) => x.key !== "carinho" && c.care.today.includes(x.key)).length;
  const stages = q.data.stages;

  return (
    <div className="space-y-4 px-3 py-4 sm:px-4 md:px-6">
      <style>{PARTICLE_CSS}</style>
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
      <BackToWorld />
      <AdventureHeader icon={<PawPrint size={40} className="text-rpg-purple" />} title="Companheiro" subtitle="Seu parceiro de jornada na Vila. Ele evolui com a sua rotina real, acompanha as missões e reage ao seu estilo de vida.">
        <HeaderStat icon={<Heart size={18} className="text-rpg-pink" />} label="Estágio" value={`${c.stage.index + 1} · ${c.stage.name}`} tone="border-rpg-pink/60" />
        <HeaderStat icon={<PawPrint size={18} className="text-rpg-cyan" />} label="Vínculo (7 dias)" value={`${c.status.vinculo}%`} tone="border-rpg-cyan/60" />
        <HeaderStat icon={<CalendarCheck size={18} className="text-rpg-green" />} label="Dias ativos juntos" value={nf(c.activeDays)} tone="border-rpg-green/60" />
      </AdventureHeader>

      {/* Cena + necessidades */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,1fr)]">
        <section className="rpg-panel relative overflow-hidden p-0" aria-label={`${c.name}, ${c.stage.name}`}>
          <div className="aspect-[16/9] w-full">
            <PixelScene draw={draw} label={`${c.name} está ${MOOD_TEXT[c.status.mood].toLowerCase()}`} />
          </div>
          {/* brilho da cor do humor */}
          <div className="pointer-events-none absolute inset-0" style={{ boxShadow: `inset 0 0 80px ${moodColor}33` }} aria-hidden />
          {reaction && <Reaction key={reaction.id} action={reaction.action} />}
          <button type="button" onClick={() => setEditOpen(true)} className="absolute left-3 top-3 flex items-center gap-2 border-2 border-rpg-gold/70 bg-rpg-bg/85 px-3 py-1.5 text-left backdrop-blur-sm hover:brightness-110" style={R} aria-label="Editar nome, cor e visibilidade">
            <PawPrint size={20} className="text-rpg-purple" aria-hidden />
            <span>
              <span className="flex items-center gap-1 font-rpg text-xl font-bold text-rpg-text">
                {c.name} <Pencil size={12} className="text-rpg-muted" aria-hidden />
              </span>
              <span className="block text-[11px] text-rpg-muted">Husky {COLORS.find((x) => x.key === c.color)?.label.toLowerCase()} · {c.showInWorld ? "visível na Vila" : "oculto na Vila"}</span>
            </span>
          </button>
          <span className="absolute right-3 top-3 flex items-center gap-1.5 border-2 bg-rpg-bg/85 px-2.5 py-1 text-xs font-semibold backdrop-blur-sm" style={{ ...R, borderColor: moodColor, color: moodColor }}>
            <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: moodColor }} aria-hidden />
            {MOOD_TEXT[c.status.mood]}
          </span>
          <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1 border-2 border-rpg-border bg-rpg-bg/85 px-3 py-2 backdrop-blur-sm" style={R}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <p className="font-rpg font-bold text-rpg-text">Companheiro {c.stage.name}</p>
                <p className="text-[11px] tabular-nums text-rpg-muted">{c.stage.next ? `${nf(c.xp)} / ${nf(c.stage.next.minXp)} XP → ${c.stage.next.name}` : `${nf(c.xp)} XP · estágio máximo`}</p>
              </div>
              <div className="h-2.5 overflow-hidden bg-rpg-bg-2" style={R}>
                <div className="h-full bg-gradient-to-r from-emerald-500 via-teal-300 to-cyan-300 transition-[width] duration-1000" style={{ width: `${c.stage.progressPct}%` }} />
              </div>
            </div>
            <RPGButton variant="pink" disabled={!!c.care.cooldowns.carinho || a.care.isPending} onClick={() => care("carinho")}>
              <Hand size={16} aria-hidden /> Fazer carinho
            </RPGButton>
          </div>
        </section>

        <div className="flex flex-col gap-4">
          <Panel title="Necessidades" icon={<Heart size={17} className="text-rpg-pink" aria-hidden />} action={<span className="text-[11px] text-rpg-muted">atualiza com o tempo</span>}>
            <div className="grid grid-cols-5 gap-1">
              <Gauge value={c.status.energia} label="Energia" icon={<Battery size={18} />} />
              <Gauge value={c.status.fome} label="Saciedade" icon={<UtensilsCrossed size={17} />} />
              <Gauge value={c.status.hidratacao} label="Água" icon={<Droplets size={17} />} />
              <Gauge value={c.status.bemEstar} label="Bem-estar" icon={<Smile size={17} />} />
              <Gauge value={c.status.vinculo} label="Vínculo" icon={<Heart size={17} />} color="#E78FC0" />
            </div>
          </Panel>
          <Panel title="Humor" icon={<Smile size={17} className="text-rpg-green" aria-hidden />} className="flex-1">
            <div className="grid grid-cols-5 gap-1.5">
              {MOODS.map((m) => {
                const on = c.status.mood === m.key || (m.key === "cansado" && c.status.mood === "descansando");
                return (
                  <div key={m.key} className={clsx("flex flex-col items-center border-2 p-1 transition", on ? "scale-105" : "border-rpg-border/50 opacity-45")} style={{ ...R, borderColor: on ? m.color : undefined, background: on ? `${m.color}1f` : undefined, boxShadow: on ? `0 0 14px ${m.color}55` : undefined }} aria-current={on ? "true" : undefined}>
                    <PetThumb pet={{ ...pet, mood: m.key }} size={50} />
                    <span className="text-[10px] font-semibold" style={{ color: on ? m.color : undefined }}>
                      {m.label}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 border-l-4 bg-rpg-bg-2/70 p-2.5 text-sm italic text-rpg-text" style={{ borderColor: moodColor }}>
              “{tipFor(c)}”
            </p>
          </Panel>
        </div>
      </div>

      {/* Cuidados */}
      <Panel
        title="Cuidados do dia"
        icon={<UtensilsCrossed size={17} className="text-rpg-orange" aria-hidden />}
        action={
          <span className="border border-rpg-green/60 bg-rpg-green/10 px-2 py-0.5 text-[11px] font-semibold text-rpg-green" style={R}>
            {careDoneCount}/4 hoje · {c.care.xpActionsLeft} com XP restante(s)
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {CARE.map((k) => {
            const done = c.care.today.includes(k.key);
            const cd = c.care.cooldowns[k.key];
            const left = cd ? Math.max(0, Date.parse(cd) - now) : 0;
            const xpOk = !done && c.care.xpActionsLeft > 0 && k.key !== "carinho";
            return (
              <button
                key={k.key}
                type="button"
                disabled={left > 0 || a.care.isPending}
                onClick={() => care(k.key)}
                className="group relative flex flex-col items-center gap-2 overflow-hidden border-2 p-3 text-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                style={{ ...R, borderColor: done ? `${k.color}aa` : "#3b3657", background: `linear-gradient(160deg, ${k.color}${done ? "26" : "12"}, transparent 70%)` }}
              >
                {xpOk && (
                  <span className="absolute right-1.5 top-1.5 border border-rpg-purple/70 bg-rpg-purple/20 px-1.5 text-[10px] font-bold text-rpg-purple" style={R}>
                    +3 XP
                  </span>
                )}
                {done && <span className="absolute left-1.5 top-1.5 text-[11px] font-bold" style={{ color: k.color }} aria-label="feito hoje">✓</span>}
                <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 transition group-hover:scale-110 group-disabled:group-hover:scale-100" style={{ borderColor: k.color, background: `${k.color}22`, boxShadow: left ? undefined : `0 0 16px ${k.color}66` }}>
                  <k.icon size={24} style={{ color: k.color }} aria-hidden />
                </span>
                <span className="font-semibold text-rpg-text">{k.label}</span>
                <span className="text-[10px] text-rpg-muted">{left ? `de novo em ${left >= 3_600_000 ? `${Math.ceil(left / 3_600_000)} h` : `${Math.ceil(left / 60_000)} min`}` : done ? "feito hoje" : "disponível"}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-rpg-muted">Cuidados são virtuais e não substituem nada real: o companheiro nunca adoece nem some se você se ausentar.</p>
      </Panel>

      {/* Evolução */}
      <Panel title="Jornada de evolução" icon={<Zap size={17} className="text-rpg-gold-light" aria-hidden />} action={<span className="text-[11px] text-rpg-muted">{nf(c.xp)} XP do companheiro</span>}>
        <div className="relative px-2 pb-1 pt-2">
          <div className="absolute left-[10%] right-[10%] top-[44px] h-1.5 bg-rpg-bg-2" style={R} aria-hidden />
          <div className="absolute left-[10%] top-[44px] h-1.5 bg-gradient-to-r from-emerald-500 to-cyan-300" style={{ ...R, width: `${(Math.min(stages.length - 1, c.stage.index + c.stage.progressPct / 100) / (stages.length - 1)) * 80}%` }} aria-hidden />
          <ol className="relative grid grid-cols-5 gap-1">
            {stages.map((s, i) => {
              const cur = i === c.stage.index;
              const locked = i > c.stage.index;
              return (
                <li key={s.key} className="flex flex-col items-center text-center" aria-current={cur ? "step" : undefined}>
                  <div className={clsx("flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 bg-rpg-bg", cur ? "border-rpg-green shadow-[0_0_18px_rgba(79,212,154,.55)]" : locked ? "border-rpg-border/50" : "border-rpg-gold/70")}>
                    <PetThumb pet={{ ...pet, mood: "feliz", stage: i }} size={56} locked={locked} />
                  </div>
                  <p className={clsx("mt-1 text-xs font-semibold", cur ? "text-rpg-green" : locked ? "text-rpg-muted" : "text-rpg-text")}>{s.name}</p>
                  <p className="text-[10px] text-rpg-muted">{s.minXp ? `${nf(s.minXp)} XP` : "início"}</p>
                  {cur && <p className="text-[10px] font-bold text-rpg-green">você está aqui</p>}
                </li>
              );
            })}
          </ol>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rpg-tile p-3">
            <p className="mb-1 text-xs font-semibold text-rpg-green">Benefícios atuais · {c.stage.name}</p>
            <ul className="space-y-0.5 text-sm text-rpg-text">
              {c.stage.benefits.map((b) => (
                <li key={b}>✓ {b}</li>
              ))}
            </ul>
          </div>
          <div className="rpg-tile p-3">
            {c.stage.next ? (
              <>
                <p className="mb-1 text-xs font-semibold text-rpg-gold-light">Próximo: {c.stage.next.name} (faltam {nf(c.stage.next.minXp - c.xp)} XP)</p>
                <ul className="space-y-0.5 text-sm text-rpg-muted">
                  {(stages[c.stage.index + 1]?.benefits ?? []).map((b) => (
                    <li key={b}>
                      <Lock size={11} className="mr-1 inline" aria-hidden />
                      {b}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-rpg-gold-light">Estágio Lendário alcançado. A evolução nunca regride.</p>
            )}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-rpg-muted">XP do companheiro vem de dias ativos, semanas com 3+ tipos de atividade, cuidados (com teto diário) e conquistas.</p>
      </Panel>

      {/* Guarda-roupa e traços */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Guarda-roupa" icon={<Shirt size={17} className="text-rpg-purple" aria-hidden />} action={<span className="text-[11px] text-rpg-muted">clique para equipar</span>}>
          <div className="space-y-3">
            {(["cabeca", "pescoco", "costas"] as PetSlot[]).map((slot) => {
              const options = c.accessories.filter((x) => x.slot === slot);
              const cur = c.equipped[slot] === undefined ? "auto" : c.equipped[slot] ?? "nenhum";
              const equip = (v: string) => a.update.mutate({ equipped: { [slot]: v === "nenhum" ? null : v } }, { onError: (err) => notify(errMsg(err, "Não foi possível equipar."), "error") });
              return (
                <div key={slot}>
                  <p className="mb-1 text-xs font-semibold text-rpg-muted">{SLOT_LABEL[slot]}</p>
                  <div className="flex flex-wrap gap-2">
                    <WardrobeTile active={cur === "auto"} onClick={() => equip("auto")} label="Automático" hint="pela rotina">
                      <Sparkles size={22} className="text-rpg-purple" aria-hidden />
                    </WardrobeTile>
                    <WardrobeTile active={cur === "nenhum"} onClick={() => equip("nenhum")} label="Nenhum" hint="vazio">
                      <PetThumb pet={{ ...pet, mood: "feliz", appearance: { ...pet.appearance, [slot]: null } }} size={46} />
                    </WardrobeTile>
                    {options.map((o) => (
                      <WardrobeTile key={o.key} active={cur === o.key} locked={!o.unlocked} onClick={() => o.unlocked && equip(o.key)} label={o.name} hint={o.unlocked ? "desbloqueado" : UNLOCK_HINT[o.key] ?? "bloqueado"}>
                        <PetThumb pet={{ ...pet, mood: "feliz", appearance: { ...pet.appearance, [slot]: o.key } }} size={46} locked={!o.unlocked} />
                      </WardrobeTile>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-rpg-muted">Acessórios desbloqueados também entram na sua Coleção.</p>
        </Panel>

        <Panel title="Traços da rotina (30 dias)" icon={<Star size={17} className="text-rpg-gold" aria-hidden />}>
          <ul className="space-y-3">
            {c.traits.map((t) => {
              const min = TRAIT_MIN[t.key] ?? 5;
              const Icon = TRAIT_ICON[t.key] ?? Star;
              return (
                <li key={t.key} className="flex items-center gap-3">
                  <span className={clsx("flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2", t.active ? "border-rpg-gold bg-rpg-gold/15 text-rpg-gold" : "border-rpg-border text-rpg-muted")}>
                    <Icon size={18} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-rpg-text">{t.name}</p>
                      <span className={clsx("text-[10px] font-bold", t.active ? "text-rpg-gold" : "text-rpg-muted")}>{t.active ? "ATIVO" : `${t.count}/${min}`}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden bg-rpg-bg-2" style={R}>
                      <div className={clsx("h-full", t.active ? "bg-rpg-gold" : "bg-rpg-purple")} style={{ width: `${Math.min(100, (t.count / min) * 100)}%` }} />
                    </div>
                    <p className="text-[10px] text-rpg-muted">{t.hint} · {t.count} registro(s)</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CompanionAchievements c={c} />
        <Panel title="Diário de aventuras" icon={<History size={17} className="text-rpg-blue" aria-hidden />} action={<button type="button" onClick={() => setHistoryOpen(true)} className="text-xs text-rpg-blue hover:underline">Cuidados →</button>}>
          {!q.data.recent?.length ? (
            <EmptyNote>Registre uma tarefa, treino, leitura ou commit: {c.name} vai acompanhar.</EmptyNote>
          ) : (
            <ol className="relative space-y-2.5 border-l-2 border-rpg-purple/40 pl-5">
              {q.data.recent.slice(0, 5).map((r, i) => {
                const Icon = FAMILY_ICON[r.family];
                return (
                  <li key={`${r.at}-${i}`} className="relative">
                    <span className="absolute -left-[31px] top-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-rpg-purple bg-rpg-bg">
                      <Icon size={12} className="text-rpg-purple" aria-hidden />
                    </span>
                    <p className="text-[10px] text-rpg-muted">{ago(r.at)}</p>
                    <p className="truncate text-sm font-semibold text-rpg-text">{r.label}</p>
                    <p className="text-[11px] text-rpg-muted">
                      {c.name} {FAMILY_TEXT[r.family]}.
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>
      </div>

      <EditCompanionModal open={editOpen} onClose={() => setEditOpen(false)} c={c} saving={a.update.isPending} onSave={(p) => a.update.mutate(p, { onSuccess: () => { setEditOpen(false); notify("Companheiro atualizado."); }, onError: (e) => notify(errMsg(e, "Não foi possível salvar."), "error") })} />
      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="Histórico de cuidados">
        {!q.data.careLog?.length ? (
          <EmptyNote>Nenhum cuidado registrado ainda.</EmptyNote>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {q.data.careLog.map((l, i) => (
              <li key={`${l.at}-${i}`} className="flex justify-between">
                <span className="capitalize">{l.action}</span>
                <span className="text-rpg-muted">{new Date(l.at.includes("T") ? l.at : `${l.at.replace(" ", "T")}Z`).toLocaleString("pt-BR")}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-rpg-muted">Dias ativos desde a adoção: {c.activeDays}.</p>
      </Modal>
    </div>
  );
}

function HeaderStat({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className={clsx("flex items-center gap-2 border-2 bg-rpg-bg-2/80 px-3 py-2", tone)} style={R}>
      <span aria-hidden>{icon}</span>
      <span>
        <span className="block text-[11px] text-rpg-muted">{label}</span>
        <span className="block font-rpg text-lg font-bold leading-tight text-rpg-text">{value}</span>
      </span>
    </div>
  );
}

/** Ícones subindo sobre a cena depois de um cuidado. */
function Reaction({ action }: { action: CareAction }) {
  const k = CARE.find((x) => x.key === action)!;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[30%] flex justify-center" aria-hidden>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="absolute" style={{ left: `${44 + (i - 2.5) * 3.2}%`, animation: `petFloat 1.8s ease-out ${i * 0.12}s both` }}>
          {i % 2 ? <Heart size={18} fill="#F16D75" color="#F16D75" /> : <k.icon size={20} style={{ color: k.color }} />}
        </span>
      ))}
    </div>
  );
}

function WardrobeTile({ active, locked, onClick, label, hint, children }: { active: boolean; locked?: boolean; onClick: () => void; label: string; hint: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked}
      aria-pressed={active}
      title={locked ? `Desbloqueia com: ${hint}` : label}
      className={clsx("relative flex w-[88px] flex-col items-center gap-0.5 border-2 p-1.5 text-center transition", active ? "border-rpg-gold bg-rpg-gold/10 shadow-[0_0_12px_rgba(241,198,106,.35)]" : "border-rpg-border/70 bg-rpg-bg-2/60 hover:border-rpg-purple", locked && "cursor-not-allowed opacity-70")}
      style={R}
    >
      {locked && <Lock size={11} className="absolute right-1 top-1 text-rpg-muted" aria-hidden />}
      <span className="flex h-10 items-center">{children}</span>
      <span className="w-full truncate text-[10px] font-semibold text-rpg-text">{label}</span>
      <span className="w-full truncate text-[9px] text-rpg-muted">{hint}</span>
    </button>
  );
}

function CompanionAchievements({ c }: { c: Companion }) {
  const active = c.traits.filter((t) => t.active).length;
  const list = [
    { key: "vinculo", title: "Primeiro Vínculo", desc: "Adotou um companheiro.", value: 1, target: 1, icon: Heart },
    { key: "rotina", title: "Rotina Diversa", desc: "Ter 2 traços de rotina ativos.", value: active, target: 2, icon: Sparkles },
    { key: "aventura", title: "Laço de Aventura", desc: "Chegar ao estágio Explorador.", value: c.stage.index + 1, target: 3, icon: PawPrint },
    { key: "guardiao", title: "Guardião da Rotina", desc: "Alcançar o estágio Guardião.", value: c.stage.index + 1, target: 4, icon: Trophy },
    { key: "lenda", title: "Companheiro Lendário", desc: "Alcançar o estágio Lendário.", value: c.stage.index + 1, target: 5, icon: Star },
  ];
  return (
    <Panel title="Conquistas do Companheiro" icon={<Trophy size={17} className="text-rpg-gold" aria-hidden />} action={<span className="text-[11px] text-rpg-muted">{list.filter((x) => x.value >= x.target).length}/{list.length}</span>}>
      <ul className="space-y-2">
        {list.map((x) => {
          const done = x.value >= x.target;
          return (
            <li key={x.key} className={clsx("rpg-tile flex items-center gap-2.5 p-2", done && "border-rpg-gold/60")}>
              <span className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2", done ? "border-rpg-gold bg-rpg-gold/15 text-rpg-gold" : "border-rpg-border text-rpg-muted")}>
                <x.icon size={16} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-rpg-text">{x.title}</p>
                <p className="text-[11px] text-rpg-muted">{x.desc}</p>
                {!done && (
                  <div className="mt-1 h-1 overflow-hidden bg-rpg-bg-2" style={R}>
                    <div className="h-full bg-rpg-purple" style={{ width: `${(Math.min(x.value, x.target) / x.target) * 100}%` }} />
                  </div>
                )}
              </div>
              <span className={clsx("text-xs font-bold", done ? "text-rpg-gold" : "text-rpg-muted")}>{done ? "✓" : `${Math.min(x.value, x.target)}/${x.target}`}</span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function ColorPicker({ value, onChange }: { value: PetColor; onChange: (c: PetColor) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor do pelo">
      {COLORS.map((x) => (
        <button key={x.key} type="button" role="radio" aria-checked={value === x.key} onClick={() => onChange(x.key)} className={clsx("flex items-center gap-1.5 border-2 px-2 py-1 text-xs", value === x.key ? "border-rpg-gold" : "border-rpg-border")} style={R}>
          <span className="h-4 w-4 rounded-full border border-black/40" style={{ background: x.hex }} aria-hidden /> {x.label}
        </button>
      ))}
    </div>
  );
}

function EditCompanionModal({ open, onClose, c, onSave, saving }: { open: boolean; onClose: () => void; c: NonNullable<CompanionData["companion"]>; onSave: (p: { name: string; color: PetColor; showInWorld: boolean }) => void; saving: boolean }) {
  const [name, setName] = useState(c.name);
  const [color, setColor] = useState<PetColor>(c.color);
  const [show, setShow] = useState(c.showInWorld);
  useEffect(() => {
    setName(c.name);
    setColor(c.color);
    setShow(c.showInWorld);
  }, [c, open]);
  const valid = name.trim().length >= 2 && name.trim().length <= 24;
  return (
    <Modal open={open} onClose={onClose} title="Editar companheiro">
      <div className="space-y-3">
        <label className="block text-sm">
          Nome
          <input className={`${INPUT} mt-1 w-full`} style={R} value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
        </label>
        <ColorPicker value={color} onChange={setColor} />
        <div className="flex items-center justify-between">
          <span className="text-sm">Mostrar na Vila (segue o seu herói)</span>
          <RPGSwitch checked={show} onChange={() => setShow(!show)} label="Mostrar na Vila" />
        </div>
        <div className="flex justify-end gap-2">
          <RPGButton variant="ghost" onClick={onClose}>
            Cancelar
          </RPGButton>
          <RPGButton disabled={!valid || saving} onClick={() => onSave({ name: name.trim(), color, showInWorld: show })}>
            Salvar
          </RPGButton>
        </div>
      </div>
    </Modal>
  );
}

function AdoptView({ onAdopt, busy, toast, clearToast }: { onAdopt: (b: { name: string; color: PetColor }) => void; busy: boolean; toast: { msg: string; tone: "success" | "error" } | null; clearToast: () => void }) {
  const [name, setName] = useState("Rex");
  const [color, setColor] = useState<PetColor>("cinza");
  const pet: PetLook = { color, mood: "feliz", stage: 0, appearance: { pescoco: "coleira", cabeca: null, costas: null } };
  const draw = useMemo(() => (ctx: CanvasRenderingContext2D, t: number, still: boolean) => drawPetScene(ctx, t, pet, { still }), [color]); // eslint-disable-line react-hooks/exhaustive-deps
  const valid = name.trim().length >= 2 && name.trim().length <= 24;
  return (
    <div className="space-y-4 px-3 py-4 sm:px-4 md:px-6">
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={clearToast} />
      <BackToWorld />
      <AdventureHeader icon={<PawPrint size={40} className="text-rpg-purple" />} title="Companheiro" subtitle="Adote um parceiro de jornada. Ele vive na Vila, segue o seu herói e evolui com a sua rotina real." />
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rpg-panel overflow-hidden p-0">
          <div className="aspect-[16/9]">
            <PixelScene draw={draw} label="Prévia do companheiro" />
          </div>
        </div>
        <form
          className="rpg-panel space-y-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) onAdopt({ name: name.trim(), color });
          }}
        >
          <h2 className="font-rpg text-xl font-bold">Adotar um husky</h2>
          <label className="block text-sm">
            Nome
            <input className={`${INPUT} mt-1 w-full`} style={R} value={name} maxLength={24} onChange={(e) => setName(e.target.value)} aria-invalid={!valid} />
          </label>
          <ColorPicker value={color} onChange={setColor} />
          <ul className="space-y-1 text-xs text-rpg-muted">
            <li>• Evolui em 5 estágios: Filhote → Aventureiro → Explorador → Guardião → Lendário.</li>
            <li>• Ganha acessórios de acordo com o que você mais faz (estudo, código, treino, exploração).</li>
            <li>• Nunca adoece nem morre: ausência só o deixa abatido.</li>
          </ul>
          <RPGButton type="submit" disabled={!valid || busy} className="w-full">
            <Smile size={16} aria-hidden /> Adotar {name.trim() || "companheiro"}
          </RPGButton>
        </form>
      </div>
    </div>
  );
}
