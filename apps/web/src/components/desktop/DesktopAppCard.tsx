import { useEffect, useState } from "react";
import { Monitor } from "lucide-react";
import { RPGPanel } from "@/components/rpg";
import { Card } from "@/components/ui/primitives";
import { IS_DESKTOP, desktopVersion } from "@/platform";

/**
 * "Desktop / Integração Windows": só aparece dentro do app nativo.
 * A versão vem do próprio executável (permissão core:app:allow-version,
 * concedida apenas ao domínio publicado do LifeOS).
 */
export function DesktopAppCard({ rpg = false }: { rpg?: boolean }) {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    if (IS_DESKTOP) void desktopVersion().then(setVersion);
  }, []);
  if (!IS_DESKTOP) return null;

  const body = (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
      <dt className="opacity-70">Versão instalada</dt>
      <dd className="font-semibold">{version ?? "—"}</dd>
      <dt className="opacity-70">Interface</dt>
      <dd>atualizada automaticamente a cada publicação do LifeOS</dd>
      <dt className="opacity-70">App nativo</dt>
      <dd>atualizado pelo instalador quando houver nova versão</dd>
    </dl>
  );
  if (rpg) {
    return (
      <RPGPanel title="LifeOS Desktop" icon={<Monitor size={16} />}>
        <div className="text-rpg-text">{body}</div>
      </RPGPanel>
    );
  }
  return (
    <Card className="p-5">
      <p className="flex items-center gap-2 font-semibold mb-3">
        <Monitor size={17} className="text-brand-600" /> LifeOS Desktop
      </p>
      {body}
    </Card>
  );
}
