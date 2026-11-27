import { useState } from "react";
import { FileText, FolderTree, Library, Link2, Sparkles, Trash2 } from "lucide-react";
import { RPGProgressBar } from "@/components/rpg";
import { INPUT, R, StatTile, errMsg } from "@/components/adventures/AdventureKit";
import { IntegrationBanner, KeyConnectForm, SyncBar } from "@/components/integrations/IntegrationKit";
import { useZotero, useZoteroActions } from "@/hooks/usePersonalIntegrations";
import type { ZoteroSync } from "@/services/personalIntegrationsService";

const MAX_ROUNDS = 8;

/**
 * Portal do Zotero — traz a biblioteca pessoal do Zotero para a Biblioteca do
 * Mestrado. A sincronização é em partes (limite de tempo do servidor): quando
 * vem "parcial", o portal continua sozinho algumas rodadas.
 */
export function ZoteroPortal({ notify }: { notify: (msg: string, tone?: "success" | "error") => void }) {
  const q = useZotero();
  const a = useZoteroActions();
  const [progress, setProgress] = useState<string | null>(null);
  const o = q.data;

  const report = (total: { created: number; linked: number; xp: number }) =>
    notify(total.created || total.linked ? `Portal aberto: ${total.created} artigo(s) novo(s)${total.linked ? `, ${total.linked} já existente(s) vinculado(s)` : ""}${total.xp ? `, +${total.xp} XP` : ""}.` : "O Zotero está em dia: nada novo para trazer.");

  // Continua sincronizações parciais até terminar (ou atingir o limite de rodadas).
  const runRounds = async (first?: ZoteroSync) => {
    const total = { created: first?.created ?? 0, linked: first?.linked ?? 0, xp: first?.xp ?? 0 };
    let last = first;
    for (let round = first ? 1 : 0; round < MAX_ROUNDS && (!last || !last.done); round++) {
      setProgress(last?.remaining != null ? `Trazendo itens… faltam ~${last.remaining}` : "Abrindo o portal…");
      try {
        last = await a.sync.mutateAsync();
      } catch (e) {
        setProgress(null);
        notify(errMsg(e, "Falha ao sincronizar o Zotero."), "error");
        return;
      }
      total.created += last.created;
      total.linked += last.linked;
      total.xp += last.xp;
    }
    setProgress(null);
    if (last && !last.done) notify("Biblioteca grande: parte dos itens já chegou. Clique em Sincronizar para continuar.");
    else report(total);
  };

  const connect = (key: string) =>
    a.connect.mutate(key, {
      onSuccess: (r) => {
        if (!r.sync.ok) return notify(`Conectado, mas a primeira leitura falhou: ${r.sync.error}`, "error");
        if (!r.sync.done) void runRounds(r.sync);
        else report(r.sync);
      },
      onError: (e) => notify(errMsg(e, "Não foi possível conectar o Zotero."), "error"),
    });

  const linked = o?.stats.linked ?? 0;
  const nextGoal = linked < 1 ? 1 : linked < 100 ? 100 : null;

  return (
    <section className="rpg-panel relative overflow-hidden p-4" aria-label="Portal do Zotero">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(204,41,54,0.25),transparent_70%)]" aria-hidden />
      <IntegrationBanner icon={<Library size={22} />} tone="pink" title="Portal do Zotero" subtitle="Sua biblioteca do Zotero na Biblioteca do Mestrado, sem cadastrar DOI um por um." />
      {q.isLoading ? (
        <div className="h-40 animate-pulse bg-rpg-bg-2" style={R} />
      ) : q.isError ? (
        <p className="text-sm text-rpg-red" role="alert">
          Não foi possível ler o estado do Zotero.
        </p>
      ) : !o?.connected ? (
        <KeyConnectForm
          service="Zotero"
          placeholder="Ex.: P9NiFoyLeZu2bZNvvuQPDWsd"
          link={{ href: "https://www.zotero.org/settings/keys/new", text: "Criar chave no zotero.org" }}
          busy={a.connect.isPending || !!progress}
          onSubmit={connect}
          steps={[
            <>Entre em <b>zotero.org → Settings → Security → Create new private key</b>.</>,
            <>Marque <b>Allow library access</b> (só leitura basta). Notas e escrita não são necessárias.</>,
            <>Cole a chave aqui. Cada artigo novo rende XP de pesquisa (com o mesmo teto diário da biblioteca).</>,
          ]}
        />
      ) : (
        <div className="space-y-3">
          <div className="grid [&>*]:min-w-0 grid-cols-2 gap-2">
            <StatTile icon={<Link2 size={14} />} tone="text-rpg-pink" value={linked.toLocaleString("pt-BR")} label="Itens vinculados" />
            <StatTile icon={<FileText size={14} />} tone="text-rpg-green" value={o.stats.withPdf.toLocaleString("pt-BR")} label="Com PDF anexado" hint="No Zotero" />
            <StatTile icon={<FolderTree size={14} />} tone="text-rpg-blue" value={o.collections.length} label="Coleções" />
            <StatTile icon={<Trash2 size={14} />} tone="text-rpg-muted" value={o.stats.removed} label="Apagados no Zotero" hint="Continuam aqui" />
          </div>
          {nextGoal && <RPGProgressBar value={linked} max={nextGoal} tone="pink" label={nextGoal === 1 ? "Conquista: Portal do Zotero" : "Conquista: Arquivista do Mestrado"} valueLabel={`${linked}/${nextGoal}`} />}
          <label className="flex flex-wrap items-center gap-2 text-xs text-rpg-muted">
            <FolderTree size={13} aria-hidden /> Trazer
            <select
              value={o.connection?.collectionKey ?? ""}
              onChange={(e) =>
                a.collection.mutate(e.target.value || null, {
                  onSuccess: () => void runRounds(),
                  onError: (err) => notify(errMsg(err, "Não foi possível trocar a coleção."), "error"),
                })
              }
              className={INPUT + " min-w-0 flex-1 py-1 text-xs"}
              style={R}
              aria-label="Coleção do Zotero a importar"
            >
              <option value="">Toda a biblioteca</option>
              {o.collections.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.parentKey ? "↳ " : ""}
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {progress && (
            <p className="flex items-center gap-2 border border-rpg-pink/50 bg-rpg-pink/10 px-2 py-1.5 text-xs text-rpg-pink" style={R} role="status">
              <Sparkles size={13} className="animate-pulse" aria-hidden /> {progress}
            </p>
          )}
          <SyncBar
            status={o.connection?.lastSyncStatus ?? null}
            lastSyncAt={o.connection?.lastSyncAt ?? null}
            error={o.connection?.lastSyncError ?? null}
            busy={a.sync.isPending || !!progress}
            onSync={() => void runRounds()}
            onDisconnect={() => a.disconnect.mutate(undefined, { onSuccess: () => notify("Zotero desconectado. Os artigos continuam na biblioteca.") })}
            disconnecting={a.disconnect.isPending}
            keepNote="Os artigos importados e seus fichamentos continuam na biblioteca."
          />
          <p className="text-[11px] text-rpg-muted">
            Conta: <b className="text-rpg-text">{o.connection?.username ?? "Zotero"}</b> · nomes de coleções e etiquetas viram tags; etiqueta “lido” marca o artigo como lido. PDFs ficam no Zotero.
          </p>
        </div>
      )}
    </section>
  );
}
