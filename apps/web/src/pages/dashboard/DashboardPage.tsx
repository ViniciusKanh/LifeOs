import { LifeScoreRadar } from "@/components/charts/LifeScoreRadar";
import { useTasks } from "@/hooks/useTasks";
import { useAuth } from "@/hooks/useAuth";

export function DashboardPage() {
  const { user } = useAuth();
  const { tasks } = useTasks();

  const doneTasks = tasks.filter((t) => t.status === "Concluído").length;
  const plannedTasks = tasks.length;
  const productivityScore = plannedTasks > 0 ? Math.round((doneTasks / plannedTasks) * 100) : 0;

  // Enquanto os demais módulos (saúde, educação, leitura...) não têm
  // rotas de API ainda, usamos 0 como valor honesto — nunca inventamos
  // um número. Assim que habits/health/books tiverem endpoints, este
  // cálculo passa a agregar dados reais de cada um.
  const dims = [
    { dim: "Produtividade", value: productivityScore },
    { dim: "Saúde", value: 0 },
    { dim: "Educação", value: 0 },
    { dim: "Leitura", value: 0 },
    { dim: "Hábitos", value: 0 },
    { dim: "Profissional", value: 0 },
    { dim: "Metas", value: 0 },
  ];
  const lifeScore = Math.round(dims.reduce((a, b) => a + b.value, 0) / dims.length);

  return (
    <div className="px-5 py-6 md:px-8 md:py-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <p className="font-display font-medium text-2xl">Olá, {user?.name?.split(" ")[0] ?? ""}.</p>
        <p className="text-sm mt-1 text-slate">Aqui está o retrato atual da sua rotina.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4 mb-4">
        <div className="rounded-2xl p-6 flex flex-col md:flex-row items-center gap-6 border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised">
          <div className="w-full md:w-40 h-40 shrink-0">
            <LifeScoreRadar data={dims} />
          </div>
          <div className="flex-1 w-full">
            <div className="flex items-end gap-2">
              <span className="font-display font-medium text-5xl leading-none">{lifeScore}</span>
              <span className="text-sm mb-1 text-slate">/ 100 · Life Score</span>
            </div>
            <div className="mt-4 space-y-2">
              {dims.map((d) => (
                <div key={d.dim} className="flex items-center gap-3 text-xs">
                  <span className="w-24 shrink-0 text-slate">{d.dim}</span>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border">
                    <div className="h-full rounded-full bg-signal" style={{ width: `${d.value}%` }} />
                  </div>
                  <span className="w-6 text-right">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl p-6 border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised">
          <p className="text-sm font-semibold mb-4">Tarefas</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate">Concluídas</p>
              <p className="font-display font-medium text-2xl">
                {doneTasks}/{plannedTasks}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate">Progresso</p>
              <p className="font-display font-medium text-2xl">{productivityScore}%</p>
            </div>
          </div>
          <div className="mt-5 pt-5 border-t border-paper-border dark:border-ink-border">
            <div className="h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border">
              <div className="h-full rounded-full bg-growth" style={{ width: `${productivityScore}%` }} />
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-slate">
        As demais dimensões do Life Score ficam em 0 até os módulos de Saúde, Educação, Leitura, Hábitos, Profissional
        e Metas terem suas próprias rotas de API implementadas (Fases 3 a 6).
      </p>
    </div>
  );
}
