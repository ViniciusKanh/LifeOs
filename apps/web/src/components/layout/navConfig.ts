import {
  Activity,
  BarChart3,
  BellRing,
  BookOpen,
  Briefcase,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  CloudSun,
  Database,
  FlaskConical,
  GanttChartSquare,
  Gauge,
  GraduationCap,
  HeartPulse,
  History,
  Inbox,
  LayoutGrid,
  ListChecks,
  NotebookPen,
  Radar,
  Repeat,
  Settings,
  Share2,
  Sun,
  Target,
  TrendingUp,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Navegação do LifeOS organizada pelo ciclo do produto
 * (Planejar → Executar → Registrar → Medir → Melhorar), em vez de uma
 * lista única de 27 itens. Fonte única para Sidebar, menu mobile e
 * título do cabeçalho — nenhuma rota é declarada em dois lugares.
 */
export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Frase curta do cabeçalho (decoração, sem dado nenhum). */
  quote?: string;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
  adminOnly?: boolean;
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "planejar",
    label: "Planejar",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutGrid, quote: "Disciplina de hoje, liberdade de amanhã." },
      { to: "/hoje", label: "Hoje", icon: Sun, quote: "Consistência hoje, resultados amanhã." },
      { to: "/inbox", label: "Inbox", icon: Inbox, quote: "Capture agora, decida depois." },
      { to: "/semana", label: "Semana", icon: CalendarRange, quote: "Uma semana bem planejada se vive melhor." },
      { to: "/calendario", label: "Calendário", icon: CalendarDays, quote: "Quem planeja o tempo, comanda o progresso." },
      { to: "/metas", label: "Metas", icon: Target, quote: "Um objetivo sem plano é apenas um desejo." },
    ],
  },
  {
    id: "executar",
    label: "Executar",
    items: [
      { to: "/tarefas", label: "Tarefas", icon: ListChecks, quote: "Disciplina de hoje, liberdade de amanhã." },
      { to: "/projetos", label: "Projetos", icon: GanttChartSquare, quote: "Projetos claros avançam mais rápido." },
      { to: "/profissional", label: "Profissional", icon: Briefcase, quote: "Foco no que move os ponteiros." },
      { to: "/capacity-planner", label: "Capacity Planner", icon: Gauge, quote: "Quanto realmente cabe no seu dia?" },
      { to: "/deadline-radar", label: "Deadline Radar", icon: Radar, quote: "Antecipar é criar mais liberdade." },
    ],
  },
  {
    id: "registrar",
    label: "Registrar",
    items: [
      { to: "/diario", label: "Diário", icon: NotebookPen, quote: "Escrever é enxergar o próprio caminho." },
      { to: "/habitos", label: "Hábitos", icon: Repeat, quote: "Disciplina é a ponte entre seus objetivos e seus sonhos." },
      { to: "/saude", label: "Saúde", icon: HeartPulse, quote: "Corpo saudável, mente mais forte." },
      { to: "/biblioteca", label: "Biblioteca", icon: BookOpen, quote: "Livros constroem a melhor versão de nós." },
      { to: "/educacao", label: "Educação", icon: GraduationCap, quote: "Estudo hoje, liberdade amanhã." },
      { to: "/contexto-do-dia", label: "Contexto do Dia", icon: CloudSun, quote: "Entender o contexto é ajustar melhor a rotina." },
    ],
  },
  {
    id: "medir",
    label: "Medir",
    items: [
      { to: "/analytics", label: "Analytics", icon: BarChart3, quote: "Dados transformam esforço em clareza." },
      { to: "/signals", label: "Signals", icon: Activity, quote: "Observar com atenção é o primeiro passo para melhorar." },
      { to: "/goal-forecast", label: "Goal Forecast", icon: TrendingUp, quote: "Pequenos passos hoje, grandes conquistas amanhã." },
      { to: "/timeline", label: "Timeline", icon: History, quote: "Sua história, registrada automaticamente." },
      { to: "/data-health", label: "Data Health", icon: Database, quote: "Dados confiáveis geram decisões melhores." },
    ],
  },
  {
    id: "melhorar",
    label: "Melhorar",
    items: [
      { to: "/weekly-review", label: "Weekly Review", icon: ClipboardList, quote: "Pequenos ajustes hoje, grandes resultados amanhã." },
      { to: "/experimentos", label: "Experimentos", icon: FlaskConical, quote: "Teste pequeno, aprenda grande." },
      { to: "/conquistas", label: "Conquistas", icon: Trophy, quote: "Cada conquista começou com um hábito repetido." },
      { to: "/life-map", label: "Life Map", icon: Share2, quote: "Clareza nasce quando você enxerga as conexões." },
      { to: "/gatilhos", label: "Gatilhos", icon: BellRing, quote: "O lembrete certo na hora certa." },
    ],
  },
  {
    id: "admin",
    label: "Administração",
    adminOnly: true,
    items: [
      { to: "/configuracoes", label: "Configurações", icon: Settings },
      { to: "/admin/usuarios", label: "Usuários", icon: Users },
    ],
  },
];

/** Atalhos fixos da barra inferior no celular. */
export const MOBILE_PRIMARY: string[] = ["/dashboard", "/hoje", "/tarefas", "/projetos"];

export const DEFAULT_QUOTE = "Disciplina de hoje, liberdade de amanhã.";

export function visibleGroups(isAdmin: boolean): NavGroup[] {
  return NAV_GROUPS.filter((g) => !g.adminOnly || isAdmin);
}

/** Item de navegação correspondente à rota atual (considera sub-rotas como /projetos/:id). */
export function findNavItem(pathname: string): { item: NavItem; group: NavGroup } | null {
  let best: { item: NavItem; group: NavGroup } | null = null;
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (pathname === item.to || pathname.startsWith(`${item.to}/`)) {
        if (!best || item.to.length > best.item.to.length) best = { item, group };
      }
    }
  }
  return best;
}
