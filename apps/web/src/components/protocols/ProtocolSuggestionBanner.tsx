import { useState } from "react";
import { Link } from "react-router-dom";
import { Leaf, ScrollText, X } from "lucide-react";
import { rpgButtonClass } from "@/components/rpg";
import { useProtocolSuggestions } from "@/hooks/useProtocols";
import { protocolArtUrl } from "@/utils/protocolDisplay";

const DISMISS_KEY = "lifeos:protocols:dismissed";
const readDismissed = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
};

/**
 * Sugestão de protocolo na tela Hoje (gatilho ativo com dados reais).
 * Só sugere: "Executar" abre a prévia em /protocolos, nunca roda sozinho.
 * "Ignorar" vale para o dia, só neste navegador.
 */
export function ProtocolSuggestionBanner() {
  const { data } = useProtocolSuggestions();
  const today = new Date().toLocaleDateString("sv-SE"); // AAAA-MM-DD no fuso local
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const suggestion = data?.suggestions.find((s) => !dismissed.includes(`${today}:${s.ref}`));
  const dismiss = (ref: string) => {
    const next = [...dismissed.filter((d) => d.startsWith(today)), `${today}:${ref}`];
    setDismissed(next);
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      // Sem armazenamento: o aviso some só até recarregar.
    }
  };

  if (!suggestion && !data?.daily.recovery) return null;
  return (
    <div className="space-y-2 mb-4">
      {data?.daily.recovery && (
        <p className="rpg-panel inline-flex items-center gap-2 px-3 py-1.5 text-xs text-rpg-green" role="status">
          <Leaf size={14} aria-hidden /> Modo recuperação ativo hoje — pegue leve com a carga.
        </p>
      )}
      {suggestion && (
        <section className="rpg-panel rpg-panel-gold flex flex-col sm:flex-row sm:items-center gap-3 p-3" aria-label="Sugestão de protocolo">
          <img src={protocolArtUrl(suggestion.art)} alt="" className="pixelated hidden sm:block w-24 aspect-[16/10] object-cover border border-rpg-border" style={{ borderRadius: 3 }} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 font-pixel text-[10px] uppercase tracking-[0.14em] text-rpg-gold">
              <ScrollText size={12} aria-hidden /> Sugestão de protocolo
            </p>
            <p className="mt-1 text-sm text-rpg-text">
              O protocolo <strong>“{suggestion.name}”</strong> pode ajudar hoje.
            </p>
            {suggestion.reason && <p className="text-xs text-rpg-muted">Dado real: {suggestion.reason}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`/protocolos?executar=${encodeURIComponent(suggestion.ref)}`} className={rpgButtonClass("gold")}>
              Executar
            </Link>
            <Link to="/protocolos" className={rpgButtonClass("secondary")}>
              Ver
            </Link>
            <button type="button" className={rpgButtonClass("ghost")} onClick={() => dismiss(suggestion.ref)} aria-label={`Ignorar sugestão ${suggestion.name} hoje`}>
              <X size={14} aria-hidden /> Ignorar
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
