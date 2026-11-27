import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { BookOpen, CheckCircle2, Compass, Eye, Landmark, MapPin, Mountain, RefreshCw, Settings2, Theater, Trees } from "lucide-react";
import { RPGButton, RPGProgressBar } from "@/components/rpg";
import { EmptyNote, INPUT, R, Spinner, errMsg } from "@/components/adventures/AdventureKit";
import { IntegrationBanner, XpChip } from "@/components/integrations/IntegrationKit";
import { useAtlasActions } from "@/hooks/useAdventures";
import { EXPEDITIONS_KEY, useExpeditionActions, useExpeditions } from "@/hooks/useAdventuresMore";
import type { ExpeditionKind, ExpeditionMission, ExpeditionOverview } from "@/services/adventuresMoreService";

type Notify = (msg: string, tone?: "success" | "error") => void;

const KIND: Record<ExpeditionKind, { label: string; icon: JSX.Element }> = {
  parque: { label: "Parques", icon: <Trees size={15} aria-hidden /> },
  museu: { label: "Museus", icon: <Landmark size={15} aria-hidden /> },
  biblioteca: { label: "Bibliotecas", icon: <BookOpen size={15} aria-hidden /> },
  mirante: { label: "Mirantes", icon: <Eye size={15} aria-hidden /> },
  trilha: { label: "Trilhas", icon: <Mountain size={15} aria-hidden /> },
  cultura: { label: "Cultura e história", icon: <Theater size={15} aria-hidden /> },
};
const km = (m: number | null) => (m == null ? "" : m < 1000 ? `${m} m` : `${(m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`);

