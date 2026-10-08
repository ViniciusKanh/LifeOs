import { Link } from "react-router-dom";
import clsx from "clsx";
import { AlertTriangle, BellRing, ChevronRight, Hammer, Lightbulb, Scale, type LucideIcon } from "lucide-react";
import { RPGPanel } from "@/components/rpg";
import type { CoreAlert } from "@/services/intelligenceService";

const UI: Record<CoreAlert["type"], { icon: LucideIcon; cls: string; title: string }> = {
  drift: { icon: AlertTriangle, cls: "text-rpg-red border-rpg-red/60", title: "text-rpg-red" },
  reforge: { icon: Hammer, cls: "text-rpg-purple border-rpg-purple/60", title: "text-rpg-text" },
  experimental: { icon: Scale, cls: "text-rpg-orange border-rpg-orange/60", title: "text-rpg-orange" },
  opportunity: { icon: Lightbulb, cls: "text-rpg-gold-light border-rpg-gold/60", title: "text-rpg-blue" },
};

/** Alertas reais do núcleo (deriva, reforja, sem vantagem, oportunidade). Clique leva à ação correspondente. */
export function CoreAlertsPanel({ alerts, onInspect, onReforge }: { alerts: CoreAlert[]; onInspect: (id: string) => void; onReforge: (id: string) => void }) {
  return (
    <RPGPanel title="Alertas do Núcleo" icon={<BellRing size={15} />} className="h-full">
      {alerts.length === 0 ? (
        <p className="text-sm text-rpg-muted py-4">Nenhum alerta. Os artefatos estão estáveis — ou ainda não há artefatos forjados.</p>
      ) : (
        <ul className="space-y-2">
          {alerts.slice(0, 4).map((a, i) => {
            const ui = UI[a.type];
            const inner = (
              <>
                <span className={clsx("inline-flex w-10 h-10 shrink-0 items-center justify-center border-2 bg-rpg-bg", ui.cls)} style={{ borderRadius: 3 }} aria-hidden>
                  <ui.icon size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={clsx("block text-sm font-semibold", ui.title)}>{a.title}</span>
                  <span className="block text-xs text-rpg-muted leading-snug">{a.description}</span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-rpg-muted" aria-hidden />
              </>
            );
            const cls = "flex w-full items-center gap-3 border border-rpg-border/70 bg-rpg-bg-2/60 p-2.5 text-left hover:bg-rpg-panel-hover transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold";
            return (
              <li key={`${a.type}-${a.artifactId}-${i}`}>
                {a.type === "opportunity" ? (
                  <Link to="/saude" className={cls} style={{ borderRadius: 3 }}>
                    {inner}
                  </Link>
                ) : (
                  <button type="button" className={cls} style={{ borderRadius: 3 }} onClick={() => (a.type === "reforge" ? onReforge(a.artifactId) : onInspect(a.artifactId))}>
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </RPGPanel>
  );
}
