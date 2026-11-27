import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { Briefcase, Compass, Crown, Headphones, PawPrint, Star, Bus, ChevronRight, Clapperboard, Flame, Hammer, Library, PartyPopper, Percent, PlayCircle, Radar, ScrollText, Sparkles, UtensilsCrossed, Wind } from "lucide-react";
import { useClickUp, useHolidays, useNutrition, useRadar, useWakatime, useZotero } from "@/hooks/usePersonalIntegrations";
import { usePublicKeys } from "@/hooks/usePublicApis";
import type { KeyStatus } from "@/services/publicApisService";

// "info": status visto só na própria tela (não consultamos a API aqui).
type State = "ok" | "off" | "warn" | "load" | "info";

function Row({ icon, name, screen, to, state, detail }: { icon: ReactNode; name: string; screen: string; to: string; state: State; detail: string }) {
  const dot = state === "ok" ? "bg-cat-green" : state === "warn" ? "bg-cat-orange" : state === "load" ? "bg-slate/40 animate-pulse" : state === "info" ? "bg-cat-blue/60" : "bg-slate/40";
  return (
    <li>
      <Link to={to} className="flex items-center gap-3 rounded-lg border border-paper-border px-3 py-2 hover:bg-paper-raised dark:border-ink-border dark:hover:bg-ink-raised rpg:rpg-tile">
        <span className="shrink-0 text-slate" aria-hidden>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{name}</span>
          <span className="block truncate text-[11px] text-slate">
            {screen} · {detail}
          </span>
        </span>
        <span className={clsx("h-2.5 w-2.5 shrink-0 rounded-full", dot)} aria-label={state === "ok" ? "Ativa" : state === "warn" ? "Com aviso" : state === "info" ? "Status na tela da integração" : "Desconectada"} />
        <ChevronRight size={14} className="shrink-0 text-slate" aria-hidden />
      </Link>
    </li>
  );
}

/**
 * Resumo das integrações pessoais nas Configurações. As chaves são do próprio
 * usuário e se conectam na tela de cada integração (nunca aparecem aqui).
 */
