/**
 * Aparência dos personagens do Meu Mundo (avatar, agentes e aldeões).
 * Tudo é cosmético: nenhuma opção concede XP, moedas ou vantagem.
 * As listas abaixo espelham as do backend (apps/api/src/config/livingWorld.ts)
 * — ao criar uma opção nova, adicione nos dois lados.
 */

export const HAIR_STYLES = ["curto", "longo", "rabo", "cacheado", "moicano", "coque", "trancas", "careca"] as const;
export const BEARDS = ["nenhuma", "bigode", "cavanhaque", "cheia"] as const;
export const OUTFITS = ["tunica", "manto", "armadura", "gibao", "vestido", "avental"] as const;
export const HATS = ["nenhum", "capuz", "chapeu_mago", "elmo", "coroa", "bandana", "palha", "boina", "flores"] as const;
export const PROPS = ["nenhum", "espada", "cajado", "livro", "pena", "regador", "lanterna", "pergaminho", "escudo"] as const;

export type HairStyle = (typeof HAIR_STYLES)[number];
export type Beard = (typeof BEARDS)[number];
export type Outfit = (typeof OUTFITS)[number];
export type Hat = (typeof HATS)[number];
export type Prop = (typeof PROPS)[number];

export interface CharacterLook {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  beard: Beard;
  eyes: string;
  glasses: boolean;
  outfit: Outfit;
  /** Cor principal da roupa. */
  shirt: string;
  pants: string;
  /** Detalhes: barra, faixa, avental, tabardo. */
  trim: string;
  boots: string;
  /** null = sem capa. */
  cape: string | null;
  hat: Hat;
  hatColor: string;
  prop: Prop;
}

export const LOOK_LABELS = {
  hairStyle: { curto: "Curto", longo: "Longo", rabo: "Rabo de cavalo", cacheado: "Cacheado", moicano: "Moicano", coque: "Coque", trancas: "Tranças", careca: "Careca" },
  beard: { nenhuma: "Sem barba", bigode: "Bigode", cavanhaque: "Cavanhaque", cheia: "Barba cheia" },
  outfit: { tunica: "Túnica", manto: "Manto", armadura: "Armadura", gibao: "Gibão nobre", vestido: "Vestido", avental: "Avental" },
  hat: { nenhum: "Nenhum", capuz: "Capuz", chapeu_mago: "Chapéu de mago", elmo: "Elmo", coroa: "Coroa", bandana: "Bandana", palha: "Chapéu de palha", boina: "Boina", flores: "Coroa de flores" },
  prop: { nenhum: "Nada", espada: "Espada", cajado: "Cajado", livro: "Livro", pena: "Pena", regador: "Regador", lanterna: "Lanterna", pergaminho: "Pergaminho", escudo: "Escudo" },
} as const satisfies { [K in "hairStyle" | "beard" | "outfit" | "hat" | "prop"]: Record<CharacterLook[K], string> };

/** Paletas oferecidas no editor (cores livres também são aceitas pelo backend). */
export const LOOK_PALETTES = {
  skin: ["#F6D3B3", "#E8B48A", "#D9A57A", "#C98E66", "#A86F4C", "#8A5636", "#6B3F26", "#4A2B1A"],
  hair: ["#1E1410", "#3A2418", "#6B4A32", "#A0522D", "#C8742E", "#E3C36A", "#D8D8D8", "#7A7A7A", "#2B3A67", "#7A2A6A"],
  eyes: ["#5A6FBA", "#3F7A3C", "#6B4A32", "#2A1A10", "#7A8A9A", "#A875F5"],
  cloth: ["#C8423B", "#7A1F3A", "#B7791F", "#3F7A3C", "#2B6CB0", "#2B3A67", "#5B3F8C", "#4A4F5C", "#E9E2CF", "#2A2420"],
  trim: ["#F1C66A", "#E9E2CF", "#C8423B", "#59A9F8", "#4FD49A", "#A875F5", "#8A5D3B", "#1B1430"],
  boots: ["#4A2F1B", "#2A1A10", "#5A3A22", "#3B3B46", "#7A5A3A"],
  cape: ["#7A1F3A", "#2B3A67", "#3F5A3A", "#5B3F8C", "#B7791F", "#1B1430"],
} as const;

