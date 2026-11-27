import { useState } from "react";
import { PartyPopper, Plus, Trash2 } from "lucide-react";
import { RPGButton, RPGSwitch } from "@/components/rpg";
import { INPUT, R, errMsg } from "@/components/adventures/AdventureKit";
import { useHolidayActions, useHolidays } from "@/hooks/usePersonalIntegrations";
import type { Holiday } from "@/services/personalIntegrationsService";

const WD = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const daysUntil = (date: string, today: string) => Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);

/** Fato de calendário, não recomendação: terça/quinta deixam um dia útil isolado. */
function bridgeHint(date: string): string | null {
  const wd = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (wd === 2) return "cai numa terça: a segunda fica entre o fim de semana e o feriado";
  if (wd === 4) return "cai numa quinta: a sexta fica entre o feriado e o fim de semana";
  return null;
}

/**
 * Festivais do Reino — feriados nacionais (BrasilAPI) + locais do usuário.
 * Mostram-se na Agenda; opcionalmente o Conselho não distribui missões neles
 * e a Raid entra em trégua (o chefe não se cura).
 */
export function HolidaysPanel({ today, onToast }: { today: string; onToast: (msg: string, tone?: "success" | "error") => void }) {
  const year = Number(today.slice(0, 4));
  const cur = useHolidays(year);
  const next = useHolidays(year + 1);
  const a = useHolidayActions();
  const [form, setForm] = useState({ date: "", name: "" });
  const all: Holiday[] = [...(cur.data?.items ?? []), ...(next.data?.items ?? [])];
  const upcoming = all.filter((h) => h.date >= today).slice(0, 6);
  const locals = all.filter((h) => h.type === "local");
  const prefs = cur.data?.prefs;
  const unavailable = [...(cur.data?.unavailableYears ?? []), ...(next.data?.unavailableYears ?? [])];

  return (
    <section className="rpg-panel space-y-3 p-3" aria-label="Feriados">
      <h3 className="flex items-center gap-2 font-rpg text-base font-bold text-rpg-text">
        <PartyPopper size={16} className="text-rpg-gold" aria-hidden /> Festivais do Reino
      </h3>
      {cur.isLoading ? (
        <div className="h-24 animate-pulse bg-rpg-bg-2" style={R} />
      ) : (
        <>
          {unavailable.length > 0 && <p className="text-[11px] text-rpg-orange">A BrasilAPI não respondeu para {unavailable.join(", ")}. Mostrando o que já estava salvo.</p>}
          {upcoming.length === 0 ? (
            <p className="text-xs text-rpg-muted">Nenhum feriado pela frente nos dados disponíveis.</p>
          ) : (
            <ul className="space-y-1.5">
              {upcoming.map((h) => {
                const n = daysUntil(h.date, today);
                const hint = bridgeHint(h.date);
                return (
                  <li key={`${h.date}-${h.name}`} className="rpg-tile flex items-start gap-2 p-2">
                    <span className="w-11 shrink-0 border border-rpg-gold/60 bg-rpg-gold/10 py-0.5 text-center font-rpg text-xs font-bold leading-tight text-rpg-gold-light" style={R}>
                      {h.date.slice(8, 10)}/{h.date.slice(5, 7)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-rpg-text">{h.name}</span>
                      <span className="block text-[10px] text-rpg-muted">
                        {WD[new Date(`${h.date}T12:00:00Z`).getUTCDay()]} · {n === 0 ? "hoje" : n === 1 ? "amanhã" : `em ${n} dias`}
                        {h.type === "local" ? " · local" : ""}
                      </span>
                      {hint && <span className="block text-[10px] text-rpg-cyan">{hint}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {prefs && (
            <div className="space-y-1.5 border-t border-rpg-border pt-2 text-xs text-rpg-muted">
              <label className="flex items-center justify-between gap-2">
                <span>Conselho de Guerra não distribui missões em feriados</span>
                <RPGSwitch checked={prefs.council} label="Feriados no Conselho de Guerra" onChange={() => a.prefs.mutate({ council: !prefs.council })} />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span>Trégua na Raid: o Chefe da Semana não se cura em feriados</span>
                <RPGSwitch checked={prefs.raidTruce} label="Trégua de feriado na Raid" onChange={() => a.prefs.mutate({ raidTruce: !prefs.raidTruce })} />
              </label>
            </div>
          )}
          <details className="border-t border-rpg-border pt-2">
            <summary className="cursor-pointer text-xs font-semibold text-rpg-blue">Feriados locais ({locals.length})</summary>
            <form
              className="mt-2 flex flex-wrap gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                a.addLocal.mutate(form, {
                  onSuccess: () => (setForm({ date: "", name: "" }), onToast("Feriado local adicionado.")),
                  onError: (err) => onToast(errMsg(err, "Não foi possível adicionar."), "error"),
                });
              }}
            >
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={INPUT + " py-1 text-xs"} style={R} aria-label="Data do feriado local" required />
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Aniversário da cidade" maxLength={80} className={INPUT + " min-w-0 flex-1 py-1 text-xs"} style={R} aria-label="Nome do feriado local" required />
              <RPGButton type="submit" variant="secondary" className="text-xs" disabled={a.addLocal.isPending || !form.date || form.name.trim().length < 2} aria-label="Adicionar feriado local">
                <Plus size={13} aria-hidden />
              </RPGButton>
            </form>
            {locals.length > 0 && (
              <ul className="mt-2 space-y-1">
                {locals.map((h) => (
                  <li key={h.id} className="flex items-center gap-2 text-xs text-rpg-text">
                    <span className="text-rpg-muted">
                      {h.date.slice(8, 10)}/{h.date.slice(5, 7)}/{h.date.slice(0, 4)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{h.name}</span>
                    <button type="button" className="p-0.5 text-rpg-muted hover:text-rpg-red" aria-label={`Remover ${h.name}`} onClick={() => h.id && a.removeLocal.mutate(h.id)}>
                      <Trash2 size={12} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-[10px] text-rpg-muted">Nacionais vêm da BrasilAPI. Municipais e estaduais você cadastra aqui.</p>
          </details>
        </>
      )}
    </section>
  );
}
