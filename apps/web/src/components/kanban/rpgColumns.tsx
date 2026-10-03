import { Flag, PackageOpen, ScrollText, Search, Swords } from "lucide-react";

/**
 * Colunas do Kanban de missões no tema RPG — compartilhadas entre Tarefas
 * e o detalhe da campanha (Projeto). Cores lidas dos tokens:
 * bronze (backlog), azul (a fazer), roxo (andamento), laranja (revisão), verde (concluído).
 */
export const COLUMN_ACCENT_RPG: Record<string, string> = {
  Backlog: "rgb(var(--rpg-bronze))",
  "A Fazer": "rgb(var(--rpg-blue))",
  "Em Andamento": "rgb(var(--rpg-purple))",
  "Em Revisão": "rgb(var(--rpg-orange))",
  Concluído: "rgb(var(--rpg-green))",
};

// Baú (backlog), pergaminho (a fazer), espadas (andamento), lupa (revisão), bandeira (concluído).
export const COLUMN_ICON_RPG: Record<string, JSX.Element> = {
  Backlog: <PackageOpen size={16} />,
  "A Fazer": <ScrollText size={16} />,
  "Em Andamento": <Swords size={16} />,
  "Em Revisão": <Search size={16} />,
  Concluído: <Flag size={16} />,
};

export const COLUMN_HINT_RPG: Record<string, string> = {
  Backlog: "Missões futuras e ideias.",
  "A Fazer": "Próximas missões da jornada.",
  "Em Andamento": "Missões em execução.",
  "Em Revisão": "Aguardando verificação.",
  Concluído: "Missões completadas.",
};
