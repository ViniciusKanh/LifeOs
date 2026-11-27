import clsx from "clsx";
import { CalendarDays, Clock, Code2, Flame, FolderGit2, Hammer, Timer, Trophy } from "lucide-react";
import { RPGProgressBar } from "@/components/rpg";
import { MeterRow, R, StatTile, errMsg, fmtDay } from "@/components/adventures/AdventureKit";
import { IntegrationBanner, KeyConnectForm, SyncBar, XpChip, fmtSec } from "@/components/integrations/IntegrationKit";
import { useWakatime, useWakatimeActions } from "@/hooks/usePersonalIntegrations";
import type { WakaOverview } from "@/services/personalIntegrationsService";

const LANG_TONES = ["bg-rpg-blue", "bg-rpg-gold", "bg-rpg-green", "bg-rpg-purple", "bg-rpg-pink", "bg-rpg-cyan"];
const WEEKDAY = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Fornalha: um segmento aceso por bloco de 30 min pago hoje. */
function Furnace({ blocks, max }: { blocks: number; max: number }) {
  return (
    <div className="flex gap-1" role="img" aria-label={`${blocks} de ${max} blocos de 30 minutos acesos hoje`}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={clsx("h-6 flex-1 border", i < blocks ? "border-rpg-orange bg-gradient-to-t from-rpg-red via-rpg-orange to-rpg-gold shadow-[0_0_8px_rgba(255,140,0,0.55)]" : "border-rpg-border bg-rpg-bg-2")}
          style={{ borderRadius: 3 }}
        />
      ))}
    </div>
  );
}

