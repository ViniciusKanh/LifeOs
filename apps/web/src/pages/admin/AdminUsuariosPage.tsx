import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronRight, Plus, Search, ShieldCheck, User as UserIcon, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAdminUsers } from "@/hooks/useAdmin";
import { NovoUsuarioModal } from "@/components/admin/NovoUsuarioModal";
import { UserDetailDrawer } from "@/components/admin/UserDetailDrawer";
import type { AdminUser } from "@/types";
import { Button, Card, IconBadge, PageHeader } from "@/components/ui/primitives";

function formatRelative(iso: string | null) {
  if (!iso) return "Nunca acessou";
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 5) return "Agora";
  if (diffMin < 60) return `Há ${diffMin} min`;
  const h = Math.round(diffMin / 60);
  if (h < 24) return `Há ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `Há ${d} dia${d > 1 ? "s" : ""}`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function Tag({ tone, children, title }: { tone: "green" | "purple" | "slate" | "amber"; children: React.ReactNode; title?: string }) {
  const tones = {
    green: "bg-cat-green/10 text-cat-green",
    purple: "bg-cat-purple/10 text-cat-purple",
    slate: "bg-slate/10 text-slate",
    amber: "bg-signal/15 text-signal-deep dark:text-signal",
  };
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

function SecurityBadges({ user }: { user: AdminUser }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {Number(user.mfa_enabled) === 1 ? (
        <Tag tone="purple" title="Verificação em duas etapas ativa">
          <ShieldCheck size={10} /> MFA
        </Tag>
      ) : (
        <Tag tone="slate" title="Sem verificação em duas etapas">
          Sem MFA
        </Tag>
      )}
      {Number(user.google_linked) === 1 && <Tag tone="green">Google</Tag>}
      {Number(user.email_verified) !== 1 && <Tag tone="amber">E-mail pendente</Tag>}
      {!user.terms_version && <Tag tone="amber">Termos pendentes</Tag>}
    </span>
  );
}

function UserCell({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <span className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-paper-border dark:bg-ink-border shrink-0">
        {user.avatar_url ? <img src={user.avatar_url} alt="" className="w-full h-full object-cover" /> : <UserIcon size={14} className="text-slate" />}
      </span>
      <div className="min-w-0">
        <p className="font-medium truncate">
          {user.name}
          {isSelf && <span className="text-slate font-normal"> (você)</span>}
        </p>
        <p className="text-xs text-slate truncate">{user.email}</p>
      </div>
    </div>
  );
}

function RoleSelect({
  user,
  disabled,
  onChange,
}: {
  user: AdminUser;
  disabled: boolean;
  onChange: (input: { id: string; role: "user" | "admin" }) => void;
}) {
  return (
    <select
      value={user.role}
      disabled={disabled}
      aria-label={`Perfil de acesso de ${user.name}`}
      onChange={(e) => onChange({ id: user.id, role: e.target.value as "user" | "admin" })}
      className="text-xs rounded-lg px-2 py-1.5 bg-transparent border border-paper-border dark:border-ink-border disabled:opacity-50"
    >
      <option value="user">Usuário</option>
      <option value="admin">Administrador</option>
    </select>
  );
}

export function AdminUsuariosPage() {
  const { user: currentUser } = useAuth();
  const { users, isLoading, isError, createUser, updateUserRole, removeUser, resetMfa, sendPasswordReset, tempPassword, revokeSessions } =
    useAdminUsers();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedUser = users.find((u) => u.id === selectedId) ?? null;
  const mfaCount = users.filter((u) => Number(u.mfa_enabled) === 1).length;

  const adminsCount = users.filter((u) => u.role === "admin").length;
  const thisMonthCount = useMemo(() => {
    const now = new Date();
    return users.filter((u) => {
      const d = new Date(u.created_at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
  }, [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [users, search]);

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 w-full space-y-4">
      <div>
        <Link to="/configuracoes" className="inline-flex items-center gap-1.5 text-xs text-slate hover:underline mb-1.5">
          <ArrowLeft size={13} /> Configurações
        </Link>
        <PageHeader
          icon={<Users size={20} />}
          title="Usuários"
          subtitle="Gerencie contas, segurança (MFA, senha, sessões) e veja o uso de cada pessoa no LifeOS."
          actions={
            <Button onClick={() => setModalOpen(true)}>
              <Plus size={14} /> Novo usuário
            </Button>
          }
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4 flex items-center gap-3">
          <IconBadge tone="blue" icon={<Users size={16} />} size={36} />
          <div>
            <p className="font-display font-bold text-xl leading-none">{users.length}</p>
            <p className="text-xs text-slate mt-1">Usuários no total</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <IconBadge tone="purple" icon={<ShieldCheck size={16} />} size={36} />
          <div>
            <p className="font-display font-bold text-xl leading-none">{adminsCount}</p>
            <p className="text-xs text-slate mt-1">Administradores</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <IconBadge tone="green" icon={<UserIcon size={16} />} size={36} />
          <div>
            <p className="font-display font-bold text-xl leading-none">{thisMonthCount}</p>
            <p className="text-xs text-slate mt-1">Cadastrados este mês</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <IconBadge tone="teal" icon={<ShieldCheck size={16} />} size={36} />
          <div>
            <p className="font-display font-bold text-xl leading-none">{mfaCount}</p>
            <p className="text-xs text-slate mt-1">Com MFA ativo</p>
          </div>
        </Card>
      </div>

      <Card className="p-5 md:p-6">
        <div className="relative mb-4 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou e-mail..."
            className="w-full rounded-xl pl-9 pr-3 py-2.5 text-sm bg-paper dark:bg-ink border border-paper-border dark:border-ink-border outline-none focus:border-brand-500 transition-colors"
          />
        </div>

        {isLoading ? (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-paper-border/60 dark:bg-ink-border/60 animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-sm text-drop py-8 text-center">Não foi possível carregar os usuários.</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate py-8 text-center">
            {users.length === 0 ? "Nenhum usuário cadastrado ainda." : "Nenhum usuário encontrado para essa busca."}
          </p>
        ) : (
          <>
            {/* Desktop/tablet: tabela */}
            <div className="hidden md:block overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate border-b border-paper-border dark:border-ink-border">
                    <th className="font-medium px-1 py-2">Usuário</th>
                    <th className="font-medium px-1 py-2">Perfil</th>
                    <th className="font-medium px-1 py-2">Segurança</th>
                    <th className="font-medium px-1 py-2">Última atividade</th>
                    <th className="font-medium px-1 py-2 text-right">
                      <span className="sr-only">Detalhes</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => (
                    <tr
                      key={u.id}
                      onClick={() => setSelectedId(u.id)}
                      className="border-b border-paper-border/60 dark:border-ink-border/60 last:border-0 cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
                    >
                      <td className="px-1 py-2.5">
                        <UserCell user={u} isSelf={u.id === currentUser?.id} />
                      </td>
                      <td className="px-1 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <RoleSelect user={u} disabled={u.id === currentUser?.id} onChange={updateUserRole} />
                      </td>
                      <td className="px-1 py-2.5">
                        <SecurityBadges user={u} />
                      </td>
                      <td className="px-1 py-2.5 text-xs text-slate whitespace-nowrap">{formatRelative(u.last_seen_at)}</td>
                      <td className="px-1 py-2.5 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(u.id);
                          }}
                          className="inline-flex items-center gap-1 text-xs font-medium text-brand-500 hover:underline"
                          aria-label={`Ver detalhes de ${u.name}`}
                        >
                          Gerenciar <ChevronRight size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: lista de cartões */}
            <ul className="md:hidden space-y-2">
              {filtered.map((u) => (
                <li key={u.id}>
                  <button
                    onClick={() => setSelectedId(u.id)}
                    className="w-full text-left rounded-xl border border-paper-border dark:border-ink-border p-3 active:scale-[0.99] transition-transform"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <UserCell user={u} isSelf={u.id === currentUser?.id} />
                      </div>
                      <ChevronRight size={16} className="text-slate shrink-0" />
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      {u.role === "admin" && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-cat-purple/10 text-cat-purple">Admin</span>
                      )}
                      <SecurityBadges user={u} />
                      <span className="ml-auto text-[11px] text-slate">{formatRelative(u.last_seen_at)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {modalOpen && <NovoUsuarioModal onClose={() => setModalOpen(false)} onCreate={createUser} />}
      {selectedUser && (
        <UserDetailDrawer
          user={selectedUser}
          isSelf={selectedUser.id === currentUser?.id}
          actions={{ resetMfa, sendPasswordReset, tempPassword, revokeSessions, removeUser }}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
