import { useState } from "react";
import { X } from "lucide-react";
import { Button, Field } from "@/components/ui/primitives";

/**
 * Modal de criação de usuário pelo admin — reaproveitado em
 * Configurações e no painel dedicado de Usuários (/admin/usuarios)
 * para não duplicar o formulário em dois lugares.
 */
export function NovoUsuarioModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: { name: string; email: string; password: string; role?: "user" | "admin" }) => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    setSaving(true);
    try {
      await onCreate({ name: name.trim(), email: email.trim(), password, role });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar o usuário.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl p-5 md:p-6 bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold">Novo usuário</p>
          <button onClick={onClose} className="text-slate">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">
          <Field label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
          <Field label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Field label="Senha provisória" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div>
            <label className="text-xs text-slate">Perfil de acesso</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "user" | "admin")}
              className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border"
            >
              <option value="user">Usuário</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          {error && <p className="text-xs text-drop">{error}</p>}
          <Button onClick={handleSubmit} disabled={saving || !name.trim() || !email.trim() || password.length < 8} className="w-full">
            {saving ? "Criando..." : "Criar usuário"}
          </Button>
        </div>
      </div>
    </div>
  );
}