/** Barras dos últimos 14 dias (dia sem dado ≠ zero: aparece hachurado). */
function DaysChart({ series }: { series: WakaOverview["series"] }) {
  const max = Math.max(3600, ...series.map((s) => s.seconds ?? 0));
  return (
    <div className="flex h-32 items-end gap-1" role="list" aria-label="Tempo programando nos últimos 14 dias">
      {series.map((s) => {
        const h = s.seconds == null ? 100 : Math.max(2, (s.seconds / max) * 100);
        const wd = WEEKDAY[new Date(`${s.day}T12:00:00Z`).getUTCDay()];
        const label = s.seconds == null ? `${fmtDay(s.day)}: sem dados do WakaTime` : `${fmtDay(s.day)}: ${fmtSec(s.seconds)}`;
        return (
          <div key={s.day} role="listitem" className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={label} aria-label={label}>
            <span
              className={clsx("w-full", s.seconds == null ? "bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.07)_0_3px,transparent_3px_6px)]" : s.seconds >= 1800 ? "bg-gradient-to-t from-rpg-orange to-rpg-gold" : "bg-rpg-blue/60")}
              style={{ height: `${h}%`, borderRadius: 3 }}
            />
            <span className="text-[9px] text-rpg-muted">{wd}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Tempo na Bigorna — WakaTime na Forja do Código: tempo real no editor vira
 * XP de código (soma no nível da oficina) e dano no Chefe da Semana.
 */
export function WakaTimeAnvil({ notify }: { notify: (msg: string, tone?: "success" | "error") => void }) {
  const q = useWakatime();
  const a = useWakatimeActions();
  const o = q.data;
  const hours = Math.floor((o?.totalSeconds ?? 0) / 3600);
  const goal = hours < 10 ? 10 : hours < 100 ? 100 : null;

  return (
    <section className="rpg-panel relative overflow-hidden p-4" aria-label="Tempo na Bigorna (WakaTime)">
      <div className="pointer-events-none absolute -left-16 bottom-0 h-40 w-56 bg-[radial-gradient(ellipse_at_bottom,rgba(255,120,0,0.18),transparent_70%)]" aria-hidden />
      <IntegrationBanner
        icon={<Hammer size={22} />}
        tone="orange"
        title="Tempo na Bigorna"
        subtitle="Tempo real programando (WakaTime) vira XP da Forja e dano no Chefe da Semana."
        right={o?.connected ? <XpChip xp={o.xpTotal} className="text-[11px]" /> : null}
      />
      {q.isLoading ? (
        <div className="h-48 animate-pulse bg-rpg-bg-2" style={R} />
      ) : q.isError || !o ? (
        <p className="text-sm text-rpg-red" role="alert">
          Não foi possível ler o WakaTime.
        </p>
      ) : !o.connected ? (
        <div className="grid [&>*]:min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <KeyConnectForm
            service="WakaTime"
            placeholder="token pessoal (waka_tok_…)"
            minLength={20}
            link={{ href: "https://wakatime.com/oauth", text: "Gerar meu token pessoal do WakaTime" }}
            busy={a.connect.isPending}
            onSubmit={(key) =>
              a.connect.mutate(key, {
                onSuccess: (r) => notify(r.sync.ok ? `WakaTime conectado${r.username ? ` (${r.username})` : ""}. +${r.sync.xp} XP de código.` : `Conectado, mas a leitura falhou: ${r.sync.error}`, r.sync.ok ? "success" : "error"),
                onError: (e) => notify(errMsg(e, "Não foi possível conectar o WakaTime."), "error"),
              })
            }
            steps={[
              <>No VS Code, instale a extensão <b>WakaTime</b> e entre com sua conta (o plano gratuito basta).</>,
              <>Gere o <b>token pessoal (OAuth)</b> em wakatime.com/oauth. A Secret API Key não serve: o WakaTime só aceita ela no plugin.</>,
              <>Cole aqui. O WakaTime grátis guarda 14 dias; o LifeOS guarda todo o histórico a partir de agora.</>,
            ]}
          />
          <div className="space-y-2 border border-dashed border-rpg-orange/50 p-3 text-xs text-rpg-muted" style={R}>
            <p className="font-rpg text-sm font-bold text-rpg-orange">Como a bigorna paga</p>
            <p>
              <b className="text-rpg-text">+10 XP e 1 moeda</b> por bloco de 30 min programando, até 12 blocos (6 h) por dia.
            </p>
            <p>O XP entra como XP de código: sobe o nível da oficina da Forja junto com commits e PRs.</p>
            <p>Cada dia com 15 min ou mais vira um golpe no Chefe da Semana, maior quanto mais tempo.</p>
            <p>Conquistas: Mãos na Bigorna (10 h) e Mestre do Tempo de Forja (100 h).</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid [&>*]:min-w-0 gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div className="space-y-2 border border-rpg-orange/40 bg-rpg-bg-2/60 p-3" style={R}>
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-rpg-muted">Hoje no editor</p>
                  <p className="font-rpg text-3xl font-bold text-rpg-gold-light">{fmtSec(o.today.seconds)}</p>
                </div>
                <p className="text-right text-[11px] text-rpg-muted">
                  {o.today.blocks}/{o.rules.maxBlocks} blocos · <b className="text-rpg-gold">+{o.today.blocks * o.rules.perBlock} XP</b>
                  <br />
                  {o.today.blocks < o.rules.maxBlocks ? `próximo bloco em ${fmtSec((o.today.blocks + 1) * o.rules.blockMinutes * 60 - o.today.seconds)}` : "fornalha no máximo hoje"}
                </p>
              </div>
              <Furnace blocks={o.today.blocks} max={o.rules.maxBlocks} />
            </div>
            <div className="grid [&>*]:min-w-0 grid-cols-2 gap-2">
              <StatTile icon={<CalendarDays size={14} />} tone="text-rpg-blue" value={fmtSec(o.weekSeconds)} label="Últimos 7 dias" />
              <StatTile icon={<Flame size={14} />} tone="text-rpg-orange" value={`${o.streak} dia(s)`} label="Sequência no editor" />
              <StatTile icon={<Clock size={14} />} tone="text-rpg-green" value={`${hours} h`} label="Total registrado" hint={`${o.activeDays} dia(s) ativos`} />
              <StatTile icon={<Trophy size={14} />} tone="text-rpg-gold" value={fmtSec(o.bestDaySeconds)} label="Melhor dia" />
            </div>
          </div>

          <div className="grid [&>*]:min-w-0 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-rpg-text">
                <Timer size={13} className="text-rpg-orange" aria-hidden /> Últimos 14 dias
              </p>
              <DaysChart series={o.series} />
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-rpg-text">
                  <Code2 size={13} className="text-rpg-blue" aria-hidden /> Linguagens (14 dias)
                </p>
                {o.languages.length ? (
                  <>
                    <div className="flex h-2.5 overflow-hidden" style={{ borderRadius: 3 }} aria-hidden>
                      {o.languages.map((l, i) => (
                        <span key={l.name} className={LANG_TONES[i % LANG_TONES.length]} style={{ width: `${l.pct}%` }} />
                      ))}
                    </div>
                    <ul className="grid [&>*]:min-w-0 grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                      {o.languages.map((l, i) => (
                        <li key={l.name} className="flex items-center gap-1.5 text-rpg-muted">
                          <span className={clsx("h-2 w-2 shrink-0 rounded-full", LANG_TONES[i % LANG_TONES.length])} aria-hidden />
                          <span className="truncate text-rpg-text">{l.name}</span>
                          <span className="ml-auto tabular-nums">{l.pct}%</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-[11px] text-rpg-muted">Sem tempo registrado nos últimos 14 dias.</p>
                )}
              </div>
              {o.projects.length > 0 && (
                <div className="space-y-1.5">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-rpg-text">
                    <FolderGit2 size={13} className="text-rpg-green" aria-hidden /> Projetos
                  </p>
                  {o.projects.slice(0, 4).map((p) => (
                    <MeterRow key={p.name} label={p.name} value={p.seconds} max={o.projects[0]!.seconds} tone="bg-rpg-green" right={fmtSec(p.seconds)} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {goal && <RPGProgressBar value={hours} max={goal} tone="orange" label={goal === 10 ? "Conquista: Mãos na Bigorna" : "Conquista: Mestre do Tempo de Forja"} valueLabel={`${hours}/${goal} h`} />}
          <SyncBar
            status={o.connection?.lastSyncStatus ?? null}
            lastSyncAt={o.connection?.lastSyncAt ?? null}
            error={o.connection?.lastSyncError ?? null}
            busy={a.sync.isPending}
            onSync={() => a.sync.mutate(undefined, { onSuccess: (r) => notify(r.xp ? `Bigorna atualizada: +${r.xp} XP de código.` : "Tudo em dia na bigorna."), onError: (e) => notify(errMsg(e, "Falha ao sincronizar o WakaTime."), "error") })}
            onDisconnect={() => a.disconnect.mutate(undefined, { onSuccess: () => notify("WakaTime desconectado. O histórico e o XP continuam.") })}
            disconnecting={a.disconnect.isPending}
            keepNote="Os dias já registrados e o XP continuam."
          />
        </div>
      )}
    </section>
  );
}
