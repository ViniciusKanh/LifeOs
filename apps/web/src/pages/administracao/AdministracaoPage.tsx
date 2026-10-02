import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { AlertTriangle, Archive, CalendarClock, CheckCircle2, FileText, FolderLock, Plus, Search, X } from "lucide-react";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { useLifeAdmin } from "@/hooks/useLifeOs";
import { LifeAdminCard } from "@/components/lifeAdmin/LifeAdminCard";
import { LifeAdminForm, LIFE_ADMIN_TEMPLATES } from "@/components/lifeAdmin/LifeAdminForm";
import { LifeAdminDetailModal } from "@/components/lifeAdmin/LifeAdminDetailModal";
import { LIFE_ADMIN_CATEGORY, LIFE_ADMIN_KIND } from "@/utils/lifeOsLabels";
import type { LifeAdminCategory, LifeAdminDetail, LifeAdminItem, LifeAdminKind } from "@/types";

type KindFilter = LifeAdminKind | "todos";

const GROUPS: Array<{ key: string; label: string; test: (i: LifeAdminItem) => boolean }> = [
  { key: "attention", label: "Pedem atenção", test: (i) => i.urgency === "overdue" || i.urgency === "today" || i.urgency === "soon" },
  { key: "next90", label: "Próximos 3 meses", test: (i) => i.urgency === "ok" && (i.daysLeft ?? 999) <= 90 },
  { key: "later", label: "Mais adiante", test: (i) => i.urgency === "ok" && (i.daysLeft ?? 0) > 90 },
  { key: "nodate", label: "Sem data (documentos guardados)", test: (i) => i.urgency === "no_date" },
];

/**
 * Administração da vida — o "cofre" de longo prazo: vencimentos,
 * manutenções, documentos e contas, com lembrete antes, no dia e no atraso.
 */
