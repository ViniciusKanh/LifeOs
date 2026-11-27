import { useMemo, useState } from "react";
import { Clock3, MapPin, RefreshCw, Syringe } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { RPGBadge, RPGButton } from "@/components/rpg";
import { IndicatorCard, KitSection } from "@/components/rpg-modules/ModuleKit";
import { useLocalToast } from "@/components/integrations/PublicApiKit";
import { useCityFavorites, useQueue } from "@/hooks/useCity";
import { cityService, type QueueLevel } from "@/services/cityService";
import { CityBanner, CityError, EmptyBox, FavoriteButton, LoadingBlock, R, Select, SourceStrip, TextInput, dateTimeBR } from "@/components/city/CityKit";

const LEVEL: Record<QueueLevel, { label: string; tone: "green" | "blue" | "orange" | "red" | "muted"; order: number }> = {
  sem_fila: { label: "Sem fila", tone: "green", order: 0 },
  pequena: { label: "Fila pequena", tone: "blue", order: 1 },
  media: { label: "Fila média", tone: "orange", order: 2 },
  grande: { label: "Fila grande", tone: "red", order: 3 },
  fechado: { label: "Fechado", tone: "muted", order: 5 },
  desconhecida: { label: "Sem informação", tone: "muted", order: 4 },
};

export function DeOlhoNaFilaPage() {
  const [notify, toast] = useLocalToast();
  const qc = useQueryClient();
  const q = useQueue();
  const favs = useCityFavorites("fila");
  const saved = useMemo(() => new Set((favs.data ?? []).map((f) => f.itemKey)), [favs.data]);
  const [vaccine, setVaccine] = useState("");
  const [level, setLevel] = useState("");
  const [search, setSearch] = useState("");
  const [onlyFresh, setOnlyFresh] = useState(false);
  const posts = q.data?.posts ?? [];
  const vaccines = useMemo(() => [...new Set(posts.flatMap((p) => p.vaccines.map((v) => v.name)))], [posts]);
  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    return posts
      .filter((p) => !vaccine || p.vaccines.some((v) => v.name === vaccine && v.available))
      .filter((p) => !level || p.level === level)
      .filter((p) => !onlyFresh || !p.outdated)
      .filter((p) => !s || `${p.unit} ${p.address ?? ""}`.toLowerCase().includes(s))
      .sort((a, b) => LEVEL[a.level].order - LEVEL[b.level].order || Number(a.outdated) - Number(b.outdated) || a.unit.localeCompare(b.unit));
  }, [posts, vaccine, level, search, onlyFresh]);
  const by = (l: QueueLevel) => posts.filter((p) => p.level === l).length;

  const refresh = async () => {
    try {
      const fresh = await cityService.queue(true);
      qc.setQueryData(["city", "fila"], fresh);
      notify(fresh.stale ? "A Prefeitura não respondeu; mantida a última cópia." : "Fila atualizada.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Falha ao atualizar.", "error");
    }
  };

  return (
    <div className="space-y-3">
      {toast}
      <CityBanner domain="saude" eyebrow="Saúde e Educação" title="De Olho na Fila" subtitle="Situação da fila e vacinas disponíveis nos postos, como cada posto informou à Secretaria da Saúde. Sem tempo de espera inventado.">
        <RPGButton variant="secondary" onClick={refresh} disabled={!q.isSuccess}>
          <RefreshCw size={14} aria-hidden /> Atualizar
        </RPGButton>
      </CityBanner>

      {q.isSuccess && (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <IndicatorCard icon={<Syringe size={22} />} label="Postos na lista" value={posts.length} tone="green" />
          <IndicatorCard icon={<Syringe size={22} />} label="Sem fila" value={by("sem_fila")} tone="green" hint="segundo o posto" />
          <IndicatorCard icon={<Syringe size={22} />} label="Fila grande" value={by("grande")} tone="red" hint="segundo o posto" />
          <IndicatorCard icon={<Clock3 size={22} />} label="Sem atualização em 3 h" value={posts.filter((p) => p.outdated).length} tone="orange" />
        </div>
      )}

      <section className="rpg-panel p-3" aria-label="Filtros">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:items-end">
          <Select label="Vacina" value={vaccine} onChange={setVaccine} options={[{ value: "", label: "Todas" }, ...vaccines.map((v) => ({ value: v, label: v }))]} />
          <Select label="Situação" value={level} onChange={setLevel} options={[{ value: "", label: "Todas" }, ...Object.entries(LEVEL).map(([v, l]) => ({ value: v, label: l.label }))]} />
          <TextInput label="Posto ou endereço" value={search} onChange={setSearch} placeholder="UBS, bairro, rua…" />
          <label className="flex min-h-[40px] items-center gap-2 text-xs text-rpg-muted">
            <input type="checkbox" checked={onlyFresh} onChange={(e) => setOnlyFresh(e.target.checked)} /> Só atualizados nas últimas 3 h
          </label>
        </div>
      </section>

      <SourceStrip apiId="fila" meta={q.data} reference="Situação informada por cada posto" />

      <KitSection title={`Postos (${list.length})`} icon={<Syringe size={16} aria-hidden />}>
        {q.isLoading ? (
          <LoadingBlock />
        ) : q.isError ? (
          <CityError error={q.error} onRetry={() => void q.refetch()} />
        ) : !list.length ? (
          <EmptyBox title={posts.length ? "Nenhum posto com esses filtros." : "A Secretaria não listou postos agora."} />
        ) : (
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 md:grid-cols-2 2xl:grid-cols-3">
            {list.map((p) => (
              <li key={p.key} className="flex min-w-0 flex-col gap-1.5 border-2 border-rpg-border bg-rpg-bg-2/60 p-2.5" style={R}>
                <div className="flex min-w-0 items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-rpg-text">{p.unit}</p>
                    {p.address && <p className="truncate text-xs text-rpg-muted">{p.address}</p>}
                  </div>
                  <FavoriteButton apiId="fila" itemKey={p.key} title={p.unit} subtitle={p.address} saved={saved.has(p.key)} notify={notify} />
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <RPGBadge tone={LEVEL[p.level].tone}>{LEVEL[p.level].label}</RPGBadge>
                  {p.statusText && p.level === "desconhecida" && <span className="text-xs text-rpg-text/80">“{p.statusText}”</span>}
                  <span className={`text-[11px] ${p.outdated ? "text-amber-300" : "text-rpg-muted"}`}>
                    <Clock3 size={11} className="mr-0.5 inline" aria-hidden />
                    {p.updatedAt ? dateTimeBR(p.updatedAt) : "sem horário"}
                    {p.outdated && " · desatualizado"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {p.vaccines.map((v) => (
                    <span key={v.name} className={`border px-1.5 py-0.5 text-[11px] ${v.available ? "border-rpg-green/50 text-rpg-green" : "border-rpg-border text-rpg-muted line-through"}`} style={R}>
                      {v.name}
                    </span>
                  ))}
                </div>
                {p.address && (
                  <a href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(`${p.address}, São Paulo`)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-[32px] items-center gap-1 text-xs text-rpg-blue">
                    <MapPin size={12} aria-hidden /> Ver no mapa
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </KitSection>
    </div>
  );
}
