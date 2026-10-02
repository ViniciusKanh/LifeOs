import { createContext, useContext, type RefObject } from "react";

/**
 * O LifeOS se comporta como app (desktop/mobile): a janela não rola — só a
 * área de conteúdo dentro do AppShell. Quem precisar da posição de rolagem
 * (barra de progresso, voltar ao topo) usa este ref em vez de `window`.
 */
export const AppScrollContext = createContext<RefObject<HTMLDivElement> | null>(null);

export function useAppScrollRef(): RefObject<HTMLDivElement> | null {
  return useContext(AppScrollContext);
}
