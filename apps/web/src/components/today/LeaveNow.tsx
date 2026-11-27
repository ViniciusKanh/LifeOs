import { useEffect, useState } from "react";
import clsx from "clsx";
import { Accessibility, Bus, CalendarClock, Footprints, MapPinned, Plus, Search, Settings2, Trash2 } from "lucide-react";
import { RPGButton } from "@/components/rpg";
import { EmptyNote, INPUT, R, Spinner, errMsg } from "@/components/adventures/AdventureKit";
import { IntegrationBanner } from "@/components/integrations/IntegrationKit";
import { KeySourceNote, PublicKeyForm, useLocalToast, type Notify } from "@/components/integrations/PublicApiKit";
import { useTransit, useTransitActions } from "@/hooks/usePublicApis";
import { publicApis } from "@/services/publicApisService";
import type { TransitOverview, TransitStop } from "@/services/publicApisService";

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function StopSearch({ notify, onDone }: { notify: Notify; onDone: () => void }) {
  const a = useTransitActions();
  const [q, setQ] = useState("");
  const [walk, setWalk] = useState(5);
  const [results, setResults] = useState<Array<{ code: number; name: string; address: string | null }> | null>(null);
  const [busy, setBusy] = useState(false);
  const search = async () => {
    if (q.trim().length < 3) return;
    setBusy(true);
    try {
      setResults(await publicApis.transit.search(q.trim()));
    } catch (e) {
      notify(errMsg(e, "Não foi possível buscar pontos."), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 border border-dashed border-rpg-blue/50 p-3" style={R}>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <label htmlFor="stop-q" className="sr-only">
          Buscar ponto de ônibus
        </label>
        <input id="stop-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome do ponto ou rua (ex.: Paulista)" className={clsx(INPUT, "min-w-0 flex-1")} style={R} />
        <label className="flex items-center gap-1 text-[11px] text-rpg-muted">
          <Footprints size={13} aria-hidden /> caminhada
          <input type="number" min={0} max={60} value={walk} onChange={(e) => setWalk(Math.max(0, Math.min(60, Number(e.target.value) || 0)))} className={clsx(INPUT, "w-14 py-1")} style={R} aria-label="Minutos de caminhada até o ponto" />
          min
        </label>
        <RPGButton type="submit" variant="blue" disabled={busy || q.trim().length < 3} className="justify-center text-sm">
          {busy ? <Spinner /> : <Search size={14} aria-hidden />} Buscar
        </RPGButton>
      </form>
      {results && (results.length === 0 ? (
        <p className="text-[11px] text-rpg-muted">Nenhum ponto encontrado. Tente o nome da rua.</p>
      ) : (
        <ul className="max-h-56 overflow-y-auto [scrollbar-width:thin]">
          {results.map((r) => (
            <li key={r.code} className="flex items-center gap-2 border-b border-dashed border-rpg-border/60 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-rpg-text">{r.name}</span>
                <span className="block truncate text-[10px] text-rpg-muted">
                  {r.address ?? "sem endereço"} · cód. {r.code}
                </span>
              </span>
              <RPGButton
                variant="gold"
                className="px-2 py-0.5 text-[11px]"
                disabled={a.addStop.isPending}
                onClick={() =>
                  a.addStop.mutate(
                    { code: r.code, name: r.name, address: r.address, walkMinutes: walk },
                    { onSuccess: () => { notify("Ponto salvo."); onDone(); }, onError: (e) => notify(errMsg(e, "Não foi possível salvar o ponto."), "error") },
                  )
                }
              >
                <Plus size={12} aria-hidden /> Salvar
              </RPGButton>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

function StopSettings({ s, notify }: { s: TransitStop; notify: Notify }) {
  const a = useTransitActions();
  const [walk, setWalk] = useState(s.walk);
  const [ride, setRide] = useState<string>(s.ride == null ? "" : String(s.ride));
  const [lines, setLines] = useState(s.lines.join(", "));
  return (
    <form
      className="grid gap-2 border border-rpg-border bg-rpg-bg-2/60 p-2 text-[11px] sm:grid-cols-[auto_auto_minmax(0,1fr)_auto]"
      style={R}
      onSubmit={(e) => {
        e.preventDefault();
        const ls = lines.split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
        a.updateStop.mutate(
          { id: s.id, walkMinutes: walk, rideMinutes: ride ? Math.max(1, Math.min(240, Number(ride))) : null, lines: ls },
          { onSuccess: () => notify("Ponto atualizado."), onError: (err) => notify(errMsg(err, "Não foi possível salvar."), "error") },
        );
      }}
    >
      <label className="flex items-center gap-1 text-rpg-muted">
        Caminhada
        <input type="number" min={0} max={60} value={walk} onChange={(e) => setWalk(Math.max(0, Math.min(60, Number(e.target.value) || 0)))} className={clsx(INPUT, "w-14 py-1")} style={R} />
        min
      </label>
      <label className="flex items-center gap-1 text-rpg-muted" title="Tempo médio de viagem do ponto até seus compromissos">
        Viagem
        <input type="number" min={1} max={240} value={ride} onChange={(e) => setRide(e.target.value)} placeholder="—" className={clsx(INPUT, "w-14 py-1")} style={R} />
        min
      </label>
      <label className="flex min-w-0 items-center gap-1 text-rpg-muted">
        Linhas
        <input value={lines} onChange={(e) => setLines(e.target.value)} placeholder="todas (ex.: 875A-10)" className={clsx(INPUT, "min-w-0 flex-1 py-1")} style={R} />
      </label>
      <span className="flex items-center gap-1">
        <RPGButton type="submit" variant="secondary" className="px-2 py-0.5 text-[11px]" disabled={a.updateStop.isPending}>
          Salvar
        </RPGButton>
        <RPGButton type="button" variant="ghost" className="px-2 py-0.5 text-[11px]" aria-label="Remover ponto" onClick={() => a.removeStop.mutate(s.id, { onSuccess: () => notify("Ponto removido.") })}>
          <Trash2 size={12} aria-hidden />
        </RPGButton>
      </span>
    </form>
  );
}

function Board({ o, notify }: { o: TransitOverview; notify: Notify }) {
  const a = useTransitActions();
  const [sel, setSel] = useState(o.stops[0]?.id ?? "");
  const [settings, setSettings] = useState(false);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    if (!o.stops.some((s) => s.id === sel)) setSel(o.stops[0]?.id ?? "");
  }, [o.stops, sel]);
  const s = o.stops.find((x) => x.id === sel) ?? o.stops[0];
  if (!s) return null;
  const rec = s.recommendation;
  const leave = rec?.leaveInMinutes ?? null;
  return (
    <div className="space-y-3">
      {o.stops.length > 1 && (
        <div role="tablist" aria-label="Pontos salvos" className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          {o.stops.map((x) => (
            <button key={x.id} role="tab" aria-selected={x.id === s.id} onClick={() => setSel(x.id)} className={clsx("shrink-0 border px-2.5 py-1 text-xs font-semibold", x.id === s.id ? "border-rpg-blue bg-rpg-blue/10 text-rpg-blue" : "border-rpg-border text-rpg-muted")} style={R}>
              {x.name}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] [&>*]:min-w-0">
        <div className={clsx("border bg-rpg-bg-2/60 p-3", leave != null && leave <= 3 ? "border-rpg-red/70" : "border-rpg-orange/60")} style={R}>
          {o.event ? (
            <p className="flex items-center gap-1 text-[11px] text-rpg-muted">
              <CalendarClock size={12} aria-hidden /> Próximo: <b className="truncate text-rpg-text">{o.event.title}</b> às {hhmm(o.event.startsAt)}
            </p>
          ) : (
            <p className="text-[11px] text-rpg-muted">Sem compromisso nas próximas horas. Mostrando o próximo ônibus que dá para pegar.</p>
          )}
          {s.error ? (
            <p className="mt-2 text-sm text-rpg-orange" role="status">
              {s.error}
            </p>
          ) : rec ? (
            <>
              <p className={clsx("mt-1 font-rpg text-3xl font-bold", leave! <= 3 ? "text-rpg-red" : "text-rpg-orange")} aria-live="polite">
                {leave! <= 0 ? "Saia agora" : `Saia em ${leave} min`}
              </p>
              <p className="text-[11px] text-rpg-muted">
                {rec.line} chega em {rec.inMinutes} min ({rec.at}) · caminhada de {s.walk} min
                {rec.fitsEvent === false && <span className="text-rpg-red"> · não chega a tempo do compromisso</span>}
                {rec.fitsEvent === true && <span className="text-rpg-green"> · chega com folga</span>}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-rpg-muted">Nenhum ônibus previsto que dê para alcançar agora.</p>
          )}
          {o.today ? (
            <p className={clsx("mt-2 text-xs font-semibold", o.today.onTime ? "text-rpg-green" : "text-rpg-muted")}>
              Partida de hoje registrada às {hhmm(o.today.leftAt)}
              {o.today.onTime ? ` · no horário (+${o.rules.onTime} XP)` : " · fora da janela recomendada"}
            </p>
          ) : (
            <RPGButton
              variant="gold"
              className="mt-2 text-sm"
              disabled={a.depart.isPending || !!s.error}
              onClick={() =>
                a.depart.mutate(s.id, {
                  onSuccess: (r) => notify(r.onTime ? `Boa viagem! Missão "Chegar sem atraso": +${r.xp} XP.` : "Partida registrada. Desta vez fora da janela recomendada."),
                  onError: (e) => notify(errMsg(e, "Não foi possível registrar a partida."), "error"),
                })
              }
            >
              <Bus size={15} aria-hidden /> Saí agora
            </RPGButton>
          )}
        </div>
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-xs font-semibold text-rpg-text" title={s.address ?? s.name}>
              <MapPinned size={12} className="mr-1 inline text-rpg-blue" aria-hidden />
              {s.name}
            </p>
            <button type="button" onClick={() => setSettings((v) => !v)} aria-expanded={settings} className="text-rpg-muted hover:text-rpg-text" aria-label="Ajustes do ponto">
              <Settings2 size={14} aria-hidden />
            </button>
            <button type="button" onClick={() => setAdding((v) => !v)} aria-expanded={adding} className="text-rpg-muted hover:text-rpg-text" aria-label="Adicionar ponto">
              <Plus size={14} aria-hidden />
            </button>
          </div>
          {s.arrivals.length === 0 ? (
            <p className="text-[11px] text-rpg-muted">{s.error ? "Previsão indisponível." : "Sem ônibus previstos neste ponto agora."}</p>
          ) : (
            <ul>
              {s.arrivals.slice(0, 6).map((x, i) => (
                <li key={`${x.line}-${x.at}-${i}`} className={clsx("flex items-center gap-2 border-b border-dashed border-rpg-border/60 py-1", x.inMinutes < s.walk && "opacity-50")}>
                  <span className="shrink-0 border border-rpg-blue/60 bg-rpg-blue/10 px-1.5 py-0.5 text-[10px] font-bold text-rpg-blue" style={R}>
                    {x.line}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-rpg-text">{x.destination}</span>
                  {x.accessible && <Accessibility size={12} className="text-rpg-muted" aria-label="Acessível" />}
                  <span className="shrink-0 text-sm font-bold tabular-nums text-rpg-text">{x.inMinutes} min</span>
                </li>
              ))}
            </ul>
          )}
          {s.now && <p className="mt-1 text-[10px] text-rpg-muted">Previsão da SPTrans às {s.now}. Atualiza a cada minuto.</p>}
        </div>
      </div>
      {settings && <StopSettings key={s.id} s={s} notify={notify} />}
      {adding && <StopSearch notify={notify} onDone={() => setAdding(false)} />}
    </div>
  );
}

/**
 * Hora de Sair — previsão real dos ônibus (SPTrans Olho Vivo) no ponto do
 * usuário, cruzada com o próximo compromisso da Agenda. "Saí agora" na janela
 * certa cumpre a missão diária "Chegar sem atraso".
 */
export function LeaveNow() {
  const q = useTransit();
  const o = q.data;
  const [notify, toast] = useLocalToast();
  const [setup, setSetup] = useState(false);
  // Sem token: no Hoje fica só uma linha discreta (nem todo mundo usa ônibus de São Paulo).
  if (o && !o.key.source && !setup)
    return (
      <section className="rpg-panel flex flex-wrap items-center gap-3 px-4 py-2.5" aria-label="Hora de Sair (ônibus de São Paulo)">
        <Bus size={18} className="shrink-0 text-rpg-blue" aria-hidden />
        <p className="min-w-0 flex-1 text-xs text-rpg-muted">
          <b className="text-rpg-text">Hora de Sair</b> · usa ônibus em São Paulo? Veja a previsão real do seu ponto e quando sair para cada compromisso.
        </p>
        <RPGButton variant="blue" className="text-xs" onClick={() => setSetup(true)}>
          Configurar
        </RPGButton>
        {toast}
      </section>
    );
  return (
    <section className="rpg-panel relative overflow-hidden p-4" aria-label="Hora de Sair (ônibus de São Paulo)">
      <IntegrationBanner
        icon={<Bus size={22} />}
        tone="blue"
        title="Hora de Sair"
        subtitle="Previsão real do ônibus no seu ponto (SPTrans Olho Vivo) antes do próximo compromisso."
        right={o?.key.source ? <span className="border border-rpg-gold/60 bg-rpg-gold/10 px-1.5 py-0.5 font-rpg text-[10px] font-bold text-rpg-gold-light" style={R}>{o.onTimeTotal} saída(s) no horário</span> : null}
      />
      {q.isLoading ? (
        <div className="h-36 animate-pulse bg-rpg-bg-2" style={R} aria-busy="true" />
      ) : q.isError || !o ? (
        <p className="text-sm text-rpg-red" role="alert">
          Não foi possível consultar a SPTrans.
        </p>
      ) : !o.key.source ? (
        <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          <PublicKeyForm
            provider="sptrans"
            service="Olho Vivo"
            placeholder="token de 64 caracteres"
            minLength={20}
            notify={notify}
            link={{ href: "https://www.sptrans.com.br/desenvolvedores/", text: "Portal do desenvolvedor da SPTrans" }}
            steps={[
              <>Cadastre-se de graça no portal do desenvolvedor da SPTrans.</>,
              <>Em <b>Meus aplicativos</b>, crie um aplicativo para a API <b>Olho Vivo</b>.</>,
              <>Copie o <b>token</b> gerado e cole aqui. Só a previsão dos pontos que você salvar é consultada.</>,
            ]}
          />
          <div className="space-y-2 border border-dashed border-rpg-blue/50 p-3 text-xs text-rpg-muted" style={R}>
            <p className="font-rpg text-sm font-bold text-rpg-blue">Missão "Chegar sem atraso"</p>
            <p>Salve os pontos que você usa e o tempo de caminhada até eles. O LifeOS diz quando sair para pegar o ônibus certo.</p>
            <p>Com o tempo de viagem preenchido, ele escolhe o último ônibus que ainda chega com folga ao próximo compromisso da Agenda.</p>
            <p>
              Tocar em <b className="text-rpg-text">Saí agora</b> na janela certa vale <b className="text-rpg-text">+{o.rules.onTime} XP e {o.rules.coins} moedas</b> por dia. Conquista: Pontual como a Guarda (10 saídas).
            </p>
            <p>Sem rastreamento: nada da sua localização é lido ou guardado.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {o.stops.length === 0 ? (
            <>
              <EmptyNote>Salve o ponto de ônibus que você mais usa para ver a hora de sair.</EmptyNote>
              <StopSearch notify={notify} onDone={() => undefined} />
            </>
          ) : (
            <Board o={o} notify={notify} />
          )}
          <KeySourceNote provider="sptrans" status={o.key} service="Olho Vivo" notify={notify} />
        </div>
      )}
      {toast}
    </section>
  );
}
