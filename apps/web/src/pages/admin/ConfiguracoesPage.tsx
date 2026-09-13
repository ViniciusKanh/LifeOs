import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, KeyRound, Mail, Plus, Trash2, Users, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAdminSettings, useAdminUsers } from "@/hooks/useAdmin";
import { adminService } from "@/services/adminService";
import { NovoUsuarioModal } from "@/components/admin/NovoUsuarioModal";
import { Button, Card } from "@/components/ui/primitives";
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

/** Botão "Testar conexão" — hoje só implementado de verdade para SMTP (conecta no servidor com as credenciais salvas). */
function TestConnectionButton({ integration }: { integration: AdminIntegration }) {
  const [state, setState] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    setState(null);
    try {
      const result = await adminService.testConnection(integration);
      setState({ ok: true, message: (result as unknown as { message?: string }).message ?? "Conexão verificada com sucesso." });
    } catch (err) {
      setState({ ok: false, message: err instanceof Error ? err.message : "Falha ao testar a conexão." });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <Button variant="secondary" onClick={handleTest} disabled={testing}>
        {testing ? "Testando..." : "Testar conexão"}
      </Button>
      {state && (
        <p className={`flex items-center gap-1.5 text-xs mt-2 ${state.ok ? "text-growth" : "text-drop"}`}>
          {state.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
          {state.message}
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
  const { settings, upsertSetting, removeSetting } = useAdminSettings();
  const { users, createUser } = useAdminUsers();
  const [userModalOpen, setUserModalOpen] = useState(false);

  const gemini = findSetting(settings, "gemini", "api_key");
  const tursoUrl = findSetting(settings, "turso", "database_url");
  const tursoToken = findSetting(settings, "turso", "auth_token");
  const smtpHost = findSetting(settings, "smtp", "host");
  const smtpPort = findSetting(settings, "smtp", "port");
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
        title="E-mail (Gmail) para cadastro, validação e recuperação de senha"
        description="Use um app password do Gmail (não sua senha normal): Conta Google → Segurança → Verificação em duas etapas → Senhas de app. Este e-mail envia a mensagem de boas-vindas no cadastro, o link de redefinição de senha e o aviso de troca de senha."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SecretField
            label="Servidor SMTP"
            placeholder="smtp.gmail.com"
            existing={smtpHost}
            onSave={(value) => upsertSetting({ integration: "smtp", keyName: "host", value })}
            onRemove={() => removeSetting({ integration: "smtp", keyName: "host" })}
          />
          <SecretField
            label="Porta"
            placeholder="587"
            existing={smtpPort}
            onSave={(value) => upsertSetting({ integration: "smtp", keyName: "port", value })}
            onRemove={() => removeSetting({ integration: "smtp", keyName: "port" })}
          />
        </div>
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
        <TestConnectionButton integration="smtp" />
        <p className="text-[11px] text-slate">
          Sem servidor, porta, e-mail e senha de app configurados, o link de redefinição de senha continua sendo
          apenas registrado no servidor (modo de desenvolvimento) em vez de enviado por e-mail.
        </p>
      </SectionCard>

      <Card className="p-5 md:p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <Users size={16} className="text-slate" />
            <div>
              <p className="text-sm font-semibold">Usuários do LifeOS</p>
              <p className="text-xs text-slate mt-0.5">{users.length} conta(s) cadastrada(s).</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/admin/usuarios">
              <Button variant="secondary">
                <Users size={14} /> Ver painel de usuários
              </Button>
            </Link>
            <Button onClick={() => setUserModalOpen(true)}>
              <Plus size={14} /> Novo usuário
            </Button>
          </div>
        </div>
      </Card>

      {userModalOpen && <NovoUsuarioModal onClose={() => setUserModalOpen(false)} onCreate={createUser} />}
    </div>
  );
}
