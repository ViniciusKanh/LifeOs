import { useMemo, useState } from "react";
import clsx from "clsx";
import { Bug, ExternalLink, Feather, Fish, Flower2, Leaf, PawPrint, Sparkles, Squirrel, Turtle } from "lucide-react";
import { RPGButton, RPGProgressBar } from "@/components/rpg";
import { AdventureHeader, BackToWorld, EmptyNote, INPUT, PageError, PageSkeleton, Panel, R, Spinner, StatTile, errMsg, nf } from "@/components/adventures/AdventureKit";
import { SyncBar, XpChip } from "@/components/integrations/IntegrationKit";
import { useLocalToast } from "@/components/integrations/PublicApiKit";
import { useBestiary, useBestiaryActions } from "@/hooks/useAdventuresMore";
import type { BestiarySpecies, Rarity } from "@/services/adventuresMoreService";

/* Cores de raridade no padrão dos jogos: comum < incomum < rara < épica < lendária. */
const RARITY: Record<Rarity, { label: string; text: string; border: string; glow: string }> = {
  comum: { label: "Comum", text: "text-rpg-muted", border: "border-rpg-border", glow: "" },
  incomum: { label: "Incomum", text: "text-rpg-green", border: "border-rpg-green/70", glow: "" },
  rara: { label: "Rara", text: "text-rpg-blue", border: "border-rpg-blue/80", glow: "shadow-[0_0_10px_rgba(59,130,246,0.35)]" },
  epica: { label: "Épica", text: "text-rpg-purple", border: "border-rpg-purple/80", glow: "shadow-[0_0_12px_rgba(139,92,246,0.45)]" },
  lendaria: { label: "Lendária", text: "text-rpg-orange", border: "border-rpg-orange", glow: "shadow-[0_0_16px_rgba(245,158,11,0.55)]" },
};
const ORDER: Rarity[] = ["lendaria", "epica", "rara", "incomum", "comum"];
const GROUP: Record<string, { label: string; icon: JSX.Element }> = {
  Aves: { label: "Aves", icon: <Feather size={13} aria-hidden /> },
  Plantae: { label: "Plantas", icon: <Leaf size={13} aria-hidden /> },
  Insecta: { label: "Insetos", icon: <Bug size={13} aria-hidden /> },
  Mammalia: { label: "Mamíferos", icon: <Squirrel size={13} aria-hidden /> },
  Reptilia: { label: "Répteis", icon: <Turtle size={13} aria-hidden /> },
  Amphibia: { label: "Anfíbios", icon: <PawPrint size={13} aria-hidden /> },
  Actinopterygii: { label: "Peixes", icon: <Fish size={13} aria-hidden /> },
  Fungi: { label: "Fungos", icon: <Flower2 size={13} aria-hidden /> },
  Arachnida: { label: "Aracnídeos", icon: <Bug size={13} aria-hidden /> },
  Mollusca: { label: "Moluscos", icon: <PawPrint size={13} aria-hidden /> },
};
const groupLabel = (g: string | null) => (g && GROUP[g]?.label) || g || "Outros";

function Card({ s }: { s: BestiarySpecies }) {
  const r = RARITY[s.rarity];
  return (
    <li className="min-w-0">
      <a href={s.url} target="_blank" rel="noreferrer noopener" className={clsx("group block border-2 bg-rpg-bg-2/70 p-1.5 transition-transform hover:-translate-y-0.5", r.border, r.glow)} style={R} aria-label={`${s.commonName ?? s.name}, ${r.label}`}>
        <div className="relative">
          {s.photoUrl ? (
            <img src={s.photoUrl} alt="" className="aspect-square w-full object-cover" style={{ borderRadius: 3 }} loading="lazy" />
          ) : (
            <span className="flex aspect-square w-full items-center justify-center bg-rpg-panel text-rpg-muted" style={{ borderRadius: 3 }}>
              <PawPrint size={22} aria-hidden />
            </span>
          )}
          {s.rarity === "lendaria" && <Sparkles size={16} className="absolute right-1 top-1 text-rpg-orange drop-shadow" aria-hidden />}
          {s.myCount > 1 && <span className="absolute bottom-1 left-1 bg-black/70 px-1 text-[9px] font-bold text-white" style={{ borderRadius: 3 }}>×{s.myCount}</span>}
        </div>
        <p className="mt-1 truncate text-xs font-semibold text-rpg-text" title={s.commonName ?? s.name}>
          {s.commonName ?? s.name}
        </p>
        <p className="truncate text-[10px] italic text-rpg-muted" title={s.name}>
          {s.name}
        </p>
        <p className={clsx("text-[10px] font-bold", r.text)}>
          {r.label}
          {s.globalCount != null && <span className="font-normal text-rpg-muted"> · {nf(s.globalCount)} no mundo</span>}
        </p>
      </a>
    </li>
  );
}

