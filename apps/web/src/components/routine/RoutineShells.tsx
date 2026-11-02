import { useState } from "react";
import { BarChart3, BookOpen, Bot, CalendarDays, Flame, GraduationCap, History, LayoutGrid, Library, ListChecks, Map as MapIcon, Plus, Repeat, ScanLine, ScrollText, Sparkles, Trophy, Upload, Zap, Bell } from "lucide-react";
import { RPGButton, RPGToast } from "@/components/rpg";
import { AdvisorPanel, KitSection, MODULE_ART, MedalStrip, MissionList, ModuleBanner, ModuleTabs } from "@/components/rpg-modules/ModuleKit";
import { AutomationsPanel } from "@/components/automations/AutomationsPanel";
import { BookRecommendations } from "@/components/biblioteca/BookRecommendations";
import { useHabits } from "@/hooks/useHabits";
import { useBooks } from "@/hooks/useBooks";
import { useAdminHub, useHabitsHub, useLibraryHub } from "@/hooks/useRoutineHubs";
import { toHubMissions, type HubHabit, type LibSession } from "@/services/routineHubService";
import { ConsistencyCalendar, HABIT_MEDALS, HabitCardsGrid, HabitSettingsModal, HabitsAnalysis, HabitsIndicators, RitualPanel, StreakRewards } from "./HabitsHub";
import { Bookshelf, FeaturedBook, LIBRARY_MEDALS, LearningsPanel, LibraryIndicators, ReaderDesk, ReadingCalendar, SessionModal, TrailsPanel } from "./LibraryHub";
import { ADMIN_MEDALS, AdminIndicators, DueCalendar, OrderPanel, SubscriptionsPanel, TranquilityChest, UpcomingPanel } from "./AdminHub";

type Toast = { msg: string; tone: "success" | "error" } | null;
const Skeleton = () => <div className="rpg-panel h-56 animate-pulse" aria-busy aria-label="Carregando" />;
const ErrorBox = ({ onRetry }: { onRetry: () => void }) => (
  <div className="rpg-panel p-4 text-center">
    <p className="text-sm text-rpg-red">Não foi possível carregar agora.</p>
    <RPGButton variant="secondary" className="mt-2" onClick={onRetry}>
      Tentar novamente
    </RPGButton>
  </div>
);

/* ════════════════════════════════ Hábitos ════════════════════════════════ */

export const HABIT_TABS = ["jornada", "classico", "analise", "conquistas", "automacoes", "ia"] as const;
export type HabitTab = (typeof HABIT_TABS)[number];

/**
 * Hábitos 3.0 (tema RPG). "Jornada" é o novo painel; "Painel completo" mantém
 * a tela anterior (gráficos, histórico, gerador de tarefas) intacta.
 */
