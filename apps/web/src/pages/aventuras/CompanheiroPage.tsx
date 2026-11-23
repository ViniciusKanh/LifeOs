import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { BookOpen, Code2, Droplets, Dumbbell, Footprints, Hand, Heart, History, Moon, PawPrint, Pencil, Smile, Sparkles, Star, Trophy, UtensilsCrossed, Zap, Dribbble, ListChecks, Repeat, GraduationCap } from "lucide-react";
import { RPGButton, RPGSwitch, RPGToast } from "@/components/rpg";
import { Modal } from "@/components/ui/Modal";
import { PixelScene } from "@/components/living-world/PixelScene";
import { drawHusky, drawPetScene, type PetLook } from "@/components/living-world/engine/adventureScenes";
import { useCompanion, useCompanionActions } from "@/hooks/useAdventures";
import type { CareAction, CompanionData, PetColor, PetMood, PetSlot, RaidFamily } from "@/services/adventuresService";
import { AdventureHeader, BackToWorld, EmptyNote, INPUT, MeterRow, PageError, PageSkeleton, Panel, R, ago, errMsg } from "@/components/adventures/AdventureKit";

const MOODS: Array<{ key: PetMood; label: string }> = [
  { key: "feliz", label: "Feliz" },
  { key: "focado", label: "Focado" },
  { key: "cansado", label: "Cansado" },
  { key: "faminto", label: "Faminto" },
  { key: "entediado", label: "Entediado" },
];
const CARE: Array<{ key: CareAction; label: string; icon: typeof Heart; tone: string }> = [
  { key: "alimentar", label: "Alimentar", icon: UtensilsCrossed, tone: "text-rpg-orange" },
  { key: "hidratar", label: "Hidratar", icon: Droplets, tone: "text-rpg-blue" },
  { key: "brincar", label: "Brincar", icon: Dribbble, tone: "text-rpg-green" },
  { key: "descansar", label: "Descansar", icon: Moon, tone: "text-rpg-purple" },
];
const COLORS: Array<{ key: PetColor; label: string; hex: string }> = [
  { key: "cinza", label: "Cinza", hex: "#7f8a9b" },
  { key: "marrom", label: "Marrom", hex: "#9a6440" },
  { key: "branco", label: "Branco", hex: "#d7dbe4" },
  { key: "preto", label: "Preto", hex: "#3d3f4c" },
  { key: "dourado", label: "Dourado", hex: "#c99543" },
];
const SLOT_LABEL: Record<PetSlot, string> = { cabeca: "Cabeça", pescoco: "Pescoço", costas: "Costas" };
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

/** Canvas pequeno de um estágio/humor (miniatura). */
function PetThumb({ pet, size = 56 }: { pet: PetLook; size?: number }) {
  const draw = useMemo(
    () => (canvas: HTMLCanvasElement | null) => {
      const ctx = canvas?.getContext("2d");
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawHusky(ctx, canvas.width / 2, canvas.height - 4, 1.6, pet, 0);
    },
    [pet]
  );
  return <canvas ref={draw} width={48} height={40} style={{ width: size, height: (size * 40) / 48, imageRendering: "pixelated" }} aria-hidden />;
}

function tipFor(c: NonNullable<CompanionData["companion"]>) {
  const s = c.status;
  const low = [
    { v: s.fome, t: `"Estou com fome... um petisco cairia bem!"` },
    { v: s.hidratacao, t: `"Um pouco de água para seguirmos viagem?"` },
    { v: s.energia, t: `"Que tal descansarmos um pouco? Amanhã rendemos mais."` },
    { v: s.bemEstar, t: `"Bora brincar? Ou registrar algo juntos hoje!"` },
  ].sort((a, b) => a.v - b.v)[0]!;
  if (low.v < 50) return low.t;
  const top = [...c.traits].sort((a, b) => b.count - a.count)[0];
  return top && top.count > 0 ? `"Gosto quando ${top.hint.toLowerCase()} faz parte da nossa rotina. Vamos manter o ritmo!"` : `"Manter uma rotina equilibrada de estudo, código, treino e descanso me deixa mais forte."`;
}

