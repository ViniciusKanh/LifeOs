import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  Calendar,
  Coins,
  Crown,
  Droplets,
  Dumbbell,
  FlaskConical,
  Gamepad2,
  Link2,
  ListChecks,
  Lock,
  Mail,
  Moon,
  Palette,
  ReceiptText,
  Repeat,
  Settings2,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import { GoogleAccountCard } from "@/components/auth/GoogleAccountCard";
import { platformFeatures } from "@/platform";
import { MfaSettingsCard } from "@/components/profile/MfaSettingsCard";
import { DeleteAccountCard } from "@/components/profile/DeleteAccountCard";
import { AppearanceCard } from "@/components/profile/AppearanceCard";
import { RpgAvatarStudio } from "@/components/profile/RpgAvatarStudio";
import { DifficultyRewardsPanel } from "@/components/profile/DifficultyRewardsPanel";
import { PriorityRewardsPanel } from "@/components/profile/PriorityRewardsPanel";
import { RPGBadge, RPGButton, RPGPageHeader, RPGPanel, RPGPortrait, RPGProgressBar, RPGStatCard, RPGTabs, RPGWallet, rpgButtonClass } from "@/components/rpg";
import { useTheme, THEME_LABEL } from "@/hooks/useTheme";
import { useProfile } from "@/hooks/useProfile";
import { useGamificationProfile, useGamificationRules, useXpHistory } from "@/hooks/useGamification";
import { useAchievements } from "@/hooks/useAchievements";
import { useAnalyticsOverview, useLifeScore } from "@/hooks/useAnalytics";
import { useHabits } from "@/hooks/useHabits";
import { useProjects } from "@/hooks/useProjects";
import { useLifeAdmin } from "@/hooks/useLifeOs";
import { useExperiments } from "@/hooks/useExperiments";
import { useRpgPreferences, type AnimationLevel } from "@/hooks/useRpgPreferences";
import { FRAMES, PROFILE_BANNERS, bannerSrc, isFrameUnlocked, unlockedTiers } from "@/utils/cosmetics";
import { useCodexTitles, useEquippedTitle } from "@/hooks/useCodex";
import { XP_SOURCES } from "@/utils/gamification";
import type { CurrentUser } from "@/types";

type Tab = "overview" | "stats" | "custom" | "rewards" | "security" | "integrations" | "prefs";

const TIMEZONES = ["America/Sao_Paulo", "America/Manaus", "America/Fortaleza", "America/Recife", "America/Belem", "America/Cuiaba", "America/Rio_Branco", "America/Noronha", "Europe/Lisbon", "UTC"];

function fmtMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
}

/**
 * Meu Perfil no tema RPG — "Ficha do personagem". Só apresentação e
 * preferências: identidade/segurança reaproveitam os blocos reais da página,
 * progressão vem do motor de gamificação e as estatísticas dos serviços existentes.
 */
