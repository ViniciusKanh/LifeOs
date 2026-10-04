import {
  Dna,
  Scroll,
  BarChart3,
  BookOpen,
  Briefcase,
  CalendarRange,
  ClipboardList,
  Compass,
  Hammer,
  FlaskConical,
  GanttChartSquare,
  GraduationCap,
  HeartPulse,
  History,
  Inbox,
  LayoutGrid,
  ListChecks,
  NotebookPen,
  NotebookText,
  FolderLock,
  Radar,
  Repeat,
  ScrollText,
  BookMarked,
  Coins,
  Backpack,
  Settings,
  Share2,
  Sun,
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
export interface NavTab {
  to: string;
  label: string;
}

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Frase curta do cabeçalho (decoração, sem dado nenhum). */
  quote?: string;
  /** Nome exibido só no tema RPG (camada de UX; a rota e o domínio continuam os mesmos). */
  rpgLabel?: string;
  /**
   * Abas do "hub": telas irmãs que deixaram de ocupar uma linha própria no
   * menu. As rotas antigas continuam valendo; o AppShell desenha as abas.
   */
  tabs?: NavTab[];
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
  adminOnly?: boolean;
}

/*
 * Menu enxuto (de 28 para 21 itens): telas relacionadas viram abas de um
 * hub — ex.: Signals, Goal Forecast e Data Health moram dentro de Analytics;
 * Capacity Planner e Deadline Radar dentro de Tarefas. O Dashboard é a tela principal.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "planejar",
    label: "Planejar",
    items: [
      // Tela principal: o painel do personagem (HUD) com nível, XP e ritmo.
      { to: "/dashboard", label: "Dashboard", rpgLabel: "Painel do Herói", icon: LayoutGrid, quote: "Disciplina de hoje, liberdade de amanhã." },
      {
        to: "/hoje",
        label: "Hoje",
        icon: Sun,
        quote: "Consistência hoje, resultados amanhã.",
        tabs: [
          { to: "/hoje", label: "Hoje" },
          { to: "/contexto-do-dia", label: "Contexto do dia" },
          { to: "/gatilhos", label: "Lembretes" },
        ],
      },
      { to: "/inbox", label: "Inbox", icon: Inbox, quote: "Capture agora, decida depois." },
      {
        to: "/semana",
        label: "Agenda",
        icon: CalendarRange,
        quote: "Quem planeja o tempo, comanda o progresso.",
        tabs: [
          { to: "/semana", label: "Semana" },
          { to: "/calendario", label: "Calendário" },
        ],
      },
      {
        to: "/direcao",
        label: "Direção",
        icon: Compass,
        quote: "Um objetivo sem plano é apenas um desejo.",
        tabs: [
          { to: "/direcao", label: "Visão e ciclos" },
          { to: "/metas", label: "Metas" },
        ],
      },
      { to: "/forja-campanhas", label: "Forja de Campanhas", icon: Hammer, quote: "Grandes conquistas nascem de muitas pequenas vitórias." },
    ],
  },
  {
    id: "executar",
    label: "Executar",
    items: [
      {
        to: "/tarefas",
        label: "Tarefas",
        rpgLabel: "Missões",
        icon: ListChecks,
        quote: "Disciplina de hoje, liberdade de amanhã.",
        tabs: [
          { to: "/tarefas", label: "Quadro" },
          { to: "/capacity-planner", label: "Carga" },
          { to: "/deadline-radar", label: "Prazos" },
        ],
      },
      { to: "/contratos", label: "Contratos", icon: ScrollText, quote: "Um pacto cumprido vale mais que mil promessas." },
      { to: "/projetos", label: "Projetos", icon: GanttChartSquare, quote: "Projetos claros avançam mais rápido." },
      { to: "/profissional", label: "Profissional", icon: Briefcase, quote: "Foco no que move os ponteiros." },
    ],
  },
  {
    id: "registrar",
    label: "Registrar",
    items: [
      { to: "/diario", label: "Diário", icon: NotebookPen, quote: "Escrever é enxergar o próprio caminho." },
      { to: "/notas", label: "Notas", icon: NotebookText, quote: "Ideias conectadas viram conhecimento." },
      { to: "/habitos", label: "Hábitos", icon: Repeat, quote: "Disciplina é a ponte entre seus objetivos e seus sonhos." },
      { to: "/saude", label: "Saúde", icon: HeartPulse, quote: "Corpo saudável, mente mais forte." },
      { to: "/biblioteca", label: "Biblioteca", icon: BookOpen, quote: "Livros constroem a melhor versão de nós." },
      { to: "/educacao", label: "Educação", icon: GraduationCap, quote: "Estudo hoje, liberdade amanhã." },
      { to: "/administracao", label: "Administração", icon: FolderLock, quote: "O que é lembrado a tempo não vira problema." },
    ],
  },
  {
    id: "medir",
    label: "Medir",
    items: [
      {
        to: "/analytics",
        label: "Analytics",
        icon: BarChart3,
        quote: "Dados transformam esforço em clareza.",
        tabs: [
          { to: "/analytics", label: "Visão geral" },
          { to: "/signals", label: "Sinais" },
          { to: "/goal-forecast", label: "Previsão de metas" },
          { to: "/data-health", label: "Qualidade dos dados" },
        ],
      },
      { to: "/timeline", label: "Timeline", icon: History, quote: "Sua história, registrada automaticamente." },
      { to: "/codex", label: "Códex da Jornada", icon: BookMarked, quote: "Toda grande história começa com um registro." },
    ],
  },
  {
    id: "melhorar",
    label: "Melhorar",
    items: [
      {
        to: "/revisoes",
        label: "Revisões",
        icon: ClipboardList,
        quote: "Pequenos ajustes hoje, grandes resultados amanhã.",
        tabs: [
          { to: "/weekly-review", label: "Semanal" },
          { to: "/revisoes", label: "Mês, trimestre e ano" },
        ],
      },
      { to: "/experimentos", label: "Experimentos", icon: FlaskConical, quote: "Teste pequeno, aprenda grande." },
      { to: "/life-map", label: "Life Map", icon: Share2, quote: "Clareza nasce quando você enxerga as conexões." },
      {
        to: "/conquistas",
        label: "Conquistas",
        icon: Trophy,
        quote: "Cada conquista começou com um hábito repetido.",
      },
      { to: "/tesouro", label: "Tesouro & Recompensas", icon: Coins, quote: "Pequenas recompensas sustentam grandes jornadas." },
      { to: "/inventario", label: "Coleção / Inventário", icon: Backpack, quote: "Organize o que você conquistou — e use com propósito." },
      { to: "/build", label: "Build do Personagem", icon: Dna, quote: "Conheça seus atributos para escolher o próximo passo." },
      { to: "/protocolos", label: "Protocolos", icon: Scroll, quote: "Situações repetidas merecem respostas prontas." },
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
export const MOBILE_PRIMARY: string[] = ["/dashboard", "/hoje", "/tarefas", "/notas"];

export const DEFAULT_QUOTE = "Disciplina de hoje, liberdade de amanhã.";

export function visibleGroups(isAdmin: boolean): NavGroup[] {
  return NAV_GROUPS.filter((g) => !g.adminOnly || isAdmin);
}

/** Item de navegação correspondente à rota atual (considera sub-rotas como /projetos/:id e as abas de cada hub). */
/** Rótulo do item conforme o tema (no RPG, Tarefas → Missões, Hábitos → Contratos). */
export function navLabel(item: Pick<NavItem, "label" | "rpgLabel">, isRpg: boolean): string {
  return isRpg && item.rpgLabel ? item.rpgLabel : item.label;
}

