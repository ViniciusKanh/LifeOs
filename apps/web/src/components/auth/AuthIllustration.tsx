import type { ReactNode } from "react";
import { IconBadge } from "@/components/ui/primitives";

/**
 * Painel ilustrado usado em Login e Cadastro. Compartilhado entre as
 * duas telas (só muda o texto/ícones recebidos por props) para não
 * duplicar a cena SVG nem o layout — ver seção 66 do briefing.
 */

export interface AuthFeature {
  icon: ReactNode;
  label: string;
  tone: "blue" | "purple" | "green" | "pink" | "teal" | "amber";
}

export function AuthIllustration({
  headline,
  subheadline,
  features,
  insight,
  vertical,
}: {
  headline: ReactNode;
  subheadline: string;
  features: AuthFeature[];
  insight: string;
  vertical: string;
}) {
  return (
    <div className="relative hidden md:flex md:w-1/2 flex-col justify-between overflow-hidden px-12 py-12 lg:px-16 text-white bg-gradient-to-br from-brand-700 via-brand-600 to-signal-deep">
      {/* Cena original (sol + lago + montanhas), toda em SVG — não é
          uma reprodução de nenhuma arte de terceiros. */}
      <svg
        className="absolute inset-0 h-full w-full opacity-90"
        viewBox="0 0 600 800"
        preserveAspectRatio="xMidYMax slice"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="sun" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFE7B8" />
            <stop offset="55%" stopColor="#F0A93B" />
            <stop offset="100%" stopColor="#F0A93B" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="mtn-far" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6472E8" />
            <stop offset="100%" stopColor="#4C5FE0" />
          </linearGradient>
          <linearGradient id="mtn-near" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3F4FC4" />
            <stop offset="100%" stopColor="#2F3A94" />
          </linearGradient>
          <linearGradient id="lake" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D9860F" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#3F4FC4" stopOpacity="0.5" />
          </linearGradient>
        </defs>

        <circle cx="300" cy="330" r="150" fill="url(#sun)" />
        <circle cx="300" cy="330" r="72" fill="#FCEBC7" opacity="0.95" />

        <path d="M0 430 L120 300 L210 400 L330 260 L430 390 L520 320 L600 430 L600 500 L0 500 Z" fill="url(#mtn-far)" opacity="0.55" />
        <path d="M0 500 L90 400 L200 480 L300 380 L420 470 L520 400 L600 480 L600 560 L0 560 Z" fill="url(#mtn-near)" opacity="0.8" />

        <rect x="0" y="500" width="600" height="300" fill="url(#lake)" />
        <ellipse cx="300" cy="512" rx="150" ry="16" fill="#FCEBC7" opacity="0.25" />
      </svg>

      <div className="relative z-10">
        <p className="font-display font-semibold text-2xl leading-tight max-w-sm">{headline}</p>
        <p className="mt-3 text-sm text-white/80 max-w-xs">{subheadline}</p>

        <div className="mt-8 flex flex-col gap-3 max-w-xs">
          {features.map((f) => (
            <div key={f.label} className="flex items-center gap-3 rounded-xl bg-white/10 backdrop-blur-sm px-3 py-2.5 border border-white/10">
              <IconBadge icon={f.icon} tone={f.tone} size={32} />
              <span className="text-sm font-medium">{f.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-10 flex items-end justify-between gap-6">
        <div className="max-w-[15rem] rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 px-4 py-3.5">
          <p className="text-sm leading-snug text-white/95">{insight}</p>
        </div>
        <p
          className="hidden lg:block shrink-0 text-xs font-semibold tracking-[0.3em] text-white/50 whitespace-nowrap"
          style={{ writingMode: "vertical-rl" }}
        >
          {vertical}
        </p>
      </div>
    </div>
  );
}
