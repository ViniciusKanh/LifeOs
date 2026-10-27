import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check } from "lucide-react";
import { useNotificationFeed } from "@/hooks/useNotifications";
import type { InAppNotificationItem } from "@/types";

/** "agora", "5 min atrás", "2h atrás", "3 dias atrás" — granularidade fina para o sino (eventos recentes). */
function formatNotificationTime(iso: string): string {
  const t = Date.parse(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  const minutes = Math.floor((Date.now() - t) / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d atrás`;
  return `${Math.floor(days / 7)} sem atrás`;
}

/**
 * Sino de notificações — histórico real do que já foi disparado (gatilhos de
 * tarefa, Banco, diário etc. com canal "No app" ativo). Não recomputa
 * condições atuais: isso já existe no cartão "Precisa da sua atenção" do
 * Dashboard. Modelado sobre o mesmo padrão do AchievementHeaderPulse.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { items, unreadCount, isLoading, markRead, markAllRead } = useNotificationFeed();

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  function handleItemClick(item: InAppNotificationItem) {
    setOpen(false);
    if (!item.read) void markRead(item.id);
    if (item.url) navigate(item.url);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={unreadCount > 0 ? `Notificações (${unreadCount} não lidas)` : "Notificações"}
        title="Notificações"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-paper-border text-slate transition-colors hover:border-brand-500/50 hover:text-brand-600 dark:border-ink-border rpg:rounded-[4px] rpg:border-2 rpg:border-rpg-border rpg:bg-rpg-panel rpg:text-rpg-text rpg:[&>svg]:text-rpg-gold-light"
      >
        <Bell size={15} />
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-growth px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 max-w-[90vw] overflow-hidden rounded-lg border border-paper-border bg-paper-raised shadow-xl dark:border-ink-border dark:bg-ink-raised">
          <div className="flex items-center justify-between border-b border-paper-border px-4 py-3 dark:border-ink-border">
            <p className="text-sm font-semibold">Notificações</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:underline"
              >
                <Check size={12} /> Marcar tudo como lido
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <p className="px-4 py-6 text-center text-xs text-slate">Carregando...</p>
            ) : items.length ? (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleItemClick(item)}
                  className={`flex w-full items-start gap-2 border-b border-paper-border/60 px-4 py-3 text-left text-xs transition-colors last:border-0 hover:bg-paper-sunken dark:border-ink-border/60 dark:hover:bg-ink-sunken ${item.read ? "opacity-70" : ""}`}
                >
                  {!item.read && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />}
                  <div className={`min-w-0 flex-1 ${item.read ? "pl-3.5" : ""}`}>
                    <p className="truncate font-semibold">{item.title}</p>
                    {item.body && <p className="mt-0.5 line-clamp-2 text-slate">{item.body}</p>}
                    <p className="mt-1 text-[10px] text-slate">{formatNotificationTime(item.createdAt)}</p>
                  </div>
                </button>
              ))
            ) : (
              <p className="px-4 py-6 text-center text-xs text-slate">Nenhuma notificação ainda.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
