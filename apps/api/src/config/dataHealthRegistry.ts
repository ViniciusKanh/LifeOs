/**
 * Data Health — registro central dos módulos monitorados.
 * Só metadados (rótulo, cor semântica, rota de destino); as
 * verificações reais vivem em dataHealthService.ts e
 * dataQualityRules.ts. Adicionar um módulo novo é só adicionar uma
 * entrada aqui + o cálculo de cobertura correspondente no service.
 */

export type DataHealthModuleKey =
  | "tasks"
  | "projects"
  | "goals"
  | "habits"
  | "education"
  | "library"
  | "health"
  | "experiments"
  | "signals";

export interface DataHealthModuleDefinition {
  key: DataHealthModuleKey;
  label: string;
  /** Rota para onde o usuário é levado ao clicar num alerta/ação deste módulo. */
  openPath: string;
}

export const DATA_HEALTH_MODULES: DataHealthModuleDefinition[] = [
  { key: "tasks", label: "Tarefas", openPath: "/tarefas" },
  { key: "projects", label: "Projetos", openPath: "/projetos" },
  { key: "goals", label: "Metas", openPath: "/metas" },
  { key: "habits", label: "Hábitos", openPath: "/habitos" },
  { key: "education", label: "Educação", openPath: "/educacao" },
  { key: "library", label: "Biblioteca", openPath: "/biblioteca" },
  { key: "health", label: "Saúde", openPath: "/saude" },
  { key: "experiments", label: "Experimentos", openPath: "/experimentos" },
  { key: "signals", label: "Signals", openPath: "/signals" },
];

export const MODULE_LABEL: Record<DataHealthModuleKey, string> = Object.fromEntries(
  DATA_HEALTH_MODULES.map((m) => [m.key, m.label])
) as Record<DataHealthModuleKey, string>;

export const MODULE_PATH: Record<DataHealthModuleKey, string> = Object.fromEntries(
  DATA_HEALTH_MODULES.map((m) => [m.key, m.openPath])
) as Record<DataHealthModuleKey, string>;
