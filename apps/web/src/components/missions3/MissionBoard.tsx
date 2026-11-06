import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import clsx from "clsx";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Ban,
  CalendarClock,
  Check,
  Clock,
  Coins,
  FileSignature,
  FolderKanban,
  Hammer,
  ListChecks,
  MoreHorizontal,
  PackageOpen,
  Pencil,
  Plus,
  Sparkles,
  Target,
  Timer,
} from "lucide-react";
import { Tag } from "@/components/forge3/ForgeShared";
import { BOARD_COLUMNS, fmtMin, type MissionsOverview } from "@/services/missions3Service";
import { DIFFICULTY_TONE, DONE, PRIORITY_TONE, boardOrderOf, difficultyLabel, fmtDay, isOverdue, type BoardTask } from "./MissionsShared";

export type SortMode = "manual" | "prazo" | "prioridade";
type Reward = { xp: number; coins: number; fromHabit?: boolean } | null;

export interface BoardHandlers {
  onOpen: (t: BoardTask) => void;
  onToggleDone: (t: BoardTask) => void;
  /** Move/reordena: beforeId = cartão que fica logo abaixo; afterId = cartão logo acima. */
  onMove: (t: BoardTask, status: string, beforeId: string | null, afterId: string | null) => void;
  onAdd: (status: string) => void;
  onArchive: (t: BoardTask) => void;
  /** null quando a automação "Foco integrado" está desligada. */
  onFocus: ((t: BoardTask) => void) | null;
  /** null quando a automação "Quebra de etapas" está desligada. */
  onBreakdown: ((t: BoardTask) => void) | null;
}

const TONE_BORDER: Record<string, string> = {
  muted: "border-t-rpg-border",
  blue: "border-t-rpg-blue",
  purple: "border-t-rpg-purple",
  orange: "border-t-rpg-orange",
  green: "border-t-rpg-green",
};
const TONE_TEXT: Record<string, string> = {
  muted: "text-rpg-text",
  blue: "text-rpg-blue",
  purple: "text-rpg-purple",
  orange: "text-rpg-orange",
  green: "text-rpg-green",
};
const PRIORITY_RANK: Record<string, number> = { Alta: 0, Média: 1, Baixa: 2 };
const DONE_LIMIT = 8;

export function sortColumn(items: BoardTask[], mode: SortMode, status: string) {
  const list = [...items];
  if (status === DONE) return list.sort((a, b) => (b.completed_at ?? b.updated_at).localeCompare(a.completed_at ?? a.updated_at));
  if (mode === "manual") return list.sort((a, b) => boardOrderOf(a) - boardOrderOf(b));
  if (mode === "prioridade") return list.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3) || (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  return list.sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3));
}