export function RpgProfileView({
  user,
  identityEditor,
  passwordCard,
  pushCard,
  weeklyEmailCard,
  triggersCard,
  exportCard,
  helpCard,
}: {
  user: CurrentUser;
  identityEditor: ReactNode;
  passwordCard: ReactNode;
  pushCard: ReactNode;
  weeklyEmailCard: ReactNode;
  triggersCard: ReactNode;
  exportCard: ReactNode;
  helpCard: ReactNode;
}) {
  const [params] = useSearchParams();
  const initialTab = params.get("aba");
  const [tab, setTab] = useState<Tab>(initialTab && ["overview", "stats", "custom", "rewards", "security", "integrations", "prefs"].includes(initialTab) ? (initialTab as Tab) : "overview");
  const [editing, setEditing] = useState(false);
  const [statsDays, setStatsDays] = useState(30);
  const { mode } = useTheme();
  const { prefs, update } = useRpgPreferences();
  const { updateProfile, isUpdatingProfile } = useProfile();
  const { data: p } = useGamificationProfile();
  const { data: xp30 } = useXpHistory(30);
  const { achievements } = useAchievements(false);
  const { overview } = useAnalyticsOverview(statsDays);
  const { lifeScore } = useLifeScore();
  const { habits, summaryByHabitId } = useHabits();
  const { projects } = useProjects();
  const { items: adminItems } = useLifeAdmin();
  const { experiments } = useExperiments();

  const level = p?.level ?? 1;
  const title = useEquippedTitle();
  const { data: titleCatalog } = useCodexTitles();
  const tiers = unlockedTiers(achievements);
  const unlocked = achievements.filter((a) => a.unlockedAt);
  const lastAch = [...unlocked].sort((a, b) => (b.unlockedAt ?? "").localeCompare(a.unlockedAt ?? ""))[0] ?? null;
  const nextAch = [...achievements].filter((a) => !a.unlockedAt).sort((a, b) => b.progress - a.progress)[0] ?? null;
  const xpLast30 = (xp30?.days ?? []).reduce((s, d) => s + d.total, 0);
  const mainSource = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const d of xp30?.days ?? []) for (const [k, v] of Object.entries(d.bySource)) totals[k] = (totals[k] ?? 0) + v;
    const best = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
    return best ? XP_SOURCES.find((s) => s.id === best[0])?.label ?? best[0] : null;
  }, [xp30]);
  const contractsDone = habits.filter((h) => summaryByHabitId.get(h.id)?.checkedInToday).length;
  const memberSince = new Date(user.created_at.replace(" ", "T")).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  const stats = [
    { icon: <ListChecks size={18} />, tone: "blue" as const, v: overview ? String(overview.tasksCompleted) : "—", l: "Missões concluídas", c: `últimos ${statsDays} dias` },
    { icon: <Repeat size={18} />, tone: "red" as const, v: `${contractsDone} / ${habits.length}`, l: "Hábitos cumpridos hoje" },
    { icon: <Swords size={18} />, tone: "gold" as const, v: String(projects.filter((x) => x.status === "completed").length), l: "Projetos concluídos" },
    { icon: <FlaskConical size={18} />, tone: "purple" as const, v: String(experiments.length), l: "Experimentos" },
    { icon: <ReceiptText size={18} />, tone: "pink" as const, v: String(adminItems.filter((i) => i.status === "active").length), l: "Itens administrados" },
    { icon: <BookOpen size={18} />, tone: "pink" as const, v: overview ? String(overview.pagesRead) : "—", l: "Páginas lidas", c: `últimos ${statsDays} dias` },
    { icon: <Droplets size={18} />, tone: "blue" as const, v: overview && overview.avgWaterMl > 0 ? `${(overview.avgWaterMl / 1000).toFixed(1)} L` : "—", l: "Água média/dia" },
    { icon: <Moon size={18} />, tone: "purple" as const, v: overview && overview.avgSleepMinutes > 0 ? fmtMinutes(overview.avgSleepMinutes) : "—", l: "Sono médio" },
    { icon: <Dumbbell size={18} />, tone: "orange" as const, v: overview ? String(overview.workouts) : "—", l: "Exercícios", c: `últimos ${statsDays} dias` },
    { icon: <BarChart3 size={18} />, tone: "green" as const, v: overview ? `${overview.habitsCompletionPct}%` : "—", l: "Consistência dos hábitos" },
    { icon: <Trophy size={18} />, tone: "gold" as const, v: `${unlocked.length} / ${achievements.length}`, l: "Conquistas" },
    { icon: <Sparkles size={18} />, tone: "green" as const, v: lifeScore ? String(lifeScore.overall) : "—", l: "Life Score" },
  ];

  const statsGrid = (limit?: number) => (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5">
      {stats.slice(0, limit ?? stats.length).map((s) => (
        <RPGStatCard key={s.l} icon={s.icon} label={s.l} value={s.v} tone={s.tone} caption={s.c} />
      ))}
    </div>
  );

  const radio = (active: boolean) =>
    `border-2 px-3 py-2 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold ${active ? "border-rpg-gold bg-rpg-gold/10 text-rpg-gold-light" : "border-rpg-border bg-rpg-bg-2 text-rpg-text hover:border-rpg-gold/50"}`;
  const field = "w-full px-3 py-2 text-sm bg-rpg-bg-2 text-rpg-text border border-rpg-border focus:border-rpg-gold outline-none";

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 space-y-4">
      <header className="rpg-panel rpg-panel-gold relative overflow-hidden min-h-[150px] sm:min-h-[190px]">
        <img src={bannerSrc(prefs.banner)} alt="" aria-hidden decoding="async" className="pixelated absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-rpg-bg/90 via-rpg-bg/45 to-transparent" aria-hidden />
        <div className="relative p-5 sm:p-7 max-w-xl">
          <p className="font-pixel text-[11px] uppercase tracking-[0.18em] text-rpg-gold">Ficha do personagem</p>
          <h1 className="rpg-title text-3xl sm:text-4xl font-bold leading-tight">Meu Perfil</h1>
          <p className="mt-1 text-sm text-rpg-text/90">Gerencie sua identidade e personalize sua jornada no LifeOS.</p>
          <p className="mt-2 hidden sm:block text-xs italic text-rpg-text/75">&ldquo;Conheça a si mesmo para governar sua jornada.&rdquo;</p>
        </div>
      </header>

      {/* Card principal do personagem — tudo real (auth + motor de gamificação). */}
      <RPGPanel variant="gold" bodyClassName="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="self-center"><RPGPortrait size="lg" /></div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h2 className="font-rpg text-2xl font-bold text-rpg-text">{user.name}</h2>
              <RPGBadge tone={user.role === "admin" ? "gold" : "blue"} icon={user.role === "admin" ? <Crown size={10} aria-hidden /> : undefined}>
                {user.role === "admin" ? "Administrador" : "Usuário"}
              </RPGBadge>
            </div>
            <p className="font-pixel text-xs text-rpg-purple mt-0.5">{title}</p>
            <p className="mt-2 flex flex-wrap justify-center sm:justify-start gap-x-4 gap-y-1 text-xs text-rpg-muted">
              <span className="inline-flex items-center gap-1"><Mail size={12} aria-hidden /> {user.email}</span>
              <span className="inline-flex items-center gap-1"><Calendar size={12} aria-hidden /> Membro desde {memberSince}</span>
            </p>
          </div>
          <RPGButton variant="primary" className="self-center" onClick={() => setEditing(true)}>Editar perfil</RPGButton>
        </div>
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <RPGStatCard icon={<Crown size={18} />} label="Nível atual" value={`Nv. ${level}`} tone="purple" />
          <RPGStatCard icon={<Sparkles size={18} />} label="Experiência total" value={p ? `${p.totalXp.toLocaleString("pt-BR")} XP` : "—"} tone="cyan" />
          <RPGStatCard icon={<Coins size={18} />} label="Moedas" value={p ? String(p.coins) : "—"} tone="gold" to="/tesouro" caption="Ver tesouro →" />
          <RPGStatCard icon={<Trophy size={18} />} label="Conquistas" value={`${unlocked.length} / ${achievements.length}`} tone="red" to="/conquistas" caption="Ver conquistas →" />
        </div>
      </RPGPanel>

      <RPGTabs
        label="Seções do perfil"
        className="max-w-full"
        tabs={[
          { value: "overview" as Tab, label: "Visão geral" },
          { value: "stats" as Tab, label: "Estatísticas" },
          { value: "custom" as Tab, label: "Personalização" },
          { value: "rewards" as Tab, label: "XP e recompensas" },
          { value: "security" as Tab, label: "Segurança" },
          { value: "integrations" as Tab, label: "Integrações" },
          { value: "prefs" as Tab, label: "Preferências" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "overview" && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start">
          <div className="space-y-4 min-w-0">
            <RPGPanel title="Progressão" icon={<Crown size={16} />}>
              {p ? (
                <>
                  <RPGProgressBar tone="purple" label={`Nível ${p.level} → ${p.level + 1}`} value={p.xpIntoLevel} max={p.xpForNextLevel} valueLabel={`${p.xpIntoLevel.toLocaleString("pt-BR")} / ${p.xpForNextLevel.toLocaleString("pt-BR")} XP (${p.progressPct}%)`} />
                  <dl className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    {[
                      { l: "Para o próximo nível", v: `${(p.xpForNextLevel - p.xpIntoLevel).toLocaleString("pt-BR")} XP` },
                      { l: "XP nos últimos 30 dias", v: `${xpLast30.toLocaleString("pt-BR")} XP` },
                      { l: "Origem principal (30d)", v: mainSource ?? "—" },
                      { l: "Sequência com XP", v: `${p.streakDays} ${p.streakDays === 1 ? "dia" : "dias"}` },
                    ].map((d) => (
                      <div key={d.l} className="border border-rpg-border/70 bg-rpg-bg/40 px-2.5 py-2" style={{ borderRadius: 3 }}>
                        <dt className="text-rpg-muted">{d.l}</dt>
                        <dd className="font-pixel text-sm text-rpg-text mt-0.5">{d.v}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : (
                <div className="h-16 rpg-bar animate-pulse" aria-label="Carregando progressão" />
              )}
            </RPGPanel>

            <div className="grid gap-3 md:grid-cols-3">
              <RPGStatCard icon={<Palette size={18} />} label="Tema do LifeOS" value={THEME_LABEL[mode]} tone="purple" caption="Altere em Personalização" />
              <RPGStatCard icon={<ShieldCheck size={18} />} label="Perfil de acesso" value={user.role === "admin" ? "Administrador" : "Usuário"} tone="gold" caption={user.role === "admin" ? "Acesso total à plataforma" : "Acesso à sua conta"} />
              <RPGStatCard icon={<Link2 size={18} />} label="Login com Google" value={user.google_linked ? "Conectado" : "Não conectado"} tone={user.google_linked ? "green" : "orange"} />
            </div>

            <RPGPanel title="Conquistas" icon={<Trophy size={16} />} actions={<Link to="/conquistas" className="text-xs text-rpg-gold-light hover:underline">Ver conquistas →</Link>}>
              <div className="grid gap-2 sm:grid-cols-2 text-sm">
                <div className="border border-rpg-border/70 bg-rpg-bg/40 p-3" style={{ borderRadius: 3 }}>
                  <p className="text-[11px] text-rpg-muted">Última conquista</p>
                  <p className="font-rpg font-bold text-rpg-text">{lastAch ? lastAch.title : "Nenhuma ainda"}</p>
                  {lastAch?.unlockedAt && <p className="text-[11px] text-rpg-muted">em {new Date(lastAch.unlockedAt.replace(" ", "T")).toLocaleDateString("pt-BR")}</p>}
                </div>
                <div className="border border-rpg-border/70 bg-rpg-bg/40 p-3" style={{ borderRadius: 3 }}>
                  <p className="text-[11px] text-rpg-muted">Próxima conquista</p>
                  <p className="font-rpg font-bold text-rpg-text">{nextAch ? nextAch.title : "Todas desbloqueadas"}</p>
                  {nextAch && <RPGProgressBar className="mt-1" tone="purple" label="Progresso" value={nextAch.progress} showLabel={false} />}
                </div>
              </div>
            </RPGPanel>

            <RPGPanel title="Minhas estatísticas" icon={<BarChart3 size={16} />} actions={<button type="button" onClick={() => setTab("stats")} className="text-xs text-rpg-gold-light hover:underline">Ver todas →</button>}>
              {statsGrid(8)}
            </RPGPanel>
          </div>
          <div className="space-y-4 min-w-0">
            {passwordCard}
            {platformFeatures.googleOAuthRedirect && <GoogleAccountCard user={user} />}
          </div>
        </div>
      )}

      {tab === "stats" && (
        <RPGPanel
          title="Minhas estatísticas"
          icon={<BarChart3 size={16} />}
          actions={
            <select aria-label="Período" className={`${field} w-auto`} style={{ borderRadius: 3 }} value={statsDays} onChange={(e) => setStatsDays(Number(e.target.value))}>
              <option value={7}>Últimos 7 dias</option>
              <option value={30}>Últimos 30 dias</option>
              <option value={90}>Últimos 90 dias</option>
            </select>
          }
        >
          <p className="-mt-1 mb-3 text-xs text-rpg-muted">Seu progresso em todas as áreas do LifeOS — calculado dos seus registros reais e visível só para você.</p>
          {statsGrid()}
        </RPGPanel>
      )}

      {tab === "custom" && (
        <div className="grid gap-4 xl:grid-cols-2 items-start">
          <div className="min-w-0"><AppearanceCard hideAvatar /></div>
          <div className="space-y-4 min-w-0">
            <RpgAvatarStudio radio={radio} />

            <RPGPanel title="Moldura" icon={<Crown size={16} />}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {FRAMES.map((f) => {
                  const ok = isFrameUnlocked(f.id, tiers);
                  return (
                    <button key={f.id} type="button" disabled={!ok} aria-pressed={prefs.frame === f.id} onClick={() => update({ frame: f.id })} className={`${radio(prefs.frame === f.id)} disabled:opacity-50 disabled:cursor-not-allowed`} style={{ borderRadius: 3 }} title={f.hint}>
                      <span className="flex items-center gap-1.5 font-semibold">{!ok && <Lock size={12} aria-label="Bloqueada" />}{f.label}</span>
                      <span className="block text-[10px] text-rpg-muted">{ok ? "Disponível" : f.hint}</span>
                    </button>
                  );
                })}
              </div>
            </RPGPanel>

            <RPGPanel title="Título" icon={<Sparkles size={16} />}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(titleCatalog ?? []).map((t) => {
                  const ok = t.unlocked;
                  const active = title === t.name;
                  return (
                    <button key={t.id} type="button" disabled={!ok} aria-pressed={active} onClick={() => update({ title: t.id })} className={`${radio(active)} disabled:opacity-50 disabled:cursor-not-allowed`} style={{ borderRadius: 3 }} title={t.description}>
                      <span className="flex items-center gap-1.5 font-semibold">{!ok && <Lock size={12} aria-label="Bloqueado" />}{t.name}</span>
                      <span className="block text-[10px] text-rpg-muted">{ok ? "Desbloqueado" : "Bloqueado — veja no Códex"}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-rpg-muted">Cosméticos não dão nenhuma vantagem — só mudam a aparência da sua ficha.</p>
            </RPGPanel>

            <RPGPanel title="Banner do perfil" icon={<Palette size={16} />}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PROFILE_BANNERS.map((b) => (
                  <button key={b.id} type="button" aria-pressed={prefs.banner === b.id} onClick={() => update({ banner: b.id })} className={`relative h-16 overflow-hidden border-2 ${prefs.banner === b.id ? "border-rpg-gold" : "border-rpg-border hover:border-rpg-gold/50"}`} style={{ borderRadius: 3 }}>
                    <img src={bannerSrc(b.id)} alt="" loading="lazy" decoding="async" className="pixelated absolute inset-0 w-full h-full object-cover" />
                    <span className="absolute inset-x-0 bottom-0 bg-rpg-bg/80 px-1 py-0.5 text-[10px] text-rpg-text truncate">{b.label}</span>
                  </button>
                ))}
              </div>
            </RPGPanel>
          </div>
        </div>
      )}

      {tab === "rewards" && (
        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr] items-start">
          <div className="min-w-0 space-y-4"><PriorityRewardsPanel /><DifficultyRewardsPanel /></div>
          <RPGPanel title="Regras fixas da jornada" icon={<Settings2 size={16} />}>
            <p className="-mt-1 mb-2 text-xs text-rpg-muted">Estas recompensas são iguais para todos e vêm do servidor (hábitos, foco, revisões, conquistas, laboratório).</p>
            <FixedRules />
            <Link to="/contratos" className={rpgButtonClass("secondary", "mt-3")}>Gestão de contratos →</Link>
          </RPGPanel>
        </div>
      )}

      {tab === "security" && (
        <div className="grid gap-4 xl:grid-cols-2 items-start">
          <div className="space-y-4 min-w-0">{passwordCard}</div>
          <div className="space-y-4 min-w-0">
            <MfaSettingsCard user={user} />
            <RPGPanel title="Privacidade dos dados" icon={<ShieldCheck size={16} />}>
              <p className="text-sm text-rpg-text/90">Suas estatísticas, XP, moedas e conquistas são privados: nenhum dado pessoal aparece para outros usuários.</p>
              <p className="mt-2 text-xs text-rpg-muted">
                Leia a <Link to="/privacidade" className="text-rpg-gold-light hover:underline">Política de Privacidade</Link> e o{" "}
                <Link to="/termos" className="text-rpg-gold-light hover:underline">Termo de Uso</Link>
                {user.terms_version ? ` (versão aceita: ${user.terms_version}).` : "."}
              </p>
            </RPGPanel>
            <DeleteAccountCard user={user} />
          </div>
        </div>
      )}

      {tab === "integrations" && (
        <div className="grid gap-4 xl:grid-cols-2 items-start">
          <div className="space-y-4 min-w-0">
            {platformFeatures.googleOAuthRedirect && <GoogleAccountCard user={user} />}
            {pushCard}
          </div>
          <div className="space-y-4 min-w-0">
            {weeklyEmailCard}
            {triggersCard}
            {exportCard}
          </div>
        </div>
      )}

      {tab === "prefs" && (
        <div className="grid gap-4 xl:grid-cols-2 items-start">
          <RPGPanel title="Preferências da conta" icon={<Settings2 size={16} />}>
            <div className="space-y-3">
              <label className="block text-xs text-rpg-muted">
                Idioma
                <select className={`${field} mt-1`} style={{ borderRadius: 3 }} value={user.language ?? "pt-BR"} disabled={isUpdatingProfile} onChange={(e) => void updateProfile({ language: e.target.value })}>
                  <option value="pt-BR">Português (Brasil)</option>
                </select>
              </label>
              <label className="block text-xs text-rpg-muted">
                Fuso horário (define o "dia" das missões, hábitos e XP)
                <select className={`${field} mt-1`} style={{ borderRadius: 3 }} value={user.timezone ?? "America/Sao_Paulo"} disabled={isUpdatingProfile} onChange={(e) => void updateProfile({ timezone: e.target.value })}>
                  {[...new Set([user.timezone ?? "America/Sao_Paulo", ...TIMEZONES])].map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </label>
              <p className="text-[11px] text-rpg-muted">Tema e personagem ficam em Personalização. Notificações e e-mails ficam em Integrações.</p>
            </div>
          </RPGPanel>

          <RPGPanel title="Gamificação" icon={<Gamepad2 size={16} />}>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span>
                  <span className="block text-rpg-text">Mostrar elementos de jogo</span>
                  <span className="block text-[11px] text-rpg-muted">Desligado, XP e moedas continuam sendo registrados — só somem da tela.</span>
                </span>
                <Switch checked={prefs.gamification} onChange={() => update({ gamification: !prefs.gamification })} label="Mostrar elementos de jogo" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-rpg-text">Mostrar barra de XP no topo</span>
                <Switch checked={prefs.showXp} onChange={() => update({ showXp: !prefs.showXp })} disabled={!prefs.gamification} label="Mostrar barra de XP" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-rpg-text">Mostrar moedas no topo {p && <RPGWallet coins={p.coins} size="sm" />}</span>
                <Switch checked={prefs.showCoins} onChange={() => update({ showCoins: !prefs.showCoins })} disabled={!prefs.gamification} label="Mostrar moedas" />
              </div>
              <fieldset>
                <legend className="text-rpg-text">Animações do RPG</legend>
                <div role="radiogroup" aria-label="Animações do RPG" className="mt-1.5 grid grid-cols-3 gap-2">
                  {([
                    { v: "full", l: "Ativadas" },
                    { v: "reduced", l: "Reduzidas" },
                    { v: "off", l: "Desativadas" },
                  ] as Array<{ v: AnimationLevel; l: string }>).map((o) => (
                    <button key={o.v} type="button" role="radio" aria-checked={prefs.animations === o.v} onClick={() => update({ animations: o.v })} className={radio(prefs.animations === o.v)} style={{ borderRadius: 3 }}>
                      {o.l}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-rpg-muted">A configuração "reduzir movimento" do seu sistema é sempre respeitada.</p>
              </fieldset>
            </div>
          </RPGPanel>
          <div className="xl:col-span-2">{helpCard}</div>
        </div>
      )}

      <Modal open={editing} onClose={() => setEditing(false)} title="Editar perfil" size="md">
        {identityEditor}
      </Modal>
    </div>
  );
}

/** Tabela das regras fixas (públicas) do motor — valores reais de /gamification/rules. */
function FixedRules() {
  const { data: r } = useGamificationRules();
  if (!r) return <p className="text-sm text-rpg-muted">Carregando regras…</p>;
  const rows: Array<[string, { xp: number; coins: number }]> = [
    ["Hábito cumprido no dia", r.habit],
    [`Foco (${r.focus.blockMinutes} min)`, { xp: r.focus.xpPerBlock, coins: r.focus.coinsPerBlock }],
    ["Projeto concluído", r.project],
    ["Primeira crônica do dia", r.journal],
    ["Revisão semanal", r.review.weekly],
    ["Experimento iniciado", r.experiment.started],
    ["Registro no laboratório", r.experiment.checkin],
    ["Experimento concluído", r.experiment.concluded],
  ];
  return (
    <ul className="divide-y divide-rpg-border/50 text-sm">
      {rows.map(([label, v]) => (
        <li key={label} className="flex items-center justify-between gap-2 py-1.5">
          <span className="text-rpg-text">{label}</span>
          <span className="font-pixel text-xs text-rpg-muted shrink-0">+{v.xp} XP · +{v.coins} 🪙</span>
        </li>
      ))}
    </ul>
  );
}
