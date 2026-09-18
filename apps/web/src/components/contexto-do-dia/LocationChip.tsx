import { useState } from "react";
import { MapPin } from "lucide-react";
import { LocationModal } from "./LocationModal";

export function LocationChip({ city, region }: { city: string | null; region: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border border-paper-border dark:border-ink-border hover:bg-paper dark:hover:bg-ink transition-colors"
      >
        <MapPin size={13} />
        {city ? `${city}${region ? `, ${region}` : ""}` : "Configurar localização"}
      </button>
      {open && <LocationModal onClose={() => setOpen(false)} />}
    </>
  );
}