export function MissionBoard({
  tasks,
  today,
  cards,
  names,
  rewardOf,
  sort,
  breakdownMin,
  h,
}: {
  tasks: BoardTask[];
  today: string;
  cards: MissionsOverview["cards"];
  names: { project: Map<string, string>; goal: Map<string, string>; contract: Map<string, string> };
  rewardOf: (t: BoardTask) => Reward;
  sort: SortMode;
  breakdownMin: number;
  h: BoardHandlers;
}) {
  const [mobileCol, setMobileCol] = useState<string>("A Fazer");
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ status: string; index: number } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [allDone, setAllDone] = useState(false);

  const columns = useMemo(
    () =>
      BOARD_COLUMNS.map((c) => {
        const items = sortColumn(
          tasks.filter((t) => t.status === c.status),
          sort,
          c.status,
        );
        return { ...c, total: items.length, items: c.status === DONE && !allDone ? items.slice(0, DONE_LIMIT) : items };
      }),
    [tasks, sort, allDone],
  );

  // Fecha o menu do cartão com Esc ou clique fora.
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof MouseEvent && (e.target as HTMLElement).closest?.("[data-card-menu]")) return;
      setMenu(null);
    };
    window.addEventListener("keydown", close);
    window.addEventListener("mousedown", close);
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("mousedown", close);
    };
  }, [menu]);

  const neighbors = (status: string, index: number, movingId: string) => {
    const col = columns.find((c) => c.status === status);
    const rest = (col?.items ?? []).filter((t) => t.id !== movingId);
    if (sort !== "manual" || status === DONE) return { beforeId: null, afterId: null };
    return { beforeId: rest[index]?.id ?? null, afterId: rest[index - 1]?.id ?? null };
  };

  const finishDrop = (status: string) => {
    const t = tasks.find((x) => x.id === dragId);
    const index = drop?.status === status ? drop.index : Number.MAX_SAFE_INTEGER;
    setDragId(null);
    setDrop(null);
    if (!t) return;
    const col = columns.find((c) => c.status === status);
    const rest = (col?.items ?? []).filter((x) => x.id !== t.id);
    const idx = Math.min(index, rest.length);
    const { beforeId, afterId } = neighbors(status, idx, t.id);
    // Mesma coluna: sem ordem manual não há o que mudar; com ordem manual, só se a posição mudou.
    if (t.status === status && (sort !== "manual" || status === DONE || idx === (col?.items ?? []).findIndex((x) => x.id === t.id))) return;
    h.onMove(t, status, beforeId, afterId);
  };

  const moveBy = (t: BoardTask, delta: -1 | 1) => {
    const col = columns.find((c) => c.status === t.status);
    if (!col) return;
    const i = col.items.findIndex((x) => x.id === t.id);
    const target = i + delta;
    if (target < 0 || target >= col.items.length) return;
    const rest = col.items.filter((x) => x.id !== t.id);
    h.onMove(t, t.status, rest[target]?.id ?? null, rest[target - 1]?.id ?? null);
  };

  return (
    <div>
      {/* Celular: uma coluna por vez, escolhida pelas abas. */}
      <div className="mb-2 flex gap-1 overflow-x-auto pb-1 md:hidden" role="tablist" aria-label="Colunas do quadro">
        {columns.map((c) => (
          <button
            key={c.status}
            role="tab"
            aria-selected={mobileCol === c.status}
            onClick={() => setMobileCol(c.status)}
            className={clsx("shrink-0 border px-2.5 py-1.5 text-xs font-semibold", mobileCol === c.status ? "border-rpg-gold bg-rpg-gold/15 text-rpg-gold-light" : "border-rpg-border bg-rpg-bg-2 text-rpg-muted")}
            style={{ borderRadius: 3 }}
          >
            {c.label} <span className="tabular-nums">({c.total})</span>
          </button>
        ))}
      </div>
      <div className="-mx-1 overflow-x-auto px-1 pb-2">
        <div className="grid gap-3 md:min-w-[1060px] md:grid-cols-5">
          {columns.map((c) => {
            const dropping = dragId && drop?.status === c.status;
            return (
              <section
                key={c.status}
                aria-label={`${c.label}: ${c.total} missão(ões)`}
                className={clsx("rpg-panel flex min-w-0 flex-col border-t-4 p-2", TONE_BORDER[c.tone], mobileCol === c.status ? "flex" : "hidden md:flex", dropping && "ring-2 ring-rpg-gold/70")}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  if (drop?.status !== c.status) setDrop({ status: c.status, index: c.items.length });
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  finishDrop(c.status);
                }}
              >
                <header className="mb-1.5 flex items-center gap-2 px-1">
                  <h3 className={clsx("font-pixel text-[12px] uppercase tracking-wider", TONE_TEXT[c.tone])}>{c.label}</h3>
                  <Tag tone="muted">{c.total}</Tag>
                  <button onClick={() => h.onAdd(c.status)} className="ml-auto text-rpg-muted hover:text-rpg-gold" aria-label={`Nova missão em ${c.label}`} title="Nova missão nesta coluna">
                    <Plus size={15} />
                  </button>
                </header>
                <p className="mb-2 px-1 text-[11px] text-rpg-muted">{c.hint}</p>
                <ul className="flex min-h-[120px] flex-1 flex-col gap-2">
                  {c.items.map((t, i) => (
                    <li
                      key={t.id}
                      onDragOver={(e: DragEvent<HTMLLIElement>) => {
                        if (!dragId) return;
                        e.preventDefault();
                        e.stopPropagation();
                        const r = e.currentTarget.getBoundingClientRect();
                        const index = e.clientY < r.top + r.height / 2 ? i : i + 1;
                        if (drop?.status !== c.status || drop.index !== index) setDrop({ status: c.status, index });
                      }}
                      className="relative"
                    >
                      {dropping && sort === "manual" && c.status !== DONE && drop.index === i && <span className="absolute -top-1.5 left-0 right-0 h-0.5 bg-rpg-gold" aria-hidden />}
                      <MissionCard
                        t={t}
                        today={today}
                        card={cards[t.id]}
                        names={names}
                        reward={rewardOf(t)}
                        dragging={dragId === t.id}
                        onDragStart={() => setDragId(t.id)}
                        onDragEnd={() => {
                          setDragId(null);
                          setDrop(null);
                        }}
                        menuOpen={menu === t.id}
                        onMenu={() => setMenu((m) => (m === t.id ? null : t.id))}
                        canUp={sort === "manual" && t.status !== DONE && i > 0}
                        canDown={sort === "manual" && t.status !== DONE && i < c.items.length - 1}
                        onUp={() => moveBy(t, -1)}
                        onDown={() => moveBy(t, 1)}
                        breakdownMin={breakdownMin}
                        h={h}
                      />
                      {dropping && sort === "manual" && c.status !== DONE && drop.index === i + 1 && i === c.items.length - 1 && <span className="absolute -bottom-1.5 left-0 right-0 h-0.5 bg-rpg-gold" aria-hidden />}
                    </li>
                  ))}
                  {c.items.length === 0 && (
                    <li className="flex flex-1 flex-col items-center justify-center gap-1.5 border-2 border-dashed border-rpg-border/80 bg-rpg-bg-2/40 p-3 text-center text-[11px] text-rpg-muted" style={{ borderRadius: 3 }}>
                      <PackageOpen size={22} className="text-rpg-gold/70" aria-hidden />
                      Solte uma missão aqui ou crie com o conselheiro.
                    </li>
                  )}
                </ul>
                {c.status === DONE && c.total > DONE_LIMIT && (
                  <button onClick={() => setAllDone((v) => !v)} className="mt-2 w-full border border-rpg-green/50 bg-rpg-green/10 px-2 py-1.5 text-xs font-semibold text-rpg-green" style={{ borderRadius: 3 }}>
                    {allDone ? "Mostrar só as recentes" : `Ver todas (${c.total})`}
                  </button>
                )}
                {c.status !== DONE && (
                  <button onClick={() => h.onAdd(c.status)} className="mt-2 flex w-full items-center justify-center gap-1.5 border border-rpg-border bg-rpg-bg-2/70 px-2 py-1.5 text-xs font-semibold text-rpg-text hover:border-rpg-gold hover:text-rpg-gold-light" style={{ borderRadius: 3 }}>
                    <Plus size={13} /> Adicionar
                  </button>
                )}
              </section>
            );
          })}
        </div>
      </div>
      <p className="mt-1 hidden text-[11px] text-rpg-muted md:block">
        Arraste os cartões entre colunas{sort === "manual" ? " e dentro delas para reordenar" : ""}. Mover para “Concluídas” paga XP e moedas pelo motor oficial (uma única vez por missão).
      </p>
    </div>
  );
}

