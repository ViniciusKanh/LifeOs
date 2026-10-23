import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { IS_DESKTOP } from "@/platform";
import { notify, onDesktopEvent } from "@/platform/desktopBridge";
import { deadlineRadarService } from "@/services/deadlineRadarService";
import { tavernService } from "@/services/tavernService";
import { todayKey } from "@/utils/localDate";

/**
 * Lembretes nativos do LifeOS Desktop (só roda dentro do app Tauri):
 * - a partir das 9h: missões que vencem hoje ou estão atrasadas;
 * - a partir das 21h: ritual da Taverna, se a missão de amanhã ainda não foi fixada.
 * Cada aviso sai no máximo uma vez por dia; o último dia avisado fica no
 * localStorage (só conveniência — nada sensível). Também trata as ações do
 * menu da bandeja (Taverna, Verificar atualizações).
 */

const DEADLINES_HOUR = 9;
const TAVERN_HOUR = 21;
const CHECK_EVERY_MS = 60_000;
const KEY_DEADLINES = "lifeos:desktop-notified:deadlines";
const KEY_TAVERN = "lifeos:desktop-notified:tavern";

function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Armazenamento bloqueado: no pior caso o aviso pode se repetir.
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Monta o texto do aviso de prazos com números reais do Radar de Prazos (null se não há o que avisar). */
async function deadlinesMessage(): Promise<string | null> {
  const radar = await deadlineRadarService.dashboard("today");
  const { overdue, dueToday } = radar.summary;
  if (overdue === 0 && dueToday === 0) return null;
  const parts: string[] = [];
  if (dueToday > 0) parts.push(`${plural(dueToday, "missão vence", "missões vencem")} hoje`);
  if (overdue > 0) parts.push(`${plural(overdue, "está atrasada", "estão atrasadas")}`);
  const first = radar.items.find((i) => !i.done && i.daysRemaining <= 0);
  return `${parts.join(" e ")}.${first ? ` Comece por: ${first.title}` : ""}`;
}

/** Ritual feito = já existe missão fixada para amanhã pela Taverna. */
async function tavernPending(): Promise<boolean> {
  const summary = await tavernService.summary();
  return summary.mission.pinned.length === 0;
}

async function runChecks(running: { current: boolean }): Promise<void> {
  if (running.current) return;
  running.current = true;
  try {
    const now = new Date();
    const today = todayKey(now);
    const hour = now.getHours();

    if (hour >= DEADLINES_HOUR && readKey(KEY_DEADLINES) !== today) {
      const message = await deadlinesMessage();
      // Marca o dia mesmo sem prazos: não consulta de novo a cada minuto.
      if (!message || (await notify("Prazos de hoje", message))) writeKey(KEY_DEADLINES, today);
    }

    if (hour >= TAVERN_HOUR && readKey(KEY_TAVERN) !== today) {
      const pending = await tavernPending();
      if (!pending || (await notify("Hora da Taverna", "Feche o dia: veja o balanço e escolha a missão de amanhã."))) {
        writeKey(KEY_TAVERN, today);
      }
    }
  } catch {
    // Sem rede/sessão: tenta de novo no próximo ciclo.
  } finally {
    running.current = false;
  }
}

export function useDesktopNotifications(): void {
  const navigate = useNavigate();

  useEffect(() => {
    if (!IS_DESKTOP) return;
    const running = { current: false };
    void runChecks(running);
    const timer = window.setInterval(() => void runChecks(running), CHECK_EVERY_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(
    () =>
      onDesktopEvent((action) => {
        if (action === "tavern") {
          navigate("/taverna");
          return;
        }
        // O cartão do app no Perfil mostra o resultado e o botão de instalar.
        navigate("/perfil");
        void import("@/platform/desktopUpdater").then((m) => m.checkForUpdate());
      }),
    [navigate],
  );
}
