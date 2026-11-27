import { useState } from "react";
import clsx from "clsx";
import { useQueryClient } from "@tanstack/react-query";
import { Award, Database, Route, ScrollText, Star, Trash2 } from "lucide-react";
import { RPGBadge, RPGButton, RPGProgressBar } from "@/components/rpg";
import { KitSection } from "@/components/rpg-modules/ModuleKit";
import { KeySourceNote, PublicKeyForm } from "@/components/integrations/PublicApiKit";
import { useAuth } from "@/hooks/useAuth";
import { useStationActions } from "@/hooks/useStation";
import { TRANSIT_KEY } from "@/hooks/usePublicApis";
import { stationService, type StationOverview } from "@/services/stationService";
import { LineBadge, R } from "./StationKit";

type Notify = (m: string, tone?: "success" | "error") => void;
const WD = ["D", "S", "T", "Q", "Q", "S", "S"];

export function Punctuality({ o }: { o: StationOverview }) {
  const n = o.stats.onTimeTotal;
  const tier = n < 10 ? { name: "Pontual como a Guarda", target: 10 } : { name: "Cocheiro Lendário", target: 50 };
  return (
    <KitSection title="Pontualidade" icon={<Award size={16} />}>
      <p className="flex items-baseline gap-2">
        <span className="font-rpg text-3xl font-bold text-rpg-green">{n}</span>
        <span className="text-xs text-rpg-muted">partida(s) na hora certa</span>
      </p>
      <ol className="mt-2 grid grid-cols-7 gap-1" aria-label="Últimos 7 dias">
        {o.stats.week.map((d) => (
          <li key={d.day} title={d.day} className={clsx("flex h-9 flex-col items-center justify-center border text-[10px]", d.onTime == null ? "border-rpg-border text-rpg-muted" : d.onTime ? "border-rpg-green/60 bg-rpg-green/10 text-rpg-green" : "border-rpg-red/60 bg-rpg-red/10 text-rpg-red")} style={R}>
            <span>{WD[new Date(`${d.day}T12:00:00`).getDay()]}</span>
            <span aria-label={d.onTime == null ? "sem partida" : d.onTime ? "na hora" : "atrasado"}>{d.onTime == null ? "·" : d.onTime ? "✓" : "✗"}</span>
          </li>
        ))}
      </ol>
      <RPGProgressBar className="mt-3" label={`Conquista: ${tier.name}`} value={Math.min(n, tier.target)} max={tier.target} valueLabel={`${Math.min(n, tier.target)}/${tier.target}`} tone="gold" />
      <p className="mt-1 text-[10px] text-rpg-muted">
        “Parti agora” na janela certa vale +{o.rules.onTime} XP e {o.rules.coins} moedas, uma vez por dia (até {o.rules.graceMinutes} min de atraso).
      </p>
    </KitSection>
  );
}

