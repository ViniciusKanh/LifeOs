/**
 * Contexto do Dia — utilities determinísticas de classificação
 * meteorológica. Tudo aqui é puro/sem I/O para poder ser testado sem
 * rede e para NUNCA espalhar switch/if de weather_code pela UI (regra
 * 16 do briefing). Gemini nunca decide nada disto — é sempre código.
 */

export interface WeatherCodeInfo {
  label: string;
  icon: "sun" | "cloud-sun" | "cloud" | "cloud-rain" | "cloud-drizzle" | "cloud-lightning" | "cloud-snow" | "cloud-fog";
  severity: "clear" | "mild" | "rain" | "storm" | "snow" | "fog";
}

/** Tabela oficial WMO Weather interpretation codes (usada pelo Open-Meteo). */
const WEATHER_CODE_TABLE: Record<number, WeatherCodeInfo> = {
  0: { label: "Céu limpo", icon: "sun", severity: "clear" },
  1: { label: "Poucas nuvens", icon: "cloud-sun", severity: "clear" },
  2: { label: "Parcialmente nublado", icon: "cloud-sun", severity: "mild" },
  3: { label: "Nublado", icon: "cloud", severity: "mild" },
  45: { label: "Neblina", icon: "cloud-fog", severity: "fog" },
  48: { label: "Neblina com geada", icon: "cloud-fog", severity: "fog" },
  51: { label: "Garoa fraca", icon: "cloud-drizzle", severity: "rain" },
  53: { label: "Garoa moderada", icon: "cloud-drizzle", severity: "rain" },
  55: { label: "Garoa forte", icon: "cloud-drizzle", severity: "rain" },
  56: { label: "Garoa congelante fraca", icon: "cloud-drizzle", severity: "rain" },
  57: { label: "Garoa congelante forte", icon: "cloud-drizzle", severity: "rain" },
  61: { label: "Chuva fraca", icon: "cloud-rain", severity: "rain" },
  63: { label: "Chuva moderada", icon: "cloud-rain", severity: "rain" },
  65: { label: "Chuva forte", icon: "cloud-rain", severity: "rain" },
  66: { label: "Chuva congelante fraca", icon: "cloud-rain", severity: "rain" },
  67: { label: "Chuva congelante forte", icon: "cloud-rain", severity: "rain" },
  71: { label: "Neve fraca", icon: "cloud-snow", severity: "snow" },
  73: { label: "Neve moderada", icon: "cloud-snow", severity: "snow" },
  75: { label: "Neve forte", icon: "cloud-snow", severity: "snow" },
  77: { label: "Grãos de neve", icon: "cloud-snow", severity: "snow" },
  80: { label: "Pancadas de chuva fracas", icon: "cloud-rain", severity: "rain" },
  81: { label: "Pancadas de chuva moderadas", icon: "cloud-rain", severity: "rain" },
  82: { label: "Pancadas de chuva fortes", icon: "cloud-rain", severity: "rain" },
  85: { label: "Pancadas de neve fracas", icon: "cloud-snow", severity: "snow" },
  86: { label: "Pancadas de neve fortes", icon: "cloud-snow", severity: "snow" },
  95: { label: "Trovoada", icon: "cloud-lightning", severity: "storm" },
  96: { label: "Trovoada com granizo fraco", icon: "cloud-lightning", severity: "storm" },
  99: { label: "Trovoada com granizo forte", icon: "cloud-lightning", severity: "storm" },
};

export function mapWeatherCode(code: number | null | undefined): WeatherCodeInfo {
  if (code == null || !(code in WEATHER_CODE_TABLE)) {
    return { label: "Condição indisponível", icon: "cloud", severity: "mild" };
  }
  return WEATHER_CODE_TABLE[code];
}

export type UVLevel = "Baixo" | "Moderado" | "Alto" | "Muito alto" | "Extremo";

