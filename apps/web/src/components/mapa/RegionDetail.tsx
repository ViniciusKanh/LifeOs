import { Link } from "react-router-dom";
import { ArrowRight, CloudFog, Footprints, Trophy } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RPGBadge, RPGProgressBar } from "@/components/rpg";
import { RPG_TONE_TEXT } from "@/components/rpg/rpgAssets";
import type { WorldRegion } from "@/services/worldmapService";
import { REGION_UI, trendInfo } from "./regionUi";

const fmtDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** Painel da região: progresso, fontes reais do XP, último feito, atividade e próximo passo. */
export function RegionDetail({ region, onClose }: { region: WorldRegion | null; onClose: () => void }) {
  if (!region) return null;
  const ui = REGION_UI[region.key];
  const Icon = ui.icon;
  const trend = trendInfo(region);
  const span = region.nextLevelXp - region.levelStartXp;
  const into = region.xp - region.levelStartXp;

  return (
    <Modal open onClose={onClose} size="lg" title={region.fogged ? `${region.name} — em névoa` : `${region.name} — Nv. ${region.level}`}>
      <div className="space-y-4 text-sm">
        <div className="flex items-start gap-3">
          <span
            className={`shrink-0 w-12 h-12 flex items-center justify-center border-2 border-rpg-gold/60 bg-rpg-bg ${region.fogged ? "text-rpg-muted" : RPG_TONE_TEXT[ui.tone]}`}
            style={{ borderRadius: 3 }}
            aria-hidden
          >
            {region.fogged ? <CloudFog size={24} /> : <Icon size={24} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-rpg-text/85">{region.description}</p>
            {!region.fogged && (
              <>
                <RPGProgressBar className="mt-2" tone={ui.tone} label={`Nível ${region.level} → ${region.level + 1}`} value={into} max={span} valueLabel={`${into} / ${span} XP`} />
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-rpg-muted">
                  <span>
                    Total {region.xp} XP em {region.events} {region.events === 1 ? "registro" : "registros"}
                  </span>
                  <span aria-hidden>·</span>
                  <span>
                    30 dias: {region.last30} XP (anteriores: {region.prev30} XP)
                  </span>
                  <RPGBadge tone={trend.tone}>{trend.text}</RPGBadge>
                </p>
              </>
            )}
          </div>
        </div>

        {region.fogged && (
          <div className="rpg-parchment p-3">
            <p className="font-rpg font-bold text-rpg-ink">Como desbloquear</p>
            <p className="mt-1 text-rpg-ink/85">{region.unlockHint}</p>
          </div>
        )}

        {!region.fogged && (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rpg-panel p-3">
              <p className="font-semibold text-rpg-text mb-1">Principais fontes de XP</p>
              {region.topSources.length === 0 ? (
                <p className="text-xs text-rpg-muted">Nenhum XP classificado nesta região ainda.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {region.topSources.map((s) => (
                    <li key={s.source} className="flex justify-between gap-2">
                      <span className="text-rpg-text">{s.label}</span>
                      <span className="font-pixel text-rpg-muted tabular-nums">{s.xp} XP</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rpg-panel p-3">
              <p className="font-semibold text-rpg-text mb-1 flex items-center gap-1.5">
                <Trophy size={14} className="text-rpg-gold-light" aria-hidden /> Último feito
              </p>
              {region.lastFeat ? (
                <p className="text-xs text-rpg-text">
                  {region.lastFeat.label ?? "Registro sem descrição"}
                  <span className="block text-rpg-muted">
                    {fmtDay(region.lastFeat.dayKey)} · +{region.lastFeat.xp} XP
                  </span>
                </p>
              ) : (
                <p className="text-xs text-rpg-muted">Nenhum feito registrado aqui ainda.</p>
              )}
            </div>
          </div>
        )}

        {region.activity && (
          <div className="rpg-panel p-3">
            <p className="font-semibold text-rpg-text">Atividade real (últimos {region.activity.windowDays} dias)</p>
            <p className="text-[11px] text-rpg-muted">Registros que não geram XP — mostrados à parte, sem alterar o nível.</p>
            <RPGProgressBar
              className="mt-2"
              tone={ui.tone}
              label="Dias com registro"
              value={region.activity.activeDays30}
              max={region.activity.windowDays}
              valueLabel={`${region.activity.activeDays30}/${region.activity.windowDays} dias`}
            />
            <ul className="mt-2 flex flex-wrap gap-2 text-xs">
              {region.activity.items.map((i) => (
                <li key={i.label} className="border border-rpg-border bg-rpg-bg-2 px-2 py-1 text-rpg-text" style={{ borderRadius: 3 }}>
                  {i.label}: <span className="font-pixel tabular-nums">{i.count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rpg-panel rpg-panel-gold p-3">
          <p className="font-semibold text-rpg-gold-light flex items-center gap-1.5">
            <Footprints size={14} aria-hidden /> Próximo passo
          </p>
          {region.nextStep ? (
            <>
              <p className="mt-1 text-rpg-text">{region.nextStep.label}</p>
              <p className="text-xs text-rpg-muted">{region.nextStep.detail}</p>
              <Link to={region.nextStep.href} className="rpg-btn rpg-btn-primary mt-2 inline-flex items-center gap-1.5 text-sm" onClick={onClose}>
                Ir agora <ArrowRight size={14} aria-hidden />
              </Link>
            </>
          ) : (
            <p className="mt-1 text-xs text-rpg-muted">
              Nenhuma meta ativa ou tarefa aberta ligada a esta região. Crie uma meta da área ou vincule um projeto para receber sugestões.
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Link to={region.href} className="rpg-btn rpg-btn-secondary inline-flex items-center gap-1.5 text-sm" onClick={onClose}>
            Abrir a tela da área <ArrowRight size={14} aria-hidden />
          </Link>
        </div>
      </div>
    </Modal>
  );
}
