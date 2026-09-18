import { CloudSun, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, IconBadge } from "@/components/ui/primitives";
import type { CapacityContextSummary } from "@/types";

export function ContextCard({ context }: { context: CapacityContextSummary }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <IconBadge tone="blue" icon={<CloudSun size={18} />} size={36} />
        <p className="text-sm font-semibold">Contexto do dia</p>
      </div>
      {context.temperature != null ? (
        <>
          <p className="font-display font-bold text-xl">{Math.round(context.temperature)}°C</p>
          <p className="text-xs text-slate mt-1">{context.condition}</p>
          <p className="text-xs mt-1 font-medium" style={{ color: context.favorable ? "#2E7D6B" : "#C9821E" }}>
            {context.favorable ? "Condições favoráveis" : "Condições exigem atenção"}
          </p>
        </>
      ) : (
        <p className="text-sm text-slate">Contexto do Dia ainda não configurado.</p>
      )}
      <Link to="/contexto-do-dia" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400 mt-3">
        Ver detalhes <ChevronRight size={14} />
      </Link>
    </Card>
  );
}
