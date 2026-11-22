import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useReducedMotion } from "motion/react";
import { Dices, RotateCcw, RotateCw } from "lucide-react";
import { RPGButton, RPGSwitch, RPGTabs } from "@/components/rpg";
import { CharacterPortrait } from "./AgentPortrait";
import { BEARDS, HAIR_STYLES, HATS, LOOK_LABELS, LOOK_PALETTES, OUTFITS, PROPS, type CharacterLook } from "./engine/looks";
import { framesFor, type Pose } from "./engine/sprites";

const R = { borderRadius: 4 };
type Tab = "rosto" | "roupa" | "acessorios";
const POSES: Array<{ value: Pose; label: string }> = [
  { value: "stand", label: "Parado" },
  { value: "walk", label: "Andando" },
  { value: "celebrate", label: "Comemorando" },
  { value: "talk", label: "Conversando" },
  { value: "reading", label: "Lendo" },
];

const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;

/** Visual sorteado só entre as opções e paletas oferecidas (nada aleatório é salvo sem o usuário confirmar). */
function randomLook(): CharacterLook {
  return {
    skin: pick(LOOK_PALETTES.skin),
    hair: pick(LOOK_PALETTES.hair),
    hairStyle: pick(HAIR_STYLES),
    beard: Math.random() > 0.6 ? pick(BEARDS) : "nenhuma",
    eyes: pick(LOOK_PALETTES.eyes),
    glasses: Math.random() > 0.8,
    outfit: pick(OUTFITS),
    shirt: pick(LOOK_PALETTES.cloth),
    pants: pick(LOOK_PALETTES.cloth),
    trim: pick(LOOK_PALETTES.trim),
    boots: pick(LOOK_PALETTES.boots),
    cape: Math.random() > 0.5 ? pick(LOOK_PALETTES.cape) : null,
    hat: Math.random() > 0.4 ? pick(HATS) : "nenhum",
    hatColor: pick(LOOK_PALETTES.cloth),
    prop: pick(PROPS),
  };
}

function Swatches({ label, value, colors, onPick, allowCustom = true }: { label: string; value: string | null; colors: readonly string[]; onPick: (c: string) => void; allowCustom?: boolean }) {
  return (
    <fieldset>
      <legend className="mb-1 text-[11px] text-rpg-muted">{label}</legend>
      <div className="flex flex-wrap items-center gap-1.5">
        {colors.map((c) => (
          <button key={c} type="button" aria-label={`${label}: ${c}`} aria-pressed={value?.toLowerCase() === c.toLowerCase()} onClick={() => onPick(c)} className={clsx("h-7 w-7 border-2 transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold", value?.toLowerCase() === c.toLowerCase() ? "border-rpg-gold shadow-[0_0_0_2px_rgba(241,198,106,0.35)]" : "border-rpg-border")} style={{ ...R, background: c }} />
        ))}
        {allowCustom && (
          <label className="relative flex h-7 w-7 cursor-pointer items-center justify-center border-2 border-dashed border-rpg-border text-[10px] text-rpg-muted hover:border-rpg-gold" style={R} title="Outra cor">
            +
            <input type="color" aria-label={`${label}: outra cor`} value={value ?? "#000000"} onChange={(e) => onPick(e.target.value.toUpperCase())} className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
        )}
      </div>
    </fieldset>
  );
}