export function PersonalIntegrationsCard() {
  const zotero = useZotero();
  const radar = useRadar();
  const waka = useWakatime();
  const clickup = useClickUp();
  const meals = useNutrition();
  const holidays = useHolidays(new Date().getFullYear());
  const keys = usePublicKeys();
  const sync = (s: string | null | undefined): State => (s === "erro" ? "warn" : "ok");
  // Só a origem da chave (pessoal/servidor) — o valor nunca chega ao navegador.
  const keyState = (k: KeyStatus | undefined): State => (keys.isLoading ? "load" : k?.source ? "ok" : "off");
  const keyDetail = (k: KeyStatus | undefined, off: string) => (k?.source === "pessoal" ? `sua chave ${k.masked ?? ""}`.trim() : k?.source === "servidor" ? "chave do servidor" : off);
  return (
    <ul className="space-y-2">
      <Row icon={<Library size={18} />} name="Zotero" screen="Biblioteca do Mestrado" to="/biblioteca-mestrado" state={zotero.isLoading ? "load" : zotero.data?.connected ? sync(zotero.data.connection?.lastSyncStatus) : "off"} detail={zotero.data?.connected ? `${zotero.data.stats.linked} itens vinculados` : "chave pessoal (leitura)"} />
      <Row icon={<Radar size={18} />} name="Radar de Artigos (arXiv + OpenAlex)" screen="Biblioteca do Mestrado" to="/biblioteca-mestrado" state={radar.isLoading ? "load" : radar.data?.topics.length ? "ok" : "off"} detail={radar.data?.topics.length ? `${radar.data.topics.length} tema(s) · ${radar.data.counts.novo} novo(s) na semana` : "sem chave · adicione temas"} />
      <Row icon={<Hammer size={18} />} name="WakaTime" screen="Forja do Código" to="/forja-codigo" state={waka.isLoading ? "load" : waka.data?.connected ? sync(waka.data.connection?.lastSyncStatus) : "off"} detail={waka.data?.connected ? `${Math.floor((waka.data.totalSeconds ?? 0) / 3600)} h registradas` : "chave pessoal (plano grátis)"} />
      <Row icon={<Briefcase size={18} />} name="ClickUp" screen="Profissional" to="/profissional" state={clickup.isLoading ? "load" : clickup.data?.connected ? sync(clickup.data.connection?.lastSyncStatus) : "off"} detail={clickup.data?.connected ? `${clickup.data.counts.open} tarefa(s) abertas · ${clickup.data.connection?.team?.name ?? ""}` : "token pessoal pk_"} />
      <Row icon={<UtensilsCrossed size={18} />} name="Open Food Facts" screen="Saúde · Cozinha do Herói" to="/saude" state={meals.isLoading ? "load" : "ok"} detail={meals.data ? `${meals.data.streak} dia(s) seguidos com refeição · sem chave` : "sem chave"} />
      <Row icon={<PartyPopper size={18} />} name="BrasilAPI (feriados)" screen="Agenda, Conselho e Raid" to="/calendario?aba=calendario" state={holidays.isLoading ? "load" : holidays.data?.unavailableYears.length ? "warn" : "ok"} detail={holidays.data ? `${holidays.data.items.length} feriado(s) em ${holidays.data.year}` : "sem chave"} />
      <Row icon={<PlayCircle size={18} />} name="YouTube Data API" screen="Educação · Cursos em Vídeo" to="/educacao" state={keyState(keys.data?.youtube)} detail={keyDetail(keys.data?.youtube, "chave de API (grátis)")} />
      <Row icon={<Wind size={18} />} name="Open-Meteo (qualidade do ar)" screen="Saúde · Ar do Treino" to="/saude" state="ok" detail="sem chave · usa a cidade do Clima" />
      <Row icon={<Flame size={18} />} name="Hugging Face (Daily Papers)" screen="Biblioteca do Mestrado" to="/biblioteca-mestrado" state="ok" detail="sem chave" />
      <Row icon={<Bus size={18} />} name="SPTrans Olho Vivo" screen="Estação das Carruagens" to="/estacao" state={keyState(keys.data?.sptrans)} detail={keyDetail(keys.data?.sptrans, "token de cadastro (grátis)")} />
      <Row icon={<ScrollText size={18} />} name="Wikipédia (Neste dia)" screen="Taverna · Pergaminho do Dia" to="/taverna?aba=pergaminho" state="ok" detail="sem chave" />
      <Row icon={<Sparkles size={18} />} name="NASA APOD" screen="Meu Mundo · Vitral do Céu" to="/meu-mundo" state={keys.isLoading ? "load" : "ok"} detail={keyDetail(keys.data?.nasa, "DEMO_KEY (limite baixo)")} />
      <Row icon={<Clapperboard size={18} />} name="TMDB" screen="Sala de Cinema" to="/sala-de-cinema" state={keyState(keys.data?.tmdb)} detail={keyDetail(keys.data?.tmdb, "chave de API (grátis)")} />
      <Row icon={<Percent size={18} />} name="Banco Central (SGS)" screen="Banco do Reino · Termômetro" to="/banco" state="ok" detail="sem chave" />
      {/* As telas abaixo carregam os próprios dados ao abrir (evita consultas externas nas Configurações). */}
      <Row icon={<Crown size={18} />} name="Lichess" screen="Aventuras · Arena de Xadrez" to="/xadrez" state="info" detail="usuário público · token opcional para puzzles" />
      <Row icon={<Star size={18} />} name="Advent of Code" screen="Forja do Código" to="/forja-codigo" state="info" detail="cookie de sessão · evento em dezembro" />
      <Row icon={<Compass size={18} />} name="OpenStreetMap (Overpass)" screen="Atlas · Expedições da Semana" to="/atlas" state="info" detail="sem chave · usa a cidade do Clima" />
      <Row icon={<PawPrint size={18} />} name="iNaturalist" screen="Aventuras · Bestiário" to="/bestiario" state="info" detail="login público, sem senha" />
      <Row icon={<Headphones size={18} />} name="Podcast Index" screen="Biblioteca · Leitura em Áudio" to="/biblioteca?aba=audio" state="info" detail="chave e segredo grátis" />
    </ul>
  );
}
