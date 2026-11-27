import { useState, type ReactNode } from "react";
import { KeyRound, Trash2 } from "lucide-react";
import { RPGButton, RPGToast } from "@/components/rpg";
import { errMsg } from "@/components/adventures/AdventureKit";
import { KeyConnectForm } from "@/components/integrations/IntegrationKit";
import { usePublicKeyActions } from "@/hooks/usePublicApis";
import type { KeyStatus, PublicApiProvider } from "@/services/publicApisService";

/**
 * Peças comuns das APIs públicas (YouTube, NASA, TMDB, SPTrans): formulário de
 * chave pessoal (testada no servidor antes de salvar) e rodapé com a origem da
 * chave. A chave nunca volta para o navegador.
 */

export type Notify = (msg: string, tone?: "success" | "error") => void;

/** Toast local para painéis que vivem em páginas sem toast próprio. */
export function useLocalToast(): [Notify, ReactNode] {
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);
  const notify: Notify = (msg, tone = "success") => setToast({ msg, tone });
  return [notify, <RPGToast key="toast" message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />];
}

export function PublicKeyForm({
  provider,
  service,
  placeholder,
  steps,
  link,
  notify,
  minLength = 16,
}: {
  provider: PublicApiProvider;
  service: string;
  placeholder: string;
  steps: ReactNode[];
  link: { href: string; text: string };
  notify: Notify;
  minLength?: number;
}) {
  const a = usePublicKeyActions(provider);
  return (
    <KeyConnectForm
      service={service}
      placeholder={placeholder}
      steps={steps}
      link={link}
      minLength={minLength}
      busy={a.save.isPending}
      onSubmit={(key) =>
        a.save.mutate(key, {
          onSuccess: () => notify(`Chave do ${service} conferida e salva.`),
          onError: (e) => notify(errMsg(e, `Não foi possível salvar a chave do ${service}.`), "error"),
        })
      }
    />
  );
}

/** Rodapé discreto: de onde vem a chave e como trocar/remover a pessoal. */
export function KeySourceNote({ provider, status, service, notify, extra }: { provider: PublicApiProvider; status: KeyStatus; service: string; notify: Notify; extra?: ReactNode }) {
  const a = usePublicKeyActions(provider);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-rpg-border/50 pt-2 text-[11px] text-rpg-muted">
      <KeyRound size={12} className="text-rpg-gold" aria-hidden />
      <span>
        {status.source === "pessoal" ? `Sua chave do ${service} (${status.masked ?? "••••"})` : status.source === "servidor" ? `Chave do ${service} configurada no servidor` : `Sem chave do ${service}`}
      </span>
      {extra}
      <span className="flex-1" />
      {status.source === "pessoal" &&
        (confirm ? (
          <span className="flex items-center gap-1">
            <RPGButton variant="danger" className="px-2 py-0.5 text-[11px]" disabled={a.remove.isPending} onClick={() => a.remove.mutate(undefined, { onSuccess: () => notify(`Chave do ${service} removida.`) })}>
              Remover chave
            </RPGButton>
            <RPGButton variant="ghost" className="px-2 py-0.5 text-[11px]" onClick={() => setConfirm(false)}>
              Cancelar
            </RPGButton>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirm(true)} className="inline-flex items-center gap-1 text-rpg-muted hover:text-rpg-red" aria-label={`Remover a chave do ${service}`}>
            <Trash2 size={12} aria-hidden /> remover
          </button>
        ))}
    </div>
  );
}

/** Data "2026-11-27" → "27/11". */
export const shortDay = (d: string) => d.split("-").reverse().slice(0, 2).join("/");
/** Número pt-BR com casas fixas. */
export const fmtNum = (n: number, digits = 2) => n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