export const DEFAULT_AVATAR_LOOK: CharacterLook = {
  skin: "#E8B48A",
  hair: "#3A2418",
  hairStyle: "curto",
  beard: "nenhuma",
  eyes: "#5A6FBA",
  glasses: false,
  outfit: "tunica",
  shirt: "#C8423B",
  pants: "#2B3A67",
  trim: "#F1C66A",
  boots: "#4A2F1B",
  cape: "#7A1F3A",
  hat: "nenhum",
  hatColor: "#2B3A67",
  prop: "espada",
};

/**
 * Agentes agora são pessoas do reino. Cada um tem um visual padrão ligado à
 * especialidade; o usuário pode trocar tudo no painel do agente.
 */
export const DEFAULT_AGENT_LOOKS: Record<string, CharacterLook> = {
  // Escriba-estrategista: gibão azul, boina e pergaminho de planos.
  planejador: { skin: "#D9A57A", hair: "#2A1A10", hairStyle: "curto", beard: "cavanhaque", eyes: "#3F2A1A", glasses: false, outfit: "gibao", shirt: "#2B6CB0", pants: "#2B3A67", trim: "#F1C66A", boots: "#2A1A10", cape: null, hat: "boina", hatColor: "#1B2B55", prop: "pergaminho" },
  // Sábio da biblioteca: manto roxo, chapéu de mago, barba grisalha e cajado.
  mentor: { skin: "#F6D3B3", hair: "#D8D8D8", hairStyle: "longo", beard: "cheia", eyes: "#5A6FBA", glasses: false, outfit: "manto", shirt: "#5B3F8C", pants: "#3A2A5A", trim: "#F1C66A", boots: "#2A1A10", cape: null, hat: "chapeu_mago", hatColor: "#4A2F7A", prop: "cajado" },
  // Alquimista-analista: óculos, coque ruivo, avental de couro e pena.
  analista: { skin: "#E8B48A", hair: "#C8742E", hairStyle: "coque", beard: "nenhuma", eyes: "#3F7A3C", glasses: true, outfit: "avental", shirt: "#E9E2CF", pants: "#4A3A2A", trim: "#8A5D3B", boots: "#4A2F1B", cape: null, hat: "nenhum", hatColor: "#000000", prop: "pena" },
  // Druida dos hábitos: tranças, coroa de flores, túnica verde e regador.
  habitos: { skin: "#A86F4C", hair: "#1E1410", hairStyle: "trancas", beard: "nenhuma", eyes: "#2A1A10", glasses: false, outfit: "tunica", shirt: "#3F7A3C", pants: "#5A4A3A", trim: "#E3C36A", boots: "#5A3A22", cape: null, hat: "flores", hatColor: "#4FD49A", prop: "regador" },
};

const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown, fb: T): T => (list.includes(v as T) ? (v as T) : fb);

/** Completa um visual parcial (dado salvo antigo, campos faltando) com o padrão. */
export function normalizeLook(raw: Partial<CharacterLook> | null | undefined, base: CharacterLook): CharacterLook {
  const r = raw ?? {};
  return {
    skin: isHex(r.skin) ? r.skin : base.skin,
    hair: isHex(r.hair) ? r.hair : base.hair,
    hairStyle: oneOf(HAIR_STYLES, r.hairStyle, base.hairStyle),
    beard: oneOf(BEARDS, r.beard, base.beard),
    eyes: isHex(r.eyes) ? r.eyes : base.eyes,
    glasses: typeof r.glasses === "boolean" ? r.glasses : base.glasses,
    outfit: oneOf(OUTFITS, r.outfit, base.outfit),
    shirt: isHex(r.shirt) ? r.shirt : base.shirt,
    pants: isHex(r.pants) ? r.pants : base.pants,
    trim: isHex(r.trim) ? r.trim : base.trim,
    boots: isHex(r.boots) ? r.boots : base.boots,
    cape: r.cape === null ? null : isHex(r.cape) ? r.cape : base.cape,
    hat: oneOf(HATS, r.hat, base.hat),
    hatColor: isHex(r.hatColor) ? r.hatColor : base.hatColor,
    prop: oneOf(PROPS, r.prop, base.prop),
  };
}

export const agentLookFor = (key: string, custom?: Partial<CharacterLook> | null): CharacterLook =>
  normalizeLook(custom, DEFAULT_AGENT_LOOKS[key] ?? DEFAULT_AGENT_LOOKS.planejador!);
