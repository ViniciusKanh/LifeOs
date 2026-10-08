import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import { Coins, Crown, Flame, ScrollText, Trophy, Zap } from "lucide-react";
import { RPGPanel, RPGPortrait, RPGProgressBar, rpgButtonClass } from "@/components/rpg";
import { useAuth } from "@/hooks/useAuth";
import { useGamificationProfile } from "@/hooks/useGamification";
import { useAchievements } from "@/hooks/useAchievements";
import { useEquippedTitle } from "@/hooks/useCodex";

/** Cores dos tokens RPG (sem hex solto). */
const tok = (name: string) => `rgb(var(--rpg-${name}))`;

function Chip({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center gap-2 border border-rpg-border/70 bg-rpg-bg-2/70 px-2.5 py-1.5 min-w-0" style={{ borderRadius: 3 }}>
      <span className={tone} aria-hidden>{icon}</span>
      <div className="min-w-0">
        <p className="font-pixel text-sm text-rpg-text leading-none">{value}</p>
        <p className="text-[10px] text-rpg-muted truncate">{label}</p>
      </div>
    </div>
  );
}

/**
 * Destaque do personagem: nível em evidência, XP até o próximo nível e o
 * "mapa de atributos" (as 7 dimensões reais do Life Score). Nada inventado:
 * sem dados, cada bloco mostra o estado vazio.
 */
export function RpgLevelSpotlight({ dimensions }: { dimensions: Array<{ key: string; label: string; value: number }> }) {
  const { user } = useAuth();
  const title = useEquippedTitle();
  const { data: p, isLoading, isError } = useGamificationProfile();
  const { achievements } = useAchievements(false);
  const unlocked = achievements.filter((a) => a.unlockedAt).length;
  const level = p?.level ?? 1;
  const hasAttributes = dimensions.some((d) => d.value > 0);

  return (
    <RPGPanel variant="legendary" bodyClassName="p-4 sm:p-5">
      <div className="grid gap-5 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,320px)] items-center">
        <div className="relative mx-auto">
          <RPGPortrait size="xl" />
          <span
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center border-2 border-rpg-gold bg-rpg-bg px-3 py-1 shadow-rpg"
            style={{ borderRadius: 3 }}
            aria-label={`Nível ${level}`}
          >
            <span className="font-pixel text-[9px] uppercase tracking-widest text-rpg-gold">Nível</span>
            <span className="font-pixel text-3xl leading-none text-rpg-gold-light">{level}</span>
          </span>
        </div>

        <div className="min-w-0 pt-4 lg:pt-0 text-center lg:text-left">
          <p className="font-pixel text-[11px] uppercase tracking-[0.18em] text-rpg-purple">{title}</p>
          <h2 className="rpg-title text-3xl sm:text-4xl font-bold leading-tight">{user?.name?.split(" ")[0] ?? "Aventureiro"}</h2>
          {isLoading && <div className="mt-3 h-4 rpg-bar animate-pulse" aria-label="Carregando progressão" />}
          {isError && <p className="mt-2 text-sm text-rpg-red">Não foi possível carregar a progressão.</p>}
          {p && (
            <>
              <RPGProgressBar
                className="mt-3"
                tone="purple"
                label={`Experiência do nível ${p.level}`}
                value={p.xpIntoLevel}
                max={p.xpForNextLevel}
                valueLabel={`${p.xpIntoLevel.toLocaleString("pt-BR")} / ${p.xpForNextLevel.toLocaleString("pt-BR")} XP`}
              />
              <p className="mt-1 text-xs text-rpg-muted">
                Faltam <span className="font-pixel text-rpg-gold-light">{(p.xpForNextLevel - p.xpIntoLevel).toLocaleString("pt-BR")} XP</span> para o nível {p.level + 1}
              </p>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Chip icon={<Zap size={15} />} label="XP hoje" value={`+${p.xpToday}`} tone="text-rpg-purple" />
                <Chip icon={<Flame size={15} />} label="Dias seguidos" value={String(p.streakDays)} tone="text-rpg-orange" />
                <Chip icon={<Coins size={15} />} label="Moedas" value={String(p.coins)} tone="text-rpg-gold" />
                <Chip icon={<Trophy size={15} />} label="Conquistas" value={`${unlocked}/${achievements.length}`} tone="text-rpg-green" />
              </div>
            </>
          )}
          <div className="mt-3 flex flex-wrap justify-center lg:justify-start gap-2">
            <Link to="/contratos" className={rpgButtonClass("gold")}><ScrollText size={14} aria-hidden /> Contratos</Link>
            <Link to="/tesouro" className={rpgButtonClass("secondary")}><Coins size={14} aria-hidden /> Tesouro</Link>
            <Link to="/perfil" className={rpgButtonClass("ghost")}><Crown size={14} aria-hidden /> Ficha</Link>
          </div>
        </div>

        <div className="min-w-0">
          <p className="mb-1 text-center font-rpg text-sm font-semibold text-rpg-text">Atributos do herói</p>
          {hasAttributes ? (
            <div className="h-56" role="img" aria-label={`Atributos (Life Score por dimensão): ${dimensions.map((d) => `${d.label} ${d.value}`).join(", ")}`}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={dimensions} outerRadius="72%">
                  <PolarGrid stroke={tok("border")} />
                  <PolarAngleAxis dataKey="label" tick={{ fontSize: 10, fill: tok("text-muted") }} />
                  <Radar dataKey="value" name="Pontos" stroke={tok("gold")} fill={tok("purple")} fillOpacity={0.35} />
                  <Tooltip formatter={(v: number) => [`${v}/100`, "Pontos"]} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-10 text-center text-xs text-rpg-muted">Dados insuficientes — registre tarefas, hábitos e saúde para revelar seus atributos.</p>
          )}
        </div>
      </div>
    </RPGPanel>
  );
}
