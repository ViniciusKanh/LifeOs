import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { guildService, type GuildCheerKind, type GuildEntityType, type GuildInviteInput } from "@/services/guildService";

const KEY = ["guild"] as const;

/** Página da Guilda: convites, o que compartilharam comigo e o que eu compartilhei. */
export function useGuildOverview() {
  const qc = useQueryClient();
  const overview = useQuery({ queryKey: [...KEY, "overview"], queryFn: guildService.overview, staleTime: 30_000 });
  const invalidate = () => void qc.invalidateQueries({ queryKey: KEY });

  const respond = useMutation({ mutationFn: ({ id, accept }: { id: string; accept: boolean }) => guildService.respond(id, accept), onSuccess: invalidate });
  const leave = useMutation({ mutationFn: (id: string) => guildService.leave(id), onSuccess: invalidate });
  const revoke = useMutation({ mutationFn: (id: string) => guildService.revoke(id), onSuccess: invalidate });
  const cheer = useMutation({
    mutationFn: ({ id, kind, text }: { id: string; kind: GuildCheerKind; text?: string | null }) => guildService.cheer(id, kind, text),
    onSuccess: invalidate,
  });
  return { ...overview, respond, leave, revoke, cheer };
}

/** Parceiros de um contrato/meta do dono (usado nos detalhes do item). */
export function useGuildPartners(entityType: GuildEntityType, entityId: string) {
  const qc = useQueryClient();
  const shares = useQuery({
    queryKey: [...KEY, "shares", entityType, entityId],
    queryFn: () => guildService.sharesFor(entityType, entityId),
    staleTime: 30_000,
  });
  const invalidate = () => void qc.invalidateQueries({ queryKey: KEY });
  const invite = useMutation({ mutationFn: (input: GuildInviteInput) => guildService.invite(input), onSuccess: invalidate });
  const revoke = useMutation({ mutationFn: (id: string) => guildService.revoke(id), onSuccess: invalidate });
  return { ...shares, invite, revoke };
}
