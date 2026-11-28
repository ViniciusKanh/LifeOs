import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarPlus, ClipboardList, ExternalLink, History, ListPlus, Plus, Star, Trash2 } from "lucide-react";
import { RPGBadge, RPGButton } from "@/components/rpg";
import { KitSection } from "@/components/rpg-modules/ModuleKit";
import type { Notify } from "@/components/integrations/PublicApiKit";
import { useCityActions, useCityCatalog, useCityFavorites, useCityHistory, useCityProtocols } from "@/hooks/useCity";
import type { CityApi, Favorite, Protocol, ProtocolStatus } from "@/services/cityService";
import { EmptyBox, FIELD, LoadingBlock, R, TextInput, dayBR } from "./CityKit";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível concluir.");

/* ═══════════════════════ Favoritos ═══════════════════════ */

export function FavoritesPanel({ notify, apiId, compact }: { notify: Notify; apiId?: CityApi; compact?: boolean }) {
  const favs = useCityFavorites(apiId);
  const catalog = useCityCatalog();
  const a = useCityActions();
  const [eventFor, setEventFor] = useState<Favorite | null>(null);
  const [when, setWhen] = useState("");
  const list = (favs.data ?? []).slice(0, compact ? 6 : 200);
  return (
    <KitSection title="Favoritos" icon={<Star size={16} aria-hidden />} action={<span className="text-xs text-rpg-muted">{favs.data?.length ?? 0}</span>}>
      {favs.isLoading ? (
        <LoadingBlock rows={2} label="Carregando favoritos…" />
      ) : !list.length ? (
        <EmptyBox title="Nada guardado ainda.">Use a estrela nos contratos e registros para guardar aqui.</EmptyBox>
      ) : (
        <ul className="space-y-1.5">
          {list.map((f) => (
            <li key={f.id} className="min-w-0 border-2 border-rpg-border bg-rpg-bg-2/60 p-2" style={R}>
              <div className="flex min-w-0 items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold text-rpg-text">{f.title}</p>
                  <p className="truncate text-[11px] text-rpg-muted">
                    {catalog.data?.find((c) => c.id === f.api)?.name ?? f.api}
                    {f.subtitle ? ` · ${f.subtitle}` : ""}
                  </p>
                </div>
                {f.url && (
                  <a href={f.url} target="_blank" rel="noreferrer" className="inline-flex min-h-[32px] min-w-[32px] items-center justify-center text-rpg-blue" aria-label="Abrir fonte oficial">
                    <ExternalLink size={14} aria-hidden />
                  </a>
                )}
              </div>
              {!compact && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <RPGButton variant="ghost" onClick={() => a.favoriteToTask.mutate({ id: f.id, dueDate: null }, { onSuccess: () => notify("Missão criada em Tarefas."), onError: (e) => notify(errMsg(e), "error") })}>
                    <ListPlus size={13} aria-hidden /> Virar missão
                  </RPGButton>
                  <RPGButton variant="ghost" onClick={() => (setEventFor(f), setWhen(""))}>
                    <CalendarPlus size={13} aria-hidden /> Agendar
                  </RPGButton>
                  <RPGButton variant="ghost" onClick={() => a.removeFavorite.mutate(f.id, { onError: (e) => notify(errMsg(e), "error") })} aria-label={`Remover ${f.title}`}>
                    <Trash2 size={13} aria-hidden />
                  </RPGButton>
                </div>
              )}
              {eventFor?.id === f.id && (
                <form
                  className="mt-2 flex flex-wrap items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    a.favoriteToEvent.mutate({ id: f.id, startsAt: when }, { onSuccess: () => (notify("Compromisso criado na Agenda."), setEventFor(null)), onError: (er) => notify(errMsg(er), "error") });
                  }}
                >
                  <TextInput label="Data e hora" type="datetime-local" value={when} onChange={setWhen} className="min-w-[200px] flex-1" />
                  <RPGButton type="submit" variant="primary" disabled={!when}>
                    Criar
                  </RPGButton>
                  <RPGButton type="button" variant="ghost" onClick={() => setEventFor(null)}>
                    Cancelar
                  </RPGButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {compact && (favs.data?.length ?? 0) > list.length && <p className="mt-2 text-xs text-rpg-muted">+{(favs.data?.length ?? 0) - list.length} na lista completa.</p>}
    </KitSection>
  );
}

/* ═══════════════════════ Protocolos (SP156 / e-SIC) ═══════════════════════ */

const PROTOCOL_LABEL: Record<ProtocolStatus, string> = { aberto: "Aberto", em_andamento: "Em andamento", respondido: "Respondido", encerrado: "Encerrado" };
const PROTOCOL_TONE = { aberto: "blue", em_andamento: "orange", respondido: "green", encerrado: "muted" } as const;

export function ProtocolsPanel({ kind, notify, officialUrl }: { kind: Protocol["kind"]; notify: Notify; officialUrl: string }) {
  const protocols = useCityProtocols();
  const a = useCityActions();
  const [number, setNumber] = useState("");
  const [title, setTitle] = useState("");
  const [openedOn, setOpenedOn] = useState("");
  const mine = (protocols.data ?? []).filter((p) => p.kind === kind);
  const label = kind === "sp156" ? "SP156" : "e-SIC";
  return (
    <KitSection title={`Meus protocolos ${label}`} icon={<ClipboardList size={16} aria-hidden />}>
      <p className="mb-2 text-xs text-rpg-muted">
        A API é somente leitura e não consulta protocolos individuais: registre aqui o número que o{" "}
        <a href={officialUrl} target="_blank" rel="noreferrer" className="text-rpg-blue underline">
          portal oficial
        </a>{" "}
        te deu e acompanhe o andamento. Só você vê. Abrir protocolos não dá XP.
      </p>
      <form
        className="grid gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)_minmax(0,0.8fr)_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          a.createProtocol.mutate({ kind, number: number.trim(), title: title.trim(), status: "aberto", notes: null, openedOn: openedOn || null }, { onSuccess: () => (setNumber(""), setTitle(""), setOpenedOn(""), notify("Protocolo registrado.")), onError: (er) => notify(errMsg(er), "error") });
        }}
      >
        <TextInput label="Número" value={number} onChange={setNumber} placeholder="Ex.: 2026-0012345" />
        <TextInput label="Assunto" value={title} onChange={setTitle} placeholder="Do que se trata" />
        <TextInput label="Aberto em" type="date" value={openedOn} onChange={setOpenedOn} />
        <RPGButton type="submit" variant="primary" disabled={number.trim().length < 3 || title.trim().length < 2}>
          <Plus size={14} aria-hidden /> Registrar
        </RPGButton>
      </form>
      {protocols.isLoading ? (
        <LoadingBlock rows={1} label="Carregando protocolos…" />
      ) : !mine.length ? (
        <p className="mt-2 text-sm text-rpg-muted">Nenhum protocolo registrado.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {mine.map((p) => (
            <li key={p.id} className="flex min-w-0 flex-wrap items-center gap-2 border-2 border-rpg-border bg-rpg-bg-2/60 p-2" style={R}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-rpg-text">{p.title}</p>
                <p className="truncate text-[11px] text-rpg-muted">
                  nº {p.number}
                  {p.openedOn ? ` · aberto em ${dayBR(p.openedOn)}` : ""}
                </p>
              </div>
              <RPGBadge tone={PROTOCOL_TONE[p.status]}>{PROTOCOL_LABEL[p.status]}</RPGBadge>
              <select
                aria-label={`Andamento de ${p.title}`}
                value={p.status}
                onChange={(e) => a.updateProtocol.mutate({ id: p.id, kind: p.kind, number: p.number, title: p.title, status: e.target.value as ProtocolStatus, notes: p.notes, openedOn: p.openedOn }, { onError: (er) => notify(errMsg(er), "error") })}
                className={`${FIELD} !w-auto`}
                style={R}
              >
                {Object.entries(PROTOCOL_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <RPGButton variant="ghost" aria-label={`Excluir protocolo ${p.number}`} onClick={() => a.removeProtocol.mutate(p.id, { onError: (er) => notify(errMsg(er), "error") })}>
                <Trash2 size={13} aria-hidden />
              </RPGButton>
            </li>
          ))}
        </ul>
      )}
    </KitSection>
  );
}

/* ═══════════════════════ Histórico ═══════════════════════ */

const ACTION_LABEL: Record<string, string> = { read: "Leitura", explore: "Exploração", compare: "Comparação", territory: "Território" };

export function HistoryPanel() {
  const h = useCityHistory();
  const catalog = useCityCatalog();
  return (
    <KitSection title="Crônica da cidade" icon={<History size={16} aria-hidden />}>
      {h.isLoading ? (
        <LoadingBlock rows={2} label="Carregando…" />
      ) : !h.data?.length ? (
        <p className="text-sm text-rpg-muted">Suas leituras e explorações aparecem aqui.</p>
      ) : (
        <ol className="space-y-1">
          {h.data.slice(0, 12).map((e, i) => {
            const c = catalog.data?.find((x) => x.id === e.api);
            return (
              <li key={i} className="flex min-w-0 items-center gap-2 text-xs">
                <span className="w-12 shrink-0 tabular-nums text-rpg-muted">{dayBR(e.day).slice(0, 5)}</span>
                <RPGBadge tone="muted">{ACTION_LABEL[e.action] ?? e.action}</RPGBadge>
                {c ? (
                  <Link to={c.route} className="min-w-0 truncate text-rpg-text hover:text-rpg-gold">
                    {c.name}
                    {e.action === "territory" ? ` · ${e.ref}` : ""}
                  </Link>
                ) : (
                  <span className="truncate">{e.api}</span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </KitSection>
  );
}
