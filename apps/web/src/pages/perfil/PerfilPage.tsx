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
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useTheme } from "@/hooks/useTheme";
import { Button, Card, Field, IconBadge } from "@/components/ui/primitives";
import { ImageCropModal } from "@/components/ui/ImageCropModal";

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
      <p className="font-display font-bold text-2xl">Meu perfil</p>
      <p className="text-sm text-slate mt-0.5 mb-5">Gerencie suas informações pessoais e preferências da sua conta LifeOS.</p>

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

            <div className="flex items-center gap-4">
              <div className="relative w-20 h-20 shrink-0">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center bg-paper dark:bg-ink border border-paper-border dark:border-ink-border"
                  title="Trocar foto"
                >
                  {avatarPreview ? (
                    <img src={avatarPreview} alt={user.name} className="w-full h-full object-cover" />
                  ) : (
                    <User size={28} className="text-slate" />
                  )}
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

              <div className="flex-1 flex items-end gap-2">
                <Field label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
                <Button onClick={handleSaveName} disabled={isUpdatingProfile || !name.trim() || name.trim() === user.name}>
                  Salvar
                </Button>
              </div>
            </div>
            <p className="text-xs text-slate mt-1.5 ml-24">Esse é o nome que será exibido na sua conta.</p>
            {avatarError && <p className="text-xs text-drop mt-2">{avatarError}</p>}
            {updateProfileError && <p className="text-xs text-drop mt-2">{updateProfileError.message}</p>}

            <div className="mt-5 pt-5 border-t border-paper-border dark:border-ink-border grid grid-cols-2 gap-4">
              <div className="flex items-start gap-2.5">
                <IconBadge tone="blue" size={30} icon={<Mail size={14} />} />
                <div className="min-w-0">
                  <p className="text-xs text-slate">E-mail</p>
                  <p className="text-sm mt-0.5 truncate">{user.email}</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <IconBadge tone="purple" size={30} icon={<Lock size={14} />} />
                <div>
                  <p className="text-xs text-slate">Perfil de acesso</p>
                  <p className="text-sm mt-0.5 font-medium">{user.role === "admin" ? "Administrador" : "Usuário"}</p>
                  <p className="text-[11px] text-slate">{user.role === "admin" ? "Acesso total à plataforma." : "Acesso à sua conta pessoal."}</p>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl p-3.5 bg-paper dark:bg-ink flex items-center gap-2.5">
                <IconBadge tone="teal" size={30} icon={<Calendar size={14} />} />
                <div>
                  <p className="text-xs text-slate">Membro desde</p>
                  <p className="text-sm font-semibold">{formatFullDate(user.created_at)}</p>
                  <p className="text-[11px] text-slate">{monthsSince(user.created_at)}</p>
                </div>
              </div>
              <Link to="/configuracoes" className="rounded-xl p-3.5 bg-paper dark:bg-ink flex items-center gap-2.5 hover:border-brand-500/50 border border-transparent transition-colors">
                <IconBadge tone="purple" size={30} icon={<MoonIcon size={14} />} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate">Tema preferido</p>
                  <p className="text-sm font-semibold">{themeLabel}</p>
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
              <span className="flex items-center gap-2">
                <Mail size={14} className="text-slate" /> {ADMIN_EMAIL}
              </span>
              <ChevronRight size={14} className="text-slate" />
            </a>
          </Card>
        </div>
      </div>

      {cropFile && <ImageCropModal file={cropFile} onCancel={() => setCropFile(null)} onConfirm={handleCropConfirm} />}
    </div>
  );
}
