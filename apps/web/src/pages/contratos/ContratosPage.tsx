import { useCallback, useMemo, useState } from "react";
import { CheckCircle2, Coins, ListChecks, Plus, ScrollText, Search, Sparkles, Wand2 } from "lucide-react";
import { RPGButton, RPGPageHeader, RPGPanel, RPGStatCard, RPGTabs, RPGToast } from "@/components/rpg";
import { ContractCard } from "@/components/contracts/ContractCard";
import { ContractCreateModal } from "@/components/contracts/ContractCreateModal";
import { ContractDetailModal } from "@/components/contracts/ContractDetailModal";
import { rpgField } from "@/components/contracts/contractUi";
import { useContracts } from "@/hooks/useContracts";
import type { ContractStatus } from "@/services/contractsService";

/**
 * Gestão de Contratos: cada contrato é um objetivo com um conjunto de
 * tarefas reais. Cada tarefa paga XP/moedas pela dificuldade; o contrato
 * paga um bônus único quando todas são concluídas. Criação manual ou com
 * o Gemini (sempre com revisão e confirmação do usuário).
 */
export function ContratosPage() {
  const { contracts, isLoading, isError, refetch } = useContracts();
  const [tab, setTab] = useState<ContractStatus>("ativo");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState<"manual" | "ai" | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);
  const showToast = useCallback((msg: string, tone: "success" | "error" = "success") => setToast({ msg, tone }), []);

  const counts = useMemo(() => {
    const by = { ativo: 0, concluido: 0, arquivado: 0 } as Record<ContractStatus, number>;
    for (const c of contracts) by[c.status]++;
    return by;
  }, [contracts]);
  const openTasks = contracts.filter((c) => c.status === "ativo").reduce((s, c) => s + (c.totalTasks - c.doneTasks), 0);
  const earnedXp = contracts.reduce((s, c) => s + c.earned.xp, 0);
  const term = q.trim().toLowerCase();
  const list = contracts.filter((c) => c.status === tab && (!term || `${c.title} ${c.objective ?? ""}`.toLowerCase().includes(term)));

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 space-y-4">
      <RPGPageHeader
        banner="contratos"
        eyebrow="Gestão de Contratos"
        title="Contratos"
        subtitle="Firme um pacto com um objetivo. Cumpra cada tarefa e receba o bônus quando o contrato for selado."
        actions={
          <>
            <RPGButton variant="gold" onClick={() => setCreating("ai")}><Wand2 size={14} aria-hidden /> Criar com IA</RPGButton>
            <RPGButton variant="secondary" onClick={() => setCreating("manual")}><Plus size={14} aria-hidden /> Novo contrato</RPGButton>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <RPGStatCard icon={<ScrollText size={18} />} label="Contratos ativos" value={String(counts.ativo)} tone="gold" />
        <RPGStatCard icon={<CheckCircle2 size={18} />} label="Contratos cumpridos" value={String(counts.concluido)} tone="green" />
        <RPGStatCard icon={<ListChecks size={18} />} label="Tarefas em aberto" value={String(openTasks)} tone="blue" />
        <RPGStatCard icon={<Coins size={18} />} label="XP ganho em contratos" value={`${earnedXp} XP`} tone="purple" caption="tarefas + bônus" />
      </div>

      <RPGPanel>
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <RPGTabs
            label="Situação dos contratos"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "ativo", label: `Ativos (${counts.ativo})` },
              { value: "concluido", label: `Cumpridos (${counts.concluido})` },
              { value: "arquivado", label: `Arquivados (${counts.arquivado})` },
            ]}
          />
          <label className="relative md:ml-auto md:w-72">
            <span className="sr-only">Buscar contratos</span>
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-rpg-muted" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar contratos…" className={`${rpgField} pl-8`} style={{ borderRadius: 3 }} />
          </label>
        </div>
      </RPGPanel>

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy>
          {[0, 1, 2].map((i) => <div key={i} className="rpg-panel h-44 animate-pulse" />)}
        </div>
      )}
      {isError && (
        <RPGPanel variant="danger">
          <p className="text-sm text-rpg-text">Não foi possível carregar os contratos.</p>
          <RPGButton variant="secondary" className="mt-2" onClick={() => void refetch()}>Tentar de novo</RPGButton>
        </RPGPanel>
      )}
      {!isLoading && !isError && list.length === 0 && (
        <RPGPanel variant="parchment">
          <div className="text-center py-6">
            <ScrollText size={28} className="mx-auto text-rpg-ink" aria-hidden />
            <p className="mt-2 font-rpg font-bold text-rpg-ink">{tab === "ativo" ? "Nenhum contrato em andamento." : tab === "concluido" ? "Nenhum contrato cumprido ainda." : "Nenhum contrato arquivado."}</p>
            {tab === "ativo" && (
              <>
                <p className="text-sm text-rpg-ink/80">Descreva um objetivo e deixe o Copilot propor as tarefas, ou monte o contrato à mão.</p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <RPGButton variant="gold" onClick={() => setCreating("ai")}><Sparkles size={14} aria-hidden /> Criar com IA</RPGButton>
                  <RPGButton variant="secondary" onClick={() => setCreating("manual")}>Novo contrato</RPGButton>
                </div>
              </>
            )}
          </div>
        </RPGPanel>
      )}
      {list.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => <ContractCard key={c.id} contract={c} onOpen={() => setOpenId(c.id)} />)}
        </div>
      )}

      {creating && (
        <ContractCreateModal
          mode={creating}
          onClose={() => setCreating(null)}
          onCreated={(id, msg) => {
            setCreating(null);
            setTab("ativo");
            setOpenId(id);
            showToast(msg);
          }}
        />
      )}
      {openId && <ContractDetailModal id={openId} onClose={() => setOpenId(null)} onToast={showToast} />}
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}

export default ContratosPage;
