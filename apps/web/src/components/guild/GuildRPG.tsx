import { useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { Bell, CalendarDays, Crown, Flame, Gift, History, Megaphone, PartyPopper, ScrollText, Shuffle, Trophy } from "lucide-react";
import type { GuildHub, Quest } from "@/services/planningHubService";
import type { PlayerProfile } from "@/services/gamificationService";
import { RPGProgressBar } from "@/components/rpg";
import { AutomationsPanel } from "@/components/automations/AutomationsPanel";
import { AdvisorPanel, KitSection, MissionList, MODULE_ART, RankPanel } from "@/components/rpg-modules/ModuleKit";

/**
 * Quadro de Avisos — peças RPG. Não existe saldo de XP próprio: o nível é o
 * global do personagem e o resgate usa a rota de quests já existente
 * (idempotente: resgatar duas vezes não paga duas vezes).
 */

const R = { borderRadius: 4 } as const;
const ART = `${MODULE_ART}/guild`;
const dayBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const rel = (iso: string) => {
  const ms = Date.now() - Date.parse(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  const h = Math.floor(ms / 3_600_000);
  return h < 1 ? "agora" : h < 24 ? `há ${h}h` : `há ${Math.floor(h / 24)}d`;
};

export function GuildLevelPanel({ hub, profile }: { hub: GuildHub; profile: PlayerProfile | undefined }) {
  const p = hub.progress;
  return (
    <RankPanel
      title="Nível da Guilda"
      subtitle={`Combo de quests: ${hub.combo.current} dia(s)`}
      rank={{
        level: profile?.level ?? 1,
        title: profile ? `${profile.totalXp.toLocaleString("pt-BR")} XP de personagem` : "Carregando…",
        currentMin: profile?.levelStartXp ?? 0,
        next: profile ? { title: `Nível ${profile.level + 1}`, min: profile.nextLevelXp } : null,
        pct: profile?.progressPct ?? 0,
      }}
      valueLabel={profile?.totalXp ?? 0}
      unit="XP"
      icon={<Crown size={26} />}
      rules={
        <>
          É o mesmo nível global do LifeOS (não existe um segundo saldo de XP). Hoje: {p.dailyDone}/{p.dailyTotal} diárias cumpridas · semana: {p.weeklyDone}/{p.weeklyTotal}. O
          bônus diário é pago quando todas as diárias são resgatadas.
        </>
      }
    />
  );
}

const RARITY: Array<{ min: number; label: string; cls: string }> = [
  { min: 60, label: "Lendária", cls: "border-rpg-gold text-rpg-gold-light bg-rpg-gold/15" },
  { min: 40, label: "Épica", cls: "border-rpg-purple/70 text-rpg-purple bg-rpg-purple/15" },
  { min: 20, label: "Rara", cls: "border-rpg-blue/70 text-rpg-blue bg-rpg-blue/10" },
  { min: 0, label: "Comum", cls: "border-rpg-border text-rpg-muted" },
];
/** Raridade visual pela recompensa definida nas regras (não altera a recompensa). */
const rarityOf = (xp: number) => RARITY.find((r) => xp >= r.min)!;

function questState(q: Quest): { label: string; cls: string } {
  if (q.claimed) return { label: "Resgatada", cls: "text-rpg-green" };
  if (q.completed) return { label: "Concluída", cls: "text-rpg-gold-light" };
  if (q.progress > 0) return { label: "Em progresso", cls: "text-rpg-blue" };
  return { label: "Disponível", cls: "text-rpg-muted" };
}

/** Carta colecionável de quest. */
export function QuestCard({ quest: q, onClaim, onReroll, busy, expired }: { quest: Quest; onClaim: (q: Quest) => void; onReroll?: (q: Quest) => void; busy?: boolean; expired?: boolean }) {
  const r = rarityOf(q.xpReward);
  const st = expired && !q.claimed ? { label: "Expirada", cls: "text-rpg-red" } : questState(q);
  return (
    <article className={clsx("flex h-full flex-col border-2 bg-rpg-panel p-3", q.completed && !q.claimed ? "border-rpg-gold shadow-[0_0_18px_-6px_rgb(var(--rpg-gold)/0.8)]" : "border-rpg-border")} style={R}>
      <div className="flex items-start gap-2">
        <ScrollText size={18} className="mt-0.5 shrink-0 text-rpg-gold" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-rpg-text">{q.title}</p>
          <p className="text-[11px] text-rpg-muted">{q.module}</p>
        </div>
        <span className={clsx("shrink-0 border px-1 font-pixel text-[9px] uppercase", r.cls)} style={{ borderRadius: 2 }}>
          {r.label}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <RPGProgressBar className="flex-1" value={Math.min(q.progress, q.target)} max={q.target} tone={q.completed ? "green" : "purple"} label={`Progresso de ${q.title}`} showLabel={false} />
        <span className="shrink-0 font-pixel text-[10px] text-rpg-text">
          {Math.min(q.progress, q.target)}/{q.target}
          {q.unit ? ` ${q.unit}` : ""}
        </span>
      </div>
      <div className="mt-auto flex items-center gap-1.5 pt-2">
        <span className={clsx("min-w-0 flex-1 font-pixel text-[10px] uppercase", st.cls)}>{st.label}</span>
        <span className="font-pixel text-[11px] text-rpg-gold-light">+{q.xpReward} XP</span>
        {onReroll && q.canReroll && !q.completed && (
          <button type="button" className="flex h-9 w-9 items-center justify-center text-rpg-muted hover:text-rpg-gold-light" aria-label={`Trocar ${q.title}`} title="Trocar (1 por dia)" onClick={() => onReroll(q)}>
            <Shuffle size={14} />
          </button>
        )}
        {q.completed && !q.claimed && (
          <button type="button" className="rpg-btn rpg-btn-gold px-2 py-1 text-xs" disabled={busy} onClick={() => onClaim(q)}>
            Resgatar
          </button>
        )}
      </div>
    </article>
  );
}

/** Baú de recompensas: resgata em sequência as quests concluídas pela rota oficial (idempotente). */
export function RewardChest({ hub, onClaimAll, busy }: { hub: GuildHub; onClaimAll: () => void; busy: boolean }) {
  const n = hub.chest.claimable.length;
  return (
    <KitSection title="Baú de recompensas" icon={<Gift size={16} />} tone="gold">
      <div className="flex items-center gap-3">
        <img src={`${ART}/chest.webp`} alt="" aria-hidden className={clsx("pixelated h-20 w-20 shrink-0 object-contain", n > 0 && "motion-safe:animate-bounce")} />
        <div className="min-w-0 flex-1">
          <p className="font-rpg text-xl font-bold text-rpg-gold-light">{n > 0 ? `${n} recompensa(s)` : "Baú vazio"}</p>
          <p className="text-[11.5px] text-rpg-muted">{n > 0 ? `${hub.chest.xp} XP prontos para resgate${hub.chest.bonusReady ? " + bônus diário" : ""}.` : "Conclua quests para enchê-lo."}</p>
          {n > 0 && (
            <button type="button" className="rpg-btn rpg-btn-gold mt-1.5 text-sm" disabled={busy} onClick={onClaimAll}>
              Abrir o baú
            </button>
          )}
        </div>
      </div>
    </KitSection>
  );
}

export function GuildCombo({ hub }: { hub: GuildHub }) {
  return (
    <KitSection title="Combo de quests" icon={<Flame size={16} />}>
      <p className="font-rpg text-3xl font-bold text-rpg-orange">
        {hub.combo.current} <span className="text-sm font-normal text-rpg-muted">dia(s)</span>
      </p>
      <p className="text-[11.5px] text-rpg-muted">
        Recorde: {hub.combo.best} · {hub.claimedTotal} quest(s) resgatada(s) no total. Conta dias seguidos com pelo menos uma diária resgatada; o bônus do dia segue a regra das diárias (sem multiplicador extra).
      </p>
    </KitSection>
  );
}

export function SmartNotices({ hub }: { hub: GuildHub }) {
  const n = hub.notices;
  const empty = n.notifications.length + n.deadlines.length + n.events.length + n.achievements.length === 0 && n.reviewsDue === 0;
  return (
    <KitSection title="Avisos inteligentes" icon={<Megaphone size={16} />}>
      {empty && <p className="text-sm text-rpg-muted">Nenhum aviso agora.</p>}
      <ul className="space-y-1.5 text-sm">
        {n.reviewsDue > 0 && (
          <li className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-rpg-purple" aria-hidden />
            <Link to="/grimorio" className="min-w-0 flex-1 truncate text-rpg-text underline">
              {n.reviewsDue} revisão(ões) pendentes no Grimório
            </Link>
          </li>
        )}
        {n.deadlines.map((d, i) => (
          <li key={`d${i}`} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-rpg-orange" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-rpg-text">
              {d.kind}: {d.title}
            </span>
            <span className="shrink-0 font-pixel text-[10px] text-rpg-muted">{dayBr(d.date)}</span>
          </li>
        ))}
        {n.events.map((e) => (
          <li key={e.id} className="flex items-center gap-2">
            <CalendarDays size={12} className="text-rpg-blue" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-rpg-text">{e.title}</span>
            <span className="shrink-0 font-pixel text-[10px] text-rpg-muted">
              {dayBr(e.startsAt.slice(0, 10))}
              {!e.allDay && e.startsAt.length > 10 ? ` ${e.startsAt.slice(11, 16)}` : ""}
            </span>
          </li>
        ))}
        {n.achievements.map((a, i) => (
          <li key={`a${i}`} className="flex items-center gap-2">
            <Trophy size={12} className="text-rpg-gold" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-rpg-text">Conquista: {a.title}</span>
            <span className="shrink-0 text-[10px] text-rpg-muted">{rel(a.unlockedAt)}</span>
          </li>
        ))}
        {n.notifications.map((x) => (
          <li key={x.id} className="flex items-center gap-2">
            <Bell size={12} className="text-rpg-muted" aria-hidden />
            {x.url ? (
              <Link to={x.url} className="min-w-0 flex-1 truncate text-rpg-text underline" title={x.body ?? undefined}>
                {x.title}
              </Link>
            ) : (
              <span className="min-w-0 flex-1 truncate text-rpg-text">{x.title}</span>
            )}
            <span className="shrink-0 text-[10px] text-rpg-muted">{rel(x.createdAt)}</span>
          </li>
        ))}
      </ul>
    </KitSection>
  );
}

export function GuildEvents({ hub }: { hub: GuildHub }) {
  return (
    <KitSection title="Eventos da guilda" icon={<PartyPopper size={16} />}>
      <MissionList missions={hub.events} format={(m) => `${m.current}/${m.target} ${(m as GuildHub["events"][number]).unit}`} empty="Sem eventos ativos nesta semana." />
      <p className="mt-2 text-[10.5px] text-rpg-muted">Desafios da semana medidos pelos seus próprios registros — sem participantes nem ranking social.</p>
    </KitSection>
  );
}

export function QuestHistory({ hub }: { hub: GuildHub }) {
  const [all, setAll] = useState(false);
  return (
    <KitSection title="Histórico" icon={<History size={16} />}>
      {hub.history.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nenhuma quest resgatada ainda.</p>
      ) : (
        <>
          <ul className="space-y-1 text-sm">
            {hub.history.slice(0, all ? 20 : 6).map((h, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className={clsx("font-pixel text-[9px] uppercase", h.period === "weekly" ? "text-rpg-purple" : "text-rpg-blue")}>{h.period === "weekly" ? "Sem" : "Dia"}</span>
                <span className="min-w-0 flex-1 truncate text-rpg-text">{h.title}</span>
                <span className="shrink-0 font-pixel text-[10px] text-rpg-gold-light">+{h.xp}</span>
                <span className="shrink-0 text-[10px] text-rpg-muted">{rel(h.claimedAt)}</span>
              </li>
            ))}
          </ul>
          {hub.history.length > 6 && (
            <button type="button" className="mt-1 text-xs text-rpg-gold-light underline" onClick={() => setAll((v) => !v)}>
              {all ? "Ver menos" : "Ver mais"}
            </button>
          )}
        </>
      )}
    </KitSection>
  );
}

export function GuildHerald() {
  return (
    <div className="space-y-3">
      <AdvisorPanel module="quests" title="Arauto da Guilda" avatar={`${ART}/herald.webp`} />
      <AutomationsPanel module="quests" title="Automações do quadro" intro="Lembrete diário de quests abertas e recompensas no baú." />
    </div>
  );
}
