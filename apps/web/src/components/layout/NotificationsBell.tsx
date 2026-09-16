import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, AlertTriangle, Clock, Repeat, ClipboardList } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import type { LiveNotification } from "@/services/notificationsService";

const KIND_ICON: Record<LiveNotification["kind"], typeof Bell> = {
  task_overdue: AlertTriangle,
  task_due_today: Clock,
  habit_pending: Repeat,
  weekly_review_pending: ClipboardList,
};

const SEVERITY_DOT: Record<LiveNotification["severity"], string> = {
  alta: "bg-drop",
  media: "bg-signal",
  baixa: "bg-slate",
};

export function NotificationsBell() {
  const { notifications } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const hasHighAlert = notifications.some((n) => n.severity === "alta");

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`relative w-9 h-9 rounded-full flex items-center justify-center border transition-colors ${
          hasHighAlert
            ? "border-drop/40 bg-drop/10 text-drop shadow-[0_0_0_4px_rgba(240,68,94,.08)] animate-pulse"
            : "border-paper-border dark:border-ink-border hover:bg-black/5 dark:hover:bg-white/10"
        }`}
        title="Notificações"
      >
        <Bell size={16} />
        {notifications.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-drop text-white text-[9px] font-bold flex items-center justify-center">
            {notifications.length > 9 ? "9+" : notifications.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-2xl shadow-xl border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised overflow-hidden z-40">
          <div className="px-4 py-3 border-b border-paper-border dark:border-ink-border">
            <p className="text-sm font-semibold">Notificações</p>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-xs text-slate px-4 py-6 text-center">Tudo em dia por aqui. 🎉</p>
            ) : (
              notifications.map((n) => {
                const Icon = KIND_ICON[n.kind];
                return (
                  <button
                    key={n.id}
                    onClick={() => {
                      setOpen(false);
                      navigate(n.link);
                    }}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-black/5 dark:hover:bg-white/5 border-b border-paper-border/60 dark:border-ink-border/60 last:border-0 ${
                      n.severity === "alta" ? "bg-drop/5" : ""
                    }`}
                  >
                    <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${SEVERITY_DOT[n.severity]}`} />
                    <Icon size={15} className="text-slate shrink-0 mt-0.5" />
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold">{n.title}</span>
                      <span className="block text-xs text-slate truncate">{n.body}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