/** Classificação padrão da OMS/EPA do índice UV — nunca recomendação médica individual, só a faixa. */
export function classifyUV(uvIndex: number | null): { level: UVLevel; description: string } | null {
  if (uvIndex == null) return null;
  if (uvIndex <= 2) return { level: "Baixo", description: "Risco baixo de dano pela radiação solar." };
  if (uvIndex <= 5) return { level: "Moderado", description: "Risco moderado — proteção recomendada em exposição prolongada." };
  if (uvIndex <= 7) return { level: "Alto", description: "Risco alto — proteção recomendada." };
  if (uvIndex <= 10) return { level: "Muito alto", description: "Risco muito alto — evite exposição prolongada ao meio-dia." };
  return { level: "Extremo", description: "Risco extremo — evite exposição direta." };
}

export type AQILevel = "Boa" | "Moderada" | "Ruim para grupos sensíveis" | "Ruim" | "Muito ruim" | "Perigosa";

/** Classificação US AQI (0-500) — escolhida por ser a mais documentada e consistente entre localizações (regra 13). */
export function classifyAQI(usAqi: number | null): { level: AQILevel; description: string } | null {
  if (usAqi == null) return null;
  if (usAqi <= 50) return { level: "Boa", description: "Qualidade do ar satisfatória, risco mínimo." };
  if (usAqi <= 100) return { level: "Moderada", description: "Aceitável; grupos muito sensíveis podem notar efeitos leves." };
  if (usAqi <= 150) return { level: "Ruim para grupos sensíveis", description: "Grupos sensíveis podem ter efeitos à saúde." };
  if (usAqi <= 200) return { level: "Ruim", description: "Todos podem começar a notar efeitos à saúde." };
  if (usAqi <= 300) return { level: "Muito ruim", description: "Alerta de saúde — efeitos mais sérios para toda a população." };
  return { level: "Perigosa", description: "Alerta de emergência sanitária." };
}

export type ThermalComfort = "Frio" | "Ameno" | "Agradável" | "Quente" | "Muito quente";

/**
 * Conforto térmico simplificado (nunca diagnóstico médico) a partir de
 * sensação térmica e umidade. Regra documentada e determinística:
 * faixas de sensação térmica, com ajuste de +1 nível se umidade muito
 * alta (>80%) tornar o calor mais desconfortável.
 */
export function classifyThermalComfort(apparentTemp: number | null, humidityPct: number | null): ThermalComfort | null {
  if (apparentTemp == null) return null;
  const levels: ThermalComfort[] = ["Frio", "Ameno", "Agradável", "Quente", "Muito quente"];
  let idx: number;
  if (apparentTemp < 12) idx = 0;
  else if (apparentTemp < 18) idx = 1;
  else if (apparentTemp < 26) idx = 2;
  else if (apparentTemp < 32) idx = 3;
  else idx = 4;
  if (humidityPct != null && humidityPct > 80 && idx < levels.length - 1 && idx >= 2) idx += 1;
  return levels[idx];
}

/** Faixas de temperatura para correlações históricas (regra 29) — largas o bastante para não fragmentar amostras pequenas. */
export type TemperatureBand = "< 15°C" | "15–18°C" | "18–25°C" | "25–30°C" | "> 30°C";

export function temperatureBand(tempC: number): TemperatureBand {
  if (tempC < 15) return "< 15°C";
  if (tempC < 18) return "15–18°C";
  if (tempC < 25) return "18–25°C";
  if (tempC < 30) return "25–30°C";
  return "> 30°C";
}

/** Dia chuvoso: precipitação observada > 0mm no dia (regra 30 — preferir dado observado, não previsão, para histórico). */
export function isRainyDay(precipitationMm: number | null): boolean {
  return precipitationMm != null && precipitationMm > 0;
}

/** Dia ensolarado: pouca cobertura de nuvens e weather_code claro (regra 31 — não só rótulo textual). */
export function isSunnyDay(weatherCode: number | null, cloudCoverPct: number | null): boolean {
  if (weatherCode == null) return false;
  const info = mapWeatherCode(weatherCode);
  if (info.severity !== "clear") return false;
  if (cloudCoverPct != null && cloudCoverPct > 50) return false;
  return true;
}
