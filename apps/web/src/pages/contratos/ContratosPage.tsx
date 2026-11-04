import { GuildScreen } from "@/components/contracts3/GuildScreen";

/**
 * Contratos 3.0 — Guilda dos Pactos. A tela anterior (lista + modais) foi
 * substituída; os dados, rotas oficiais (/api/contracts) e o motor de XP
 * continuam os mesmos — a Guilda é uma camada derivada em /api/contract-guild.
 */
export function ContratosPage() {
  return <GuildScreen />;
}

export default ContratosPage;
