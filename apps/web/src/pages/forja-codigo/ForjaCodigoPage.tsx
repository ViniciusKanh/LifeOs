import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { ArrowLeft, BookOpen, CheckCircle2, ExternalLink, Flame, GitBranch, GitMerge, GitPullRequest, Github, Hammer, Info, KeyRound, Loader2, Lock, RefreshCw, Rocket, Star, Trophy, TrendingUp, Unplug } from "lucide-react";
import { RPGButton, RPGProgressBar, RPGSwitch, RPGToast } from "@/components/rpg";
import { Modal } from "@/components/ui/Modal";
import { PixelScene } from "@/components/living-world/PixelScene";
import { CharacterPortrait } from "@/components/living-world/AgentPortrait";
import { drawForgeScene, SMITH } from "@/components/living-world/engine/scenes";
import { useCodeForge, useCodeForgeActions } from "@/hooks/useCodeForge";
import type { CodeKind, ForgeOverview } from "@/services/codeForgeService";
import { ApiError } from "@/services/api";

const R = { borderRadius: 6 };
const KIND_ICON: Record<CodeKind, typeof GitBranch> = { commit: GitBranch, pr_opened: GitPullRequest, pr_merged: GitMerge, issue_closed: CheckCircle2, release: Rocket };
const KIND_TONE: Record<CodeKind, string> = { commit: "text-rpg-blue", pr_opened: "text-rpg-purple", pr_merged: "text-rpg-green", issue_closed: "text-rpg-green", release: "text-rpg-gold-light" };
const KIND_TEXT: Record<CodeKind, string> = { commit: "Commit em", pr_opened: "PR aberta em", pr_merged: "PR mesclada em", issue_closed: "Issue resolvida em", release: "Release em" };

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 60) return `Há ${Math.max(1, m)} min`;
  if (m < 1440) return `Há ${Math.round(m / 60)} h`;
  const d = Math.round(m / 1440);
  return d === 1 ? "Ontem" : `Há ${d} dias`;
};
const errMsg = (e: unknown, fb: string) => (e instanceof ApiError || e instanceof Error ? e.message || fb : fb);
const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** Mapa de calor estilo GitHub; dias sem cobertura ficam hachurados (nunca viram "zero"). */
function Heatmap({ data }: { data: ForgeOverview["heatmap"] }) {
  const max = Math.max(1, ...data.days.map((d) => d.count ?? 0));
  const first = data.days[0]?.day;
  // alinha a primeira coluna na segunda-feira
  const pad = first ? (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7 : 0;
  const cells: Array<{ day: string; count: number | null } | null> = [...Array(pad).fill(null), ...data.days];
  const weeks: Array<typeof cells> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const level = (c: number) => (c === 0 ? 0 : c / max < 0.25 ? 1 : c / max < 0.5 ? 2 : c / max < 0.75 ? 3 : 4);
  const COLORS = ["bg-rpg-bg-2", "bg-emerald-900", "bg-emerald-700", "bg-emerald-500", "bg-emerald-300"];
  const total = data.days.reduce((a, d) => a + (d.count ?? 0), 0);
  // Em telas estreitas o mapa rola: começa mostrando as semanas mais recentes.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [data.days.length]);
  return (
    <div>
      <div ref={scroller} className="overflow-x-auto pb-1 [scrollbar-width:thin]">
        <div className="inline-flex flex-col gap-1">
          <div className="flex gap-[3px] pl-7 text-[10px] text-rpg-muted" aria-hidden>
            {weeks.map((w, i) => {
              // Rótulo na coluna em que o mês muda; o 1º só aparece se houver espaço até o próximo.
              const month = (k: number) => weeks[k]?.find((x) => x)?.day.slice(5, 7);
              const m = month(i);
              const show = !!m && (i === 0 ? month(1) === m && month(2) === m && month(3) === m : month(i - 1) !== m);
              return (
                <span key={i} className="w-3 overflow-visible whitespace-nowrap">
                  {show ? MONTHS[Number(m) - 1] : ""}
                </span>
              );
            })}
          </div>
          <div className="flex gap-1">
            <div className="flex w-6 flex-col justify-between py-0.5 text-[10px] text-rpg-muted" aria-hidden>
              <span>Seg</span>
              <span>Qua</span>
              <span>Sex</span>
            </div>
            <div className="flex gap-[3px]" role="grid" aria-label={`Contribuições: ${total} no período`}>
              {weeks.map((w, i) => (
                <div key={i} className="flex flex-col gap-[3px]" role="row">
                  {Array.from({ length: 7 }, (_, j) => {
                    const c = w[j];
                    if (!c) return <span key={j} className="h-3 w-3" />;
                    const label = c.count === null ? `${c.day}: sem dados (antes da cobertura)` : `${c.day}: ${c.count} contribuição(ões)`;
                    return <span key={j} role="gridcell" title={label} aria-label={label} className={clsx("h-3 w-3 rounded-[2px]", c.count === null ? "bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.06)_0_2px,transparent_2px_4px)]" : COLORS[level(c.count)])} />;
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-rpg-muted">
        <span>
          {total} contribuição(ões) ·{" "}
          {data.source === "github_calendar" ? "calendário oficial do GitHub (com token)" : data.coveredFrom ? `atividade importada desde ${new Date(`${data.coveredFrom}T12:00:00`).toLocaleDateString("pt-BR")} (modo público)` : "sem dados ainda"}
        </span>
        <span className="flex items-center gap-1" aria-hidden>
          Menos {COLORS.map((c) => <span key={c} className={clsx("h-3 w-3 rounded-[2px]", c)} />)} Mais
        </span>
      </div>
    </div>
  );
}

function ConnectForm({ busy, onConnect, initial }: { busy: boolean; onConnect: (b: { username?: string; token?: string | null }) => void; initial?: string }) {
  const [username, setUsername] = useState(initial ?? "");
  const [token, setToken] = useState("");
  const [useToken, setUseToken] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onConnect(useToken ? { token: token.trim() } : { username: username.trim() });
      }}
    >
      <div className="flex gap-1" role="radiogroup" aria-label="Modo de conexão">
        {(
          [
            [false, "Público (só o usuário)"],
            [true, "Com token (inclui privados)"],
          ] as const
        ).map(([v, l]) => (
          <button key={String(v)} type="button" role="radio" aria-checked={useToken === v} onClick={() => setUseToken(v)} className={clsx("flex-1 border px-2 py-1.5 text-xs font-semibold", useToken === v ? "border-rpg-gold bg-rpg-gold/10 text-rpg-gold-light" : "border-rpg-border text-rpg-muted")} style={R}>
            {l}
          </button>
        ))}
      </div>
      {useToken ? (
        <label className="block text-[11px] text-rpg-muted">
          Token pessoal do GitHub (fine-grained, só leitura)
          <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_…" className="mt-1 w-full border border-rpg-border bg-rpg-bg-2 p-2 text-sm text-rpg-text outline-none focus:border-rpg-gold" style={R} />
          <span className="mt-1 block text-[10px]">
            Crie em GitHub → Settings → Developer settings → Fine-grained tokens, com acesso de leitura a Contents, Metadata, Issues e Pull requests. O token é guardado criptografado no servidor e nunca volta para o navegador.
          </span>
        </label>
      ) : (
        <label className="block text-[11px] text-rpg-muted">
          Usuário do GitHub
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="seu-usuario" maxLength={39} className="mt-1 w-full border border-rpg-border bg-rpg-bg-2 p-2 text-sm text-rpg-text outline-none focus:border-rpg-gold" style={R} />
          <span className="mt-1 block text-[10px]">Só dados públicos. O GitHub limita consultas sem token e eventos públicos cobrem cerca de 90 dias.</span>
        </label>
      )}
      <RPGButton variant="gold" type="submit" disabled={busy || (useToken ? token.trim().length < 20 : username.trim().length < 1)}>
        {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Github size={14} aria-hidden />} {busy ? "Conectando e sincronizando…" : "Conectar à Forja"}
      </RPGButton>
    </form>
  );
}

/** Mensagem do ferreiro a partir dos números reais (nunca inventa atividade). */
function smithMessage(o: ForgeOverview): string {
  if (!o.connected) return "Conecte seu GitHub e eu transformo cada commit, PR e release reais em progresso na Vila. Nada é contado sem ter acontecido de verdade.";
  const next = o.unlocks.find((u) => !u.unlocked);
  const last = o.recent[0];
  if (o.xp.week > 0 && last) return `Bela semana! +${o.xp.week.toLocaleString("pt-BR")} XP de código. O último trabalho veio de ${last.repo}.${next ? ` Faltam ${(o.xp.nextLevelXp - o.xp.total).toLocaleString("pt-BR")} XP para o próximo nível; no nível ${next.level} eu ganho: ${next.title.toLowerCase()}.` : ""}`;
  if (o.streak >= 3) return `${o.streak} dias seguidos de contribuições. A fornalha não apaga!`;
  if (!o.recent.length) return "A bigorna está fria: ainda não importei nenhuma atividade. Sincronize depois de um commit.";
  return `Faz um tempo desde a última forja (${ago(last!.at).toLowerCase()}). ${next ? `No nível ${next.level} vem: ${next.title.toLowerCase()}.` : "A oficina já está completa."}`;
}

export function ForjaCodigoPage() {
  const [range, setRange] = useState<"90d" | "6m" | "12m">("12m");
  const q = useCodeForge(range);
  const a = useCodeForgeActions();
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [showAllRepos, setShowAllRepos] = useState(false);
  const notify = (msg: string, tone: "success" | "error" = "success") => setToast({ msg, tone });
  const o = q.data;
  const level = o?.xp.level ?? 1;
  const draw = useMemo(() => (ctx: CanvasRenderingContext2D, t: number, still: boolean) => drawForgeScene(ctx, t, level, still), [level]);
  const pct = o ? Math.round(((o.xp.total - o.xp.currentLevelXp) / Math.max(1, o.xp.nextLevelXp - o.xp.currentLevelXp)) * 100) : 0;
  const nextUnlocks = o ? o.unlocks.filter((u) => !u.unlocked).slice(0, 3) : [];
  const repos = o ? (showAllRepos ? o.repos : o.repos.slice(0, 6)) : [];

  const connect = (body: { username?: string; token?: string | null }) =>
    a.connect.mutate(body, {
      onSuccess: (r) => {
        setSettingsOpen(false);
        notify(r.sync.ok ? `GitHub conectado (${r.username}). ${r.sync.inserted ?? 0} atividade(s) importada(s), +${r.sync.xp ?? 0} XP.` : `Conectado como ${r.username}, mas a primeira sincronização falhou: ${r.sync.error ?? "tente de novo"}.`, r.sync.ok ? "success" : "error");
      },
      onError: (e) => notify(errMsg(e, "Não foi possível conectar."), "error"),
    });
  const sync = () => a.sync.mutate(undefined, { onSuccess: (r) => notify(r.inserted ? `${r.inserted} atividade(s) nova(s), +${r.xp} XP.` : "Tudo em dia: nenhuma atividade nova."), onError: (e) => notify(errMsg(e, "Falha ao sincronizar."), "error") });

  if (q.isError)
    return (
      <div className="px-4 py-6">
        <div className="rpg-panel p-6 text-center" role="alert">
          <p className="text-sm text-rpg-red">Não foi possível carregar a Forja do Código.</p>
          <RPGButton variant="secondary" className="mt-3" onClick={() => void q.refetch()}>
            Tentar de novo
          </RPGButton>
        </div>
      </div>
    );

  return (
    <div className="space-y-4 px-3 py-4 sm:px-4 md:px-6">
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
      <Link to="/meu-mundo" className="inline-flex items-center gap-1.5 border border-rpg-border bg-rpg-bg-2/70 px-2.5 py-1 text-xs font-semibold text-rpg-green" style={R}>
        <ArrowLeft size={13} aria-hidden /> Meu Mundo — Vila
      </Link>
      <header className="flex flex-wrap items-start gap-3">
        <Github size={44} className="shrink-0 text-rpg-text" aria-hidden />
        <div className="min-w-0 flex-1">
          <h1 className="rpg-title font-rpg text-3xl font-bold leading-none text-rpg-text sm:text-4xl">Forja do Código</h1>
          <p className="mt-1 text-sm text-rpg-muted">Commits, pull requests e releases reais viram XP, eventos da Crônica e evolução da oficina na Vila.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setSettingsOpen(true)} className="rpg-tile flex items-center gap-2 px-3 py-2 text-left">
            <Github size={22} className="text-rpg-text" aria-hidden />
            <span className="text-xs">
              <span className="block font-semibold text-rpg-text">{o?.connected ? "GitHub conectado" : "GitHub desconectado"}</span>
              <span className={clsx("flex items-center gap-1", o?.connected ? "text-rpg-green" : "text-rpg-muted")}>
                <span className={clsx("h-2 w-2 rounded-full", o?.connected ? "bg-rpg-green" : "bg-rpg-muted")} aria-hidden /> {o?.integration?.username ?? "Conectar"}
              </span>
            </span>
          </button>
          {o?.connected && (
            <div className="rpg-tile flex items-center gap-2 px-3 py-2">
              {o.integration?.mode === "token" ? <KeyRound size={20} className="text-rpg-gold" aria-hidden /> : <BookOpen size={20} className="text-rpg-blue" aria-hidden />}
              <span className="text-xs">
                <span className="block font-semibold text-rpg-text">{o.integration?.mode === "token" ? "Token (privados)" : "API pública"}</span>
                <span className={clsx("flex items-center gap-1", o.integration?.lastSyncStatus === "ok" ? "text-rpg-green" : o.integration?.lastSyncStatus ? "text-rpg-orange" : "text-rpg-muted")}>
                  <span className={clsx("h-2 w-2 rounded-full", o.integration?.lastSyncStatus === "ok" ? "bg-rpg-green" : "bg-rpg-orange")} aria-hidden />
                  {o.integration?.lastSyncStatus === "ok" ? `Sincronizado ${o.integration.lastSyncAt ? ago(o.integration.lastSyncAt).toLowerCase() : ""}` : o.integration?.lastSyncStatus === "rate_limited" ? "Limite do GitHub" : o.integration?.lastSyncStatus === "error" ? "Erro na última sincronização" : "Aguardando"}
                </span>
              </span>
            </div>
          )}
          {o?.connected && (
            <RPGButton variant="secondary" className="self-stretch text-xs" onClick={sync} disabled={a.sync.isPending}>
              <RefreshCw size={14} className={clsx(a.sync.isPending && "animate-spin")} aria-hidden /> Sincronizar
            </RPGButton>
          )}
        </div>
      </header>
      {o?.integration?.lastSyncError && o.integration.lastSyncStatus !== "ok" && (
        <p className="border border-rpg-orange/60 bg-rpg-orange/10 px-3 py-2 text-xs text-rpg-orange" style={R} role="status">
          {o.integration.lastSyncError}
        </p>
      )}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-3">
          <section className="rpg-ornate relative aspect-[16/9] max-h-[420px] w-full overflow-hidden p-0" aria-label="Oficina do ferreiro">
            <PixelScene draw={draw} label={`Oficina do ferreiro no nível ${level}`} />
            <span className="absolute left-3 top-3 border-2 border-rpg-gold/70 bg-rpg-panel/90 px-2.5 py-1 font-rpg text-sm font-bold text-rpg-gold-light" style={R}>
              Oficina · Nível {level}
            </span>
          </section>
          <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
            {[
              { icon: Hammer, tone: "text-rpg-blue", title: "XP por atividade", text: `Commit +${o?.rules.commit.xp ?? 10}, PR mesclada +${o?.rules.pr_merged.xp ?? 60}, release +${o?.rules.release.xp ?? 100}.` },
              { icon: BookOpen, tone: "text-rpg-purple", title: "Eventos na Crônica", text: "PRs mescladas, releases e níveis da oficina entram na sua história." },
              { icon: TrendingUp, tone: "text-rpg-green", title: "Progresso na Vila", text: "A oficina evolui a cada 5 níveis e o ferreiro comemora com você." },
              { icon: Trophy, tone: "text-rpg-gold", title: "Recompensas reais", text: "XP, moedas e conquistas como Artesão de Software." },
            ].map((c) => (
              <div key={c.title} className="rpg-panel flex items-start gap-2 p-3">
                <c.icon size={22} className={clsx("shrink-0", c.tone)} aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-rpg-text">{c.title}</p>
                  <p className="text-[11px] text-rpg-muted">{c.text}</p>
                </div>
              </div>
            ))}
          </div>

          <section className="rpg-panel p-4" aria-label="Mapa de calor de contribuições">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-rpg text-lg font-bold text-rpg-text">
                Mapa de calor de contribuições
                <span title="Com token, usamos o calendário oficial do GitHub (12 meses). No modo público, só a atividade importada desde a conexão — dias sem cobertura ficam hachurados.">
                  <Info size={14} className="text-rpg-muted" aria-hidden />
                </span>
              </h2>
              <select value={range} onChange={(e) => setRange(e.target.value as typeof range)} className="border border-rpg-border bg-rpg-bg-2 px-2 py-1 text-xs text-rpg-text" style={R} aria-label="Período">
                <option value="90d">Últimos 90 dias</option>
                <option value="6m">Últimos 6 meses</option>
                <option value="12m">Últimos 12 meses</option>
              </select>
            </div>
            {q.isLoading ? <div className="h-28 animate-pulse rounded bg-rpg-bg-2" /> : o && o.connected ? <Heatmap data={o.heatmap} /> : <p className="text-sm text-rpg-muted">Conecte o GitHub para ver suas contribuições.</p>}
          </section>

          <section className="rpg-panel p-4" aria-label="Repositórios em atividade">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-rpg text-lg font-bold text-rpg-text">
                <Github size={18} aria-hidden /> Repositórios em atividade
              </h2>
              {o && o.repos.length > 6 && (
                <button type="button" className="text-xs text-rpg-blue" onClick={() => setShowAllRepos((v) => !v)}>
                  {showAllRepos ? "Ver menos" : `Ver todos (${o.repos.length})`}
                </button>
              )}
            </div>
            {!o?.connected ? (
              <p className="text-sm text-rpg-muted">Os repositórios aparecem depois da primeira sincronização.</p>
            ) : repos.length === 0 ? (
              <p className="text-sm text-rpg-muted">Nenhum repositório encontrado nessa conta.</p>
            ) : (
              <ul className="space-y-1.5">
                {repos.map((r) => (
                  <li key={r.id} className={clsx("rpg-tile flex flex-wrap items-center gap-x-3 gap-y-1 p-2", !r.monitored && "opacity-60")}>
                    <button type="button" aria-pressed={r.favorite} aria-label={r.favorite ? "Desfavoritar" : "Favoritar"} onClick={() => a.repo.mutate({ id: r.id, favorite: !r.favorite })} className={r.favorite ? "text-rpg-gold" : "text-rpg-muted"}>
                      <Star size={16} fill={r.favorite ? "currentColor" : "none"} aria-hidden />
                    </button>
                    <div className="min-w-[160px] flex-1">
                      <a href={r.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-semibold text-rpg-text hover:underline">
                        {r.fullName.split("/")[1]} {r.private && <Lock size={11} className="text-rpg-muted" aria-label="privado" />}
                        <ExternalLink size={11} className="text-rpg-muted" aria-hidden />
                      </a>
                      <p className="truncate text-[11px] text-rpg-muted">
                        {r.description ?? "Sem descrição"}
                        {r.language ? ` · ${r.language}` : ""}
                        {r.lastActivity ? ` · ${ago(r.lastActivity).toLowerCase()}` : ""}
                      </p>
                    </div>
                    <span className="flex items-center gap-1 text-xs text-rpg-text" title="Commits contabilizados">
                      <GitBranch size={13} className="text-rpg-blue" aria-hidden /> {r.commits}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-rpg-text" title="Pull requests">
                      <GitPullRequest size={13} className="text-rpg-purple" aria-hidden /> {r.prs}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-rpg-text" title="Issues resolvidas">
                      <CheckCircle2 size={13} className="text-rpg-green" aria-hidden /> {r.issues}
                    </span>
                    <span className="border border-rpg-green/60 bg-rpg-green/10 px-2 py-0.5 text-xs font-semibold text-rpg-green" style={R}>
                      +{r.xp.toLocaleString("pt-BR")} XP
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-rpg-muted">
                      Na Forja <RPGSwitch checked={r.monitored} onChange={() => a.repo.mutate({ id: r.id, monitored: !r.monitored })} label={`Contar ${r.fullName} na Forja`} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-3">
          <section className="rpg-panel p-4" aria-label="XP de código">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm text-rpg-muted">XP de Código</p>
                <p className="font-rpg text-4xl font-bold text-rpg-text">{(o?.xp.total ?? 0).toLocaleString("pt-BR")} XP</p>
                {!!o?.xp.week && <p className="text-xs font-semibold text-rpg-green">▲ +{o.xp.week.toLocaleString("pt-BR")} XP esta semana</p>}
              </div>
              <div className="border-2 border-rpg-gold/70 bg-rpg-bg-2 px-3 py-1.5 text-center" style={R}>
                <p className="text-[10px] text-rpg-muted">Nível da Forja</p>
                <p className="font-rpg text-2xl font-bold text-rpg-gold-light">{level}</p>
              </div>
            </div>
            <div className="mt-3">
              <RPGProgressBar value={pct} tone="green" label={`Rumo ao nível ${level + 1}`} valueLabel={`${(o?.xp.total ?? 0).toLocaleString("pt-BR")} / ${(o?.xp.nextLevelXp ?? 120).toLocaleString("pt-BR")} XP`} />
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {[
                { icon: Flame, tone: "text-rpg-orange", v: `${o?.streak ?? 0}`, l: "dias de sequência" },
                { icon: GitPullRequest, tone: "text-rpg-purple", v: o?.counts.openPrs == null ? "—" : String(o.counts.openPrs), l: "PRs abertas" },
                { icon: GitMerge, tone: "text-rpg-green", v: String(o?.counts.pr_merged ?? 0), l: "PRs mescladas" },
                { icon: CheckCircle2, tone: "text-rpg-green", v: String(o?.counts.issue_closed ?? 0), l: "Issues resolvidas" },
              ].map((s) => (
                <div key={s.l} className="border border-rpg-border/70 bg-rpg-bg-2/60 p-2 text-center" style={R}>
                  <s.icon size={16} className={clsx("mx-auto", s.tone)} aria-hidden />
                  <p className="font-rpg text-lg font-bold text-rpg-text">{s.v}</p>
                  <p className="text-[10px] leading-tight text-rpg-muted">{s.l}</p>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-semibold text-rpg-text">Próximas evoluções da Forja</p>
              {nextUnlocks.length === 0 ? (
                <p className="text-xs text-rpg-green">Oficina completa — todas as evoluções desbloqueadas.</p>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {nextUnlocks.map((u) => (
                    <div key={u.key} className="border border-rpg-border/70 bg-rpg-bg-2/60 p-2" style={R} title={u.description}>
                      <p className="text-[11px] font-semibold leading-tight text-rpg-text">{u.title}</p>
                      <p className="text-[10px] text-rpg-muted">Nível {u.level}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rpg-panel p-4" aria-label="Crônica do Código">
            <h2 className="mb-2 flex items-center gap-2 font-rpg text-lg font-bold text-rpg-text">
              <BookOpen size={18} aria-hidden /> Crônica do Código
            </h2>
            {!o?.recent.length ? (
              <p className="text-sm text-rpg-muted">Nenhuma atividade importada ainda.</p>
            ) : (
              <ol className="relative space-y-2 border-l-2 border-rpg-green/40 pl-4">
                {o.recent.slice(0, 8).map((e, i) => {
                  const Icon = KIND_ICON[e.kind];
                  return (
                    <li key={`${e.kind}-${e.at}-${i}`} className="relative">
                      <span className="absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 border-rpg-green bg-rpg-bg" aria-hidden />
                      <div className="rpg-tile flex items-start gap-2 p-2">
                        <Icon size={16} className={clsx("mt-0.5 shrink-0", KIND_TONE[e.kind])} aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] text-rpg-muted">{ago(e.at)}{e.xp > 0 ? ` · +${e.xp} XP` : " · sem XP"}</p>
                          <p className="text-sm font-semibold text-rpg-text">
                            {KIND_TEXT[e.kind]} {e.repo.split("/")[1] ?? e.repo}
                          </p>
                          {e.title &&
                            (e.url ? (
                              <a href={e.url} target="_blank" rel="noreferrer" className="block truncate text-xs italic text-rpg-muted hover:underline">
                                “{e.title}”
                              </a>
                            ) : (
                              <p className="truncate text-xs italic text-rpg-muted">“{e.title}”</p>
                            ))}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className="rpg-ornate flex items-end gap-3 overflow-hidden p-3" aria-label="Ferreiro da Vila">
            <div className="shrink-0">
              <CharacterPortrait look={SMITH} size={84} crop="full" pose="stand" />
            </div>
            <div className="relative min-w-0 flex-1 border-2 border-rpg-gold/60 bg-rpg-panel p-3" style={R}>
              <p className="flex items-center gap-1.5 font-rpg font-bold text-rpg-gold-light">
                <Hammer size={14} aria-hidden /> Ferreiro da Vila
              </p>
              <p className="mt-1 text-xs text-rpg-text">{o ? smithMessage(o) : "Acendendo a fornalha…"}</p>
              {!o?.connected && (
                <RPGButton variant="gold" className="mt-2 text-xs" onClick={() => setSettingsOpen(true)}>
                  <Github size={13} aria-hidden /> Conectar GitHub
                </RPGButton>
              )}
            </div>
          </section>
        </aside>
      </div>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title={o?.connected ? "Configurar a Forja do Código" : "Conectar GitHub"}>
        <div className="space-y-4">
          {o?.connected && o.integration ? (
            <>
              <div className="rpg-tile flex flex-wrap items-center justify-between gap-2 p-2 text-sm">
                <span className="text-rpg-text">
                  <strong>{o.integration.username}</strong> · {o.integration.mode === "token" ? "token (privados)" : "modo público"}
                </span>
                <span className="text-xs text-rpg-muted">Última sincronização: {o.integration.lastSyncAt ? new Date(o.integration.lastSyncAt).toLocaleString("pt-BR") : "nunca"}</span>
              </div>
              <fieldset>
                <legend className="mb-1 text-xs font-semibold text-rpg-text">Atividades que geram XP</legend>
                {(Object.keys(o.rules) as CodeKind[]).map((k) => (
                  <div key={k} className="flex items-center justify-between gap-2 border-b border-rpg-border/50 py-1.5 text-sm">
                    <span className="text-rpg-text">
                      {o.rules[k].label} <span className="text-xs text-rpg-muted">+{o.rules[k].xp} XP · até {o.rules[k].dailyCap}/dia</span>
                    </span>
                    <RPGSwitch checked={o.integration!.rules[k]} onChange={() => a.rules.mutate({ [k]: !o.integration!.rules[k] }, { onError: (e) => notify(errMsg(e, "Não foi possível salvar."), "error") })} label={o.rules[k].label} />
                  </div>
                ))}
                <p className="mt-1 text-[10px] text-rpg-muted">Commits de merge e mensagens triviais (“wip”, “typo”) ficam registrados, mas não rendem XP. Cada atividade conta uma vez só, mesmo sincronizando de novo.</p>
              </fieldset>
              <details>
                <summary className="cursor-pointer text-xs text-rpg-blue">Trocar conta ou modo</summary>
                <div className="mt-2">
                  <ConnectForm busy={a.connect.isPending} onConnect={connect} initial={o.integration.username} />
                </div>
              </details>
              <RPGButton variant="danger" className="text-xs" onClick={() => setConfirmOff(true)}>
                <Unplug size={13} aria-hidden /> Desconectar GitHub
              </RPGButton>
            </>
          ) : (
            <ConnectForm busy={a.connect.isPending} onConnect={connect} />
          )}
        </div>
      </Modal>
      <Modal
        open={confirmOff}
        onClose={() => setConfirmOff(false)}
        title="Desconectar o GitHub?"
        footer={
          <div className="flex justify-end gap-2">
            <RPGButton variant="ghost" onClick={() => setConfirmOff(false)}>
              Cancelar
            </RPGButton>
            <RPGButton
              variant="danger"
              disabled={a.disconnect.isPending}
              onClick={() =>
                a.disconnect.mutate(undefined, {
                  onSuccess: () => {
                    setConfirmOff(false);
                    setSettingsOpen(false);
                    notify("GitHub desconectado e token apagado.");
                  },
                  onError: (e) => notify(errMsg(e, "Não foi possível desconectar."), "error"),
                })
              }
            >
              Desconectar
            </RPGButton>
          </div>
        }
      >
        <p className="text-sm text-rpg-text">O token e a lista de repositórios são apagados. O XP e a atividade já importada continuam no seu histórico, porque aconteceram de verdade.</p>
      </Modal>
    </div>
  );
}
