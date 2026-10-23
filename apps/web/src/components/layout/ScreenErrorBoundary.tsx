import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Se uma tela quebra ao renderizar, mostra o aviso só naquele espaço — a
 * barra lateral e o resto do app continuam funcionando (antes, um erro de
 * uma tela deixava o app inteiro em branco). `resetKey` (a rota) limpa o
 * erro ao navegar para outra tela.
 */
export class ScreenErrorBoundary extends Component<{ resetKey: string; children: ReactNode }, { error: Error | null; key: string }> {
  state = { error: null as Error | null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(props: { resetKey: string }, state: { error: Error | null; key: string }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[tela] erro de renderização:", error.message, info.componentStack?.split("\n").slice(0, 4).join(" | "));
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="w-full px-4 md:px-8 py-10">
        <div className="mx-auto max-w-lg rounded-2xl border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised p-6 text-center rpg:rpg-panel rpg:rpg-panel-danger rpg:bg-rpg-panel" role="alert">
          <AlertTriangle className="mx-auto mb-3 text-drop rpg:text-rpg-red" size={28} aria-hidden />
          <h2 className="font-display font-semibold text-lg rpg:font-rpg rpg:text-rpg-text">Esta tela encontrou um problema</h2>
          <p className="mt-2 text-sm text-slate rpg:text-rpg-muted">Seus dados estão seguros. Tente abrir de novo; se continuar, as outras telas seguem funcionando normalmente.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-paper-border dark:border-ink-border px-4 py-2 text-sm font-semibold hover:bg-black/[0.03] dark:hover:bg-white/[0.06] rpg:rounded-[3px] rpg:border-rpg-gold/70 rpg:text-rpg-gold-light"
          >
            <RotateCcw size={14} aria-hidden /> Recarregar a tela
          </button>
        </div>
      </div>
    );
  }
}