export function TravelLog({ o }: { o: StationOverview }) {
  return (
    <KitSection title="Diário de bordo" icon={<ScrollText size={16} />}>
      {o.stats.log.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nenhuma partida registrada ainda.</p>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {o.stats.log.map((l) => (
            <li key={l.day} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-dashed border-rpg-border/60 pb-1.5">
              <span className="w-12 text-rpg-muted">{l.day.split("-").reverse().slice(0, 2).join("/")}</span>
              <span className="font-semibold text-rpg-text">{l.line ?? "—"}</span>
              <span className="text-rpg-muted">saiu {new Date(l.leftAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
              <span className={l.onTime ? "text-rpg-green" : "text-rpg-orange"}>{l.onTime ? "na hora" : "fora da janela"}</span>
              {l.eventTitle && <span className="w-full truncate text-[10px] text-rpg-muted">para “{l.eventTitle}”</span>}
            </li>
          ))}
        </ul>
      )}
    </KitSection>
  );
}

export function JourneyList({ o, notify }: { o: StationOverview; notify: Notify }) {
  const a = useStationActions();
  return (
    <KitSection title="Jornadas guardadas" icon={<Route size={16} />}>
      {o.journeys.length === 0 ? (
        <p className="text-sm text-rpg-muted">Consulte o Oráculo e guarde o caminho que você faz sempre (ex.: Casa → Trabalho).</p>
      ) : (
        <ul className="space-y-2">
          {o.journeys.map((j) => (
            <li key={j.id} className={clsx("flex items-center gap-2 border-2 bg-rpg-bg-2 p-2", j.primary ? "border-rpg-gold/70" : "border-rpg-border")} style={R}>
              <LineBadge l={j} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-rpg-text">{j.name}</p>
                <p className="truncate text-[11px] text-rpg-muted">
                  {j.boardName} → {j.alightName} · {j.walkTo + j.ride + j.walkFrom} min + espera
                </p>
              </div>
              {j.primary ? (
                <RPGBadge tone="gold">Principal</RPGBadge>
              ) : (
                <button type="button" aria-label={`Tornar ${j.name} a jornada principal`} onClick={() => a.primaryJourney.mutate(j.id)} className="text-rpg-muted hover:text-rpg-gold">
                  <Star size={15} aria-hidden />
                </button>
              )}
              <button type="button" aria-label={`Remover ${j.name}`} onClick={() => a.removeJourney.mutate(j.id, { onSuccess: () => notify("Jornada removida.") })} className="text-rpg-muted hover:text-rpg-red">
                <Trash2 size={15} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </KitSection>
  );
}

/** Importa o GTFS em passos (cada chamada cabe no limite de 60 s da Vercel). Só administrador. */
function GtfsImport({ notify }: { notify: Notify }) {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      let step: number | null = 0;
      for (let i = 0; step != null && i < 40; i++) {
        const r: { nextStep: number | null; message: string } = await stationService.importStep(step);
        setProgress(r.message);
        step = r.nextStep;
      }
      notify("Programação da SPTrans importada.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "A importação falhou.", "error");
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: TRANSIT_KEY });
    }
  };
  return (
    <div className="space-y-1">
      <RPGButton variant="gold" className="text-xs" disabled={busy} onClick={() => void run()}>
        <Database size={13} aria-hidden /> {busy ? "Importando…" : "Importar / atualizar GTFS"}
      </RPGButton>
      {progress && <p className="text-[10px] text-rpg-muted" aria-live="polite">{progress}</p>}
    </div>
  );
}

export function DataSources({ o, notify }: { o: StationOverview; notify: Notify }) {
  const { isAdmin } = useAuth();
  const [token, setToken] = useState(false);
  const f = o.feed;
  return (
    <KitSection title="De onde vêm os dados" icon={<Database size={16} />}>
      <ul className="space-y-2.5 text-xs">
        <li className="flex gap-2">
          <span className={clsx("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", f.ready ? "bg-amber-400" : "bg-rpg-muted")} aria-hidden />
          <span>
            <b className="text-rpg-text">SPTrans GTFS</b> · linhas, pontos e frequências programadas.{" "}
            {f.ready ? (
              <>
                Versão {f.version ? new Date(`${f.version}T12:00:00`).toLocaleDateString("pt-BR") : "—"} · {(f.counts.stops ?? 0).toLocaleString("pt-BR")} pontos, {(f.counts.routes ?? 0).toLocaleString("pt-BR")} linhas (ônibus, Metrô e CPTM).
              </>
            ) : f.status === "importando" ? (
              "Importação em andamento."
            ) : f.status === "erro" ? (
              <span className="text-rpg-red">Falha na importação: {f.error}</span>
            ) : (
              "Ainda não importado."
            )}{" "}
            <span className="text-rpg-muted">Fonte: espelho público do MobilityData (o download oficial exige login).</span>
          </span>
        </li>
        <li className="flex gap-2">
          <span className={clsx("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", o.live.ok ? "bg-rpg-green" : "bg-rpg-muted")} aria-hidden />
          <span>
            <b className="text-rpg-text">Olho Vivo</b> · tempo real (opcional).{" "}
            {!o.live.enabled ? "Sem token configurado — a tela usa a programação." : o.live.ok ? "Respondendo: as passagens das linhas dele ganham o selo “ao vivo”." : <span className="text-rpg-orange">{o.live.error ?? "Indisponível."} A programação segue valendo.</span>}
          </span>
        </li>
        <li className="flex gap-2">
          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-rpg-green" aria-hidden />
          <span>
            <b className="text-rpg-text">OSRM / OpenStreetMap</b> · minutos a pé, calculados ao guardar ponto ou jornada. Endereços pelo Nominatim. Nada de GPS: sua localização não é lida.
          </span>
        </li>
      </ul>
      <div className="mt-3 flex flex-wrap items-start gap-2 border-t border-rpg-border/60 pt-2">
        {isAdmin && <GtfsImport notify={notify} />}
        {!o.live.key.source && (
          <button type="button" className="min-h-[32px] text-xs text-rpg-blue hover:underline" onClick={() => setToken((v) => !v)} aria-expanded={token}>
            {token ? "Fechar" : "Configurar o Olho Vivo"}
          </button>
        )}
      </div>
      {o.live.key.source ? (
        <div className="mt-2">
          <KeySourceNote provider="sptrans" status={o.live.key} service="Olho Vivo" notify={notify} />
        </div>
      ) : (
        token && (
          <div className="mt-2">
            <PublicKeyForm
              provider="sptrans"
              service="Olho Vivo"
              placeholder="token de 64 caracteres"
              minLength={20}
              notify={notify}
              link={{ href: "https://www.sptrans.com.br/desenvolvedores/", text: "Portal do desenvolvedor da SPTrans" }}
              steps={[<>Cadastre-se de graça no portal do desenvolvedor da SPTrans.</>, <>Em <b>Meus aplicativos</b>, crie um aplicativo para a API <b>Olho Vivo</b>.</>, <>Copie o <b>token</b> e cole aqui. Se ele for recusado, a tela continua com a programação.</>]}
            />
          </div>
        )
      )}
    </KitSection>
  );
}
