import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "motion/react";
import { KeyRound, Lock, ShieldCheck } from "lucide-react";

/**
 * Entrada do código de 6 dígitos do app autenticador, com a sequência
 * animada do modelo "Secure Vault": ao completar, os dígitos orbitam e
 * somem, um anel gira enquanto a API confere, e o sucesso explode em
 * confete com o selo "Verificado"; no erro o cartão treme e os campos
 * ficam vermelhos. Cores do logo do LifeOS (ciano → azul → violeta).
 * Serve para o login e para ativar/desativar o MFA no Perfil.
 */

type Phase = "idle" | "orbit" | "loading" | "success" | "error";
const DIGITS = 6;
const CONFETTI_COLORS = ["#19d3e0", "#1e88ff", "#8b5cf6", "#12b76a", "#34d399", "#ff7a45", "#ff3d93", "#fbbf24"];

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
}

export function MfaCodeVerifier({
  onVerify,
  onSuccess,
  allowRecovery = true,
  successLabel = "Verificado",
  autoFocus = true,
}: {
  /** Deve lançar erro (com message) quando o código não for aceito. */
  onVerify: (code: string) => Promise<void>;
  onSuccess?: () => void;
  allowRecovery?: boolean;
  successLabel?: string;
  autoFocus?: boolean;
}) {
  const reduce = useReducedMotion();
  const [digits, setDigits] = useState<string[]>(Array(DIGITS).fill(""));
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recovery, setRecovery] = useState("");
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const shake = useAnimationControls();

  useEffect(() => {
    if (autoFocus && !recoveryMode) setTimeout(() => inputs.current[0]?.focus(), 250);
  }, [autoFocus, recoveryMode]);

  const reset = (focus = true) => {
    setDigits(Array(DIGITS).fill(""));
    setPhase("idle");
    if (focus) setTimeout(() => inputs.current[0]?.focus(), 50);
  };

  const submit = async (code: string) => {
    setError(null);
    setPhase(reduce ? "loading" : "orbit");
    const minAnimation = new Promise((r) => setTimeout(r, reduce ? 0 : 1100));
    if (!reduce) setTimeout(() => setPhase((p) => (p === "orbit" ? "loading" : p)), 900);
    try {
      await Promise.all([onVerify(code), minAnimation]);
      setPhase("success");
      vibrate([30, 40, 60]);
      setTimeout(() => onSuccess?.(), reduce ? 300 : 1400);
    } catch (err) {
      await minAnimation;
      setPhase("error");
      setError(err instanceof Error ? err.message : "Código inválido.");
      vibrate([20, 60, 20]);
      shake.start({ x: [0, -6, 6, -6, 6, -3, 3, 0], transition: { duration: 0.5 } });
      setTimeout(() => (recoveryMode ? setPhase("idle") : reset()), 1600);
    }
  };

  const setDigit = (i: number, raw: string) => {
    if (phase === "loading" || phase === "orbit" || phase === "success") return;
    if (phase === "error") setPhase("idle");
    const only = raw.replace(/\D/g, "");
    // Colar o código inteiro num campo preenche todos.
    if (only.length > 1) {
      const next = only.slice(0, DIGITS).split("");
      const filled = [...next, ...Array(DIGITS - next.length).fill("")];
      setDigits(filled);
      if (next.length === DIGITS) void submit(next.join(""));
      else inputs.current[next.length]?.focus();
      return;
    }
    const next = [...digits];
    next[i] = only;
    setDigits(next);
    if (only) {
      vibrate(12);
      if (i < DIGITS - 1) inputs.current[i + 1]?.focus();
      else if (next.every(Boolean)) void submit(next.join(""));
    }
  };

  const busy = phase === "orbit" || phase === "loading" || phase === "success";

  return (
    <motion.div animate={shake} className="relative flex flex-col items-center text-center">
      <div className="relative w-full h-[150px] flex items-center justify-center">
        {/* Campos */}
        {!recoveryMode && (
          <motion.div
            className="flex gap-2 sm:gap-2.5"
            animate={{ opacity: phase === "idle" || phase === "error" ? 1 : 0, scale: phase === "idle" || phase === "error" ? 1 : 0.9 }}
            transition={{ duration: 0.25 }}
          >
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => (inputs.current[i] = el)}
                value={d}
                inputMode="numeric"
                autoComplete={i === 0 ? "one-time-code" : "off"}
                maxLength={DIGITS}
                aria-label={`Dígito ${i + 1} de ${DIGITS}`}
                disabled={busy}
                onChange={(e) => setDigit(i, e.target.value)}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
                  if (e.key === "ArrowLeft" && i > 0) inputs.current[i - 1]?.focus();
                  if (e.key === "ArrowRight" && i < DIGITS - 1) inputs.current[i + 1]?.focus();
                }}
                className={`w-11 h-14 sm:w-12 sm:h-[60px] rounded-2xl text-center text-2xl font-semibold outline-none transition-all bg-white dark:bg-[#0f1629] border-[1.5px] focus:shadow-[0_0_0_4px_rgba(30,136,255,0.15)] ${
                  phase === "error"
                    ? "border-drop shadow-[0_0_0_4px_rgba(255,71,87,0.15)]"
                    : d
                      ? "border-[#1e88ff]"
                      : "border-[#e2e8f2] dark:border-[#24304a] focus:border-[#1e88ff]"
                }`}
              />
            ))}
          </motion.div>
        )}

        {recoveryMode && (phase === "idle" || phase === "error") && (
          <form
            className="w-full max-w-[280px]"
            onSubmit={(e) => {
              e.preventDefault();
              if (recovery.trim().length >= 8) void submit(recovery.trim());
            }}
          >
            <label className="text-xs text-slate" htmlFor="recovery-code">
              Código de recuperação
            </label>
            <input
              id="recovery-code"
              value={recovery}
              onChange={(e) => setRecovery(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX"
              autoFocus
              className={`mt-1.5 w-full h-14 rounded-2xl text-center text-xl font-semibold tracking-[0.2em] outline-none bg-white dark:bg-[#0f1629] border-[1.5px] ${
                phase === "error" ? "border-drop" : "border-[#e2e8f2] dark:border-[#24304a] focus:border-[#1e88ff]"
              }`}
            />
            <button type="submit" className="mt-3 w-full rounded-xl py-2.5 text-sm font-semibold text-white bg-[linear-gradient(120deg,#19d3e0,#1e88ff,#8b5cf6)]">
              Verificar código
            </button>
          </form>
        )}

        {/* Órbita: os dígitos saem para um anel, giram e somem no centro */}
        <AnimatePresence>
          {phase === "orbit" && (
            <motion.div className="absolute inset-0 flex items-center justify-center pointer-events-none" initial={{ rotate: 0 }} animate={{ rotate: 360 }} exit={{ opacity: 0 }} transition={{ duration: 1, ease: [0.6, 0, 0.4, 1] }}>
              {digits.map((d, i) => {
                const angle = (i / DIGITS) * Math.PI * 2 - Math.PI / 2;
                return (
                  <motion.span
                    key={i}
                    className="absolute w-10 h-12 rounded-xl border-[1.5px] border-[#1e88ff] bg-white dark:bg-[#0f1629] shadow-[0_0_14px_rgba(30,136,255,0.35)] flex items-center justify-center text-lg font-semibold"
                    initial={{ x: (i - (DIGITS - 1) / 2) * 52, y: 0, scale: 1, opacity: 1 }}
                    animate={{ x: [null, Math.cos(angle) * 58, 0], y: [null, Math.sin(angle) * 58, 0], scale: [1, 1, 0.3], opacity: [1, 1, 0] }}
                    transition={{ duration: 1, times: [0, 0.45, 1], delay: i * 0.04 }}
                  >
                    {recoveryMode ? "•" : d}
                  </motion.span>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Conferindo */}
        <AnimatePresence>
          {phase === "loading" && (
            <motion.div className="absolute inset-0 flex items-center justify-center" initial={{ opacity: 0, scale: 0.4, rotate: -45 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: 0.6 }} transition={{ type: "spring", stiffness: 260, damping: 18 }}>
              <span className="absolute w-[96px] h-[96px] rounded-full border border-[#1e88ff] animate-ping opacity-30" />
              <span
                className="absolute w-[76px] h-[76px] rounded-full animate-spin [animation-duration:1.1s] bg-[conic-gradient(from_0deg,transparent_0%,#19d3e0_40%,#1e88ff_70%,#8b5cf6_85%,transparent_100%)] [mask:radial-gradient(circle,transparent_60%,#000_62%)] [-webkit-mask:radial-gradient(circle,transparent_60%,#000_62%)]"
              />
              <span className="w-12 h-12 rounded-full bg-white dark:bg-[#0f1629] border border-[#1e88ff]/30 flex items-center justify-center text-[#1e88ff]">
                <Lock size={18} />
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sucesso */}
        <AnimatePresence>
          {phase === "success" && (
            <motion.div className="absolute inset-0 flex items-center justify-center pointer-events-none" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.span className="absolute w-56 h-56 rounded-full bg-[radial-gradient(circle,rgba(18,183,106,0.5)_0%,rgba(18,183,106,0.12)_40%,transparent_70%)]" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: [0.4, 1, 1.4], opacity: [0, 1, 0] }} transition={{ duration: 0.9 }} />
              {[0, 1, 2].map((b) => (
                <motion.span key={b} className="absolute w-16 h-16 rounded-full border-2 border-growth" initial={{ scale: 0.2, opacity: 1 }} animate={{ scale: 3.4, opacity: 0 }} transition={{ duration: 1.3, delay: b * 0.12, ease: [0.16, 1, 0.3, 1] }} />
              ))}
              {!reduce &&
                Array.from({ length: 24 }, (_, i) => {
                  const angle = (i / 24) * Math.PI * 2;
                  const dist = 80 + ((i * 37) % 60);
                  const size = 6 + ((i * 13) % 9);
                  return (
                    <motion.span
                      key={i}
                      className="absolute"
                      style={{
                        width: size,
                        height: size,
                        background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                        borderRadius: i % 4 === 0 ? 2 : i % 4 === 1 ? "50% 0 50% 0" : "50%",
                        boxShadow: `0 0 10px ${CONFETTI_COLORS[i % CONFETTI_COLORS.length]}`,
                      }}
                      initial={{ x: 0, y: 0, opacity: 1, scale: 0.4 }}
                      animate={{ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, opacity: [1, 1, 0], scale: [0.4, 1.2, 0.6] }}
                      transition={{ duration: 1.3, delay: 0.1 + (i % 5) * 0.03, ease: [0.16, 1, 0.3, 1] }}
                    />
                  );
                })}
              <motion.span
                className="relative w-[68px] h-[68px] rounded-full flex items-center justify-center bg-[linear-gradient(135deg,#34d399,#12b76a_55%,#059669)] shadow-[0_0_0_8px_rgba(18,183,106,0.18),0_0_50px_rgba(18,183,106,0.35)]"
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: [0, 1.25, 0.95, 1], rotate: [-180, 12, -4, 0] }}
                transition={{ duration: 0.7 }}
              >
                <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
                  <motion.polyline points="20 6 9 17 4 12" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.3, duration: 0.5 }} />
                </svg>
              </motion.span>
              <motion.span
                className="absolute top-[calc(50%+50px)] rounded-full bg-growth px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white shadow-lg"
                initial={{ opacity: 0, y: 12, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.6, type: "spring", stiffness: 300, damping: 16 }}
              >
                {successLabel}
              </motion.span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {error && phase === "error" && (
          <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-xs font-medium text-drop mb-2" role="alert">
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {allowRecovery && phase !== "success" && (
        <button
          type="button"
          onClick={() => {
            setRecoveryMode((v) => !v);
            setRecovery("");
            reset(false);
          }}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-slate hover:text-[#1e88ff] hover:bg-[#1e88ff]/5 transition-colors"
        >
          {recoveryMode ? <ShieldCheck size={13} /> : <KeyRound size={13} />}
          {recoveryMode ? "Usar o código do app autenticador" : "Perdeu o celular? Usar código de recuperação"}
        </button>
      )}
    </motion.div>
  );
}
