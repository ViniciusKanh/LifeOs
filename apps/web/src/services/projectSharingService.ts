import { api } from "./api";

/**
 * Compartilhamento de projetos ("Colaboração total"): convite por
 * e-mail, aceitar/recusar, listar membros, remover e sair. Ver
 * projectSharingService.ts no backend para as regras de negócio.
 */

export interface ProjectMember {
  userId: string;
  name: string;
  email: string;
  role: string;
  addedAt: string;
}

export interface ProjectPendingInvite {
  id: string;
  email: string;
  message: string | null;
  status: "pending";
  createdAt: string;
}

export interface MyProjectInvite {
  id: string;
  projectId: string;
  projectName: string;
  ownerName: string;
  message: string | null;
  createdAt: string;
}

export const projectSharingService = {
  listMembers: (projectId: string) =>
    api.get<{ members: ProjectMember[]; pendingInvites: ProjectPendingInvite[] }>(`/projects/${projectId}/members`),
  invite: (projectId: string, input: { email: string; message?: string | null }) =>
    api.post<{ invite: ProjectPendingInvite; emailSent: boolean }>(`/projects/${projectId}/invites`, input),
  revokeInvite: (projectId: string, inviteId: string) => api.delete<void>(`/projects/${projectId}/invites/${inviteId}`),
  removeMember: (projectId: string, userId: string) => api.delete<void>(`/projects/${projectId}/members/${userId}`),
  leave: (projectId: string) => api.post<void>(`/projects/${projectId}/leave`),
};

/** Perspectiva do convidado, independente de qual projeto (convites de qualquer dono). */
export const myProjectInvitesService = {
  list: () => api.get<{ emailVerified: boolean; invites: MyProjectInvite[] }>("/project-invites/mine"),
  respond: (inviteId: string, accept: boolean) => api.post<{ ok: boolean }>(`/project-invites/${inviteId}/respond`, { accept }),
};
