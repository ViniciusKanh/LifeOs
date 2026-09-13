import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Search, ShieldCheck, Trash2, User as UserIcon, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAdminUsers } from "@/hooks/useAdmin";
import { NovoUsuarioModal } from "@/components/admin/NovoUsuarioModal";
import { Button, Card, IconBadge } from "@/components/ui/primitives";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export function AdminUsuariosPage() {
  const { user: currentUser } = useAuth();
  const { users, createUser, updateUserRole, removeUser } = useAdminUsers();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

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
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link to="/configuracoes" className="inline-flex items-center gap-1.5 text-xs text-slate hover:underline mb-1.5">
            <ArrowLeft size={13} /> Configurações
          </Link>
          <p className="font-display font-semibold text-2xl">Usuários</p>
          <p className="text-sm text-slate mt-1">Veja e gerencie todas as contas cadastradas no LifeOS.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus size={14} /> Novo usuário
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

        {filtered.length === 0 ? (
          <p className="text-sm text-slate py-8 text-center">
            {users.length === 0 ? "Nenhum usuário cadastrado ainda." : "Nenhum usuário encontrado para essa busca."}
          </p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-left text-xs text-slate border-b border-paper-border dark:border-ink-border">
                  <th className="font-medium px-1 py-2">Usuário</th>
                  <th className="font-medium px-1 py-2">Perfil</th>
                  <th className="font-medium px-1 py-2">Cadastrado em</th>
                  <th className="font-medium px-1 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-b border-paper-border/60 dark:border-ink-border/60 last:border-0">
                    <td className="px-1 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-paper-border dark:bg-ink-border shrink-0">
                          {u.avatar_url ? (
                            <img src={u.avatar_url} alt={u.name} className="w-full h-full object-cover" />
                          ) : (
                            <UserIcon size={14} className="text-slate" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium truncate">
                            {u.name}
                            {u.id === currentUser?.id && <span className="text-slate font-normal"> (você)</span>}
                          </p>
                          <p className="text-xs text-slate truncate">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-1 py-2.5">
                      <select
                        value={u.role}
                        disabled={u.id === currentUser?.id}
                        onChange={(e) => updateUserRole({ id: u.id, role: e.target.value as "user" | "admin" })}
                        className="text-xs rounded-lg px-2 py-1.5 bg-transparent border border-paper-border dark:border-ink-border disabled:opacity-50"
                      >
                        <option value="user">Usuário</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </td>
                    <td className="px-1 py-2.5 text-xs text-slate whitespace-nowrap">{formatDate(u.created_at)}</td>
                    <td className="px-1 py-2.5 text-right">
                      <button
                        onClick={() => removeUser(u.id)}
                        disabled={u.id === currentUser?.id}
                        className="text-slate disabled:opacity-30 hover:text-drop transition-colors"
                        title={u.id === currentUser?.id ? "Você não pode remover sua própria conta" : "Remover usuário"}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modalOpen && <NovoUsuarioModal onClose={() => setModalOpen(false)} onCreate={createUser} />}
    </div>
  );
}
