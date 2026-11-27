import type { Client } from "@libsql/client";
import { BANK_PLANS } from "../config/bank.js";
import { fetchJson } from "./integrationsCore.js";

/**
 * Termômetro do Reino (Banco do Reino) — taxas oficiais do Banco Central (SGS,
 * API pública sem chave) para comparar com os planos do Cofrinho, que são do
 * jogo. Dados públicos iguais para todos: cache global em sgs_points, renovado
 * no máximo a cada 12 h. Para séries diárias guardamos o último valor de cada
 * mês (histórico) e o valor mais recente.
 */

export const SGS_SERIES = {
  selic: 432, // Meta Selic definida pelo Copom (% a.a.)
  cdi: 4389, // CDI anualizado base 252 (% a.a.)
  ipca12: 13522, // IPCA acumulado em 12 meses (%)
  ipcaMonth: 433, // IPCA mensal (%)
  poupanca: 195, // Poupança: rentabilidade no período (% a.m.)
} as const;
type SeriesKey = keyof typeof SGS_SERIES;
const DAILY = new Set<number>([SGS_SERIES.selic, SGS_SERIES.cdi, SGS_SERIES.poupanca]);
const REFRESH_MS = 12 * 3600_000;

const brDate = (iso: string) => iso.split("-").reverse().join("/");
const isoOf = (br: string) => {
  const [d, m, y] = br.split("/");
  return `${y}-${m}-${d}`;
};

/** Reduz uma série diária ao último ponto de cada mês (+ o mais recente). Exportada para testes. */
export function compactSeries(points: Array<{ date: string; value: number }>, daily: boolean) {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  if (!daily) return sorted;
  const byMonth = new Map<string, { date: string; value: number }>();
  for (const p of sorted) byMonth.set(p.date.slice(0, 7), p);
  return [...byMonth.values()];
}

async function refreshSeries(db: Client, series: number, now = new Date()) {
  const f = await db.execute({ sql: "SELECT fetched_at FROM sgs_fetch WHERE series = ?", args: [series] });
  if (f.rows[0] && now.getTime() - Date.parse(String(f.rows[0].fetched_at)) < REFRESH_MS) return;
  const start = new Date(now.getTime() - 26 * 31 * 24 * 3600_000).toISOString().slice(0, 10);
  const end = now.toISOString().slice(0, 10);
  const raw = await fetchJson<Array<{ data: string; valor: string }>>(
    `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${series}/dados?formato=json&dataInicial=${brDate(start)}&dataFinal=${brDate(end)}`,
    { headers: { Accept: "application/json" } },
    { label: "Banco Central", timeoutMs: 12_000 },
  );
  const points = (raw ?? [])
    .map((p) => ({ date: /^\d{2}\/\d{2}\/\d{4}$/.test(p.data) ? isoOf(p.data) : "", value: Number(String(p.valor).replace(",", ".")) }))
    .filter((p) => p.date && Number.isFinite(p.value));
  const keep = compactSeries(points, DAILY.has(series));
  if (keep.length) {
    await db.batch(
      [
        { sql: "DELETE FROM sgs_points WHERE series = ?", args: [series] },
        ...keep.map((p) => ({ sql: "INSERT INTO sgs_points (series, date, value) VALUES (?, ?, ?)", args: [series, p.date, p.value] })),
        { sql: "INSERT INTO sgs_fetch (series, fetched_at) VALUES (?, ?) ON CONFLICT (series) DO UPDATE SET fetched_at = excluded.fetched_at", args: [series, now.toISOString()] },
      ],
      "write",
    );
  }
}

/** Rendimento composto de uma taxa anual (%) por N dias corridos. */
export const periodRate = (annualPct: number, days: number) => (Math.pow(1 + annualPct / 100, days / 365) - 1) * 100;

export async function getThermometer(db: Client) {
  const failures: string[] = [];
  await Promise.all(
    Object.entries(SGS_SERIES).map(([k, s]) =>
      refreshSeries(db, s).catch(() => {
        failures.push(k);
      }),
    ),
  );
  const r = await db.execute({ sql: `SELECT series, date, value FROM sgs_points WHERE series IN (${Object.values(SGS_SERIES).join(",")}) ORDER BY series, date`, args: [] });
  const by = new Map<number, Array<{ date: string; value: number }>>();
  for (const row of r.rows) {
    const s = Number(row.series);
    if (!by.has(s)) by.set(s, []);
    by.get(s)!.push({ date: String(row.date), value: Number(row.value) });
  }
  const last = (k: SeriesKey) => {
    const arr = by.get(SGS_SERIES[k]) ?? [];
    return arr.length ? arr[arr.length - 1]! : null;
  };
  const selic = last("selic");
  const cdi = last("cdi");
  const ipca12 = last("ipca12");
  const ipcaMonth = last("ipcaMonth");
  const poup = last("poupanca");
  if (!selic && !cdi && !ipca12) return { available: false as const, message: "O Banco Central não respondeu agora. Tente mais tarde." };
  const poupancaYear = poup ? (Math.pow(1 + poup.value / 100, 12) - 1) * 100 : null;
  const realRate = cdi && ipca12 ? ((1 + cdi.value / 100) / (1 + ipca12.value / 100) - 1) * 100 : null;
  // Simulação educativa: R$ 1.000 por 1 ano (IR de 15% no CDI acima de 720 dias não se aplica; 1 ano = 17,5%).
  const sim = {
    cdiGross: cdi ? 1000 * (cdi.value / 100) : null,
    cdiNet: cdi ? 1000 * (cdi.value / 100) * (1 - 0.175) : null,
    poupanca: poupancaYear != null ? 1000 * (poupancaYear / 100) : null,
    inflation: ipca12 ? 1000 * (ipca12.value / 100) : null,
  };
  return {
    available: true as const,
    partial: failures.length > 0,
    selic,
    cdi,
    ipca12,
    ipcaMonth,
    poupancaMonth: poup,
    poupancaYear,
    realRate,
    sim,
    history: {
      selic: (by.get(SGS_SERIES.selic) ?? []).slice(-24),
      ipca12: (by.get(SGS_SERIES.ipca12) ?? []).slice(-24),
    },
    // O Cofrinho paga moeda do jogo; aqui mostramos quanto o CDI real renderia no mesmo prazo.
    plans: BANK_PLANS.map((p) => ({ id: p.id, label: p.label, termDays: p.termDays, gamePct: p.rateBps / 100, cdiSamePeriodPct: cdi ? Math.round(periodRate(cdi.value, p.termDays) * 1000) / 1000 : null })),
    source: "Banco Central do Brasil (SGS)" as const,
  };
}
