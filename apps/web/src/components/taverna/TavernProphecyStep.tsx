import clsx from "clsx";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, Hammer, Info } from "lucide-react";
import { RPGBadge, RPGPanel } from "@/components/rpg";
import { rpgButtonClass } from "@/components/rpg/RPGButton";
import { RPG_TONE_TEXT } from "@/components/rpg/rpgAssets";
import { ProvenanceBadge } from "@/components/experiments/AiThinking";
import type { ProphecyFactor } from "@/services/intelligenceService";
import type { TomorrowProphecy } from "@/services/tavernService";
import { ARTIFACT_ICON, STATUS_UI, pct } from "@/utils/intelligenceDisplay";

/** Faixa visual da probabilidade (o número continua visível). */
function omen(p: number): { label: string; tone: "green" | "gold" | "orange" } {
  if (p >= 0.65) return { label: "Provável", tone: "green" };
  if (p >= 0.4) return { label: "Incerto", tone: "gold" };
  return { label: "Improvável", tone: "orange" };
}

/** Fator com o valor real de HOJE (a véspera de amanhã). */
function factorText(f: ProphecyFactor): string {
  if (f.key === "weekend") return f.value === 1 ? "Amanhã é fim de semana" : "Amanhã é dia útil";
  if (f.value === null) return f.label;
  return `${f.label}: ${(Math.round(f.value * 10) / 10).toLocaleString("pt-BR")}`;
}

function ProphecyCard({ p }: { p: TomorrowProphecy }) {
  const ui = ARTIFACT_ICON[p.icon];
  const Icon = ui.icon;
  const o = p.probability === null ? null : omen(p.probability);
  const headingId = `taverna-prof-${p.artifactId}`;
  return (
    <li className="min-w-0">
      <article aria-labelledby={headingId} className="h-full border border-rpg-border bg-rpg-bg/60 p-3" style={{ borderRadius: 3 }}>
        <div className="flex items-start gap-2">
          <span className={clsx("mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center border border-rpg-gold/60 bg-rpg-panel", RPG_TONE_TEXT[ui.tone])} style={{ borderRadius: 3 }} aria-hidden>
            <Icon size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 id={headingId} className="text-sm font-semibold leading-tight text-rpg-text">{p.targetLabel}</h3>
            <p className="truncate text-[11px] text-rpg-muted">{p.artifactName}</p>
          </div>
          {p.status === "experimental" && <RPGBadge tone={STATUS_UI.experimental.tone}>Teste</RPGBadge>}
        </div>
        {p.probability === null || !o ? (
          <p className="mt-3 text-xs text-rpg-muted">{p.reason ?? "Sem registros de hoje para prever amanhã."}</p>
        ) : (
          <>
            <div className="mt-3 flex items-baseline justify-between gap-2">
              <span className="font-pixel text-2xl tabular-nums text-rpg-text" aria-label={`Chance de ${Math.round(p.probability * 100)} por cento`}>
                {Math.round(p.probability * 100)}%
              </span>
              <RPGBadge tone={o.tone}>{o.label}</RPGBadge>
            </div>
            <p className="mt-0.5 text-[11px] text-rpg-muted">Confiança do artefato: {pct(p.confidence)}</p>
            {p.factors.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-rpg-text" aria-label="Fatores que mais pesaram">
                {p.factors.slice(0, 3).map((f) => {
                  const up = f.effect > 0;
                  return (
                    <li key={f.key} className="flex items-center gap-1.5 min-w-0">
                      {up ? <ArrowUp size={12} className="shrink-0 text-rpg-green" aria-hidden /> : <ArrowDown size={12} className="shrink-0 text-rpg-red" aria-hidden />}
                      <span className="truncate" title={factorText(f)}>{factorText(f)}</span>
                      <span className={clsx("ml-auto shrink-0 font-pixel tabular-nums", up ? "text-rpg-green" : "text-rpg-red")}>
                        {up ? "+" : ""}
                        {f.effect} p.p.
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </article>
    </li>
  );
}

/** Passo 3 — Profecia de amanhã: inferência dos artefatos da Forja usando os registros de hoje como véspera. */
export function TavernProphecyStep({ prophecies }: { prophecies: TomorrowProphecy[] }) {
  if (!prophecies.length) {
    return (
      <RPGPanel title="Nenhum artefato forjado" icon={<Hammer size={15} />}>
        <p className="text-sm text-rpg-muted">
          A profecia de amanhã vem dos artefatos da Forja da Inteligência — modelos treinados só com os seus registros. Com cerca de 30 dias de dados,
          dá para forjar o primeiro (por exemplo, o Oráculo de Produtividade).
        </p>
        <Link to="/forja-inteligencia" className={rpgButtonClass("gold", "mt-3 inline-flex")}>
          <Hammer size={14} aria-hidden /> Ir para a Forja
        </Link>
      </RPGPanel>
    );
  }
  // Runas ausentes em todos os artefatos (o mesmo dia de véspera vale para todos).
  const missing = prophecies.find((p) => p.missing.length)?.missing ?? [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-rpg-muted">
        <ProvenanceBadge kind="inferencia" />
        <span>Estimativa dos seus artefatos para amanhã, lendo os registros de hoje. Não é garantia — é o padrão que o modelo aprendeu.</span>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {prophecies.map((p) => (
          <ProphecyCard key={p.artifactId} p={p} />
        ))}
      </ul>
      <p className="flex items-start gap-2 rpg-panel p-3 text-xs text-rpg-muted">
        <Info size={14} className="mt-0.5 shrink-0 text-rpg-blue" aria-hidden />
        <span>
          Hoje ainda não acabou: a chance muda conforme você registra.
          {missing.length > 0 && (
            <>
              {" "}Ainda sem registro hoje: <span className="text-rpg-text">{missing.map((m) => m.label.toLowerCase()).join(", ")}</span> — o modelo trata como ausente
              {missing.some((m) => m.key === "sleep_duration") ? " (o sono conta pela noite em que você se deita, então o desta noite entra quando for registrado)" : ""}.
            </>
          )}
        </span>
      </p>
    </div>
  );
}
