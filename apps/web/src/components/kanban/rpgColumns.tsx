import { Archive, CheckCircle2, Hourglass, ScrollText, Swords } from "lucide-react";

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

export const COLUMN_ICON_RPG: Record<string, JSX.Element> = {
  Backlog: <Archive size={16} />,
  "A Fazer": <Swords size={16} />,
  "Em Andamento": <Hourglass size={16} />,
  "Em Revisão": <ScrollText size={16} />,
  Concluído: <CheckCircle2 size={16} />,
};
