import type { LifeAdminCategory, LifeAdminKind, LifeArea, NoteKind } from "@/types";

/* Rótulos, ícones e cores dos módulos de Administração, Direção e Notas — fonte única para todas as telas. */

export const LIFE_ADMIN_KIND: Record<LifeAdminKind, { label: string; emoji: string; hint: string }> = {
  vencimento: { label: "Vencimento", emoji: "📅", hint: "CNH, passaporte, seguro, IPVA, garantia…" },
  manutencao: { label: "Manutenção", emoji: "🔧", hint: "Revisão do carro, filtro de água, dedetização…" },
  documento: { label: "Documento", emoji: "📄", hint: "Onde está, número de referência e uma foto/PDF" },
  conta: { label: "Conta a pagar", emoji: "🧾", hint: "Boletos e contas que não estão no débito automático" },
};

export const LIFE_ADMIN_CATEGORY: Record<LifeAdminCategory, { label: string; emoji: string }> = {
  veiculo: { label: "Veículo", emoji: "🚗" },
  casa: { label: "Casa", emoji: "🏠" },
  documentos: { label: "Documentos", emoji: "🪪" },
  saude: { label: "Saúde", emoji: "🩺" },
  seguros: { label: "Seguros", emoji: "🛡️" },
  impostos: { label: "Impostos", emoji: "🏛️" },
  assinaturas: { label: "Assinaturas", emoji: "🔁" },
  pets: { label: "Pets", emoji: "🐾" },
  outro: { label: "Outro", emoji: "📌" },
};

export const RECURRENCE_OPTIONS: Array<{ value: number | null; label: string }> = [
  { value: null, label: "Não se repete" },
  { value: 1, label: "Todo mês" },
  { value: 3, label: "A cada 3 meses" },
  { value: 6, label: "A cada 6 meses" },
  { value: 12, label: "Todo ano" },
  { value: 24, label: "A cada 2 anos" },
  { value: 60, label: "A cada 5 anos" },
  { value: 120, label: "A cada 10 anos" },
];

export const LIFE_AREAS: Array<{ key: LifeArea; label: string; emoji: string; color: string }> = [
  { key: "saude", label: "Saúde", emoji: "💪", color: "#12B76A" },
  { key: "carreira", label: "Carreira", emoji: "💼", color: "#2F80FF" },
  { key: "financas", label: "Finanças", emoji: "💰", color: "#F59E0B" },
  { key: "relacionamentos", label: "Relacionamentos", emoji: "🤝", color: "#FF3D93" },
  { key: "familia", label: "Família", emoji: "🏡", color: "#FF7A45" },
  { key: "desenvolvimento", label: "Desenvolvimento", emoji: "🎓", color: "#9550FF" },
  { key: "lazer", label: "Lazer", emoji: "🎈", color: "#08B6A6" },
  { key: "espiritualidade", label: "Espiritualidade", emoji: "✨", color: "#7C4DFF" },
];

export const LIFE_AREA_BY_KEY = Object.fromEntries(LIFE_AREAS.map((a) => [a.key, a])) as Record<LifeArea, (typeof LIFE_AREAS)[number]>;

export const NOTE_KIND: Record<NoteKind, { label: string; emoji: string }> = {
  nota: { label: "Nota", emoji: "📝" },
  ideia: { label: "Ideia", emoji: "💡" },
  referencia: { label: "Referência", emoji: "🔖" },
};

/** "2026" → "2026", "2026-Q4" → "4º tri 2026", "2026-10" → "out 2026". */
export function cycleLabel(cycle: string | null | undefined): string {
  if (!cycle) return "Sem ciclo";
  if (/^\d{4}$/.test(cycle)) return `Ano ${cycle}`;
  const q = /^(\d{4})-Q([1-4])$/.exec(cycle);
  if (q) return `${q[2]}º tri ${q[1]}`;
  const m = /^(\d{4})-(\d{2})$/.exec(cycle);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }).replace(".", "");
  return cycle;
}

export function currentCycleKeys(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return { year: String(y), quarter: `${y}-Q${Math.ceil(m / 3)}`, month: `${y}-${String(m).padStart(2, "0")}` };
}

export function formatDateBR(date: string | null | undefined): string {
  if (!date) return "—";
  return new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).replace(".", "");
}

export function formatMoney(v: number | null | undefined): string | null {
  if (v == null) return null;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
