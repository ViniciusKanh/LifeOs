import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Bot, Check, CheckCircle2, Loader2, Play, Sprout, Trash2 } from "lucide-react";
import { RPGBadge, RPGButton, RPGProgressBar, RPGSwitch } from "@/components/rpg";
import { useAgentRuns, useDecorItems } from "@/hooks/useLivingWorld";
import { livingWorldService, type WorldAgent, type WorldHabit, type WorldMission, type WorldSettings, type WorldState } from "@/services/livingWorldService";
import { itemArtUrl } from "@/utils/inventoryDisplay";
import { agentState, elapsedLabel, EVENT_CATEGORIES, EventRow } from "./WorldPanels";

const R = { borderRadius: 4 };
const STAGE_NAME = ["Broto", "Muda", "Planta", "Arbusto florido", "Árvore florida"];
const KIND_LABEL = { dado: "Dado real", inferencia: "Inferência", sugestao: "Sugestão" } as const;

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border border-rpg-border/70 bg-rpg-bg-2/60 p-2" style={R}>
      <p className="font-pixel text-[9px] uppercase text-rpg-muted">{label}</p>
      <p className="truncate text-sm font-semibold text-rpg-text">{value}</p>
    </div>
  );
}

const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${m} min`);

/* ───────────── Missões (Guilda) ───────────── */

export function MissionList({ missions, busyId, onStart, onComplete }: { missions: WorldMission[]; busyId: string | null; onStart: (m: WorldMission) => void; onComplete: (m: WorldMission) => void }) {
  if (!missions.length) return <p className="text-sm text-rpg-muted">Nenhuma missão aqui.</p>;
  return (
    <ul className="space-y-1.5">
      {missions.map((m) => (
        <li key={m.id} className="border border-rpg-border bg-rpg-bg-2/60 p-2" style={R}>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Link to={`/tarefas?task=${m.id}`} className="block truncate text-sm font-semibold text-rpg-text hover:underline">
                {m.title}
              </Link>
              <p className="text-[11px] text-rpg-muted">
                {m.status} · prioridade {m.priority}
                {m.difficulty ? ` · ${m.difficulty}` : ""}
                {m.dueDate ? ` · prazo ${new Date(`${m.dueDate}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}
              </p>
            </div>
            {m.overdue && <RPGBadge tone="red">atrasada</RPGBadge>}
          </div>
          {m.progress && <RPGProgressBar className="mt-1" label="Etapas" showLabel={false} value={m.progress.done} max={m.progress.total} tone="purple" />}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {m.reward && <span className="text-[11px] text-rpg-gold-light">+{m.reward.xp} XP · +{m.reward.coins} moedas</span>}
            <span className="flex-1" />
            {m.status !== "Em Andamento" && (
              <RPGButton variant="secondary" className="min-h-[30px] px-2 text-xs" disabled={busyId === m.id} onClick={() => onStart(m)}>
                <Play size={11} aria-hidden /> Iniciar
              </RPGButton>
            )}
            <RPGButton variant="success" className="min-h-[30px] px-2 text-xs" disabled={busyId === m.id} onClick={() => onComplete(m)}>
              {busyId === m.id ? <Loader2 size={11} className="animate-spin" aria-hidden /> : <Check size={11} aria-hidden />} Concluir
            </RPGButton>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function GuildContent({ world, busyId, onStart, onComplete, initialTab = "andamento" }: { world: WorldState; busyId: string | null; onStart: (m: WorldMission) => void; onComplete: (m: WorldMission) => void; initialTab?: "andamento" | "disponiveis" | "concluidas" }) {
  const [tab, setTab] = useState(initialTab);
  const inProgress = world.missions.open.filter((m) => m.status === "Em Andamento");
  const available = world.missions.open.filter((m) => m.status !== "Em Andamento");
  const tabs: Array<[typeof tab, string, number]> = [
    ["andamento", "Em andamento", inProgress.length],
    ["disponiveis", "Disponíveis", available.length],
    ["concluidas", "Concluídas hoje", world.missions.doneToday.length],
  ];
  return (
    <div className="space-y-2">
      <div className="flex gap-1" role="tablist" aria-label="Missões">
        {tabs.map(([k, l, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)} className={clsx("flex-1 border px-2 py-1.5 text-xs font-semibold", tab === k ? "border-rpg-gold bg-rpg-gold/10 text-rpg-gold-light" : "border-rpg-border text-rpg-muted")} style={R}>
            {l} ({n})
          </button>
        ))}
      </div>
      {tab === "andamento" && <MissionList missions={inProgress} busyId={busyId} onStart={onStart} onComplete={onComplete} />}
      {tab === "disponiveis" && <MissionList missions={available} busyId={busyId} onStart={onStart} onComplete={onComplete} />}
      {tab === "concluidas" &&
        (world.missions.doneToday.length ? (
          <ul className="space-y-1">
            {world.missions.doneToday.map((m) => (
              <li key={m.id} className="flex items-center gap-2 text-sm text-rpg-text">
                <CheckCircle2 size={14} className="text-rpg-green" aria-hidden /> <span className="min-w-0 flex-1 truncate">{m.title}</span>
                {m.reward && <span className="text-[11px] text-rpg-gold-light">+{m.reward.xp} XP</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-rpg-muted">Nenhuma missão concluída hoje ainda.</p>
        ))}
      <p className="text-[10px] text-rpg-muted">XP e moedas são pagos pelo sistema de missões do LifeOS ao concluir — uma única vez.</p>
    </div>
  );
}

/* ───────────── Jardim ───────────── */

export function HabitRow({ h, busy, onCheck }: { h: WorldHabit; busy: boolean; onCheck: (h: WorldHabit) => void }) {
  return (
    <li className="flex items-center gap-2 border border-rpg-border bg-rpg-bg-2/60 p-2" style={R}>
      <Sprout size={18} className={h.doneToday ? "text-rpg-pink" : "text-rpg-green"} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-rpg-text">{h.name}</p>
        <p className="text-[11px] text-rpg-muted">
          {STAGE_NAME[h.stage]} · sequência {h.streak} dia(s) · hoje {h.todayCount}/{h.target}
          {h.pendingToday ? " · pendente hoje" : ""}
        </p>
      </div>
      {h.doneToday ? (
        <RPGBadge tone="green">feito</RPGBadge>
      ) : (
        <RPGButton variant="success" className="min-h-[30px] px-2 text-xs" disabled={busy} onClick={() => onCheck(h)}>
          {busy ? <Loader2 size={11} className="animate-spin" aria-hidden /> : <Check size={11} aria-hidden />} Registrar
        </RPGButton>
      )}
    </li>
  );
}

export function GardenContent({ habits, busyId, onCheck }: { habits: WorldHabit[]; busyId: string | null; onCheck: (h: WorldHabit) => void }) {
  return (
    <div className="space-y-2">
      {habits.length ? (
        <ul className="space-y-1.5">
          {habits.map((h) => (
            <HabitRow key={h.id} h={h} busy={busyId === h.id} onCheck={onCheck} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-rpg-muted">
          Nenhum hábito ativo. <Link className="text-rpg-blue hover:underline" to="/habitos">Criar em Hábitos</Link>
        </p>
      )}
      <p className="text-[10px] text-rpg-muted">
        Regra das plantas: o estágio cresce com a sequência (1, 3, 7 e 21 dias); concluído hoje = flores. O “!” só aparece em hábito diário ou do dia marcado ainda não feito — hábitos semanais/mensais nunca ficam “pendentes”.
      </p>
    </div>
  );
}

/* ───────────── Agente ───────────── */

export function AgentContent({ agent, pending, onRun }: { agent: WorldAgent; pending: boolean; onRun: (q: string | null) => void }) {
  const [q, setQ] = useState("");
  const runs = useAgentRuns(agent.key);
  const st = agentState(agent, pending);
  const last = agent.lastRun;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center border-2" style={{ ...R, borderColor: agent.color, color: agent.color }}>
          <Bot size={24} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-rpg-text">{agent.specialty}</p>
          <p className={clsx("text-xs", st.tone === "red" ? "text-rpg-red" : st.tone === "blue" ? "text-rpg-blue" : "text-rpg-muted")}>
            {st.label} · {agent.completedRuns} execução(ões) concluída(s)
          </p>
        </div>
      </div>
      <label className="block text-[11px] text-rpg-muted">
        Instrução (opcional)
        <textarea value={q} onChange={(e) => setQ(e.target.value)} maxLength={400} rows={2} placeholder={agent.defaultQuestion} className="mt-1 w-full border border-rpg-border bg-rpg-bg-2 p-2 text-sm text-rpg-text outline-none focus:border-rpg-gold" style={R} />
      </label>
      <div className="flex flex-wrap gap-2">
        <RPGButton variant="primary" disabled={pending || last?.status === "running"} onClick={() => onRun(q.trim() || null)}>
          {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Play size={14} aria-hidden />} {pending ? "Executando…" : "Executar"}
        </RPGButton>
      </div>
      <p className="text-[10px] text-rpg-muted">O agente só lê os seus dados reais pelo conselheiro do LifeOS e nunca altera nada. A execução é curta e não pode ser interrompida no meio.</p>
      {last && last.status !== "running" && (
        <div className="space-y-1.5 border-2 border-rpg-border bg-rpg-bg-2 p-2" style={R} aria-live="polite">
          <p className="text-[11px] text-rpg-muted">
            Último resultado · {elapsedLabel(last.finishedAt ?? last.startedAt)}
            {last.question ? ` · “${last.question}”` : ""}
          </p>
          {last.status === "failed" ? (
            <p className="text-sm text-rpg-red">{last.error ?? "A execução falhou."} Nenhum resultado foi gerado.</p>
          ) : last.result ? (
            <>
              {last.result.insufficient && <p className="text-xs text-rpg-orange">Há poucos dados para conclusões firmes.</p>}
              <ul className="space-y-1">
                {last.result.items.map((it, i) => (
                  <li key={i} className="text-sm text-rpg-text">
                    <RPGBadge tone={it.kind === "dado" ? "blue" : it.kind === "inferencia" ? "purple" : "gold"}>{KIND_LABEL[it.kind]}</RPGBadge> {it.text}
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-rpg-muted">{last.result.ai ? "Gerado com IA a partir dos seus dados." : "IA indisponível: leitura por regras dos seus dados."} {last.result.disclaimer}</p>
            </>
          ) : null}
        </div>
      )}
      {(runs.data?.length ?? 0) > 1 && (
        <details className="text-xs text-rpg-muted">
          <summary className="cursor-pointer text-rpg-blue">Histórico ({runs.data!.length})</summary>
          <ul className="mt-1 space-y-0.5">
            {runs.data!.map((r) => (
              <li key={r.id}>
                {elapsedLabel(r.startedAt)} · {r.status === "done" ? "concluída" : r.status === "failed" ? "falhou" : "em execução"} · {r.question ?? ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/* ───────────── Ambientes ───────────── */

export function RoomContent({ room, world, children }: { room: string; world: WorldState; children?: ReactNode }) {
  const r = world.rooms;
  if (room === "biblioteca")
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-1.5">
          <Stat label="Estudo hoje" value={hm(r.library.studyMinutesToday)} />
          <Stat label="Páginas hoje" value={r.library.readingPagesToday} />
          <Stat label="Leitura hoje" value={hm(r.library.readingMinutesToday)} />
        </div>
        <p className="text-sm text-rpg-text">{r.library.currentBook ? `Lendo: ${r.library.currentBook.title}${r.library.currentBook.author ? ` — ${r.library.currentBook.author}` : ""}` : "Nenhum livro em leitura."}</p>
        <div className="flex flex-wrap gap-2">
          <Link to="/educacao" className="rpg-btn rpg-btn-secondary text-xs">Educação</Link>
          <Link to="/biblioteca" className="rpg-btn rpg-btn-secondary text-xs">Biblioteca</Link>
        </div>
        {children}
      </div>
    );
  if (room === "academia")
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-1.5">
          <Stat label="Treinos em 7 dias" value={r.gym.week.count} />
          <Stat label="Minutos em 7 dias" value={hm(r.gym.week.minutes)} />
        </div>
        {r.gym.today.length ? (
          <ul className="text-sm text-rpg-text">
            {r.gym.today.map((w, i) => (
              <li key={i}>• {w.name}{w.minutes ? ` (${w.minutes} min)` : ""}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-rpg-muted">Nenhum treino registrado hoje.</p>
        )}
        <Link to="/saude" className="rpg-btn rpg-btn-secondary text-xs">Registrar treino em Saúde</Link>
      </div>
    );
  if (room === "casa")
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-1.5">
          <Stat label="Diário hoje" value={`${r.home.journalWordsToday} palavras`} />
          <Stat label="Água" value={`${(r.home.waterMl / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L`} />
          <Stat label="Sono" value={r.home.sleepMinutes ? hm(r.home.sleepMinutes) : "—"} />
          <Stat label="Humor" value={r.home.mood ? `${r.home.mood.mood}/5 · energia ${r.home.mood.energy}/5` : "—"} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/diario" className="rpg-btn rpg-btn-pink text-xs">Abrir o Diário</Link>
          <Link to="/taverna" className="rpg-btn rpg-btn-secondary text-xs">Taverna</Link>
        </div>
      </div>
    );
  if (room === "praca")
    return (
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <Stat label="Nível" value={world.profile.level} />
        <Stat label="Moedas" value={world.profile.coins.toLocaleString("pt-BR")} />
        <Stat label="Missões abertas" value={world.missions.open.length} />
        <Stat label="Hábitos hoje" value={`${world.habits.filter((h) => h.doneToday).length}/${world.habits.length}`} />
      </div>
    );
  return <>{children}</>;
}

/* ───────────── Decoração ───────────── */

export function SlotContent({ world, slotKey, busy, onPlace, onRemove }: { world: WorldState; slotKey: string; busy: boolean; onPlace: (itemKey: string) => void; onRemove: () => void }) {
  const placed = world.decor.objects.find((o) => o.slotKey === slotKey);
  const usage = (key: string) => world.decor.objects.filter((o) => o.itemKey === key && o.slotKey !== slotKey).length;
  const inv = useDecorItems(true);
  const items = inv.data ?? [];
  return (
    <div className="space-y-2">
      {placed && (
        <div className="flex items-center gap-2 border border-rpg-gold/60 p-2" style={R}>
          <img src={itemArtUrl(placed.art, placed.artSet)} alt="" className="pixelated h-8 w-8 object-contain" />
          <span className="min-w-0 flex-1 text-sm text-rpg-text">Aqui: {placed.name}</span>
          <RPGButton variant="danger" className="min-h-[30px] px-2 text-xs" disabled={busy} onClick={onRemove}>
            <Trash2 size={12} aria-hidden /> Retirar
          </RPGButton>
        </div>
      )}
      {inv.isLoading ? (
        <Loader2 className="animate-spin text-rpg-muted" aria-label="Carregando inventário" />
      ) : inv.isError ? (
        <p className="text-sm text-rpg-red">Não foi possível carregar o inventário.</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-rpg-muted">Seu inventário está vazio. Itens da Loja Arcana, do Tesouro e do Códex aparecem aqui.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {items.map((i) => {
            const free = i.quantity - usage(i.key);
            return (
              <li key={i.key}>
                <button type="button" disabled={busy || free <= 0} onClick={() => onPlace(i.key)} className="flex w-full items-center gap-2 border border-rpg-border bg-rpg-bg-2/60 p-2 text-left hover:border-rpg-gold disabled:opacity-40" style={R}>
                  <img src={itemArtUrl(i.art, i.artSet)} alt="" className="pixelated h-9 w-9 object-contain" />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-rpg-text">{i.name}</span>
                    <span className="block text-[10px] text-rpg-muted">{free > 0 ? `${free} disponível(is)` : "todas no mundo"}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[10px] text-rpg-muted">Decoração é só visual: não consome o item nem dá bônus.</p>
    </div>
  );
}

/* ───────────── Configurações ───────────── */

export function SettingsContent({ settings, onChange }: { settings: WorldSettings; onChange: (p: Partial<WorldSettings>) => void }) {
  const seg = <T extends string | number>(label: string, value: T, opts: Array<[T, string]>, set: (v: T) => void) => (
    <fieldset>
      <legend className="mb-1 text-[11px] text-rpg-muted">{label}</legend>
      <div className="flex gap-1">
        {opts.map(([v, l]) => (
          <button key={String(v)} type="button" aria-pressed={value === v} onClick={() => set(v)} className={clsx("flex-1 border px-2 py-1.5 text-xs font-semibold", value === v ? "border-rpg-gold bg-rpg-gold/10 text-rpg-gold-light" : "border-rpg-border text-rpg-muted")} style={R}>
            {l}
          </button>
        ))}
      </div>
    </fieldset>
  );
  const sw = (label: string, k: "sound" | "autonomous" | "showNames" | "showIndicators" | "showLabels" | "followAvatar", hint?: string) => (
    <div className="flex items-center justify-between gap-3 border-b border-rpg-border/50 py-1.5">
      <span className="text-sm text-rpg-text">
        {label}
        {hint && <span className="block text-[10px] text-rpg-muted">{hint}</span>}
      </span>
      <RPGSwitch checked={settings[k]} onChange={() => onChange({ [k]: !settings[k] })} label={label} />
    </div>
  );
  return (
    <div className="space-y-3">
      {seg("Qualidade gráfica", settings.quality, [["low", "Baixa"], ["medium", "Média"], ["high", "Alta"]], (v) => onChange({ quality: v }))}
      {seg("Efeitos", settings.effects, [[0, "Desligados"], [1, "Leves"], [2, "Completos"]], (v) => onChange({ effects: v }))}
      {seg("Velocidade das animações", settings.animSpeed, [[0.5, "Lenta"], [1, "Normal"], [1.5, "Rápida"]], (v) => onChange({ animSpeed: v }))}
      <div>
        {sw("Modo Vida Autônoma", "autonomous", "Sem atividade real, os personagens passeiam. Só visual: não cria atividades nem recompensas.")}
        {sw("Mostrar placas dos ambientes", "showLabels")}
        {sw("Mostrar nomes", "showNames")}
        {sw("Mostrar indicadores", "showIndicators", "Balões de tarefa e pendências do Jardim.")}
        {sw("Seguir o avatar", "followAvatar")}
        {sw("Sons", "sound", "Bipes curtos ao concluir.")}
      </div>
      <p className="text-[10px] text-rpg-muted">Com “reduzir movimento” ligado no sistema, os efeitos são desligados automaticamente.</p>
    </div>
  );
}

/* ───────────── Avatar ───────────── */

const PALETTES = {
  skin: ["#F2C9A0", "#E8B48A", "#C68A5E", "#8D5A3B", "#5C3A24"],
  hair: ["#1D1410", "#3A2418", "#7A4A22", "#C99A4B", "#B23A3A", "#5A3FA0"],
  shirt: ["#C8423B", "#3E7BD8", "#4FA86A", "#A875F5", "#F1C66A", "#2B2F3A"],
  pants: ["#2B3A67", "#3A3A44", "#5A4030", "#1F4F4A", "#5A2A4A"],
};

export function AvatarContent({ world, onSave, busy }: { world: WorldState; onSave: (p: Partial<WorldState["avatar"]>) => void; busy: boolean }) {
  const a = world.avatar;
  const [draft, setDraft] = useState({ name: a.name, skin: a.skin, hair: a.hair, shirt: a.shirt, pants: a.pants });
  const row = (label: string, k: keyof typeof PALETTES) => (
    <fieldset>
      <legend className="mb-1 text-[11px] text-rpg-muted">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {PALETTES[k].map((c) => (
          <button key={c} type="button" aria-label={`${label} ${c}`} aria-pressed={draft[k] === c} onClick={() => setDraft((d) => ({ ...d, [k]: c }))} className={clsx("h-8 w-8 border-2", draft[k] === c ? "border-rpg-gold" : "border-rpg-border")} style={{ ...R, background: c }} />
        ))}
      </div>
    </fieldset>
  );
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="Nível" value={world.profile.level} />
        <Stat label="XP total" value={world.profile.totalXp.toLocaleString("pt-BR")} />
        <Stat label="Sequência" value={`${world.profile.streakDays} dia(s)`} />
      </div>
      <p className="text-sm text-rpg-text">{world.activity ? `Em atividade: ${world.activity.title}` : "Sem atividade em andamento."}</p>
      <label className="block text-[11px] text-rpg-muted">
        Nome no mundo
        <input value={draft.name} maxLength={40} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} className="mt-1 w-full border border-rpg-border bg-rpg-bg-2 p-2 text-sm text-rpg-text outline-none focus:border-rpg-gold" style={R} />
      </label>
      {row("Pele", "skin")}
      {row("Cabelo", "hair")}
      {row("Roupa", "shirt")}
      {row("Calça", "pants")}
      <RPGButton variant="gold" disabled={busy || !draft.name.trim()} onClick={() => onSave({ ...draft, name: draft.name.trim() })}>
        {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Check size={14} aria-hidden />} Salvar aparência
      </RPGButton>
      <p className="text-[10px] text-rpg-muted">Dica: dê um duplo clique num ponto do mapa para mover o avatar quando não houver missão em andamento.</p>
    </div>
  );
}

/* ───────────── Histórico ───────────── */

export function HistoryContent() {
  const [cat, setCat] = useState<string | null>(null);
  const q = useInfiniteQuery({
    queryKey: ["world", "events", cat],
    queryFn: ({ pageParam }) => livingWorldService.events({ category: cat, before: pageParam, limit: 20 }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextBefore,
  });
  const events = q.data?.pages.flatMap((p) => p.events) ?? [];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Categoria">
        {EVENT_CATEGORIES.map(([k, l]) => (
          <button key={l} type="button" aria-pressed={cat === k} onClick={() => setCat(k)} className={clsx("border px-2 py-1 text-[11px] font-semibold", cat === k ? "border-rpg-gold bg-rpg-gold/10 text-rpg-gold-light" : "border-rpg-border text-rpg-muted")} style={R}>
            {l}
          </button>
        ))}
      </div>
      {q.isLoading ? (
        <Loader2 className="animate-spin text-rpg-muted" aria-label="Carregando" />
      ) : q.isError ? (
        <p className="text-sm text-rpg-red">Não foi possível carregar o histórico.</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nenhum acontecimento nesta categoria.</p>
      ) : (
        <ul className="max-h-[55vh] space-y-1.5 overflow-y-auto pr-1">
          {events.map((e) => (
            <li key={e.id}>
              <EventRow e={e} />
            </li>
          ))}
        </ul>
      )}
      {q.hasNextPage && (
        <RPGButton variant="secondary" className="w-full text-xs" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
          {q.isFetchingNextPage ? "Carregando…" : "Carregar mais"}
        </RPGButton>
      )}
    </div>
  );
}
