import { useRef, useState } from "react";
import { ImagePlus, Trash2, UserRound } from "lucide-react";
import { ImageCropModal } from "@/components/ui/ImageCropModal";
import { RPGAvatar, RPGButton, RPGPanel, RPG_AVATARS } from "@/components/rpg";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useRpgPreferences, type AvatarMode } from "@/hooks/useRpgPreferences";

/**
 * Estúdio do personagem (só em Meu Perfil, só para o próprio usuário):
 * escolhe o personagem pixel art, envia uma arte própria e define o que o
 * retrato mostra. Tudo cosmético e salvo no backend da própria conta.
 */
export function RpgAvatarStudio({ radio }: { radio: (active: boolean) => string }) {
  const { user } = useAuth();
  const { prefs, update } = useRpgPreferences();
  const { updateProfile } = useProfile();
  const inputRef = useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (!user) return null;

  const hasCustom = !!user.rpg_avatar_image;
  const modes: Array<{ v: AvatarMode; l: string; disabled?: boolean; hint?: string }> = [
    { v: "rpg", l: "Personagem" },
    { v: "custom", l: "Arte própria", disabled: !hasCustom, hint: "Envie uma imagem primeiro" },
    { v: "photo", l: "Foto" },
    { v: "initials", l: "Iniciais" },
  ];

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Escolha um arquivo de imagem (PNG, JPG, WEBP ou GIF).");
      return;
    }
    setError(null);
    setCropFile(file);
  };

  const onCrop = async (dataUri: string) => {
    setCropFile(null);
    setSaving(true);
    try {
      await updateProfile({ rpgAvatarImage: dataUri, rpgPrefs: { avatarMode: "custom" } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a imagem.");
    } finally {
      setSaving(false);
    }
  };

  const removeCustom = async () => {
    setSaving(true);
    try {
      await updateProfile({ rpgAvatarImage: null, rpgPrefs: { avatarMode: "rpg" } });
    } finally {
      setSaving(false);
    }
  };

  return (
    <RPGPanel title="Escolha seu personagem" icon={<UserRound size={16} />}>
      <p className="-mt-1 mb-3 text-xs text-rpg-muted">Só você altera o seu avatar. É apenas visual — não muda nenhuma regra de XP.</p>
      <div role="radiogroup" aria-label="Personagem" className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {RPG_AVATARS.map((a) => {
          const selected = prefs.avatarMode === "rpg" && prefs.avatarId === a.id;
          return (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => update({ avatarId: a.id, avatarMode: "rpg" })}
              className={`${radio(selected)} flex flex-col items-center gap-1.5 !px-1.5`}
              style={{ borderRadius: 3 }}
            >
              <RPGAvatar avatarId={a.id} size="md" frame={selected ? "gold" : "bronze"} alt="" />
              <span className="text-[11px] font-semibold truncate max-w-full">{a.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3 border-t border-rpg-border/60 pt-4">
        <div className="flex items-center gap-3">
          {hasCustom ? (
            <img src={user.rpg_avatar_image ?? ""} alt="Seu avatar personalizado" className="w-14 h-14 object-cover border-2 border-rpg-gold" style={{ borderRadius: 3 }} />
          ) : (
            <span className="w-14 h-14 flex items-center justify-center border-2 border-dashed border-rpg-border text-rpg-muted" style={{ borderRadius: 3 }} aria-hidden>
              <ImagePlus size={20} />
            </span>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-rpg-text">Avatar próprio</p>
            <p className="text-[11px] text-rpg-muted">Suba a arte do seu personagem (recortada em 512×512).</p>
          </div>
        </div>
        <div className="flex gap-2 sm:ml-auto">
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={onFile} aria-label="Enviar imagem do avatar" />
          <RPGButton variant="secondary" disabled={saving} onClick={() => inputRef.current?.click()}>
            <ImagePlus size={14} aria-hidden /> {hasCustom ? "Trocar" : "Enviar imagem"}
          </RPGButton>
          {hasCustom && (
            <RPGButton variant="ghost" disabled={saving} onClick={removeCustom} aria-label="Remover avatar próprio">
              <Trash2 size={14} aria-hidden />
            </RPGButton>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-rpg-red" role="alert">{error}</p>}

      <p className="mt-4 mb-2 text-xs font-semibold text-rpg-muted">O retrato mostra</p>
      <div role="radiogroup" aria-label="Tipo de retrato" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {modes.map((o) => (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={prefs.avatarMode === o.v}
            disabled={o.disabled}
            title={o.disabled ? o.hint : undefined}
            onClick={() => update({ avatarMode: o.v })}
            className={`${radio(prefs.avatarMode === o.v)} disabled:opacity-50 disabled:cursor-not-allowed`}
            style={{ borderRadius: 3 }}
          >
            {o.l}
          </button>
        ))}
      </div>
      {prefs.avatarMode === "photo" && !user.avatar_url && <p className="mt-2 text-[11px] text-rpg-orange">Você ainda não enviou uma foto — use "Editar perfil". Até lá, mostramos suas iniciais.</p>}
      {cropFile && <ImageCropModal file={cropFile} onCancel={() => setCropFile(null)} onConfirm={onCrop} />}
    </RPGPanel>
  );
}
