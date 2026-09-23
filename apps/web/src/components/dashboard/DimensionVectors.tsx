import { useId } from "react";

/**
 * Vetores ilustrativos pro Life Score do Dashboard — em vez de só uma barra
 * de progresso, cada dimensão ganha um desenho que "enche" de baixo pra
 * cima conforme o valor real (0-100), como o usuário pediu: um corpo humano
 * pra Saúde, um termômetro pras Metas. As demais dimensões usam um anel
 * circular com o ícone já usado no resto do app, pra manter a mesma
 * linguagem visual em vez de inventar um ícone novo por dimensão.
 *
 * Todos usam `fill="currentColor"` e herdam a cor via className de texto
 * (ex.: text-cat-blue), seguindo o mesmo mapeamento de tom das outras telas.
 */

const clampPct = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

/** Preenche um grupo de formas de baixo pra cima, proporcional a `pct` — usado pelo corpo e pelo termômetro. */
function BottomUpFill({
  pct,
  viewBoxWidth,
  viewBoxHeight,
  clipId,
  children,
}: {
  pct: number;
  viewBoxWidth: number;
  viewBoxHeight: number;
  clipId: string;
  children: React.ReactNode;
}) {
  const fillHeight = (viewBoxHeight * pct) / 100;
  return (
    <>
      <clipPath id={clipId}>
        <rect x={0} y={viewBoxHeight - fillHeight} width={viewBoxWidth} height={fillHeight + 1} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>{children}</g>
    </>
  );
}

/** Silhueta humana simples (cabeça + tronco) preenchida de baixo pra cima — vetor da dimensão Saúde. */
export function HealthBodyGauge({ pct, className = "" }: { pct: number; className?: string }) {
  const value = clampPct(pct);
  const clipId = useId();
  return (
    <svg viewBox="0 0 64 64" className={`w-full h-full ${className}`} role="img" aria-label={`Saúde: ${value} de 100`}>
      {/* silhueta de fundo (contorno sempre visível, bem apagado) */}
      <g opacity={0.16}>
        <circle cx="32" cy="12" r="9" fill="currentColor" />
        <rect x="14" y="24" width="36" height="38" rx="18" fill="currentColor" />
      </g>
      {/* preenchimento real, proporcional ao score */}
      <BottomUpFill pct={value} viewBoxWidth={64} viewBoxHeight={64} clipId={`health-${clipId}`}>
        <circle cx="32" cy="12" r="9" fill="currentColor" />
        <rect x="14" y="24" width="36" height="38" rx="18" fill="currentColor" />
      </BottomUpFill>
    </svg>
  );
}

/** Termômetro (bulbo sempre com um pouco de conteúdo + coluna proporcional ao score) — vetor da dimensão Metas. */
export function GoalsThermometerGauge({ pct, className = "" }: { pct: number; className?: string }) {
  const value = clampPct(pct);
  const clipId = useId();
  return (
    <svg viewBox="0 0 32 64" className={`w-full h-full ${className}`} role="img" aria-label={`Metas: ${value} de 100`}>
      <g opacity={0.16}>
        <rect x="11" y="4" width="10" height="42" rx="5" fill="currentColor" />
        <circle cx="16" cy="52" r="10" fill="currentColor" />
      </g>
      <BottomUpFill pct={value} viewBoxWidth={32} viewBoxHeight={64} clipId={`goals-${clipId}`}>
        <rect x="11" y="4" width="10" height="42" rx="5" fill="currentColor" />
        <circle cx="16" cy="52" r="10" fill="currentColor" />
      </BottomUpFill>
    </svg>
  );
}

/**
 * Anel circular com o ícone da dimensão no centro — reutilizado por
 * Produtividade, Profissional, Educação, Leitura e Hábitos, mantendo o
 * mesmo ícone já usado no card "Como o Life Score é calculado" em vez de
 * criar um vetor novo pra cada uma.
 */
export function DimensionRingGauge({
  pct,
  icon,
  className = "",
  trackClassName = "text-paper-border dark:text-ink-border",
  size = 56,
}: {
  pct: number;
  icon: React.ReactNode;
  className?: string;
  trackClassName?: string;
  size?: number;
}) {
  const value = clampPct(pct);
  const stroke = Math.max(4, Math.round(size / 11));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value / 100);
  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} className={trackClassName} stroke="currentColor" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          stroke="currentColor"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.4s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{icon}</div>
    </div>
  );
}
