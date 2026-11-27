import { useState } from "react";
import { ExternalLink, KeyRound, PlugZap, ShieldCheck, Trash2 } from "lucide-react";
import { RPGButton, RPGSwitch } from "@/components/rpg";
import type { Notify } from "@/components/integrations/PublicApiKit";
import { useCityActions, useCityCatalog, useCityStatus } from "@/hooks/useCity";
import type { CityApi } from "@/services/cityService";
import { DOMAIN, FIELD, LoadingBlock, R, StateBadge } from "./CityKit";

/**
 * Credencial do APILIB e estado de cada uma das 12 APIs.
 * O segredo vai uma única vez ao servidor (criptografado lá) e nunca volta: a tela só vê
 * a origem e os 4 últimos caracteres. "Conectada" só aparece após uma consulta real.
 */
export function CityConfigPanel({ notify }: { notify: Notify }) {
  const status = useCityStatus();
  const catalog = useCityCatalog();
  const a = useCityActions();
  const [mode, setMode] = useState<"token" | "client">("token");
  const [token, setToken] = useState("");
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");

  if (status.isLoading || catalog.isLoading) return <LoadingBlock label="Carregando a configuração…" rows={3} />;
  if (status.isError || !status.data) return <p className="text-sm text-rpg-red">Não foi possível carregar a configuração.</p>;
  const cred = status.data.credential;
  const disabled = new Set(cred.disabled);

  const done = (r: { apis: Array<{ state: string }> }) => {
    const ok = r.apis.filter((x) => x.state === "conectada").length;
    notify(ok ? `Credencial salva. ${ok} de ${r.apis.length} API(s) responderam.` : "Credencial salva, mas nenhuma API respondeu com sucesso. Veja o estado de cada uma.", ok ? "success" : "error");
    setToken("");
    setKey("");
    setSecret("");
  };
  const fail = (e: unknown) => notify(e instanceof Error ? e.message : "Não foi possível salvar.", "error");

  const toggle = (api: CityApi, on: boolean) => {
    const next = new Set(disabled);
    if (on) next.delete(api);
    else next.add(api);
    a.setDisabled.mutate([...next], { onError: fail });
  };

  return (
    <div className="space-y-3">
      <section className="rpg-panel p-3" aria-label="Credencial do APILIB">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <KeyRound size={18} className="text-rpg-gold" aria-hidden />
          <h2 className="rpg-title flex-1 text-sm font-bold uppercase">Credencial do APILIB</h2>
          <span className="text-xs text-rpg-muted">
            {cred.source === "pessoal" ? `Sua credencial (${cred.mode === "client" ? "Consumer Key/Secret" : "token"}) ${cred.masked ?? ""}` : cred.source === "servidor" ? "Usando a credencial do servidor" : "Nenhuma credencial"}
          </span>
        </div>
        <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-rpg-text/90">
          <li>
            Entre no{" "}
            <a href="https://apilib.prefeitura.sp.gov.br/store/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-rpg-blue underline">
              Store do APILIB <ExternalLink size={12} aria-hidden />
            </a>{" "}
            e crie uma aplicação (Applications → Add).
          </li>
          <li>Assine (Subscribe) cada API que quiser usar com essa aplicação — sem assinatura a API responde “Sem autorização”.</li>
          <li>Em Production Keys, gere o token de acesso ou copie a Consumer Key e o Consumer Secret.</li>
        </ol>
        <div role="tablist" aria-label="Tipo de credencial" className="mb-2 flex gap-1.5">
          {(["token", "client"] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`min-h-[36px] border-2 px-3 text-xs font-semibold ${mode === m ? "border-rpg-gold bg-rpg-gold/20 text-rpg-gold-light" : "border-rpg-border text-rpg-muted"}`} style={R}>
              {m === "token" ? "Token de acesso" : "Consumer Key + Secret"}
            </button>
          ))}
        </div>
        <form
          className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (mode === "token") a.saveToken.mutate(token, { onSuccess: done, onError: fail });
            else a.saveClient.mutate({ key, secret }, { onSuccess: done, onError: fail });
          }}
        >
          {mode === "token" ? (
            <label className="flex flex-col gap-1 text-xs text-rpg-muted sm:col-span-2">
              Token de acesso
              <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} className={FIELD} style={R} placeholder="cole o Access Token" />
            </label>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-xs text-rpg-muted">
                Consumer Key
                <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} className={FIELD} style={R} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-rpg-muted">
                Consumer Secret
                <input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} className={FIELD} style={R} />
              </label>
            </>
          )}
          <RPGButton type="submit" variant="gold" disabled={a.saveToken.isPending || a.saveClient.isPending || (mode === "token" ? token.trim().length < 8 : key.trim().length < 8 || secret.trim().length < 8)}>
            <ShieldCheck size={14} aria-hidden /> {a.saveToken.isPending || a.saveClient.isPending ? "Testando…" : "Salvar e testar"}
          </RPGButton>
        </form>
        <p className="mt-2 text-[11px] text-rpg-muted">O segredo é criptografado no servidor e nunca volta para o navegador. O token de acesso do Store expira: quando isso acontecer, as APIs aparecem como “Credencial inválida”.</p>
        {cred.source === "pessoal" && (
          <RPGButton variant="ghost" className="mt-2" onClick={() => a.removeCredential.mutate(undefined, { onSuccess: () => notify("Credencial removida."), onError: fail })}>
            <Trash2 size={14} aria-hidden /> Remover minha credencial
          </RPGButton>
        )}
      </section>

      <section className="rpg-panel p-3" aria-label="Estado das APIs">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <PlugZap size={18} className="text-rpg-gold" aria-hidden />
          <h2 className="rpg-title flex-1 text-sm font-bold uppercase">Estado das 12 APIs</h2>
          <RPGButton variant="secondary" disabled={!cred.source || a.test.isPending} onClick={() => a.test.mutate(undefined, { onSuccess: () => notify("Conexões testadas."), onError: fail })}>
            {a.test.isPending ? "Testando…" : "Testar conexões"}
          </RPGButton>
        </div>
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5 md:grid-cols-2">
          {status.data.apis.map((s) => {
            const c = catalog.data?.find((x) => x.id === s.api);
            return (
              <li key={s.api} className="flex min-w-0 items-center gap-2 border-2 border-rpg-border bg-rpg-bg-2/60 p-2" style={R}>
                <span className="h-8 w-1.5 shrink-0" style={{ background: c ? DOMAIN[c.domain].to : undefined }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-rpg-text">{c?.name ?? s.api}</p>
                  <p className="truncate text-[11px] text-rpg-muted" title={s.message ?? undefined}>
                    {c ? `${c.apilibName} ${c.version}` : ""}
                    {s.lastOkAt ? ` · último sucesso ${new Date(`${s.lastOkAt.replace(" ", "T")}Z`).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : ""}
                    {s.message && s.state !== "conectada" ? ` · ${s.message}` : ""}
                  </p>
                </div>
                <StateBadge state={s.state} />
                <RPGSwitch checked={!disabled.has(s.api)} onChange={() => toggle(s.api, disabled.has(s.api))} label={`Usar ${c?.name ?? s.api}`} />
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