export function HabitsShell({ tab, onTab, onNew, onEdit, onGenerate, canGenerate }: { tab: HabitTab; onTab: (t: HabitTab) => void; onNew: () => void; onEdit: (id: string) => void; onGenerate: () => void; canGenerate: boolean }) {
  const q = useHabitsHub();
  const { checkIn, removeHabit } = useHabits();
  const [busy, setBusy] = useState<string | null>(null);
  const [settings, setSettings] = useState<HubHabit | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const hub = q.data;
  const notify = (msg: string, tone: "success" | "error" = "success") => setToast({ msg, tone });
  // Check-in idempotente por dia: concluir grava a meta inteira; "+1" grava progresso parcial.
  const onCheck = async (h: { id: string; target: number; count: number }, full: boolean) => {
    if (!hub) return;
    setBusy(h.id);
    try {
      await checkIn({ id: h.id, entryDate: hub.today, count: full ? h.target : Math.min(h.target, h.count + 1) });
      if (full || h.count + 1 >= h.target) notify("Hábito cumprido! A recompensa vem uma única vez por dia.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Não foi possível registrar.", "error");
    } finally {
      setBusy(null);
    }
  };
  const onDelete = async (h: HubHabit) => {
    if (!confirm(`Excluir o hábito "${h.name}"? O histórico deixa de aparecer nesta tela.`)) return;
    try {
      await removeHabit(h.id);
      notify("Hábito excluído.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Não foi possível excluir.", "error");
    }
  };
  return (
    <div className="space-y-3">
      <ModuleBanner
        eyebrow="A Jornada da Disciplina"
        title="Hábitos da Jornada"
        subtitle="Pequenas ações repetidas constroem grandes conquistas."
        mage={`${MODULE_ART}/habits/banner-mage.webp`}
        scene={`${MODULE_ART}/habits/banner-scene.webp`}
        actions={
          <>
            <RPGButton variant="secondary" onClick={() => onTab("classico")}>
              <History size={14} aria-hidden /> Ver história
            </RPGButton>
            {canGenerate && (
              <RPGButton variant="secondary" onClick={onGenerate}>
                <ListChecks size={14} aria-hidden /> Gerar missões
              </RPGButton>
            )}
            <RPGButton variant="primary" onClick={onNew}>
              <Plus size={14} aria-hidden /> Novo hábito
            </RPGButton>
          </>
        }
      />
      {hub ? <HabitsIndicators hub={hub} /> : <div className="rpg-panel h-24 animate-pulse" aria-busy />}
      <ModuleTabs
        label="Seções dos Hábitos"
        value={tab}
        onChange={onTab}
        tabs={[
          { value: "jornada", label: "Ritual e hábitos", icon: <Flame size={15} /> },
          { value: "classico", label: "Painel completo", icon: <LayoutGrid size={15} /> },
          { value: "analise", label: "Análise", icon: <BarChart3 size={15} /> },
          { value: "conquistas", label: "Conquistas", icon: <Trophy size={15} /> },
          { value: "automacoes", label: "Automações", icon: <Zap size={15} /> },
          { value: "ia", label: "Mestre da Disciplina", icon: <Bot size={15} /> },
        ]}
      />
      {q.isError && <ErrorBox onRetry={() => void q.refetch()} />}
      {tab === "jornada" &&
        (!hub ? (
          <Skeleton />
        ) : hub.habits.length === 0 ? (
          <div className="rpg-panel rpg-panel-gold py-10 text-center">
            <p className="font-pixel text-xs uppercase text-rpg-gold">Nenhum hábito ainda</p>
            <p className="mt-1 text-sm text-rpg-muted">Crie o primeiro hábito (água, leitura, treino…) e acenda a Primeira Chama.</p>
            <RPGButton variant="gold" className="mt-3" onClick={onNew}>
              <Plus size={14} aria-hidden /> Novo hábito
            </RPGButton>
          </div>
        ) : (
          <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-3">
              <RitualPanel hub={hub} onCheck={onCheck} busyId={busy} />
              <HabitCardsGrid hub={hub} onCheck={onCheck} onEdit={onEdit} onDelete={onDelete} onSettings={setSettings} busyId={busy} />
            </div>
            <aside className="min-w-0 space-y-3" aria-label="Recompensas, missões e consistência">
              <StreakRewards hub={hub} />
              <KitSection title="Missões da jornada" icon={<ScrollText size={16} />}>
                <MissionList missions={toHubMissions(hub.missions, "Progresso pelos check-ins reais.")} format={(m) => (m.key === "h_week_80" ? `${m.current}%` : `${m.current}/${m.target}`)} />
                <p className="mt-2 text-[10px] text-rpg-muted">As recompensas de missões vêm das quests do Quadro de Avisos (hábitos e leitura).</p>
              </KitSection>
              <ConsistencyCalendar hub={hub} />
            </aside>
          </div>
        ))}
      {tab === "analise" && (hub ? <HabitsAnalysis hub={hub} /> : <Skeleton />)}
      {tab === "conquistas" && (
        <KitSection title="Conquistas da disciplina" icon={<Trophy size={16} />} tone="gold">
          <MedalStrip medals={HABIT_MEDALS} />
        </KitSection>
      )}
      {tab === "automacoes" && <AutomationsPanel module="habits" title="Automações dos Hábitos" intro="Lembretes, sincronização com os módulos vinculados, missões, análise e revisão semanal. Nada é registrado em outro módulo sem vínculo." />}
      {tab === "ia" && <AdvisorPanel module="habits" title="Mestre da Disciplina" avatar="/assets/rpg/avatars/cavaleiro.webp" />}
      <HabitSettingsModal habit={settings} onClose={() => setSettings(null)} onSaved={(m) => notify(m)} />
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}

/* ════════════════════════════════ Biblioteca ════════════════════════════════ */

export const LIBRARY_TABS = ["academia", "trilhas", "aprendizados", "recomendacoes", "classico", "automacoes", "ia"] as const;
export type LibraryTab = (typeof LIBRARY_TABS)[number];

export function LibraryShell({ tab, onTab, onManual, onIsbn }: { tab: LibraryTab; onTab: (t: LibraryTab) => void; onManual: () => void; onIsbn: () => void }) {
  const q = useLibraryHub();
  const { updateBook, createBook } = useBooks();
  const [session, setSession] = useState<{ open: boolean; bookId: string | null; edit: LibSession | null }>({ open: false, bookId: null, edit: null });
  const [toast, setToast] = useState<Toast>(null);
  const hub = q.data;
  const notify = (msg: string, tone: "success" | "error" = "success") => setToast({ msg, tone });
  const week = hub ? hub.calendar.filter((c) => !c.future).slice(-7) : [];
  const missions = hub
    ? [
        { key: "l_days", title: "Ler em 5 dos últimos 7 dias", current: week.filter((c) => c.pages > 0 || c.minutes > 0).length, target: 5, done: week.filter((c) => c.pages > 0 || c.minutes > 0).length >= 5 },
        { key: "l_today", title: hub.desk.dailyGoal ? `Meta de hoje: ${hub.desk.dailyGoal.target} páginas` : "Registrar uma sessão hoje", current: hub.desk.dailyGoal ? hub.desk.pagesToday : hub.desk.pagesToday > 0 ? 1 : 0, target: hub.desk.dailyGoal?.target || 1, done: hub.desk.dailyGoal ? hub.desk.pagesToday >= hub.desk.dailyGoal.target : hub.desk.pagesToday > 0 },
        { key: "l_learn", title: "Registrar 3 aprendizados", current: Math.min(3, hub.learnings.length), target: 3, done: hub.learnings.length >= 3 },
      ]
    : [];
  return (
    <div className="space-y-3">
      <ModuleBanner
        eyebrow="A Academia dos Livros"
        title="Biblioteca"
        subtitle="Seus livros, ideias e aprendizados em um só lugar."
        mage={`${MODULE_ART}/library/banner-mage.webp`}
        scene={`${MODULE_ART}/library/banner-scene.webp`}
        actions={
          <>
            <RPGButton variant="secondary" onClick={onManual}>
              <Plus size={14} aria-hidden /> Manual
            </RPGButton>
            <RPGButton variant="primary" onClick={onIsbn}>
              <ScanLine size={14} aria-hidden /> Adicionar por ISBN
            </RPGButton>
            <RPGButton variant="secondary" onClick={() => onTab("trilhas")}>
              <MapIcon size={14} aria-hidden /> Trilhas de leitura
            </RPGButton>
          </>
        }
      />
      {hub ? <LibraryIndicators hub={hub} /> : <div className="rpg-panel h-24 animate-pulse" aria-busy />}
      <ModuleTabs
        label="Seções da Biblioteca"
        value={tab}
        onChange={onTab}
        tabs={[
          { value: "academia", label: "Academia", icon: <Library size={15} /> },
          { value: "trilhas", label: "Trilhas", icon: <MapIcon size={15} /> },
          { value: "aprendizados", label: "Aprendizados", icon: <GraduationCap size={15} /> },
          { value: "recomendacoes", label: "Recomendações", icon: <Sparkles size={15} /> },
          { value: "classico", label: "Painel completo", icon: <LayoutGrid size={15} /> },
          { value: "automacoes", label: "Automações", icon: <Zap size={15} /> },
          { value: "ia", label: "Oráculo Literário", icon: <Bot size={15} /> },
        ]}
      />
      {q.isError && <ErrorBox onRetry={() => void q.refetch()} />}
      {tab === "academia" &&
        (!hub ? (
          <Skeleton />
        ) : (
          <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-3">
              <div className="grid gap-3 lg:grid-cols-2">
                <FeaturedBook hub={hub} onSession={(id) => setSession({ open: true, bookId: id, edit: null })} />
                <ReaderDesk hub={hub} onSession={() => setSession({ open: true, bookId: null, edit: null })} onEdit={(s) => setSession({ open: true, bookId: s.bookId, edit: s })} />
              </div>
              <KitSection title="Estante" icon={<BookOpen size={16} />}>
                {hub.books.length === 0 ? (
                  <p className="text-sm text-rpg-muted">Sua estante está vazia. Adicione um livro por ISBN ou manualmente.</p>
                ) : (
                  <Bookshelf hub={hub} onSession={(id) => setSession({ open: true, bookId: id, edit: null })} onStatus={(b, status) => (updateBook({ id: b.id, patch: { status } }), notify(`“${b.title}” agora está como ${status}.`))} />
                )}
              </KitSection>
            </div>
            <aside className="min-w-0 space-y-3" aria-label="Missões, calendário e conquistas">
              <KitSection title="Missões de leitura" icon={<ScrollText size={16} />}>
                <MissionList missions={toHubMissions(missions, "Progresso pelas suas sessões reais.")} />
                <p className="mt-2 text-[10px] text-rpg-muted">Recompensas de leitura vêm das quests do Quadro de Avisos (páginas e dias de leitura).</p>
              </KitSection>
              <ReadingCalendar hub={hub} />
              <KitSection title="Conquistas literárias" icon={<Trophy size={16} />} tone="gold">
                <MedalStrip medals={LIBRARY_MEDALS} />
              </KitSection>
            </aside>
          </div>
        ))}
      {tab === "trilhas" && (hub ? <TrailsPanel hub={hub} onToast={notify} /> : <Skeleton />)}
      {tab === "aprendizados" && (hub ? <LearningsPanel hub={hub} onToast={notify} /> : <Skeleton />)}
      {tab === "recomendacoes" && <BookRecommendations onAdd={createBook} />}
      {tab === "automacoes" && <AutomationsPanel module="library" title="Automações da Biblioteca" intro="Progresso, lembretes, metas, Grimório, resumo, ISBN e recomendações. Cartões e livros só são criados com a sua confirmação." />}
      {tab === "ia" && <AdvisorPanel module="library" title="Oráculo Literário" avatar="/assets/rpg/avatars/mago.webp" />}
      {hub && <SessionModal open={session.open} hub={hub} bookId={session.bookId} session={session.edit} onClose={() => setSession({ open: false, bookId: null, edit: null })} onToast={notify} />}
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}

/* ════════════════════════════════ Administração ════════════════════════════════ */

export const ADMIN_TABS = ["reino", "registros", "calendario", "assinaturas", "automacoes", "ia"] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];

export function AdminShell({ tab, onTab, onNew, onImport }: { tab: AdminTab; onTab: (t: AdminTab) => void; onNew: () => void; onImport: () => void }) {
  const [month, setMonth] = useState<string | undefined>(undefined);
  const q = useAdminHub(month);
  const [toast, setToast] = useState<Toast>(null);
  const hub = q.data;
  const notify = (msg: string, tone: "success" | "error" = "success") => setToast({ msg, tone });
  return (
    <div className="mb-4 space-y-3">
      <ModuleBanner
        eyebrow="O Reino da Organização"
        title="Administração da Vida"
        subtitle="Organize seus compromissos e mantenha seu reino funcionando."
        mage={`${MODULE_ART}/admin/banner-mage.webp`}
        scene={`${MODULE_ART}/admin/banner-scene.webp`}
        actions={
          <>
            <RPGButton variant="secondary" onClick={() => onTab("automacoes")}>
              <Bell size={14} aria-hidden /> Automatizar lembretes
            </RPGButton>
            <RPGButton variant="secondary" onClick={onImport}>
              <Upload size={14} aria-hidden /> Importar documento
            </RPGButton>
            <RPGButton variant="primary" onClick={onNew}>
              <Plus size={14} aria-hidden /> Novo item
            </RPGButton>
          </>
        }
      />
      {hub ? <AdminIndicators hub={hub} /> : <div className="rpg-panel h-24 animate-pulse" aria-busy />}
      <ModuleTabs
        label="Seções da Administração"
        value={tab}
        onChange={onTab}
        tabs={[
          { value: "reino", label: "Painel do Reino", icon: <Trophy size={15} />, badge: hub?.indicators.overdue || undefined },
          { value: "registros", label: "Registros", icon: <ScrollText size={15} /> },
          { value: "calendario", label: "Calendário", icon: <CalendarDays size={15} /> },
          { value: "assinaturas", label: "Assinaturas e arquivos", icon: <Repeat size={15} /> },
          { value: "automacoes", label: "Automações", icon: <Zap size={15} /> },
          { value: "ia", label: "Guardião do Reino", icon: <Bot size={15} /> },
        ]}
      />
      {q.isError && <ErrorBox onRetry={() => void q.refetch()} />}
      {tab === "reino" &&
        (!hub ? (
          <Skeleton />
        ) : (
          <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-3">
              <OrderPanel hub={hub} />
              <UpcomingPanel hub={hub} onToast={notify} />
            </div>
            <aside className="min-w-0 space-y-3" aria-label="Missões, calendário e conquistas">
              <KitSection title="Missões do reino" icon={<ScrollText size={16} />}>
                <MissionList missions={toHubMissions(hub.missions, "Calculado pelos seus registros administrativos.")} />
                <p className="mt-2 text-[10px] text-rpg-muted">Criar itens não rende nada — só resolver no prazo. A quest semanal fica no Quadro de Avisos.</p>
              </KitSection>
              <DueCalendar hub={hub} month={hub.month} onMonth={setMonth} />
              <KitSection title="Conquistas administrativas" icon={<Trophy size={16} />} tone="gold">
                <MedalStrip medals={ADMIN_MEDALS} />
              </KitSection>
              <TranquilityChest hub={hub} onToast={notify} />
            </aside>
          </div>
        ))}
      {tab === "calendario" && (hub ? <DueCalendar hub={hub} month={hub.month} onMonth={setMonth} /> : <Skeleton />)}
      {tab === "assinaturas" && (hub ? <SubscriptionsPanel hub={hub} /> : <Skeleton />)}
      {tab === "automacoes" && <AutomationsPanel module="admin" title="Automações da Administração" intro="Lembretes, recorrência, documentos, assinaturas, Agenda, arquivos, resumo e riscos. Nenhum pagamento ou cancelamento é feito pelo LifeOS." />}
      {tab === "ia" && <AdvisorPanel module="admin" title="Guardião do Reino" avatar="/assets/rpg/avatars/cavaleiro.webp" />}
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}
