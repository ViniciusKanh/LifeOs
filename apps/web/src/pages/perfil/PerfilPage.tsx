import { useRef, useState } from "react";
import { Camera, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { Button, Card, Field } from "@/components/ui/primitives";

const MAX_AVATAR_BYTES = 1_500_000; // ~1.5MB de arquivo original antes do base64

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function PerfilPage() {
  const { user } = useAuth();
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

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMismatch, setPasswordMismatch] = useState(false);

  if (!user) return null;

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError(null);

    if (!file.type.startsWith("image/")) {
      setAvatarError("Escolha um arquivo de imagem (PNG, JPG, WEBP ou GIF).");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError("Imagem muito grande — escolha um arquivo de até 1,5MB.");
      return;
    }

    const dataUri = await fileToDataUri(file);
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

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-2xl mx-auto space-y-4">
      <p className="font-display font-medium text-2xl mb-2">Meu perfil</p>

      <Card className="p-5 md:p-6">
        <p className="text-sm font-semibold mb-4">Foto e nome</p>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="relative w-20 h-20 shrink-0 rounded-full overflow-hidden flex items-center justify-center bg-paper-border dark:bg-ink-border group"
            title="Trocar foto"
          >
            {avatarPreview ? (
              <img src={avatarPreview} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              <User size={28} className="text-slate" />
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera size={18} className="text-white" />
            </span>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />

          <div className="flex-1 flex items-end gap-2">
            <Field label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
            <Button onClick={handleSaveName} disabled={isUpdatingProfile || !name.trim() || name.trim() === user.name}>
              Salvar
            </Button>
          </div>
        </div>
        {avatarError && <p className="text-xs text-drop mt-2">{avatarError}</p>}
        {updateProfileError && <p className="text-xs text-drop mt-2">{updateProfileError.message}</p>}

        <div className="mt-5 pt-5 border-t border-paper-border dark:border-ink-border grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-slate">E-mail</p>
            <p className="mt-0.5">{user.email}</p>
          </div>
          <div>
            <p className="text-xs text-slate">Perfil de acesso</p>
            <p className="mt-0.5">{user.role === "admin" ? "Administrador" : "Usuário"}</p>
          </div>
        </div>
      </Card>

      <Card className="p-5 md:p-6">
        <p className="text-sm font-semibold mb-4">Alterar senha</p>
        <form onSubmit={handleChangePassword} className="space-y-3">
          <Field
            label="Senha atual"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <Field label="Nova senha" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <Field
            label="Confirmar nova senha"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={passwordMismatch ? "As senhas não coincidem" : undefined}
          />
          {changePasswordError && <p className="text-xs text-drop">{changePasswordError.message}</p>}
          {changePasswordSuccess && <p className="text-xs text-growth">Senha atualizada com sucesso.</p>}
          <Button type="submit" disabled={isChangingPassword || !currentPassword || !newPassword}>
            {isChangingPassword ? "Salvando..." : "Atualizar senha"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
