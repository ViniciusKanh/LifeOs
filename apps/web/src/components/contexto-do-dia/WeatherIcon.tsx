import { Sun, CloudSun, Cloud, CloudRain, CloudDrizzle, CloudLightning, CloudSnow, CloudFog, type LucideIcon } from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  sun: Sun,
  "cloud-sun": CloudSun,
  cloud: Cloud,
  "cloud-rain": CloudRain,
  "cloud-drizzle": CloudDrizzle,
  "cloud-lightning": CloudLightning,
  "cloud-snow": CloudSnow,
  "cloud-fog": CloudFog,
};

export function WeatherIcon({ icon, size = 20, className }: { icon: string; size?: number; className?: string }) {
  const Icon = ICON_MAP[icon] ?? Cloud;
  return <Icon size={size} className={className} aria-hidden="true" />;
}
