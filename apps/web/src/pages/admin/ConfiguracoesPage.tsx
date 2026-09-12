import { useState, type ReactNode } from "react";
import { KeyRound, Mail, Plus, Trash2, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAdminSettings, useAdminUsers } from "@/hooks/useAdmin";
import { Button, Card, Field } from "@/components/ui/primitives";
import type { AdminIntegration, AdminSetting } from "@/types";

function findSetting(settings: AdminSetting[], integration: AdminIntegration, keyName: string) {
  return settings.find((s) => s.integration === integration && s.key_name === keyName);
}

/** Uma credencial: mostra o preview mascarado (se existir) e um campo pra sobrescrever. */
function SecretField({
  label,
  placeholder,
  existing,
  onSave,
  onRemove,
  inputType = "text",
}: {
  label: string;
  placeholder?: string;
  existing?: AdminSetting;
  onSave: (value: string) => Promise<unknown>;
  onRemove?: () => Promise<unknown>;
  inputType?: string;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!value.trim()) return;
    setSaving(true);
    try {
      await onSave(value.trim());
      setValue("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <label className="text-xs text-slate">{label}</label>
      <div className="flex items-center gap-2 mt-1.5">
        <input
          type={inputType}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={existing ? existing.masked_preview : placeholder}
          className="flex-1 rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border"
        />
        <Button variant="secondary" onClick={handleSave} disabled={saving || !value.trim()}>
          {existing ? "Atualizar" : "Salvar"}
        </Button>
        {existing && onRemove && (
          <button onClick={onRemove} className="text-slate shrink-0" title="Remover">
            <Trash2 size={16} />
          </button>
        )}
      </div>
      {existing && (
        <p className="text-[11px] text-slate mt-1">
          Configurado — valor atual: {existing.masked_preview} (atualizado em{" "}
          {new Date(existing.updated_at).toLocaleDateString("pt-BR")})
        </p>
      )}
    </div>
  );
}

function SectionCard({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return (
    <Card className="p-5 md:p-6">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <p className="text-sm font-semibold">{title}</p>
      </div>
      <p className="text-xs text-slate mb-4">{description}</p>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

export function ConfiguracoesPage() {
  const { user } = useAuth();
  const { settings, upsertSetting, removeSetting } = useAdminSettings();
  const { users, createUser, updateUserRole, removeUser } = useAdminUsers();
  const [userModalOpen, setUserModalOpen] = useState(false);

  const gemini = findSetting(settings, "gemini", "api_key");
  const tursoUrl = findSetting(settings, "turso", "database_url");
  const tursoToken = findSetting(settings, "turso", "auth_token");
  const smtpUser = findSetting(settings, "smtp", "user");
  const smtpPass = findSetting(settings, "smtp", "app_password");

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-3xl mx-auto space-y-4">
      <p className="font-display font-medium text-2xl mb-2">Configurações</p>

      <SectionCard
        icon={<KeyRound size={16} className="text-slate" />}
        title="Gemini API"
        description="Chave usada pelo LifeOS Copilot (recursos de IA). Fica criptografada no banco — nunca é devolvida em texto puro."
      >
        <SecretField
          label="API Key"
          placeholder="AIza..."
          existing={gemini}
          onSave={(value) => upsertSetting({ integration: "gemini", keyName: "api_key", value })}
          onRemove={() => removeSetting({ integration: "gemini", keyName: "api_key" })}
        />
      </SectionCard>

      <SectionCard
        icon={<KeyRound size={16} className="text-slate" />}
        title="Banco de dados (Turso)"
        description="Usado apenas como referência/rotação de credenciais aqui na UI — a conexão real da API ainda é feita pelas variáveis de ambiente do servidor (.env)."
      >
        <SecretField
          label="Database URL"
          placeholder="libsql://seu-banco.turso.io"
          existing={tursoUrl}
          onSave={(value) => upsertSetting({ integration: "turso", keyName: "database_url", value })}
          onRemove={() => removeSetting({ integration: "turso", keyName: "database_url" })}
        />
        <SecretField
          label="Auth Token"
          placeholder="eyJ..."
          existing={tursoToken}
          onSave={(value) => upsertSetting({ integration: "turso", keyName: "auth_token", value })}
          onRemove={() => removeSetting({ integration: "turso", keyName: "auth_token" })}
        />
      </SectionCard>

      <SectionCard
        icon={<Mail size={16} className="text-slate" />}
        title="E-mail (Gmail) para recuperação de senha"
        description="Use um app password do Gmail (não sua senha normal): Conta Google → Segurança → Verificação em duas etapas → Senhas de app."
      >
        <SecretField
          label="E-mail do remetente"
          placeholder="seuemail@gmail.com"
          existing={smtpUser}
          onSave={(value) => upsertSetting({ integration: "smtp", keyName: "user", value })}
          onRemove={() => removeSetting({ integration: "smtp", keyName: "user" })}
        />
        <SecretField
          label="App Password"
          placeholder="xxxx xxxx xxxx xxxx"
          existing={smtpPass}
          onSave={(value) => upsertSetting({ integration: "smtp", keyName: "app_password", value })}
          onRemove={() => removeSetting({ integration: "smtp", keyName: "app_password" })}
        />
        <p className="text-[11px] text-slate">
          O envio real de e-mails ainda não está implementado (Fase 6) — por enquanto, o link de recuperação de senha
          é apenas registrado no servidor.
        </p>
      </SectionCard>

      <Card className="p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold">Usuários do LifeOS</p>
          <Button onClick={() => setUserModalOpen(true)}>
            <Plus size={14} /> Novo usuário
          </Button>
        </div>
        <div className="space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between gap-2 rounded-lg p-2.5 border border-paper-border dark:border-ink-border"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{u.name}</p>
                <p className="text-xs text-slate truncate">{u.email}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={u.role}
                  disabled={u.id === user?.id}
                  onChange={(e) => updateUserRole({ id: u.id, role: e.target.value as "user" | "admin" })}
                  className="text-xs rounded-lg px-2 py-1.5 bg-transparent border border-paper-border dark:border-ink-border disabled:opacity-50"
                >
                  <option value="user">Usuário</option>
                  <option value="admin">Administrador</option>
                </select>
                <button
                  onClick={() => removeUser(u.id)}
                  disabled={u.id === user?.id}
                  className="text-slate disabled:opacity-30"
                  title={u.id === user?.id ? "Você não pode remover sua própria conta" : "Remover usuário"}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {userModalOpen && <NovoUsuarioModal onClose={() => setUserModalOpen(false)} onCreate={createUser} />}
    </div>
  );
}

function NovoUsuarioModal({
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
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl p-5 md:p-6 bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border"
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