export function findNavItem(pathname: string): { item: NavItem; group: NavGroup; tab: NavTab | null } | null {
  let best: { item: NavItem; group: NavGroup; tab: NavTab | null; len: number } | null = null;
  const matches = (to: string) => pathname === to || pathname.startsWith(`${to}/`);
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      const paths: Array<{ to: string; tab: NavTab | null }> = [{ to: item.to, tab: null }, ...(item.tabs ?? []).map((t) => ({ to: t.to, tab: t }))];
      for (const p of paths) {
        if (matches(p.to) && (!best || p.to.length > best.len)) best = { item, group, tab: p.tab, len: p.to.length };
      }
    }
  }
  return best ? { item: best.item, group: best.group, tab: best.tab } : null;
}

/** Lista plana de todas as telas (itens e abas), para a paleta de comandos (Ctrl K). */
export function allDestinations(isAdmin: boolean): Array<{ to: string; label: string; group: string }> {
  const out: Array<{ to: string; label: string; group: string }> = [];
  for (const g of visibleGroups(isAdmin)) {
    for (const item of g.items) {
      out.push({ to: item.to, label: item.label, group: g.label });
      for (const t of item.tabs ?? []) if (t.to !== item.to) out.push({ to: t.to, label: `${item.label} › ${t.label}`, group: g.label });
    }
  }
  return out;
}
