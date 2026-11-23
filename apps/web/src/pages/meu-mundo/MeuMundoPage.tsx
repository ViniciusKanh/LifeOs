import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Beer, BookOpen, Briefcase, Castle, Handshake, Landmark, Store, TowerControl, Crosshair, Dumbbell, Eye, EyeOff, Home, Maximize2, Minimize2, Minus, Palette, Plus, RotateCcw, ScrollText, Settings2, Sofa, Sparkles, Sprout } from "lucide-react";
import { RPGButton, RPGToast } from "@/components/rpg";
import { Modal } from "@/components/ui/Modal";
import { TaskModal } from "@/components/tasks/TaskModal";
import { WorldCanvas, type WorldCanvasHandle } from "@/components/living-world/WorldCanvas";
import { ActivityPanel, AgentsPanel, KingdomPanel, placeLabel, QuickActions, RewardBanner, TimelineStrip, WorldHUD, type QuickAction } from "@/components/living-world/WorldPanels";
import { AgentContent, AgentLookContent, AvatarContent, BuildingContent, GardenContent, GuildContent, HabitRow, HistoryContent, RoomContent, SettingsContent, SlotContent } from "@/components/living-world/WorldDrawers";
import type { Selection } from "@/components/living-world/engine/WorldEngine";
import type { BuildingKey, RoomKey } from "@/components/living-world/engine/worldMap";
import type { PlaceKey } from "@/components/living-world/engine/village";
import { useLivingWorld, useWorldActions, useWorldWeather } from "@/hooks/useLivingWorld";
import { usePrefersReducedMotion, useWorldEngineInputs } from "@/components/living-world/useWorldEngineInputs";
import type { WorldWeather } from "@/components/living-world/engine/weather";
import { WeatherChip } from "@/components/living-world/weather/WeatherWidgets";
import { taskService } from "@/services/taskService";
import { habitService } from "@/services/habitService";
import { type WorldHabit, type WorldMission, type WorldSettings } from "@/services/livingWorldService";
import { TASK_STATUSES } from "@/utils/taskStatus";
import { ApiError } from "@/services/api";

type Drawer =
  | { kind: "room"; key: RoomKey; tab?: "andamento" | "disponiveis" | "concluidas" }
  | { kind: "building"; key: BuildingKey }
  | { kind: "agent"; key: string }
  | { kind: "avatar" }
  | { kind: "habit"; id: string }
  | { kind: "slot"; key: string }
  | { kind: "settings" }
  | { kind: "history" }
  | null;

const ROOM_ORDER: RoomKey[] = ["praca", "biblioteca", "escritorio", "guilda", "academia", "casa", "jardim"];
const ROOM_ICON: Record<RoomKey, React.ReactNode> = {
  praca: <Sparkles size={14} />,
  biblioteca: <BookOpen size={14} />,
  escritorio: <Briefcase size={14} />,
  guilda: <ScrollText size={14} />,
  academia: <Dumbbell size={14} />,
  casa: <Home size={14} />,
  jardim: <Sprout size={14} />,
};

/** Construções da vila com tela própria no LifeOS (atalhos abaixo do mapa). */
const VILLAGE_ORDER: BuildingKey[] = ["banco", "loja", "torre", "taverna", "contratos"];
const BUILDING_ICON: Record<string, React.ReactNode> = {
  banco: <Landmark size={14} />,
  loja: <Store size={14} />,
  torre: <TowerControl size={14} />,
  taverna: <Beer size={14} />,
  contratos: <Handshake size={14} />,
};
const isBuilding = (k: PlaceKey): k is BuildingKey => (VILLAGE_ORDER as string[]).includes(k) || k === "moinho";

