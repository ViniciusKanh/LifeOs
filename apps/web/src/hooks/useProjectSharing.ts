import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { myProjectInvitesService, projectSharingService } from "@/services/projectSharingService";

/** Membros + convites pendentes de UM projeto (dono ou membro podem ver). */
export function useProjectMembers(projectId: string | undefined) {
  const queryClient = useQueryClient();
  const key = ["projects", "members", projectId];
  const query = useQuery({ queryKey: key, queryFn: () => projectSharingService.listMembers(projectId as string), enabled: !!projectId });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: key });
    // A listagem de projetos mostra quem é membro (role/isOwner).
    queryClient.invalidateQueries({ queryKey: ["projects"] });
  };

  const invite = useMutation({
    mutationFn: (input: { email: string; message?: string | null }) => projectSharingService.invite(projectId as string, input),
    onSuccess: invalidate,
  });
  const revokeInvite = useMutation({
    mutationFn: (inviteId: string) => projectSharingService.revokeInvite(projectId as string, inviteId),
    onSuccess: invalidate,
  });
  const removeMember = useMutation({
    mutationFn: (userId: string) => projectSharingService.removeMember(projectId as string, userId),
    onSuccess: invalidate,
  });
  const leave = useMutation({
    mutationFn: () => projectSharingService.leave(projectId as string),
    onSuccess: invalidate,
  });

  return {
    members: query.data?.members ?? [],
    pendingInvites: query.data?.pendingInvites ?? [],
    isLoading: query.isLoading,
    invite: invite.mutateAsync,
    isInviting: invite.isPending,
    inviteError: invite.error as Error | null,
    revokeInvite: revokeInvite.mutateAsync,
    removeMember: removeMember.mutateAsync,
    leave: leave.mutateAsync,
  };
}

/** Convites de projeto pendentes pra mim, de qualquer dono — usado no sino/lista de Projetos. */
export function useMyProjectInvites() {
  const queryClient = useQueryClient();
  const key = ["project-invites", "mine"];
  const query = useQuery({ queryKey: key, queryFn: () => myProjectInvitesService.list() });

  const respond = useMutation({
    mutationFn: ({ inviteId, accept }: { inviteId: string; accept: boolean }) => myProjectInvitesService.respond(inviteId, accept),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  return {
    invites: query.data?.invites ?? [],
    emailVerified: query.data?.emailVerified ?? true,
    isLoading: query.isLoading,
    respond: respond.mutateAsync,
    isResponding: respond.isPending,
  };
}