function Settings({ o, notify, onClose }: { o: ExpeditionOverview; notify: Notify; onClose: () => void }) {
  const a = useExpeditionActions();
  const [radius, setRadius] = useState(o.settings.radiusM);
  const [center, setCenter] = useState(o.settings.centerPlaceId ?? "");
  const [kinds, setKinds] = useState<ExpeditionKind[]>(o.settings.kinds);
  return (
    <form
      className="space-y-2 border border-rpg-border bg-rpg-bg-2/60 p-3 text-xs" style={R}
      onSubmit={(e) => {
        e.preventDefault();
        a.settings.mutate({ radiusM: radius, centerPlaceId: center || null, kinds }, { onSuccess: () => (notify("Área das expedições atualizada. Missões ainda não feitas foram refeitas."), onClose()), onError: (err) => notify(errMsg(err, "Não foi possível salvar."), "error") });
      }}
    >
      <label className="flex flex-wrap items-center gap-2 text-rpg-muted">
        Centro
        <select value={center} onChange={(e) => setCenter(e.target.value)} className={clsx(INPUT, "min-w-0 flex-1 py-1 text-xs")} style={R}>
          <option value="">Minha cidade (Clima / Contexto do Dia)</option>
          {o.centerOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-rpg-muted">
        Raio
        <input type="range" min={500} max={15000} step={500} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="flex-1 accent-[rgb(var(--rpg-gold))]" aria-valuetext={km(radius)} />
        <span className="w-14 text-right text-rpg-text">{km(radius)}</span>
      </label>
      <fieldset className="flex flex-wrap gap-1.5">
        <legend className="mb-1 text-rpg-muted">Tipos de lugar</legend>
        {o.kinds.map((k) => (
          <button key={k} type="button" aria-pressed={kinds.includes(k)} onClick={() => setKinds((cur) => (cur.includes(k) ? (cur.length > 1 ? cur.filter((x) => x !== k) : cur) : [...cur, k]))} className={clsx("flex items-center gap-1 border px-2 py-0.5", kinds.includes(k) ? "border-rpg-green text-rpg-green" : "border-rpg-border text-rpg-muted")} style={R}>
            {KIND[k].icon} {KIND[k].label}
          </button>
        ))}
      </fieldset>
      <div className="flex gap-2">
        <RPGButton type="submit" variant="secondary" className="text-xs" disabled={a.settings.isPending}>
          Salvar
        </RPGButton>
        <RPGButton type="button" variant="ghost" className="text-xs" onClick={onClose}>
          Cancelar
        </RPGButton>
      </div>
    </form>
  );
}

function MissionRow({ m, canSwap, notify }: { m: ExpeditionMission; canSwap: boolean; notify: Notify }) {
  const atlas = useAtlasActions();
  const a = useExpeditionActions();
  const qc = useQueryClient();
  const done = m.status === "concluida";
  return (
    <li className={clsx("flex flex-wrap items-center gap-2 border-b border-dashed border-rpg-border/60 py-2", done && "opacity-80")}>
      <span className={clsx("flex h-8 w-8 shrink-0 items-center justify-center border", done ? "border-rpg-green text-rpg-green" : "border-rpg-gold/60 text-rpg-gold")} style={R} aria-hidden>
        {done ? <CheckCircle2 size={16} /> : KIND[m.kind]?.icon}
      </span>
      <div className="min-w-0 flex-1">
        <a href={m.mapUrl} target="_blank" rel="noreferrer noopener" className={clsx("block truncate text-sm font-semibold hover:underline", done ? "text-rpg-muted line-through" : "text-rpg-text")} title={m.name}>
          {m.name}
        </a>
        <p className="text-[11px] text-rpg-muted">
          {KIND[m.kind]?.label.replace(/s$/, "") ?? m.kind} · {km(m.distanceM)} do centro
        </p>
      </div>
      {done ? (
        <span className="border border-rpg-green/60 bg-rpg-green/10 px-1.5 py-0.5 text-[10px] font-bold text-rpg-green" style={R}>
          concluída
        </span>
      ) : (
        <span className="flex basis-full justify-end gap-1.5 sm:basis-auto">
          {canSwap && (
            <RPGButton variant="ghost" className="px-2 text-xs" disabled={a.swap.isPending} onClick={() => a.swap.mutate(m.id, { onSuccess: () => notify("Missão trocada."), onError: (e) => notify(errMsg(e, "Não foi possível trocar."), "error") })} aria-label={`Trocar a missão ${m.name}`}>
              <RefreshCw size={13} aria-hidden />
            </RPGButton>
          )}
          <RPGButton
            variant="gold"
            className="text-xs"
            disabled={atlas.checkin.isPending}
            onClick={() =>
              atlas.checkin.mutate(
                { name: m.name, lat: m.lat, lng: m.lng, osmRef: m.osmRef, category: m.category, method: "manual" },
                {
                  onSuccess: (r) => {
                    // O check-in do Atlas cumpre a missão: recarrega as expedições para pagar o bônus.
                    void qc.invalidateQueries({ queryKey: EXPEDITIONS_KEY });
                    void qc.invalidateQueries({ queryKey: ["gamification"] });
                    notify(`Expedição cumprida em ${m.name}! +${r.xp} XP do Atlas e o bônus da expedição.`);
                  },
                  onError: (e) => notify(errMsg(e, "Não foi possível fazer o check-in."), "error") },
              )
            }
          >
            <MapPin size={13} aria-hidden /> Cheguei aqui
          </RPGButton>
        </span>
      )}
    </li>
  );
}

/**
 * Expedições da Semana — três lugares reais do OpenStreetMap perto de você que
 * ainda não estão no seu Atlas. O check-in do próprio Atlas cumpre a missão.
 */
export function ExpeditionsPanel({ notify }: { notify: Notify }) {
  const q = useExpeditions();
  const o = q.data;
  const [settings, setSettings] = useState(false);
  const done = o && o.configured ? o.missions.filter((m) => m.status === "concluida").length : 0;
  return (
    <section className="rpg-panel relative overflow-hidden p-4" aria-label="Expedições da Semana">
      <IntegrationBanner
        icon={<Compass size={22} />}
        tone="green"
        title="Expedições da Semana"
        subtitle="Lugares reais perto de você (OpenStreetMap) que ainda não estão no seu Atlas."
        right={
          o?.configured ? (
            <span className="flex items-center gap-2">
              <XpChip xp={o.xpTotal} className="text-[11px]" />
              <button type="button" onClick={() => setSettings((v) => !v)} aria-expanded={settings} aria-label="Ajustar área das expedições" className="text-rpg-muted hover:text-rpg-text">
                <Settings2 size={16} aria-hidden />
              </button>
            </span>
          ) : null
        }
      />
      {q.isLoading ? (
        <div className="h-32 animate-pulse bg-rpg-bg-2" style={R} aria-busy="true" />
      ) : q.isError || !o ? (
        <p className="text-sm text-rpg-red" role="alert">
          Não foi possível carregar as expedições.
        </p>
      ) : !o.configured ? (
        <div className="flex flex-wrap items-center gap-3 border border-dashed border-rpg-green/50 p-3 text-sm text-rpg-muted" style={R}>
          <MapPin size={18} className="text-rpg-green" aria-hidden />
          <span className="min-w-0 flex-1">Escolha sua cidade no Clima (ou faça um check-in no Atlas) para receber expedições. O LifeOS não guarda sua localização.</span>
          <Link to="/meu-mundo/clima" className="rpg-btn rpg-btn-blue text-xs">
            Escolher cidade
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {settings && <Settings o={o} notify={notify} onClose={() => setSettings(false)} />}
          <p className="text-[11px] text-rpg-muted">
            Centro: <b className="text-rpg-text">{o.center.label}</b> · raio de {km(o.settings.radiusM)} · semana de {o.week.split("-").reverse().slice(0, 2).join("/")}
          </p>
          {o.unavailable && (
            <p className="text-xs text-rpg-orange" role="status">
              {o.unavailable}
            </p>
          )}
          {o.missions.length === 0 ? (
            <EmptyNote>{o.unavailable ? "Sem missões por enquanto." : "Nenhum lugar novo encontrado nessa área. Aumente o raio ou escolha outros tipos de lugar."}</EmptyNote>
          ) : (
            <ul>
              {o.missions.map((m) => (
                <MissionRow key={m.id} m={m} canSwap={o.swapsLeft > 0} notify={notify} />
              ))}
            </ul>
          )}
          <RPGProgressBar value={done} max={o.rules.perWeek} tone="green" label={`Todas da semana: +${o.rules.week} XP`} valueLabel={`${done}/${o.rules.perWeek}`} />
          <p className="text-[10px] text-rpg-muted">
            Cada missão: +{o.rules.mission} XP e {o.rules.missionCoins} moedas, além do XP de descoberta do Atlas. {o.swapsLeft > 0 ? "Você pode trocar 1 missão nesta semana." : "Troca da semana já usada."} {o.completedTotal} expedição(ões) concluída(s) no total. Dados © colaboradores do OpenStreetMap.
          </p>
          {q.isFetching && <Spinner />}
        </div>
      )}
    </section>
  );
}