export function AdministracaoPage() {
  const [showArchived, setShowArchived] = useState(false);
  const { items, isLoading, isError, create, update, remove, markDone, removeHistory } = useLifeAdmin(showArchived);
  const [searchParams, setSearchParams] = useSearchParams();
  const [kind, setKind] = useState<KindFilter>("todos");
  const [category, setCategory] = useState<LifeAdminCategory | null>(null);
  const [q, setQ] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LifeAdminDetail | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [preset, setPreset] = useState<(typeof LIFE_ADMIN_TEMPLATES)[number] | null>(null);

  // Deep link ?item=<id> (busca global, sino de notificações, Hoje).
  useEffect(() => {
    const id = searchParams.get("item");
    if (!id) return;
    setDetailId(id);
    setSearchParams((p) => {
      const n = new URLSearchParams(p);
      n.delete("item");
      return n;
    }, { replace: true });
  }, [searchParams, setSearchParams]);

  // ?novo=1 (paleta Ctrl K) abre o formulário de cadastro.
  useEffect(() => {
    if (!searchParams.get("novo")) return;
    setEditing(null);
    setPreset(null);
    setFormOpen(true);
    setSearchParams((p) => {
      const n = new URLSearchParams(p);
      n.delete("novo");
      return n;
    }, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const active = items.filter((i) => i.status === "active");
  const counts = {
    overdue: active.filter((i) => i.urgency === "overdue").length,
    soon: active.filter((i) => i.urgency === "today" || i.urgency === "soon").length,
    ok: active.filter((i) => i.urgency === "ok").length,
    files: items.filter((i) => i.hasFile).length,
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter(
      (i) =>
        (showArchived ? i.status === "archived" : i.status === "active") &&
        (kind === "todos" || i.kind === kind) &&
        (!category || i.category === category) &&
        (!term || `${i.title} ${i.reference ?? ""} ${i.notes ?? ""} ${i.location ?? ""}`.toLowerCase().includes(term))
    );
  }, [items, kind, category, q, showArchived]);

  const usedCategories = useMemo(() => [...new Set(items.map((i) => i.category))], [items]);

  const quickDone = async (item: LifeAdminItem) => {
    try {
      const res = await markDone({ id: item.id });
      setToast(res.status === "archived" ? `"${item.title}" registrado e arquivado.` : `"${item.title}" registrado. Próximo: ${res.dueDate ? new Date(`${res.dueDate}T00:00:00`).toLocaleDateString("pt-BR") : "—"}.`);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Não foi possível registrar.");
    }
  };

  return (
    <div className="w-full px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        icon={<FolderLock size={20} />}
        title="Administração da vida"
        subtitle="Vencimentos, manutenções, documentos e contas — lembrados antes de virarem problema."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setPreset(null);
              setFormOpen(true);
            }}
          >
            <Plus size={15} /> Novo item
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          { label: "Atrasados", value: counts.overdue, icon: <AlertTriangle size={16} />, tone: "text-drop bg-drop/10" },
          { label: "Vencem em breve", value: counts.soon, icon: <CalendarClock size={16} />, tone: "text-cat-purple bg-cat-purple/10" },
          { label: "Em dia", value: counts.ok, icon: <CheckCircle2 size={16} />, tone: "text-growth bg-growth/10" },
          { label: "Com arquivo guardado", value: counts.files, icon: <FileText size={16} />, tone: "text-cat-blue bg-cat-blue/10" },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="p-3.5 flex items-center gap-3">
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${s.tone}`}>{s.icon}</span>
              <div>
                <p className="text-xl font-bold leading-none tabular-nums">{s.value}</p>
                <p className="text-[11px] text-slate mt-1">{s.label}</p>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="sticky top-0 z-20 -mx-4 md:mx-0 px-4 md:px-0 py-2 mb-3 bg-paper/85 dark:bg-ink/85 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised p-2 shadow-card">
          <div role="tablist" aria-label="Tipo" className="flex gap-1 overflow-x-auto max-w-full">
            {(["todos", ...Object.keys(LIFE_ADMIN_KIND)] as KindFilter[]).map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={kind === k}
                onClick={() => setKind(k)}
                className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                  kind === k ? "bg-brand-500 text-white" : "text-slate hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                }`}
              >
                {k === "todos" ? "Todos" : `${LIFE_ADMIN_KIND[k].emoji} ${LIFE_ADMIN_KIND[k].label}`}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[160px] sm:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome, referência, local…"
              aria-label="Buscar"
              className="w-full rounded-xl pl-8 pr-3 py-2 text-xs bg-paper dark:bg-ink border border-paper-border dark:border-ink-border outline-none focus:border-brand-500"
            />
          </div>
          <button
            onClick={() => setShowArchived((v) => !v)}
            aria-pressed={showArchived}
            className={`ml-auto flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold border ${
              showArchived ? "border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-100" : "border-paper-border dark:border-ink-border text-slate"
            }`}
          >
            <Archive size={13} /> Arquivados
          </button>
        </div>
        {usedCategories.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto mt-2 pb-0.5">
            {usedCategories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(category === c ? null : c)}
                aria-pressed={category === c}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium border ${
                  category === c ? "border-brand-500 bg-brand-500/10" : "border-paper-border dark:border-ink-border text-slate"
                }`}
              >
                {LIFE_ADMIN_CATEGORY[c].emoji} {LIFE_ADMIN_CATEGORY[c].label}
              </button>
            ))}
            {category && (
              <button onClick={() => setCategory(null)} className="shrink-0 inline-flex items-center gap-1 text-[11px] text-brand-600 px-1">
                <X size={11} /> limpar
              </button>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-black/[0.04] dark:bg-white/[0.05] animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <Card className="p-5 text-sm text-drop">Não foi possível carregar seus itens agora.</Card>
      ) : items.length === 0 && !showArchived ? (
        <div className="space-y-4">
          <EmptyState
            title="Nada cadastrado ainda"
            description="Comece pelos vencimentos que mais dão dor de cabeça quando passam: CNH, IPVA, seguro, revisão do carro."
            ctaLabel="Cadastrar o primeiro"
            onCta={() => setFormOpen(true)}
          />
          <div className="flex flex-wrap justify-center gap-1.5">
            {LIFE_ADMIN_TEMPLATES.slice(0, 8).map((t) => (
              <button
                key={t.title}
                onClick={() => {
                  setEditing(null);
                  setPreset(t);
                  setFormOpen(true);
                }}
                className="rounded-full border border-paper-border dark:border-ink-border px-3 py-1.5 text-xs hover:border-brand-500 hover:text-brand-600"
              >
                {LIFE_ADMIN_CATEGORY[t.category].emoji} {t.title}
              </button>
            ))}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate text-center py-10">Nenhum item com esses filtros.</p>
      ) : showArchived ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {filtered.map((i) => (
            <LifeAdminCard key={i.id} item={i} onOpen={() => setDetailId(i.id)} onQuickDone={() => quickDone(i)} />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {GROUPS.map((g) => {
            const list = filtered.filter(g.test);
            if (list.length === 0) return null;
            return (
              <section key={g.key}>
                <h2 className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wide mb-2 ${g.key === "attention" ? "text-drop" : "text-slate"}`}>
                  {g.label}
                  <span className="rounded-full px-1.5 py-0.5 text-[10px] bg-black/[0.05] dark:bg-white/[0.08]">{list.length}</span>
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-2">
                  {list.map((i) => (
                    <LifeAdminCard key={i.id} item={i} onOpen={() => setDetailId(i.id)} onQuickDone={() => quickDone(i)} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <LifeAdminForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setPreset(null);
        }}
        initial={editing}
        preset={preset}
        onSubmit={async (input) => {
          if (editing) await update({ id: editing.id, patch: input });
          else await create(input);
          setToast("Salvo.");
        }}
      />

      <LifeAdminDetailModal
        id={detailId}
        onClose={() => setDetailId(null)}
        onEdit={(item) => {
          setEditing(item);
          setDetailId(null);
          setFormOpen(true);
        }}
        onMarkDone={async (input) => {
          await markDone(input);
          setToast("Registrado no histórico.");
        }}
        onArchive={async (item) => {
          await update({ id: item.id, patch: { status: item.status === "archived" ? "active" : "archived" } });
          setDetailId(null);
        }}
        onDelete={async (item) => {
          if (!confirm(`Excluir "${item.title}" e todo o histórico? Isso não pode ser desfeito.`)) return;
          await remove(item.id);
          setDetailId(null);
          setToast("Item excluído.");
        }}
        onRemoveHistory={removeHistory}
      />

      {toast && (
        <div role="status" className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-[#1E2537] text-white text-xs px-4 py-2.5 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