/**
 * Bestiário — espécies que você registrou no iNaturalist viram cartas
 * colecionáveis, com raridade pelo total de avistamentos no mundo.
 */
export function BestiarioPage() {
  const q = useBestiary();
  const a = useBestiaryActions();
  const [notify, toast] = useLocalToast();
  const [login, setLogin] = useState("");
  const [rarity, setRarity] = useState<Rarity | "todas">("todas");
  const [group, setGroup] = useState<string>("todos");
  const o = q.data;
  const list = useMemo(() => (o ? o.species.filter((s) => (rarity === "todas" || s.rarity === rarity) && (group === "todos" || (s.iconic ?? "Outros") === group)) : []), [o, rarity, group]);
  if (q.isLoading) return <PageSkeleton />;
  if (q.isError || !o) return <PageError what="o Bestiário" onRetry={() => void q.refetch()} />;
  const next = o.total < 10 ? 10 : o.total < 50 ? 50 : 100;

  return (
    <div className="space-y-4 px-3 py-4 sm:px-4 md:px-6">
      <BackToWorld />
      <AdventureHeader icon={<PawPrint size={40} className="text-rpg-green" />} title="Bestiário" subtitle="Plantas, bichos e fungos que você fotografou e registrou no iNaturalist viram cartas colecionáveis, com raridade de verdade.">
        {o.connected && <XpChip xp={o.xpTotal} className="text-[11px]" />}
      </AdventureHeader>

      {!o.connected ? (
        <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          <Panel title="Conectar o iNaturalist" icon={<Leaf size={18} className="text-rpg-green" />}>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (login.trim().length < 2) return;
                a.connect.mutate(login.trim(), {
                  onSuccess: (r) => notify(r.sync.ok ? `Bestiário aberto: ${r.sync.species} espécie(s) de ${r.login}.` : `Conectado, mas a leitura falhou: ${r.sync.error}`, r.sync.ok ? "success" : "error"),
                  onError: (err) => notify(errMsg(err, "Não foi possível conectar o iNaturalist."), "error"),
                });
              }}
            >
              <ol className="space-y-1 text-xs text-rpg-muted">
                <li>1. Crie uma conta grátis em inaturalist.org (ou no app iNaturalist / Seek).</li>
                <li>2. Fotografe plantas e animais e publique as observações.</li>
                <li>3. Informe aqui o seu login. Só o que já é público no seu perfil é lido; nenhuma senha é pedida.</li>
              </ol>
              <label className="block text-xs font-semibold text-rpg-text" htmlFor="inat-login">
                Login do iNaturalist
                <input id="inat-login" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="ex.: viniciuskanh" className={clsx(INPUT, "mt-1 w-full font-normal")} style={R} autoComplete="off" />
              </label>
              <RPGButton type="submit" variant="gold" className="w-full justify-center text-sm" disabled={a.connect.isPending || login.trim().length < 2}>
                {a.connect.isPending ? <Spinner /> : <PawPrint size={15} aria-hidden />} Abrir o Bestiário
              </RPGButton>
            </form>
          </Panel>
          <Panel title="Como o Bestiário paga">
            <ul className="space-y-1.5 text-xs text-rpg-muted">
              <li>A coleção começa com as espécies que você já tem (sem XP retroativo).</li>
              <li>
                Cada espécie nova: <b className="text-rpg-text">+{o.rules.species} XP</b>, mais bônus de raridade: incomum +{o.rules.bonus.incomum}, rara +{o.rules.bonus.rara}, épica +{o.rules.bonus.epica}, lendária +{o.rules.bonus.lendaria}.
              </li>
              <li>Raridade = total de observações da espécie no mundo inteiro (lendária: até 500).</li>
              <li>Conquistas: Naturalista Iniciante (10), Guardião do Bestiário (50) e Avistamento Lendário.</li>
            </ul>
          </Panel>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 [&>*]:min-w-0">
            <StatTile icon={<PawPrint size={14} />} tone="text-rpg-green" value={o.total} label="Espécies" hint={`${nf(o.account?.observations ?? 0)} observações`} />
            {ORDER.map((k) => (
              <StatTile key={k} icon={<Sparkles size={14} />} tone={RARITY[k].text} value={o.byRarity[k]} label={RARITY[k].label} />
            ))}
          </div>
          <RPGProgressBar value={Math.min(o.total, next)} max={next} tone="green" label={next === 10 ? "Naturalista Iniciante" : next === 50 ? "Guardião do Bestiário" : "Mestre Naturalista"} valueLabel={`${o.total}/${next} espécies`} />

          <section className="rpg-panel p-4" aria-label="Coleção de espécies">
            <div className="mb-3 space-y-2">
              <div role="group" aria-label="Raridade" className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
                {(["todas", ...ORDER] as const).map((k) => (
                  <button key={k} type="button" aria-pressed={rarity === k} onClick={() => setRarity(k)} className={clsx("shrink-0 border-2 px-2.5 py-1 text-xs font-semibold", rarity === k ? "border-rpg-gold bg-rpg-gold/10 text-rpg-gold-light" : "border-rpg-border text-rpg-muted")} style={R}>
                    {k === "todas" ? `Todas (${o.total})` : `${RARITY[k].label} (${o.byRarity[k]})`}
                  </button>
                ))}
              </div>
              {o.groups.length > 1 && (
                <div role="group" aria-label="Grupo" className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
                  <button type="button" aria-pressed={group === "todos"} onClick={() => setGroup("todos")} className={clsx("shrink-0 border px-2 py-0.5 text-[11px]", group === "todos" ? "border-rpg-green text-rpg-green" : "border-rpg-border text-rpg-muted")} style={R}>
                    Todos os grupos
                  </button>
                  {o.groups.map((g) => (
                    <button key={g.iconic} type="button" aria-pressed={group === g.iconic} onClick={() => setGroup(g.iconic)} className={clsx("flex shrink-0 items-center gap-1 border px-2 py-0.5 text-[11px]", group === g.iconic ? "border-rpg-green text-rpg-green" : "border-rpg-border text-rpg-muted")} style={R}>
                      {GROUP[g.iconic]?.icon} {groupLabel(g.iconic)} ({g.count})
                    </button>
                  ))}
                </div>
              )}
            </div>
            {list.length === 0 ? (
              <EmptyNote>{o.total === 0 ? "Nenhuma espécie identificada ainda. Publique observações no iNaturalist e volte aqui." : "Nenhuma espécie com esse filtro."}</EmptyNote>
            ) : (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {list.map((s) => (
                  <Card key={s.taxonId} s={s} />
                ))}
              </ul>
            )}
          </section>

          <section className="rpg-panel p-3" aria-label="Sincronização com o iNaturalist">
            <SyncBar
              status={o.account?.lastSyncStatus ?? null}
              lastSyncAt={o.account?.lastSyncAt ?? null}
              error={o.account?.lastSyncError ?? null}
              busy={a.sync.isPending}
              onSync={() => a.sync.mutate(undefined, { onSuccess: (r) => notify(r.newSpecies ? `${r.newSpecies} espécie(s) nova(s): +${r.xp} XP.` : "Bestiário em dia."), onError: (e) => notify(errMsg(e, "Falha ao sincronizar."), "error") })}
              onDisconnect={() => a.disconnect.mutate(undefined, { onSuccess: () => notify("iNaturalist desconectado. A coleção e o XP continuam.") })}
              disconnecting={a.disconnect.isPending}
              keepNote="A coleção e o XP já registrados continuam."
            />
            {o.account && (
              <a href={o.account.url} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex items-center gap-1 text-[11px] text-rpg-blue hover:underline">
                Perfil {o.account.login} no iNaturalist <ExternalLink size={10} aria-hidden />
              </a>
            )}
            <p className="mt-1 text-[10px] text-rpg-muted">Fotos e dados: iNaturalist e seus observadores (licenças indicadas em cada observação).</p>
          </section>
        </>
      )}
      {toast}
    </div>
  );
}