function MissionCard({
  t,
  today,
  card,
  names,
  reward,
  dragging,
  onDragStart,
  onDragEnd,
  menuOpen,
  onMenu,
  canUp,
  canDown,
  onUp,
  onDown,
  breakdownMin,
  h,
}: {
  t: BoardTask;
  today: string;
  card: MissionsOverview["cards"][string] | undefined;
  names: { project: Map<string, string>; goal: Map<string, string>; contract: Map<string, string> };
  reward: Reward;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  menuOpen: boolean;
  onMenu: () => void;
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
  breakdownMin: number;
  h: BoardHandlers;
}) {
  const done = t.status === DONE;
  const late = isOverdue(t, today);
  const subs = card?.subtasks ?? null;
  const blocked = (card?.blockedBy ?? []).filter((b) => !b.done);
  const diff = difficultyLabel(t.difficulty);
  const links = [
    t.project_id && names.project.get(t.project_id) ? { icon: <FolderKanban size={11} />, label: names.project.get(t.project_id)!, kind: "Projeto" } : null,
    t.goal_id && names.goal.get(t.goal_id) ? { icon: <Target size={11} />, label: names.goal.get(t.goal_id)!, kind: "Meta" } : null,
    t.contract_id && names.contract.get(t.contract_id) ? { icon: <FileSignature size={11} />, label: names.contract.get(t.contract_id)!, kind: "Contrato" } : null,
  ].filter(Boolean) as Array<{ icon: JSX.Element; label: string; kind: string }>;
  const offerBreakdown = !!h.onBreakdown && !done && (t.estimate_minutes ?? 0) >= breakdownMin && !subs;
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", t.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={clsx(
        "group relative cursor-grab border bg-rpg-bg-2/90 p-2.5 transition-[border-color,opacity] active:cursor-grabbing",
        done ? "border-rpg-green/40" : late ? "border-rpg-red/60" : "border-rpg-border hover:border-rpg-gold/60",
        dragging && "opacity-40",
      )}
      style={{ borderRadius: 3 }}
    >
      <div className="flex items-start gap-2">
        <button
          onClick={() => h.onToggleDone(t)}
          aria-label={done ? `Reabrir "${t.title}"` : `Concluir "${t.title}"`}
          title={done ? "Reabrir" : "Concluir missão"}
          className={clsx("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2", done ? "border-rpg-green bg-rpg-green text-rpg-bg" : "border-rpg-border text-transparent hover:border-rpg-green hover:text-rpg-green")}
        >
          <Check size={12} strokeWidth={3} />
        </button>
        <button onClick={() => h.onOpen(t)} className={clsx("min-w-0 flex-1 text-left text-[13px] font-semibold leading-snug", done ? "text-rpg-muted line-through" : "text-rpg-text hover:text-rpg-gold-light")}>
          <span className="line-clamp-3">{t.title}</span>
        </button>
        <div className="relative" data-card-menu>
          <button ref={btnRef} onClick={onMenu} aria-label={`Ações de "${t.title}"`} aria-expanded={menuOpen} className="-mr-1 p-0.5 text-rpg-muted hover:text-rpg-gold">
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 top-6 z-30 w-52 border-2 border-rpg-gold/70 bg-rpg-panel p-1 shadow-xl" style={{ borderRadius: 4 }}>
              <MenuItem icon={<Pencil size={13} />} onClick={() => (onMenu(), h.onOpen(t))}>
                Editar detalhes
              </MenuItem>
              {canUp && (
                <MenuItem icon={<ArrowUp size={13} />} onClick={() => (onMenu(), onUp())}>
                  Subir na coluna
                </MenuItem>
              )}
              {canDown && (
                <MenuItem icon={<ArrowDown size={13} />} onClick={() => (onMenu(), onDown())}>
                  Descer na coluna
                </MenuItem>
              )}
              <p className="px-2 pb-0.5 pt-1.5 text-[10px] uppercase tracking-wide text-rpg-muted">Mover para</p>
              {BOARD_COLUMNS.filter((c) => c.status !== t.status).map((c) => (
                <MenuItem key={c.status} icon={<span className="w-[13px]" />} onClick={() => (onMenu(), h.onMove(t, c.status, null, null))}>
                  {c.label}
                </MenuItem>
              ))}
              {h.onFocus && !done && (
                <MenuItem icon={<Timer size={13} />} onClick={() => (onMenu(), h.onFocus!(t))}>
                  Iniciar foco
                </MenuItem>
              )}
              {h.onBreakdown && !done && (
                <MenuItem icon={<Hammer size={13} />} onClick={() => (onMenu(), h.onBreakdown!(t))}>
                  Quebrar em etapas
                </MenuItem>
              )}
              {done && (
                <MenuItem icon={<Archive size={13} />} onClick={() => (onMenu(), h.onArchive(t))}>
                  Arquivar
                </MenuItem>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-7">
        <Tag tone={PRIORITY_TONE[t.priority] ?? "muted"}>{t.priority}</Tag>
        {diff && <Tag tone={DIFFICULTY_TONE[t.difficulty ?? ""] ?? "muted"}>{diff}</Tag>}
        {blocked.length > 0 && (
          <span title={`Depende de: ${blocked.map((b) => b.title).join(", ")}`}>
            <Tag tone="red">
              <Ban size={10} className="mr-0.5 inline" aria-hidden />
              Bloqueada
            </Tag>
          </span>
        )}
      </div>
      {links.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 pl-7 text-[11px] text-rpg-muted">
          {links.map((l) => (
            <li key={l.kind} className="flex min-w-0 items-center gap-1" title={`${l.kind}: ${l.label}`}>
              <span className="shrink-0 text-rpg-gold/80" aria-hidden>
                {l.icon}
              </span>
              <span className="truncate">{l.label}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 pl-7 text-[11px] text-rpg-muted">
        {t.due_date && (
          <span className={clsx("flex items-center gap-1", late && "font-semibold text-rpg-red")} title="Prazo">
            <CalendarClock size={11} aria-hidden /> {late ? "Atrasada · " : ""}
            {fmtDay(t.due_date)}
          </span>
        )}
        {t.estimate_minutes ? (
          <span className="flex items-center gap-1" title="Tempo estimado">
            <Clock size={11} aria-hidden /> {fmtMin(t.estimate_minutes)}
          </span>
        ) : null}
        {subs && (
          <span className="flex items-center gap-1" title="Etapas concluídas">
            <ListChecks size={11} aria-hidden /> {subs.done}/{subs.total}
          </span>
        )}
      </div>
      {subs && subs.total > 0 && (
        <div className="ml-7 mt-1.5 h-1.5 overflow-hidden border border-rpg-border bg-rpg-bg" style={{ borderRadius: 2 }} role="progressbar" aria-valuenow={Math.round((subs.done / subs.total) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso das etapas">
          <div className="h-full bg-rpg-green" style={{ width: `${(subs.done / subs.total) * 100}%` }} />
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-7">
        {done ? (
          card?.xpEarned ? (
            <Tag tone="green">+{card.xpEarned} XP ganhos</Tag>
          ) : (
            <span className="text-[10px] text-rpg-muted">Sem XP registrado</span>
          )
        ) : reward ? (
          <>
            <Tag tone="purple">+{reward.xp} XP</Tag>
            <Tag tone="gold">
              <Coins size={10} className="mr-0.5 inline" aria-hidden />+{reward.coins}
            </Tag>
            {reward.fromHabit && <span className="text-[10px] text-rpg-muted">pago pelo hábito</span>}
          </>
        ) : null}
        <span className="ml-auto flex items-center gap-1">
          {h.onFocus && !done && (
            <button onClick={() => h.onFocus!(t)} className="border border-rpg-purple/50 p-1 text-rpg-purple hover:bg-rpg-purple/15" style={{ borderRadius: 3 }} aria-label={`Iniciar foco em "${t.title}"`} title="Iniciar foco (registra o tempo nesta missão)">
              <Timer size={12} />
            </button>
          )}
          {done && (
            <button onClick={() => h.onArchive(t)} className="border border-rpg-border p-1 text-rpg-muted hover:text-rpg-gold" style={{ borderRadius: 3 }} aria-label={`Arquivar "${t.title}"`} title="Arquivar">
              <Archive size={12} />
            </button>
          )}
        </span>
      </div>
      {offerBreakdown && (
        <button onClick={() => h.onBreakdown!(t)} className="ml-7 mt-2 flex items-center gap-1 text-[11px] font-semibold text-rpg-cyan hover:underline">
          <Sparkles size={11} aria-hidden /> Missão longa: quebrar em etapas?
        </button>
      )}
    </article>
  );
}

function MenuItem({ icon, onClick, children }: { icon: JSX.Element; onClick: () => void; children: string }) {
  return (
    <button role="menuitem" onClick={onClick} className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs text-rpg-text hover:bg-rpg-gold/15 hover:text-rpg-gold-light" style={{ borderRadius: 2 }}>
      <span className="shrink-0 text-rpg-muted" aria-hidden>
        {icon}
      </span>
      {children}
    </button>
  );
}