/** 🌍 Meu Mundo — o LifeOS como um pequeno mundo vivo, sempre sobre dados reais. */
export function MeuMundoPage() {
  const q = useLivingWorld();
  const actions = useWorldActions();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const reduced = usePrefersReducedMotion();
  const canvas = useRef<WorldCanvasHandle>(null);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [selectedRoom, setSelectedRoom] = useState<RoomKey | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingKey | null>(null);
  const [decorMode, setDecorMode] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newMission, setNewMission] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);
  const [selectedChar, setSelectedChar] = useState<{ id: string; follow: boolean } | null>(null);
  const [reward, setReward] = useState<{ title: string; xp: number | null; coins: number | null } | null>(null);
  const clearReward = useCallback(() => setReward(null), []);
  const notify = (msg: string, tone: "success" | "error" = "success") => setToast({ msg, tone });
  const w = q.data;
  const pendingAgent = actions.runAgent.isPending ? actions.runAgent.variables?.key ?? null : null;

  // Clima real da cidade do Contexto do Dia (desligável nas configurações do mundo).
  const weatherOn = w?.settings.weatherEnabled ?? true;
  const weatherQ = useWorldWeather(!!w && weatherOn);
  const weatherData = weatherQ.data && "current" in weatherQ.data ? weatherQ.data : null;
  const engineWeather: WorldWeather | null = useMemo(
    () =>
      weatherOn && weatherData
        ? { visual: weatherData.current.visual, intensity: w?.settings.weatherIntensity ?? 2, particles: w?.settings.weatherParticles ?? true, windDirection: weatherData.current.windDirection, windSpeedKmh: weatherData.current.windSpeedKmh }
        : null,
    [weatherOn, weatherData, w?.settings.weatherIntensity, w?.settings.weatherParticles],
  );

  const { engineSettings, engineData, markers } = useWorldEngineInputs(w, pendingAgent, reduced);

  const timeline = useMemo(() => (w ? w.timeline.filter((e) => !filter || e.category === filter) : []), [w, filter]);

  const syncOthers = useCallback(() => {
    actions.refresh();
    void qc.invalidateQueries({ queryKey: ["tasks"] });
    void qc.invalidateQueries({ queryKey: ["habits"] });
    void qc.invalidateQueries({ queryKey: ["gamification"] });
  }, [actions, qc]);

  const errMsg = (e: unknown, fb: string) => (e instanceof ApiError || e instanceof Error ? e.message || fb : fb);

  const moveMission = async (m: { id: string; title: string; reward?: { xp: number; coins: number } | null }, status: string) => {
    setBusyId(m.id);
    try {
      await taskService.move(m.id, status);
      syncOthers();
      if (status === "Concluído") {
        canvas.current?.celebrate("avatar", "Missão concluída!", m.reward?.xp ?? null);
        setReward({ title: `Missão concluída: ${m.title}`, xp: m.reward?.xp ?? null, coins: m.reward?.coins ?? null });
      } else notify(status === "Em Andamento" ? `Em andamento: ${m.title}. O avatar vai até a estação.` : `Missão pausada: ${m.title}`);
    } catch (e) {
      notify(errMsg(e, "Não foi possível atualizar a missão."), "error");
    } finally {
      setBusyId(null);
    }
  };

  const checkHabit = async (h: WorldHabit) => {
    if (!w) return;
    setBusyId(h.id);
    try {
      await habitService.checkIn(h.id, w.today, 1);
      syncOthers();
      canvas.current?.celebrate("avatar", "Hábito registrado!");
      setReward({ title: `Hábito registrado: ${h.name}`, xp: null, coins: null });
    } catch (e) {
      notify(errMsg(e, "Não foi possível registrar o hábito."), "error");
    } finally {
      setBusyId(null);
    }
  };

  const runAgent = (key: string, question: string | null) => {
    canvas.current?.centerRoom(w?.agents.find((a) => a.key === key)?.room ?? "escritorio");
    actions.runAgent.mutate(
      { key, question },
      {
        onSuccess: (r) => notify(r.status === "done" ? "Análise concluída — veja o resultado no painel do agente." : "O agente não conseguiu concluir. Nada foi inventado.", r.status === "done" ? "success" : "error"),
        onError: (e) => notify(errMsg(e, "Não foi possível acionar o agente."), "error"),
      },
    );
  };

  const openPlace = (k: PlaceKey, center = false) => {
    if (isBuilding(k)) {
      setSelectedRoom(null);
      setSelectedBuilding(k);
      if (center) canvas.current?.centerBuilding(k);
      setDrawer({ kind: "building", key: k });
    } else {
      setSelectedBuilding(null);
      setSelectedRoom(k);
      if (center) canvas.current?.centerRoom(k);
      setDrawer({ kind: "room", key: k });
    }
  };

  const onSelect = (s: Selection) => {
    if (s.type === "room" || s.type === "building") openPlace(s.key); else if (s.type === "avatar") {
      setSelectedChar({ id: "avatar", follow: false });
      setDrawer({ kind: "avatar" });
    } else if (s.type === "agent") {
      setSelectedChar({ id: s.key, follow: false });
      setDrawer({ kind: "agent", key: s.key });
    }
    else if (s.type === "npc" && s.id === "npc-ferreiro") navigate("/forja-codigo");
    else if (s.type === "habit") setDrawer({ kind: "habit", id: s.id });
    else if (s.type === "slot") setDrawer({ kind: "slot", key: s.key });
  };

  const onQuick = (a: QuickAction) => {
    if (a === "mission") setDrawer({ kind: "room", key: "guilda", tab: w?.activity ? "andamento" : "disponiveis" });
    else if (a === "plan") navigate("/conselho");
    else if (a === "new") setNewMission(true);
    else if (a === "habit") setDrawer({ kind: "room", key: "jardim" });
    else if (a === "review") navigate("/revisoes");
    else setDrawer({ kind: "agent", key: w?.agents[0]?.key ?? "planejador" });
  };

  const saveSettings = (p: Partial<WorldSettings>) => actions.saveSettings.mutate(p, { onError: () => notify("Não foi possível salvar a configuração.", "error") });

  // Teclado: setas movem a câmera, +/− zoom, C centraliza (só com foco no mapa).
  const onMapKey = (e: React.KeyboardEvent) => {
    const k = e.key;
    const step = 60;
    if (k === "ArrowLeft") canvas.current?.pan(step, 0);
    else if (k === "ArrowRight") canvas.current?.pan(-step, 0);
    else if (k === "ArrowUp") canvas.current?.pan(0, step);
    else if (k === "ArrowDown") canvas.current?.pan(0, -step);
    else if (k === "+" || k === "=") canvas.current?.zoom(1.15);
    else if (k === "-") canvas.current?.zoom(1 / 1.15);
    else if (k.toLowerCase() === "c") canvas.current?.centerAvatar();
    else return;
    e.preventDefault();
  };

  if (q.isError)
    return (
      <div className="px-4 py-6 md:px-6">
        <div className="rpg-panel p-6 text-center" role="alert">
          <p className="text-sm text-rpg-red">Não foi possível carregar o Meu Mundo agora.</p>
          <RPGButton variant="secondary" className="mt-3" onClick={() => void q.refetch()}>
            Tentar de novo
          </RPGButton>
        </div>
      </div>
    );

  const drawerTitle = (() => {
    if (!drawer || !w) return "";
    if (drawer.kind === "room" || drawer.kind === "building") return placeLabel(drawer.key);
    if (drawer.kind === "agent") return (() => { const ag = w.agents.find((a) => a.key === drawer.key); return ag ? ag.nickname ?? ag.name : "Agente"; })();
    if (drawer.kind === "avatar") return w.avatar.name;
    if (drawer.kind === "habit") return w.habits.find((h) => h.id === drawer.id)?.name ?? "Hábito";
    if (drawer.kind === "slot") return "Decorar este lugar";
    if (drawer.kind === "settings") return "Configurações do mundo";
    return "Histórico do mundo";
  })();

  return (
    <div className={clsx("space-y-3 px-3 py-4 sm:px-4 md:px-6", expanded && "fixed inset-0 z-40 overflow-y-auto bg-rpg-bg")}>
      {/* Seguindo um personagem: aviso discreto com opção de parar */}
      {selectedChar?.follow && (
        <button type="button" className="rpg-tile fixed bottom-20 left-1/2 z-30 -translate-x-1/2 px-3 py-1.5 text-xs font-semibold text-rpg-gold-light lg:bottom-6" onClick={() => setSelectedChar(null)}>
          Acompanhando {selectedChar.id === "avatar" ? w?.avatar.name : (() => { const ag = w?.agents.find((a) => a.key === selectedChar.id); return ag?.nickname ?? ag?.name; })()} — parar
        </button>
      )}
      {/* Cabeçalho (nível/moedas já estão na barra global; aqui só o selo de nível sobre o mapa) */}
      <header className="flex flex-wrap items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center border-2 border-rpg-gold/80 bg-gradient-to-b from-rpg-purple/40 to-rpg-bg text-rpg-gold-light shadow-[0_0_14px_rgba(241,198,106,0.35)]" style={{ borderRadius: 4 }} aria-hidden>
          <Castle size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="rpg-title font-rpg text-3xl font-bold leading-none text-rpg-gold-light drop-shadow-[0_2px_0_rgba(0,0,0,0.6)] sm:text-4xl">Meu Mundo</h1>
          <p className="mt-1 text-xs text-rpg-muted sm:text-sm">Seu centro de vida interativo · atividades, agentes e evolução a partir dos seus dados reais.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="rpg-tile flex min-h-[38px] items-center gap-1.5 px-3 text-xs font-semibold text-rpg-text" onClick={() => setDrawer({ kind: "avatar" })} disabled={!w}>
            <Palette size={14} className="text-rpg-pink" aria-hidden /> Avatar
          </button>
          <button type="button" className="rpg-tile flex min-h-[38px] items-center gap-1.5 px-3 text-xs font-semibold text-rpg-text" onClick={() => setDecorMode((v) => !v)} disabled={!w} aria-pressed={decorMode}>
            <Sofa size={14} className="text-rpg-gold" aria-hidden /> {decorMode ? "Concluir decoração" : "Decorar"}
          </button>
          <button type="button" className="rpg-tile flex min-h-[38px] items-center gap-1.5 px-3 text-xs font-semibold text-rpg-text" onClick={() => saveSettings({ showLabels: !(w?.settings.showLabels ?? true) })} disabled={!w} aria-pressed={!(w?.settings.showLabels ?? true)} title="Mostrar/ocultar as placas dos ambientes">
            {w?.settings.showLabels ?? true ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />} Placas
          </button>
          <button type="button" className="rpg-tile flex min-h-[38px] items-center px-3 text-rpg-text" onClick={() => setDrawer({ kind: "settings" })} disabled={!w} aria-label="Configurações do mundo">
            <Settings2 size={15} aria-hidden />
          </button>
        </div>
      </header>

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_350px]">
        {/* Mapa */}
        <section className={clsx("rpg-ornate relative min-w-0 p-0", expanded ? "h-[82vh]" : "h-[460px] sm:h-[600px] xl:sticky xl:top-3 xl:h-[calc(100vh-170px)] xl:max-h-[900px] xl:min-h-[640px]")} aria-label="Mapa do Meu Mundo">
          <RewardBanner reward={reward} onDone={clearReward} />
          {w && (
            <div className="absolute left-3 top-3 z-10 hidden sm:block">
              <WorldHUD world={w} />
            </div>
          )}
          {!w && <div className="absolute inset-0 z-10 flex items-center justify-center bg-rpg-bg/70 text-sm text-rpg-muted" aria-busy="true">Construindo o seu mundo…</div>}
          {w && weatherOn && (
            <div className="absolute bottom-3 left-3 z-10">
              <WeatherChip query={weatherQ} />
            </div>
          )}
          {decorMode && <p className="absolute left-1/2 top-3 z-10 -translate-x-1/2 border border-rpg-gold bg-rpg-bg/90 px-2 py-1 text-xs text-rpg-gold-light" style={{ borderRadius: 4 }}>Modo decoração: clique num lugar brilhante para colocar um item do inventário.</p>}
          <div tabIndex={0} onKeyDown={onMapKey} className="absolute inset-0 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-rpg-gold" aria-label="Mapa: setas movem a câmera, + e − aproximam, C centraliza o avatar">
            <WorldCanvas
              ref={canvas}
              data={engineData}
              settings={engineSettings}
              selectedRoom={selectedRoom}
              selectedBuilding={selectedBuilding}
              decorMode={decorMode}
              selectedChar={selectedChar}
              onFollowStop={() => setSelectedChar((c) => (c ? { ...c, follow: false } : c))}
              weather={engineWeather}
              onSelect={onSelect}
              onAvatarMoved={(p) => actions.saveAvatar.mutate({ x: p.x, y: p.y })}
              className="block h-full w-full"
            />
          </div>
          <div className="absolute right-2 top-2 z-10 flex flex-col gap-1" role="toolbar" aria-label="Câmera">
            {[
              [<Plus key="i" size={14} />, "Aproximar", () => canvas.current?.zoom(1.2)],
              [<Minus key="i" size={14} />, "Afastar", () => canvas.current?.zoom(1 / 1.2)],
              [<Crosshair key="i" size={14} />, "Centralizar no avatar", () => canvas.current?.centerAvatar()],
              [<RotateCcw key="i" size={14} />, "Restaurar enquadramento", () => canvas.current?.reset()],
              [expanded ? <Minimize2 key="i" size={14} /> : <Maximize2 key="i" size={14} />, expanded ? "Sair da visão expandida" : "Visão expandida", () => setExpanded((v) => !v)],
            ].map(([icon, label, fn]) => (
              <button key={label as string} type="button" title={label as string} aria-label={label as string} onClick={fn as () => void} className="rpg-tile flex h-9 w-9 items-center justify-center text-rpg-text">
                {icon as React.ReactNode}
              </button>
            ))}
          </div>
          <nav className="absolute inset-x-2 bottom-2 z-10 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]" aria-label="Lugares do mundo">
            {ROOM_ORDER.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={selectedRoom === k}
                onClick={() => openPlace(k, true)}
                className={clsx("rpg-tile flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs font-semibold", selectedRoom === k ? "text-rpg-gold-light" : "text-rpg-text")}
              >
                <span className="text-rpg-gold" aria-hidden>
                  {ROOM_ICON[k]}
                </span>
                {placeLabel(k)}
                {markers[k] && <span className={clsx("h-1.5 w-1.5 rounded-full", markers[k]!.tone === "danger" ? "bg-rpg-red" : markers[k]!.tone === "warn" ? "bg-rpg-gold" : "bg-rpg-blue")} aria-label="com pendência" />}
              </button>
            ))}
            <span className="mx-0.5 w-px shrink-0 self-stretch bg-rpg-gold/30" aria-hidden />
            {VILLAGE_ORDER.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={selectedBuilding === k}
                onClick={() => openPlace(k, true)}
                className={clsx("rpg-tile flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs font-semibold", selectedBuilding === k ? "text-rpg-gold-light" : "text-rpg-text")}
              >
                <span className="text-rpg-gold" aria-hidden>
                  {BUILDING_ICON[k]}
                </span>
                {placeLabel(k)}
                {markers[k] && <span className={clsx("h-1.5 w-1.5 rounded-full", markers[k]!.tone === "danger" ? "bg-rpg-red" : "bg-rpg-gold")} aria-label="com pendência" />}
              </button>
            ))}
          </nav>
        </section>

        {/* Coluna lateral */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          {w ? (
            <>
              <ActivityPanel world={w} busy={!!busyId && busyId === w.activity?.taskId} onPause={() => w.activity && void moveMission({ id: w.activity.taskId, title: w.activity.title }, "A Fazer")} onComplete={() => w.activity && void moveMission({ id: w.activity.taskId, title: w.activity.title, reward: w.activity.reward }, "Concluído")} onStart={() => onQuick("mission")} />
              <KingdomPanel markers={markers} onOpen={(k) => openPlace(k, true)} />
              <AgentsPanel
                agents={w.agents}
                pendingKey={pendingAgent}
                onOpen={(key) => {
                  setSelectedChar({ id: key, follow: false });
                  setDrawer({ kind: "agent", key });
                }}
              />
              <div className="sm:col-span-2 xl:col-span-1">
                <QuickActions onAction={onQuick} />
              </div>
            </>
          ) : (
            [0, 1, 2].map((i) => <div key={i} className="rpg-panel h-40 animate-pulse" aria-busy="true" />)
          )}
        </div>
      </div>

      <TimelineStrip events={timeline} filter={filter} onFilter={setFilter} onHistory={() => setDrawer({ kind: "history" })} loading={!w} />

      {/* Painéis contextuais */}
      <Modal
        open={!!drawer && !!w}
        onClose={() => {
          setDrawer(null);
          setSelectedRoom(null);
          setSelectedBuilding(null);
          setSelectedChar((c) => (c?.follow ? c : null));
        }}
        title={drawerTitle}
        size={drawer?.kind === "history" || drawer?.kind === "slot" ? "lg" : "md"}
      >
        {w && drawer?.kind === "room" && (
          <RoomContent room={drawer.key} world={w}>
            {drawer.key === "guilda" && <GuildContent world={w} busyId={busyId} onStart={(m: WorldMission) => void moveMission(m, "Em Andamento")} onComplete={(m: WorldMission) => void moveMission(m, "Concluído")} initialTab={drawer.tab} />}
            {drawer.key === "jardim" && <GardenContent habits={w.habits} busyId={busyId} onCheck={(h) => void checkHabit(h)} />}
            {drawer.key === "escritorio" && (
              <div className="space-y-2">
                <GuildContent world={w} busyId={busyId} onStart={(m) => void moveMission(m, "Em Andamento")} onComplete={(m) => void moveMission(m, "Concluído")} initialTab="andamento" />
                <div className="flex flex-wrap gap-2">
                  {w.agents.filter((a) => a.room === "escritorio").map((a) => (
                    <RPGButton key={a.key} variant="secondary" className="text-xs" onClick={() => setDrawer({ kind: "agent", key: a.key })}>
                      Falar com {a.nickname ?? a.name}
                    </RPGButton>
                  ))}
                  <RPGButton variant="ghost" className="text-xs" onClick={() => navigate("/projetos")}>
                    Projetos
                  </RPGButton>
                </div>
              </div>
            )}
            {drawer.key === "biblioteca" && (
              <div className="flex flex-wrap gap-1.5">
                <RPGButton variant="secondary" className="text-xs" onClick={() => setDrawer({ kind: "agent", key: "mentor" })}>
                  Falar com o Mentor de Estudos
                </RPGButton>
                <RPGButton variant="gold" className="text-xs" onClick={() => navigate("/biblioteca-mestrado")}>
                  Biblioteca do Mestrado
                </RPGButton>
              </div>
            )}
          </RoomContent>
        )}
        {w && drawer?.kind === "building" && <BuildingContent building={drawer.key} world={w} marker={markers[drawer.key]} />}
        {w && drawer?.kind === "agent" && (() => {
          const a = w.agents.find((x) => x.key === drawer.key);
          return a ? (
            <div className="space-y-2">
              <div className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
                {w.agents.map((x) => (
                  <button key={x.key} type="button" aria-pressed={x.key === a.key} onClick={() => setDrawer({ kind: "agent", key: x.key })} className={clsx("shrink-0 border px-2 py-1 text-[11px] font-semibold", x.key === a.key ? "border-rpg-gold text-rpg-gold-light" : "border-rpg-border text-rpg-muted")} style={{ borderRadius: 4 }}>
                    {x.nickname ?? x.name}
                  </button>
                ))}
              </div>
              <AgentContent agent={a} pending={pendingAgent === a.key} onRun={(question) => runAgent(a.key, question)} />
              <details className="border-2 border-rpg-border bg-rpg-bg-2/50 p-2" style={{ borderRadius: 4 }}>
                <summary className="cursor-pointer text-sm font-semibold text-rpg-gold-light">Personalizar aparência</summary>
                <div className="mt-2">
                  <AgentLookContent
                    key={a.key}
                    agent={a}
                    busy={actions.saveAgentLook.isPending}
                    onSave={(body) => actions.saveAgentLook.mutate({ key: a.key, ...body }, { onSuccess: () => notify("Aparência do agente salva."), onError: () => notify("Não foi possível salvar.", "error") })}
                  />
                </div>
              </details>
              <RPGButton
                variant="ghost"
                className="text-xs"
                onClick={() => {
                  setSelectedChar({ id: a.key, follow: true });
                  setDrawer(null);
                }}
              >
                <Crosshair size={12} aria-hidden /> Acompanhar no mapa
              </RPGButton>
            </div>
          ) : (
            <p className="text-sm text-rpg-muted">Agente indisponível.</p>
          );
        })()}
        {w && drawer?.kind === "avatar" && (
          <RPGButton
            variant="ghost"
            className="mb-2 text-xs"
            onClick={() => {
              setSelectedChar({ id: "avatar", follow: true });
              setDrawer(null);
            }}
          >
            <Crosshair size={12} aria-hidden /> Acompanhar no mapa
          </RPGButton>
        )}
        {w && drawer?.kind === "avatar" && <AvatarContent world={w} busy={actions.saveAvatar.isPending} onSave={(p) => actions.saveAvatar.mutate(p, { onSuccess: () => notify("Aparência salva."), onError: () => notify("Não foi possível salvar.", "error") })} />}
        {w && drawer?.kind === "habit" && (() => {
          const h = w.habits.find((x) => x.id === drawer.id);
          return h ? <ul><HabitRow h={h} busy={busyId === h.id} onCheck={(x) => void checkHabit(x)} /></ul> : <p className="text-sm text-rpg-muted">Hábito não encontrado.</p>;
        })()}
        {w && drawer?.kind === "slot" && (
          <SlotContent
            world={w}
            slotKey={drawer.key}
            busy={actions.placeDecor.isPending || actions.removeDecor.isPending}
            onPlace={(itemKey) => actions.placeDecor.mutate({ slot: drawer.key, itemKey }, { onSuccess: () => (notify("Decoração colocada."), setDrawer(null)), onError: (e) => notify(errMsg(e, "Não foi possível decorar."), "error") })}
            onRemove={() => actions.removeDecor.mutate(drawer.key, { onSuccess: () => notify("Decoração retirada."), onError: (e) => notify(errMsg(e, "Não foi possível retirar."), "error") })}
          />
        )}
        {w && drawer?.kind === "settings" && <SettingsContent settings={w.settings} onChange={saveSettings} />}
        {drawer?.kind === "history" && <HistoryContent />}
      </Modal>

      {newMission && (
        <TaskModal
          task={null}
          statusOptions={[...TASK_STATUSES]}
          onClose={() => setNewMission(false)}
          onSave={async (input) => {
            const t = await taskService.create(input);
            syncOthers();
            notify("Missão criada.");
            return t;
          }}
        />
      )}

      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}
