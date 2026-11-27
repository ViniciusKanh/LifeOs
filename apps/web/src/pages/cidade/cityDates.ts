/** Datas da Cidade Inteligente: sempre no fuso de São Paulo (o Diário é publicado lá). */
export const todayInSaoPaulo = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

/** Último dia útil (seg–sex) até a data — o Diário não circula no fim de semana. */
export function lastBusinessDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