/** Opções com miniatura do próprio personagem usando cada opção. */
function OptionGrid<K extends "hairStyle" | "beard" | "outfit" | "hat" | "prop">({ label, field, options, look, onPick, crop }: { label: string; field: K; options: readonly CharacterLook[K][]; look: CharacterLook; onPick: (v: CharacterLook[K]) => void; crop: "bust" | "full" }) {
  const labels = LOOK_LABELS[field] as Record<string, string>;
  return (
    <fieldset>
      <legend className="mb-1 text-[11px] text-rpg-muted">{label}</legend>
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
        {options.map((o) => {
          const active = look[field] === o;
          return (
            <button key={String(o)} type="button" aria-pressed={active} onClick={() => onPick(o)} className={clsx("flex flex-col items-center gap-0.5 border-2 bg-rpg-bg-2/70 p-1 transition-colors hover:border-rpg-gold/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold", active ? "border-rpg-gold bg-rpg-gold/10" : "border-rpg-border")} style={R}>
              <span className="flex h-11 items-end justify-center overflow-hidden">
                <CharacterPortrait look={{ ...look, [field]: o }} size={crop === "bust" ? 40 : 44} crop={crop} />
              </span>
              <span className={clsx("w-full truncate text-center text-[10px] leading-tight", active ? "text-rpg-gold-light" : "text-rpg-muted")}>{labels[String(o)]}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Editor de aparência do Meu Mundo (avatar e agentes): prévia animada em pixel
 * art girando entre frente e costas, abas de rosto/roupa/acessórios,
 * miniaturas de cada opção, cores livres, sorteio e restaurar padrão.
 * Controlado: quem usa decide quando salvar.
 */
export function CharacterEditor({ value, onChange, defaultLook }: { value: CharacterLook; onChange: (next: CharacterLook) => void; defaultLook: CharacterLook }) {
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<Tab>("rosto");
  const [pose, setPose] = useState<Pose>("walk");
  const [back, setBack] = useState(false);
  const [frame, setFrame] = useState(0);
  const set = <K extends keyof CharacterLook>(k: K, v: CharacterLook[K]) => onChange({ ...value, [k]: v });

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setFrame((f) => f + 1), pose === "walk" ? 160 : 380);
    return () => window.clearInterval(id);
  }, [pose, reduce]);
  const shownFrame = reduce ? 0 : frame % framesFor(pose);
  const preview = useMemo(() => value, [value]);

  return (
    <div className="space-y-3">
      <div className="flex items-stretch gap-3">
        <div className="relative flex w-36 shrink-0 flex-col items-center justify-end overflow-hidden border-2 border-rpg-gold/60 bg-gradient-to-b from-[#2a3a6a] via-[#24325a] to-[#2f5a34] pb-2 pt-3" style={R}>
          {/* chão de grama sob o personagem */}
          <span className="absolute inset-x-0 bottom-0 h-8 bg-[#3b7d3a]" aria-hidden />
          <span className="absolute bottom-5 left-1/2 h-2 w-16 -translate-x-1/2 rounded-[50%] bg-black/35" aria-hidden />
          <span className="relative">
            <CharacterPortrait look={preview} size={132} crop="full" pose={pose} frame={shownFrame} back={back} />
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="font-pixel text-[9px] uppercase text-rpg-muted">Prévia</p>
          <div className="flex flex-wrap gap-1">
            {POSES.map((p) => (
              <button key={p.value} type="button" aria-pressed={pose === p.value} onClick={() => setPose(p.value)} className={clsx("border px-2 py-0.5 text-[11px]", pose === p.value ? "border-rpg-gold text-rpg-gold-light" : "border-rpg-border text-rpg-muted")} style={R}>
                {p.label}
              </button>
            ))}
          </div>
          <RPGButton variant="ghost" className="justify-start text-xs" onClick={() => setBack((b) => !b)}>
            <RotateCw size={12} aria-hidden /> {back ? "Ver de frente" : "Ver de costas"}
          </RPGButton>
          <div className="mt-auto flex flex-wrap gap-1.5">
            <RPGButton variant="secondary" className="text-xs" onClick={() => onChange(randomLook())}>
              <Dices size={12} aria-hidden /> Sortear
            </RPGButton>
            <RPGButton variant="ghost" className="text-xs" onClick={() => onChange(defaultLook)}>
              <RotateCcw size={12} aria-hidden /> Padrão
            </RPGButton>
          </div>
        </div>
      </div>

      <RPGTabs<Tab> label="Partes da aparência" size="sm" value={tab} onChange={setTab} tabs={[{ value: "rosto", label: "Rosto e cabelo" }, { value: "roupa", label: "Roupa" }, { value: "acessorios", label: "Acessórios" }]} />

      {tab === "rosto" && (
        <div className="space-y-3">
          <Swatches label="Pele" value={value.skin} colors={LOOK_PALETTES.skin} onPick={(c) => set("skin", c)} />
          <OptionGrid label="Cabelo" field="hairStyle" options={HAIR_STYLES} look={value} onPick={(v) => set("hairStyle", v)} crop="bust" />
          <Swatches label="Cor do cabelo e da barba" value={value.hair} colors={LOOK_PALETTES.hair} onPick={(c) => set("hair", c)} />
          <OptionGrid label="Barba" field="beard" options={BEARDS} look={value} onPick={(v) => set("beard", v)} crop="bust" />
          <Swatches label="Olhos" value={value.eyes} colors={LOOK_PALETTES.eyes} onPick={(c) => set("eyes", c)} />
          <div className="flex items-center justify-between border border-rpg-border/70 bg-rpg-bg-2/60 px-2 py-1.5" style={R}>
            <span className="text-sm text-rpg-text">Óculos</span>
            <RPGSwitch checked={value.glasses} onChange={() => set("glasses", !value.glasses)} label="Usar óculos" />
          </div>
        </div>
      )}

      {tab === "roupa" && (
        <div className="space-y-3">
          <OptionGrid label="Traje" field="outfit" options={OUTFITS} look={value} onPick={(v) => set("outfit", v)} crop="full" />
          <Swatches label="Cor do traje" value={value.shirt} colors={LOOK_PALETTES.cloth} onPick={(c) => set("shirt", c)} />
          <Swatches label="Detalhes (faixa, barra, avental)" value={value.trim} colors={LOOK_PALETTES.trim} onPick={(c) => set("trim", c)} />
          <Swatches label="Calça" value={value.pants} colors={LOOK_PALETTES.cloth} onPick={(c) => set("pants", c)} />
          <Swatches label="Botas" value={value.boots} colors={LOOK_PALETTES.boots} onPick={(c) => set("boots", c)} />
          <fieldset>
            <legend className="mb-1 text-[11px] text-rpg-muted">Capa</legend>
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" aria-pressed={value.cape === null} onClick={() => set("cape", null)} className={clsx("h-7 border-2 px-2 text-[11px]", value.cape === null ? "border-rpg-gold text-rpg-gold-light" : "border-rpg-border text-rpg-muted")} style={R}>
                Sem capa
              </button>
              <Swatches label="Cor da capa" value={value.cape} colors={LOOK_PALETTES.cape} onPick={(c) => set("cape", c)} />
            </div>
          </fieldset>
        </div>
      )}

      {tab === "acessorios" && (
        <div className="space-y-3">
          <OptionGrid label="Chapéu" field="hat" options={HATS} look={value} onPick={(v) => set("hat", v)} crop="bust" />
          {value.hat !== "nenhum" && value.hat !== "coroa" && <Swatches label="Cor do chapéu" value={value.hatColor} colors={LOOK_PALETTES.cloth} onPick={(c) => set("hatColor", c)} />}
          <OptionGrid label="Item na mão" field="prop" options={PROPS} look={value} onPick={(v) => set("prop", v)} crop="full" />
        </div>
      )}
      <p className="text-[10px] text-rpg-muted">A aparência é só visual: não muda XP, moedas nem atributos.</p>
    </div>
  );
}
