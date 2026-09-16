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
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useTheme } from "@/hooks/useTheme";
import { usePush } from "@/hooks/usePush";
import { useWeeklyEmail } from "@/hooks/useReviews";
import { Button, Card, Field, IconBadge, PageHeader } from "@/components/ui/primitives";
import { ImageCropModal } from "@/components/ui/ImageCropModal";
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
  const { mode, setMode } = useTheme();
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
    await changePassword({ currentPassword, newPassword });
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  // Requisitos calculados de verdade a partir da senha que o usuário
  // está digitando agora — nada de checklist decorativo fixo.
  const hasLength = newPassword.length >= 8;
  const hasLettersAndNumbers = /[a-zA-Z]/.test(newPassword) && /[0-9]/.test(newPassword);
  const hasSpecial = /[^a-zA-Z0-9]/.test(newPassword);
  const metCount = [hasLength, hasLettersAndNumbers, hasSpecial].filter(Boolean).length;
  const strengthLabel = newPassword.length === 0 ? "" : metCount <= 1 ? "Senha fraca" : metCount === 2 ? "Senha média" : "Senha forte";
  const strengthColor = metCount <= 1 ? "bg-drop" : metCount === 2 ? "bg-signal" : "bg-growth";

  const themeLabel = mode === "dark" ? "Escuro" : mode === "light" ? "Claro" : "Automático (sistema)";

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

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl p-3.5 bg-paper dark:bg-ink flex items-center gap-2.5">
                <IconBadge tone="teal" size={30} icon={<Calendar size={14} />} />
                <div className="min-w-0">
                  <p className="text-xs text-slate">Membro desde</p>
                  <p className="text-sm font-semibold truncate">{formatFullDate(user.created_at)}</p>
                  <p className="text-[11px] text-slate">{monthsSince(user.created_at)}</p>
                </div>
              </div>
              <Link to="/configuracoes" className="rounded-xl p-3.5 bg-paper dark:bg-ink flex items-center gap-2.5 hover:border-brand-500/50 border border-transparent transition-colors">
                <IconBadge tone="purple" size={30} icon={<MoonIcon size={14} />} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate">Tema preferido</p>
                  <p className="text-sm font-semibold truncate">{themeLabel}</p>
                  <p className="text-[11px] text-slate">Você pode alterar nas configurações</p>
                </div>
                <ChevronRight size={14} className="text-slate shrink-0" />
              </Link>
            </div>
          </Card>

          <Card className="p-5 md:p-6">
            <div className="flex items-center gap-2.5 mb-4">
              <IconBadge tone="blue" size={32} icon={<ShieldCheck size={15} />} />
              <div>
                <p className="text-sm font-semibold">Segurança da conta</p>
                <p className="text-xs text-slate">Dicas para manter sua conta sempre segura.</p>
              </div>
            </div>
            <div className="rounded-xl p-4 bg-growth/5 border border-growth/20 flex items-center gap-3">
              <IconBadge tone="green" size={36} icon={<ShieldCheck size={17} />} />
              <div>
                <p className="text-sm font-semibold">Sua conta está segura!</p>
                <p className="text-xs text-slate mt-0.5">Continue usando uma senha forte e mantenha seus dados atualizados.</p>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5 md:p-6">
            <div className="flex items-center gap-2.5 mb-4">
              <IconBadge tone="purple" size={32} icon={<Lock size={15} />} />
              <div>
                <p className="text-sm font-semibold">Alterar senha</p>
                <p className="text-xs text-slate">Mantenha sua conta segura com uma senha forte.</p>
              </div>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div className="relative">
                <Field
                  label="Senha atual"
                  type={showPasswords ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
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

              {newPassword.length > 0 && (
                <div>
                  <div className="flex gap-1 mb-1.5">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className={`h-1 flex-1 rounded-full ${i < metCount ? strengthColor : "bg-paper-border dark:bg-ink-border"}`} />
                    ))}
                  </div>
                  <p className={`text-[11px] font-medium mb-2 ${metCount <= 1 ? "text-drop" : metCount === 2 ? "text-signal-deep" : "text-growth"}`}>
                    {strengthLabel}
                  </p>
                  <ul className="space-y-1">
                    <li className={`flex items-center gap-1.5 text-[11px] ${hasLength ? "text-growth" : "text-slate"}`}>
                      <Check size={12} className={hasLength ? "opacity-100" : "opacity-30"} /> Pelo menos 8 caracteres
                    </li>
                    <li className={`flex items-center gap-1.5 text-[11px] ${hasLettersAndNumbers ? "text-growth" : "text-slate"}`}>
                      <Check size={12} className={hasLettersAndNumbers ? "opacity-100" : "opacity-30"} /> Inclui letras e números
                    </li>
                    <li className={`flex items-center gap-1.5 text-[11px] ${hasSpecial ? "text-growth" : "text-slate"}`}>
                      <Check size={12} className={hasSpecial ? "opacity-100" : "opacity-30"} /> Inclui um caractere especial
                    </li>
                  </ul>
                </div>
              )}

              <Field
                label="Confirmar nova senha"
                type={showPasswords ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={passwordMismatch ? "As senhas não coincidem" : undefined}
              />
              {changePasswordError && <p className="text-xs text-drop">{changePasswordError.message}</p>}
              {changePasswordSuccess && <p className="text-xs text-growth">Senha atualizada com sucesso.</p>}
              <Button type="submit" disabled={isChangingPassword || !currentPassword || !newPassword} className="w-full">
                {isChangingPassword ? "Salvando..." : "Atualizar senha"}
              </Button>
            </form>
          </Card>

          <PushNotificationsCard />
          <WeeklyEmailCard />

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
            <button
              type="button"
              onClick={handleToggle}
              disabled={loading || permission === "denied"}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-40 ${
                isSubscribed ? "bg-growth" : "bg-paper-border dark:bg-ink-border"
              }`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${isSubscribed ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
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
        <button
          type="button"
          onClick={handleToggle}
          disabled={isLoading}
          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-40 ${
            enabled ? "bg-growth" : "bg-paper-border dark:bg-ink-border"
          }`}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>

      <Button variant="secondary" className="w-full mt-3" onClick={handleSendNow} disabled={isSending}>
        <Send size={14} /> {isSending ? "Enviando..." : "Enviar resumo da última semana agora"}
      </Button>
      {sendState && <p className={`text-xs mt-2 ${sendState.ok ? "text-growth" : "text-drop"}`}>{sendState.message}</p>}
    </Card>
  );
}