export function CompanheiroPage() {
  const q = useCompanion();
  const a = useCompanionActions();
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const notify = (msg: string, tone: "success" | "error" = "success") => setToast({ msg, tone });
  const c = q.data?.companion;
  const pet: PetLook = c ? { color: c.color, mood: c.status.mood, stage: c.stage.index, appearance: c.appearance } : { color: "cinza", mood: "feliz", stage: 0, appearance: { pescoco: "coleira", cabeca: null, costas: null } };
  const draw = useMemo(() => (ctx: CanvasRenderingContext2D, t: number, still: boolean) => drawPetScene(ctx, t, pet, { still }), [pet]);

  if (q.isError) return <PageError what="o Companheiro" onRetry={() => void q.refetch()} />;
  if (!q.data) return <PageSkeleton />;
  if (!q.data.adopted || !c) return <AdoptView onAdopt={(b) => a.adopt.mutate(b, { onSuccess: () => notify(`${b.name} chegou à Vila!`), onError: (e) => notify(errMsg(e, "Não foi possível adotar."), "error") })} busy={a.adopt.isPending} toast={toast} clearToast={() => setToast(null)} />;

  const care = (k: CareAction) =>
    a.care.mutate(k, {
      onSuccess: () => notify(k === "carinho" ? `${c.name} adorou o carinho!` : `${c.name}: ${CARE.find((x) => x.key === k)?.label.toLowerCase()} feito!`),
      onError: (e) => notify(errMsg(e, "Não foi possível agora."), "error"),
    });
  const careDone = c.care.today;
  const achievements = [
    { key: "vinculo", title: "Primeiro Vínculo", desc: "Adotou um companheiro.", done: true, icon: Heart },
    { key: "aventura", title: "Laço de Aventura", desc: "Chegar ao estágio Explorador.", done: c.stage.index >= 2, icon: PawPrint },
    { key: "rotina", title: "Rotina Diversa", desc: "Ter 2 traços de rotina ativos.", done: c.traits.filter((t) => t.active).length >= 2, icon: Sparkles },
    { key: "codigo", title: "Companheiro de Código", desc: "Traço Dev ativo (commits reais).", done: c.traits.find((t) => t.key === "dev")?.active ?? false, icon: Code2 },
    { key: "guardiao", title: "Guardião da Rotina", desc: "Alcançar o estágio Guardião.", done: c.stage.index >= 3, icon: Trophy },
  ];

  return (
    <div className="space-y-4 px-3 py-4 sm:px-4 md:px-6">
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
      <BackToWorld />
      <AdventureHeader icon={<PawPrint size={40} className="text-rpg-purple" />} title="Companheiro" subtitle="Seu parceiro de jornada na Vila. Ele evolui com a sua rotina, acompanha as missões e reage ao seu estilo de vida.">
        <div className="flex items-center gap-2 border-2 border-rpg-pink/60 bg-rpg-bg-2/80 px-3 py-2" style={R}>
          <Heart size={18} className="text-rpg-pink" aria-hidden />
          <span>
            <span className="block text-[11px] text-rpg-muted">Estágio</span>
            <span className="block font-rpg text-lg font-bold text-rpg-text">
              {c.stage.index + 1} · {c.stage.name}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2 border-2 border-rpg-cyan/60 bg-rpg-bg-2/80 px-3 py-2" style={R}>
          <PawPrint size={18} className="text-rpg-cyan" aria-hidden />
          <span>
            <span className="block text-[11px] text-rpg-muted">Vínculo (7 dias)</span>
            <span className="block font-rpg text-lg font-bold text-rpg-text">{c.status.vinculo}%</span>
          </span>
        </div>
      </AdventureHeader>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <section className="rpg-panel relative overflow-hidden p-0" aria-label={`${c.name}, ${c.stage.name}`}>
          <div className="aspect-[16/9] w-full">
            <PixelScene draw={draw} label={`${c.name} está ${c.status.mood}`} />
          </div>
          <button type="button" onClick={() => setEditOpen(true)} className="absolute left-3 top-3 flex items-center gap-2 border-2 border-rpg-gold/70 bg-rpg-bg/85 px-3 py-1.5 text-left hover:brightness-110" style={R} aria-label="Editar nome, cor e visibilidade">
            <PawPrint size={20} className="text-rpg-purple" aria-hidden />
            <span>
              <span className="flex items-center gap-1 font-rpg text-xl font-bold text-rpg-text">
                {c.name} <Pencil size={12} className="text-rpg-muted" aria-hidden />
              </span>
              <span className="block text-[11px] text-rpg-muted">Husky {COLORS.find((x) => x.key === c.color)?.label.toLowerCase()}</span>
            </span>
          </button>
          <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-end justify-between gap-2">
            <div className="border-2 border-rpg-border bg-rpg-bg/85 px-3 py-1.5" style={R}>
              <p className="text-[11px] text-rpg-muted">Estágio de evolução</p>
              <p className="font-rpg font-bold text-rpg-text">Companheiro {c.stage.name}</p>
            </div>
            <div className="w-[min(300px,60%)] border-2 border-rpg-border bg-rpg-bg/85 px-3 py-1.5" style={R}>
              <p className="mb-1 text-[11px] text-rpg-muted">{c.stage.next ? `Próximo estágio: ${c.stage.next.name} · ${c.xp} / ${c.stage.next.minXp} XP` : `Estágio máximo · ${c.xp} XP`}</p>
              <div className="h-2.5 overflow-hidden bg-rpg-bg-2" style={R}>
                <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-300" style={{ width: `${c.stage.progressPct}%` }} />
              </div>
            </div>
          </div>
        </section>

        <Panel title="Status do Companheiro" icon={<Heart size={17} className="text-rpg-pink" aria-hidden />} action={<span className="border border-rpg-green/60 bg-rpg-green/10 px-2 py-0.5 text-[11px] font-semibold text-rpg-green" style={R}>{c.status.mood === "descansando" ? "Descansando" : `Está ${c.status.mood}`}</span>}>
          <div className="mb-3 grid grid-cols-5 gap-1.5">
            {MOODS.map((m) => {
              const on = c.status.mood === m.key || (m.key === "cansado" && c.status.mood === "descansando");
              return (
                <div key={m.key} className={clsx("flex flex-col items-center border-2 p-1", on ? "border-rpg-green bg-rpg-green/10" : "border-rpg-border/60 opacity-60")} style={R} aria-current={on ? "true" : undefined}>
                  <PetThumb pet={{ ...pet, mood: m.key }} size={52} />
                  <span className="text-[10px] text-rpg-text">{m.label}</span>
                </div>
              );
            })}
          </div>
          <div className="space-y-2">
            <MeterRow label="Energia" value={c.status.energia} max={100} tone="bg-emerald-400" />
            <MeterRow label="Saciedade" value={c.status.fome} max={100} tone="bg-emerald-400" />
            <MeterRow label="Hidratação" value={c.status.hidratacao} max={100} tone="bg-sky-400" />
            <MeterRow label="Bem-estar" value={c.status.bemEstar} max={100} tone="bg-emerald-400" />
            <MeterRow label="Vínculo" value={c.status.vinculo} max={100} tone="bg-fuchsia-400" />
          </div>
          <p className="mt-2 text-[11px] text-rpg-muted">Os cuidados são virtuais: o companheiro nunca adoece nem some se você se ausentar.</p>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[1.2fr_1fr]">
        <Panel title="Aparência e Traços Ativos" icon={<Sparkles size={17} className="text-rpg-purple" aria-hidden />} action={<span className="text-[11px] text-rpg-muted">Baseado nas suas atividades (30 dias)</span>}>
          <div className="mb-3 grid gap-2 sm:grid-cols-2">
            {c.traits.map((t) => (
              <div key={t.key} className={clsx("rpg-tile flex items-center gap-2 p-2", !t.active && "opacity-55")}>
                <Star size={16} className={t.active ? "text-rpg-gold" : "text-rpg-muted"} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-rpg-text">{t.name}</p>
                  <p className="text-[11px] text-rpg-muted">
                    {t.active ? "▲ " : ""}
                    {t.hint} · {t.count} registro(s)
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {(["cabeca", "pescoco", "costas"] as PetSlot[]).map((slot) => {
              const options = c.accessories.filter((x) => x.slot === slot);
              const cur = c.equipped[slot] === undefined ? "auto" : c.equipped[slot] ?? "nenhum";
              return (
                <label key={slot} className="text-xs text-rpg-muted">
                  {SLOT_LABEL[slot]}
                  <select
                    className={`${INPUT} mt-1 w-full`} style={R}
                    value={cur}
                    onChange={(e) => {
                      const v = e.target.value;
                      a.update.mutate({ equipped: { [slot]: v === "nenhum" ? null : v } }, { onError: (err) => notify(errMsg(err, "Não foi possível equipar."), "error") });
                    }}
                  >
                    <option value="auto">Automático (rotina)</option>
                    <option value="nenhum">Nenhum</option>
                    {options.map((o) => (
                      <option key={o.key} value={o.key} disabled={!o.unlocked}>
                        {o.name}
                        {o.unlocked ? "" : " (bloqueado)"}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-rpg-muted">Acessórios desbloqueados também aparecem na sua Coleção.</p>
        </Panel>

        <Panel title="Cuidados Diários" icon={<UtensilsCrossed size={17} className="text-rpg-orange" aria-hidden />} action={<span className="border border-rpg-green/60 bg-rpg-green/10 px-2 py-0.5 text-[11px] font-semibold text-rpg-green" style={R}>{CARE.filter((x) => careDone.includes(x.key)).length}/4 hoje</span>}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CARE.map((k) => {
              const done = careDone.includes(k.key);
              const cd = c.care.cooldowns[k.key];
              return (
                <button key={k.key} type="button" disabled={!!cd || a.care.isPending} onClick={() => care(k.key)} className={clsx("relative flex flex-col items-center gap-1 border-2 p-3 text-sm transition hover:brightness-110 disabled:cursor-not-allowed", done ? "border-rpg-green/70 bg-rpg-green/10" : "border-rpg-border bg-rpg-bg-2/70")} style={R} title={cd ? `Disponível ${new Date(cd).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : undefined}>
                  {done && <span className="absolute right-1 top-1 text-[11px] text-rpg-green" aria-label="feito hoje">✓</span>}
                  <k.icon size={22} className={k.tone} aria-hidden />
                  <span className="text-rpg-text">{k.label}</span>
                  {cd && <span className="text-[10px] text-rpg-muted">às {new Date(cd).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-rpg-muted">O primeiro cuidado de cada tipo no dia dá +3 XP para você ({c.care.xpActionsLeft} restante(s) hoje). Repetir não rende XP extra.</p>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Evolução e Benefícios" icon={<Zap size={17} className="text-rpg-gold-light" aria-hidden />}>
          <ol className="mb-3 flex items-end justify-between gap-1">
            {q.data.stages.map((s, i) => (
              <li key={s.key} className={clsx("flex flex-1 flex-col items-center border-2 p-1", i === c.stage.index ? "border-rpg-green bg-rpg-green/10" : i < c.stage.index ? "border-rpg-border" : "border-rpg-border/40 opacity-50")} style={R} aria-current={i === c.stage.index ? "step" : undefined}>
                <PetThumb pet={{ ...pet, mood: "feliz", stage: i }} size={44} />
                <span className="text-[10px] text-rpg-text">{s.name}</span>
              </li>
            ))}
          </ol>
          <p className="mb-1 text-xs font-semibold text-rpg-text">Benefícios do estágio atual</p>
          <ul className="space-y-1 text-sm text-rpg-text">
            {c.stage.benefits.map((b) => (
              <li key={b} className="flex gap-1.5">
                <span className="text-rpg-green">✓</span> {b}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-rpg-muted">XP do companheiro: dias ativos, semanas com 3+ tipos de atividade, cuidados (com teto diário) e conquistas. A evolução nunca regride.</p>
        </Panel>

        <Panel title="Conquistas do Companheiro" icon={<Trophy size={17} className="text-rpg-gold" aria-hidden />}>
          <ul className="space-y-2">
            {achievements.map((x) => (
              <li key={x.key} className="rpg-tile flex items-center gap-2 p-2">
                <x.icon size={18} className={x.done ? "text-rpg-pink" : "text-rpg-muted"} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-rpg-text">{x.title}</p>
                  <p className="text-[11px] text-rpg-muted">{x.desc}</p>
                </div>
                <span className={clsx("h-4 w-4 rounded-full border-2", x.done ? "border-rpg-green bg-rpg-green" : "border-rpg-border")} aria-label={x.done ? "concluída" : "pendente"} />
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Atividades Recentes" icon={<History size={17} className="text-rpg-blue" aria-hidden />} action={<button type="button" onClick={() => setHistoryOpen(true)} className="text-xs text-rpg-blue hover:underline">Ver histórico →</button>}>
          {!q.data.recent?.length ? (
            <EmptyNote>Registre uma tarefa, treino, leitura ou commit: {c.name} vai acompanhar.</EmptyNote>
          ) : (
            <ol className="space-y-2">
              {q.data.recent.slice(0, 4).map((r, i) => {
                const Icon = FAMILY_ICON[r.family];
                return (
                  <li key={`${r.at}-${i}`} className="flex items-start gap-2">
                    <Icon size={18} className="mt-0.5 shrink-0 text-rpg-purple" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-[10px] text-rpg-muted">{ago(r.at)}</p>
                      <p className="truncate text-sm font-semibold text-rpg-text">{r.label}</p>
                      <p className="text-[11px] text-rpg-muted">
                        {c.name} {FAMILY_TEXT[r.family]}.
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>
      </div>

      <section className="rpg-panel flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center" aria-label="Dica do Companheiro">
        <PetThumb pet={{ ...pet, mood: "feliz" }} size={80} />
        <p className="font-rpg text-xl font-bold text-rpg-cyan">Dica do {c.name}</p>
        <p className="min-w-0 flex-1 border-2 border-rpg-border bg-rpg-bg-2/70 p-3 text-sm italic text-rpg-text" style={R}>
          {tipFor(c)}
        </p>
        <RPGButton variant="success" disabled={!!c.care.cooldowns.carinho || a.care.isPending} onClick={() => care("carinho")}>
          <Hand size={16} aria-hidden /> Interagir com {c.name}
        </RPGButton>
      </section>

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
