import { useRef, useState } from "react";
import {
  Camera,
  User,
  Mail,
  Lock,
  Calendar,
  Moon as MoonIcon,
  ShieldCheck,
  HelpCircle,
  ChevronRight,
  Crown,
  Eye,
  EyeOff,
  Check,
  Download,
  Bell,
  BellOff,
  Send,
  Mails,
  BellRing,
  Link2,
  Link2Off,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { THEME_LABEL, useTheme } from "@/hooks/useTheme";
import { RpgProfileView } from "@/components/profile/RpgProfileView";
import { usePush } from "@/hooks/usePush";
import { useWeeklyEmail } from "@/hooks/useReviews";
import { Button, Card, Field, IconBadge, PageHeader } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/Switch";
import { ImageCropModal } from "@/components/ui/ImageCropModal";
import { GoogleAccountCard } from "@/components/auth/GoogleAccountCard";
import { platformFeatures } from "@/platform";
import { PasswordStrengthPanel } from "@/components/auth/PasswordStrengthPanel";
import { MfaSettingsCard } from "@/components/profile/MfaSettingsCard";
import { DeleteAccountCard } from "@/components/profile/DeleteAccountCard";
import { AppearanceCard } from "@/components/profile/AppearanceCard";
import { api } from "@/services/api";

const ADMIN_EMAIL = "viniciussouza742@gmail.com";

function monthsSince(dateStr: string) {
  const start = new Date(dateStr.replace(" ", "T"));
  const now = new Date();
  const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (months <= 0) return "Membro há menos de um mês";
  if (months === 1) return "Há 1 mês com o LifeOS";
  return `Há ${months} meses com o LifeOS`;
}

function formatFullDate(dateStr: string) {
  return new Date(dateStr.replace(" ", "T")).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

export function PerfilPage() {
  const { user } = useAuth();
  const { mode, isRpg } = useTheme();
  const [isExporting, setIsExporting] = useState(false);

  /**
   * Exporta todos os dados reais do usuário (tarefas, hábitos, livros,
   * saúde, metas, foco...) num único JSON, baixado direto no navegador
   * — nenhuma credencial é incluída. O endpoint (/export/me) devolve o
   * dado bruto de cada tabela; aqui só transformamos em arquivo.
   */
  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const payload = await api.get<unknown>("/export/me");
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lifeos-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };
  const {
    updateProfile,
    isUpdatingProfile,
    updateProfileError,
    changePassword,
    isChangingPassword,
    changePasswordError,
    changePasswordSuccess,
    resetChangePassword,
    setPassword,
    isSettingPassword,
    setPasswordError,
    setPasswordSuccess,
  } = useProfile();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(user?.name ?? "");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatar_url ?? null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordMismatch, setPasswordMismatch] = useState(false);

  if (!user) return null;

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarError(null);
    if (!file.type.startsWith("image/")) {
      setAvatarError("Escolha um arquivo de imagem (PNG, JPG, WEBP ou GIF).");
      return;
    }
    setCropFile(file);
  };

  const handleCropConfirm = async (dataUri: string) => {
    setCropFile(null);
    setAvatarPreview(dataUri);
    await updateProfile({ avatarUrl: dataUri });
  };

  const handleSaveName = async () => {
    if (!name.trim() || name.trim() === user.name) return;
    await updateProfile({ name: name.trim() });
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    resetChangePassword();
    if (newPassword !== confirmPassword) {
      setPasswordMismatch(true);
      return;
    }
    setPasswordMismatch(false);
    // Conta que só entrava pelo Google define a primeira senha sem "senha atual".
    if (user.has_password) await changePassword({ currentPassword, newPassword });
    else await setPassword(newPassword);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const themeLabel = THEME_LABEL[mode];

  // Blocos compartilhados entre o layout clássico e a ficha do personagem (RPG).
  const identityEditor = (
    <>
            {/* No celular a foto fica acima e o campo de nome ocupa a linha toda,
                em vez de espremer avatar + input + botão numa única linha */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="relative w-20 h-20 shrink-0">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center bg-gradient-to-br from-brand-500 to-signal p-[2.5px]"
                  title="Trocar foto"
                >
                  <span className="w-full h-full rounded-full overflow-hidden flex items-center justify-center bg-paper dark:bg-ink">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt={user.name} className="w-full h-full object-cover" />
                    ) : (
                      <User size={28} className="text-slate" />
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full flex items-center justify-center bg-brand-500 text-white border-2 border-paper-raised dark:border-ink-raised"
                  title="Trocar foto"
                >
                  <Camera size={13} />
                </button>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />

              <div className="flex-1 flex flex-col sm:flex-row sm:items-end gap-2 w-full">
                <div className="flex-1 min-w-0">
                  <Field label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <Button
                  onClick={handleSaveName}
                  disabled={isUpdatingProfile || !name.trim() || name.trim() === user.name}
                  className="sm:w-auto w-full"
                >
                  Salvar
                </Button>
              </div>
            </div>
            <p className="text-xs text-slate mt-1.5 sm:ml-24">Esse é o nome que será exibido na sua conta.</p>
            {avatarError && <p className="text-xs text-drop mt-2">{avatarError}</p>}
            {updateProfileError && <p className="text-xs text-drop mt-2">{updateProfileError.message}</p>}
    </>
  );

  const passwordCard = (
    <>
          <Card className="p-5 md:p-6">
            <div className="flex items-center gap-2.5 mb-4">
              <IconBadge tone="purple" size={32} icon={<Lock size={15} />} />
              <div>
                <p className="text-sm font-semibold">{user.has_password ? "Alterar senha" : "Definir senha"}</p>
                <p className="text-xs text-slate">
                  {user.has_password ? "Mantenha sua conta segura com uma senha forte." : "Crie uma senha para entrar também com e-mail e senha."}
                </p>
              </div>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-3">
              {user.has_password && (
                <div className="relative">
                  <Field
                    label="Senha atual"
                    type={showPasswords ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
              )}
              <div className="relative">
                <Field
                  label="Nova senha"
                  type={showPasswords ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords((v) => !v)}
                  className="absolute right-3 top-[34px] text-slate"
                  tabIndex={-1}
                >
                  {showPasswords ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>

              {newPassword.length > 0 && <PasswordStrengthPanel password={newPassword} />}

              <Field
                label="Confirmar nova senha"
                type={showPasswords ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={passwordMismatch ? "As senhas não coincidem" : undefined}
              />
              {changePasswordError && <p className="text-xs text-drop">{changePasswordError.message}</p>}
              {setPasswordError && <p className="text-xs text-drop">{setPasswordError.message}</p>}
              {changePasswordSuccess && <p className="text-xs text-growth">Senha atualizada com sucesso.</p>}
              {setPasswordSuccess && <p className="text-xs text-growth">Senha definida. Agora você também pode entrar com e-mail e senha.</p>}
              <Button
                type="submit"
                disabled={isChangingPassword || isSettingPassword || (user.has_password && !currentPassword) || !newPassword}
                className="w-full"
              >
                {isChangingPassword || isSettingPassword ? "Salvando..." : user.has_password ? "Atualizar senha" : "Definir senha"}
              </Button>
            </form>
          </Card>
    </>
  );

  const triggersCard = (
    <>
          <Card className="p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <IconBadge tone="amber" size={32} icon={<BellRing size={15} />} />
              <div>
                <p className="text-sm font-semibold">Gatilhos e alertas</p>
                <p className="text-xs text-slate">Controle tarefas vencidas, conquistas, resumo semanal, push e e-mail em um só lugar.</p>
              </div>
            </div>
            <Link to="/gatilhos" className="flex items-center justify-between rounded-xl p-3 bg-paper dark:bg-ink hover:border-brand-500/50 border border-transparent transition-colors text-sm">
              <span className="font-semibold">Abrir central de gatilhos</span>
              <ChevronRight size={14} className="text-slate shrink-0" />
            </Link>
          </Card>
    </>
  );

  const exportCard = (
    <>
          <Card className="p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <IconBadge tone="green" size={32} icon={<Download size={15} />} />
              <div>
                <p className="text-sm font-semibold">Exportar meus dados</p>
                <p className="text-xs text-slate">Baixe tudo o que você registrou no LifeOS — tarefas, hábitos, livros, saúde, metas e mais — num único arquivo JSON.</p>
              </div>
            </div>
            <Button variant="secondary" className="w-full" onClick={handleExportData} disabled={isExporting}>
              <Download size={14} /> {isExporting ? "Gerando arquivo..." : "Baixar meus dados (.json)"}
            </Button>
          </Card>
    </>
  );

  const helpCard = (
    <>
          <Card className="p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <IconBadge tone="blue" size={32} icon={<HelpCircle size={15} />} />
              <div>
                <p className="text-sm font-semibold">Precisa de ajuda?</p>
                <p className="text-xs text-slate">Fale com o administrador da sua conta LifeOS.</p>
              </div>
            </div>
            <a
              href={`mailto:${ADMIN_EMAIL}`}
              className="flex items-center justify-between rounded-xl p-3 bg-paper dark:bg-ink hover:border-brand-500/50 border border-transparent transition-colors text-sm"
            >
              <span className="flex items-center gap-2 min-w-0 truncate">
                <Mail size={14} className="text-slate shrink-0" /> <span className="truncate">{ADMIN_EMAIL}</span>
              </span>
              <ChevronRight size={14} className="text-slate shrink-0" />
            </a>
          </Card>
    </>
  );

  // Tema RPG: "Ficha do personagem" reaproveita os mesmos blocos funcionais da tela clássica.
  if (isRpg) {
    return (
      <>
        <RpgProfileView
          user={user}
          identityEditor={identityEditor}
          passwordCard={passwordCard}
          pushCard={<PushNotificationsCard />}
          weeklyEmailCard={<WeeklyEmailCard />}
          triggersCard={triggersCard}
          exportCard={exportCard}
          helpCard={helpCard}
        />
        {cropFile && <ImageCropModal file={cropFile} onCancel={() => setCropFile(null)} onConfirm={handleCropConfirm} />}
      </>
    );
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <PageHeader icon={<User size={20} />} title="Meu perfil" subtitle="Gerencie suas informações pessoais e preferências da sua conta LifeOS." />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        <div className="space-y-4">
          <Card className="p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold">Dados do perfil</p>
                <p className="text-xs text-slate">Atualize suas informações e personalize seu perfil.</p>
              </div>
              {user.role === "admin" && (
                <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-growth/10 text-growth">
                  <Crown size={12} /> Administrador
                </span>
              )}
            </div>

            {identityEditor}

            {/* 1 coluna no celular: evita apertar ícone + textos em ~170px de largura */}
            <div className="mt-5 pt-5 border-t border-paper-border dark:border-ink-border grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-2.5 min-w-0">
                <IconBadge tone="blue" size={30} icon={<Mail size={14} />} />
                <div className="min-w-0">
                  <p className="text-xs text-slate">E-mail</p>
                  <p className="text-sm mt-0.5 truncate">{user.email}</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 min-w-0">
                <IconBadge tone="purple" size={30} icon={<Lock size={14} />} />
                <div className="min-w-0">
                  <p className="text-xs text-slate">Perfil de acesso</p>
                  <p className="text-sm mt-0.5 font-medium">{user.role === "admin" ? "Administrador" : "Usuário"}</p>
                  <p className="text-[11px] text-slate">{user.role === "admin" ? "Acesso total à plataforma." : "Acesso à sua conta pessoal."}</p>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="rounded-xl p-3.5 bg-paper dark:bg-ink flex items-center gap-2.5">
                <IconBadge tone="teal" size={30} icon={<Calendar size={14} />} />
                <div className="min-w-0">
                  <p className="text-xs text-slate">Membro desde</p>
                  <p className="text-sm font-semibold truncate">{formatFullDate(user.created_at)}</p>
                  <p className="text-[11px] text-slate">{monthsSince(user.created_at)}</p>
                </div>
              </div>
              <a href="#aparencia" className="rounded-xl p-3.5 bg-paper dark:bg-ink flex items-center gap-2.5 hover:border-brand-500/50 border border-transparent transition-colors">
                <IconBadge tone="purple" size={30} icon={<MoonIcon size={14} />} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate">Tema preferido</p>
                  <p className="text-sm font-semibold truncate">{themeLabel}</p>
                  <p className="text-[11px] text-slate">Altere em “Aparência”, logo abaixo</p>
                </div>
                <ChevronRight size={14} className="text-slate shrink-0" />
              </a>
              <div className="rounded-xl p-3.5 bg-paper dark:bg-ink flex items-center gap-2.5">
                <IconBadge
                  tone={user.google_linked ? "green" : "amber"}
                  size={30}
                  icon={user.google_linked ? <Link2 size={14} /> : <Link2Off size={14} />}
                />
                <div className="min-w-0">
                  <p className="text-xs text-slate">Login com Google</p>
                  <p className="text-sm font-semibold truncate">{user.google_linked ? "Conectado" : "Não conectado"}</p>
                  <p className="text-[11px] text-slate">
                    {user.google_linked ? "Você também pode entrar com sua conta Google." : "Vincule no card “Conta Google”."}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <AppearanceCard />

          <Card className="p-5 md:p-6">
            <div className="flex items-center gap-2.5 mb-4">
              <IconBadge tone="blue" size={32} icon={<ShieldCheck size={15} />} />
              <div>
                <p className="text-sm font-semibold">Segurança da conta</p>
                <p className="text-xs text-slate">Dicas para manter sua conta sempre segura.</p>
              </div>
            </div>
            {user.mfa_enabled ? (
              <div className="rounded-xl p-4 bg-growth/5 border border-growth/20 flex items-center gap-3">
                <IconBadge tone="green" size={36} icon={<ShieldCheck size={17} />} />
                <div>
                  <p className="text-sm font-semibold">Sua conta está bem protegida</p>
                  <p className="text-xs text-slate mt-0.5">Verificação em duas etapas ativa. Guarde seus códigos de recuperação em local seguro.</p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl p-4 bg-signal/10 border border-signal/25 flex items-center gap-3">
                <IconBadge tone="amber" size={36} icon={<ShieldCheck size={17} />} />
                <div>
                  <p className="text-sm font-semibold">Proteja mais sua conta</p>
                  <p className="text-xs text-slate mt-0.5">Ative a verificação em duas etapas no card ao lado — leva menos de 1 minuto.</p>
                </div>
              </div>
            )}
            <p className="text-[11px] text-slate mt-3">
              Leia a{" "}
              <Link to="/privacidade" className="text-brand-600 dark:text-brand-100 hover:underline">
                Política de Privacidade
              </Link>{" "}
              e o{" "}
              <Link to="/termos" className="text-brand-600 dark:text-brand-100 hover:underline">
                Termo de Uso
              </Link>
              {user.terms_version ? ` (versão aceita: ${user.terms_version}).` : "."}
            </p>
          </Card>
        </div>

        <div className="space-y-4">
          {passwordCard}

          {platformFeatures.googleOAuthRedirect && <GoogleAccountCard user={user} />}
          <MfaSettingsCard user={user} />

          <PushNotificationsCard />
          <WeeklyEmailCard />
          <DeleteAccountCard user={user} />

          {triggersCard}

          {exportCard}

          {helpCard}
        </div>
      </div>

      {cropFile && <ImageCropModal file={cropFile} onCancel={() => setCropFile(null)} onConfirm={handleCropConfirm} />}
    </div>
  );
}

/**
 * Notificações push reais (Web Push/VAPID) — o toggle reflete o
 * estado de verdade do navegador (usePush já confere PushManager.
 * getSubscription()), não um booleano só salvo no nosso banco.
 */
function PushNotificationsCard() {
  const { support, permission, isSubscribed, loading, error, subscribe, unsubscribe, sendTest } = usePush();
  const [testState, setTestState] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const handleToggle = async () => {
    setTestState(null);
    if (isSubscribed) {
      await unsubscribe();
    } else {
      await subscribe();
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestState(null);
    try {
      const result = await sendTest();
      setTestState({ ok: true, message: `Notificação de teste enviada (${result.sent} dispositivo(s)).` });
    } catch (err) {
      setTestState({ ok: false, message: err instanceof Error ? err.message : "Falha ao enviar notificação de teste." });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <IconBadge tone={isSubscribed ? "green" : "purple"} size={32} icon={isSubscribed ? <Bell size={15} /> : <BellOff size={15} />} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Notificações push</p>
          <p className="text-xs text-slate">Receba um aviso no navegador/celular quando desbloquear uma conquista ou seu insight diário estiver pronto.</p>
        </div>
      </div>

      {support === "unsupported" ? (
        <p className="text-xs text-slate">Seu navegador não tem suporte a notificações push.</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 rounded-xl p-3 bg-paper dark:bg-ink">
            <div className="min-w-0">
              <p className="text-sm font-medium">{isSubscribed ? "Ativadas neste dispositivo" : "Desativadas neste dispositivo"}</p>
              {permission === "denied" && <p className="text-[11px] text-drop mt-0.5">Bloqueadas nas configurações do navegador.</p>}
            </div>
            <Switch checked={isSubscribed} onChange={handleToggle} disabled={loading || permission === "denied"} label="Notificações push neste dispositivo" />
          </div>

          {error && <p className="text-xs text-drop mt-2">{error}</p>}

          {isSubscribed && (
            <Button variant="secondary" className="w-full mt-3" onClick={handleTest} disabled={testing}>
              <Send size={14} /> {testing ? "Enviando..." : "Enviar notificação de teste"}
            </Button>
          )}
          {testState && (
            <p className={`text-xs mt-2 ${testState.ok ? "text-growth" : "text-drop"}`}>{testState.message}</p>
          )}
        </>
      )}
    </Card>
  );
}

function WeeklyEmailCard() {
  const { enabled, isLoading, setEnabled, sendNow, isSending } = useWeeklyEmail();
  const [sendState, setSendState] = useState<{ ok: boolean; message: string } | null>(null);

  const handleToggle = async () => {
    setSendState(null);
    try {
      await setEnabled(!enabled);
      setSendState({ ok: true, message: !enabled ? "Resumo semanal ativado." : "Resumo semanal desativado." });
    } catch (err) {
      setSendState({ ok: false, message: err instanceof Error ? err.message : "Não foi possível salvar sua preferência." });
    }
  };

  const handleSendNow = async () => {
    setSendState(null);
    try {
      await sendNow();
      setSendState({ ok: true, message: "Resumo enviado! Confira sua caixa de entrada." });
    } catch (err) {
      setSendState({
        ok: false,
        message: err instanceof Error ? err.message : "Falha ao enviar o resumo semanal.",
      });
    }
  };

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <IconBadge tone={enabled ? "green" : "purple"} size={32} icon={<Mails size={15} />} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Resumo semanal por e-mail</p>
          <p className="text-xs text-slate">Toda semana, um e-mail com seu Life Score e as métricas reais da Weekly Review.</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl p-3 bg-paper dark:bg-ink">
        <div className="min-w-0">
          <p className="text-sm font-medium">{enabled ? "Ativado" : "Desativado"}</p>
        </div>
        <Switch checked={enabled} onChange={handleToggle} disabled={isLoading} label="Resumo semanal por e-mail" />
      </div>

      <Button variant="secondary" className="w-full mt-3" onClick={handleSendNow} disabled={isSending}>
        <Send size={14} /> {isSending ? "Enviando..." : "Enviar resumo da última semana agora"}
      </Button>
      {sendState && <p className={`text-xs mt-2 ${sendState.ok ? "text-growth" : "text-drop"}`}>{sendState.message}</p>}
    </Card>
  );
}
