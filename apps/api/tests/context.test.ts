import { describe, it, expect, vi, afterEach } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";
import { mapWeatherCode, classifyUV, classifyAQI, classifyThermalComfort, isRainyDay, isSunnyDay, temperatureBand } from "../src/services/weatherCodeUtils.js";
import { OpenMeteoWeatherProvider, __clearWeatherCacheForTests } from "../src/services/openMeteoProvider.js";

describe("Contexto do Dia — utilities determinísticas (sem rede)", () => {
  it("mapWeatherCode nunca quebra para código desconhecido e classifica corretamente códigos conhecidos", () => {
    expect(mapWeatherCode(0).severity).toBe("clear");
    expect(mapWeatherCode(61).severity).toBe("rain");
    expect(mapWeatherCode(95).severity).toBe("storm");
    expect(mapWeatherCode(9999).label).toBe("Condição indisponível");
    expect(mapWeatherCode(null).label).toBe("Condição indisponível");
  });

  it("classifyUV segue as faixas documentadas e nunca recomenda algo médico", () => {
    expect(classifyUV(1)?.level).toBe("Baixo");
    expect(classifyUV(4)?.level).toBe("Moderado");
    expect(classifyUV(6.5)?.level).toBe("Alto");
    expect(classifyUV(9)?.level).toBe("Muito alto");
    expect(classifyUV(12)?.level).toBe("Extremo");
    expect(classifyUV(null)).toBeNull();
  });

  it("classifyAQI segue a escala US AQI documentada", () => {
    expect(classifyAQI(30)?.level).toBe("Boa");
    expect(classifyAQI(80)?.level).toBe("Moderada");
    expect(classifyAQI(400)?.level).toBe("Perigosa");
    expect(classifyAQI(null)).toBeNull();
  });

  it("classifyThermalComfort nunca fabrica valor sem sensação térmica", () => {
    expect(classifyThermalComfort(null, 50)).toBeNull();
    expect(classifyThermalComfort(20, 50)).toBe("Agradável");
    expect(classifyThermalComfort(34, 90)).toBe("Muito quente");
  });

  it("isRainyDay e isSunnyDay nunca decidem por só o texto", () => {
    expect(isRainyDay(0)).toBe(false);
    expect(isRainyDay(2.5)).toBe(true);
    expect(isRainyDay(null)).toBe(false);
    expect(isSunnyDay(0, 20)).toBe(true);
    expect(isSunnyDay(0, 80)).toBe(false);
    expect(isSunnyDay(61, 10)).toBe(false);
  });

  it("temperatureBand cobre as faixas documentadas sem sobreposição", () => {
    expect(temperatureBand(10)).toBe("< 15°C");
    expect(temperatureBand(16)).toBe("15–18°C");
    expect(temperatureBand(20)).toBe("18–25°C");
    expect(temperatureBand(27)).toBe("25–30°C");
    expect(temperatureBand(35)).toBe("> 30°C");
  });
});

describe("Contexto do Dia — localização e integração com Signals", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __clearWeatherCacheForTests();
  });

  it("sem localização configurada, Contexto do Dia devolve configured:false e Signals recebe not_connected (nunca clima fabricado)", async () => {
    const { agent } = await createAuthenticatedAgent();

    const contextRes = await agent.get("/api/context/today?period=today");
    expect(contextRes.status).toBe(200);
    expect(contextRes.body.configured).toBe(false);

    const signalsRes = await agent.get("/api/signals?period=7d");
    const weatherCard = signalsRes.body.signals.find((s: { key: string }) => s.key === "weather");
    expect(weatherCard.status).toBe("not_connected");
    expect(weatherCard.value).toBeNull();
  });

  it("Uso de tela (Digital Wellbeing) foi removido de Signals — nunca aparece como card", async () => {
    const { agent } = await createAuthenticatedAgent();
    const res = await agent.get("/api/signals?period=7d");
    const screenTime = res.body.signals.find((s: { key: string }) => s.key === "screen_time");
    expect(screenTime).toBeUndefined();
  });

  it("isola configuração de localização por usuário", async () => {
    const { agent: agentA } = await createAuthenticatedAgent();
    const { agent: agentB } = await createAuthenticatedAgent();

    const patch = await agentA.patch("/api/context/location").send({
      city: "São Paulo",
      region: "SP",
      country: "Brasil",
      latitude: -23.55,
      longitude: -46.63,
      timezone: "America/Sao_Paulo",
    });
    expect(patch.status).toBe(200);
    expect(patch.body.configured).toBe(true);

    const locB = await agentB.get("/api/context/location");
    expect(locB.body.configured).toBe(false);
    expect(locB.body.city).toBeNull();
  });

  it("com localização configurada, Contexto do Dia consulta o WeatherProvider e Signals recebe o clima real (mockado)", async () => {
    const { agent } = await createAuthenticatedAgent();
    await agent.patch("/api/context/location").send({
      city: "São Paulo",
      region: "SP",
      country: "Brasil",
      latitude: -23.55,
      longitude: -46.63,
      timezone: "America/Sao_Paulo",
    });

    const today = new Date().toISOString().slice(0, 10);
    const fakeForecast = {
      current: { temperature_2m: 24, apparent_temperature: 23, weather_code: 1, relative_humidity_2m: 60, wind_speed_10m: 10, time: `${today}T12:00` },
      hourly: {
        time: [`${today}T09:00`],
        temperature_2m: [22],
        apparent_temperature: [21],
        precipitation_probability: [10],
        weather_code: [1],
      },
      daily: {
        time: [today],
        weather_code: [1],
        temperature_2m_max: [26],
        temperature_2m_min: [18],
        precipitation_sum: [0],
        uv_index_max: [5],
        sunrise: [`${today}T06:18`],
        sunset: [`${today}T17:42`],
        daylight_duration: [41040],
      },
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("archive-api")) {
          return { ok: true, json: async () => ({ daily: { time: [], temperature_2m_mean: [], temperature_2m_min: [], temperature_2m_max: [], apparent_temperature_mean: [], precipitation_sum: [], weather_code: [], cloud_cover_mean: [] } }) } as unknown as Response;
        }
        if (url.includes("air-quality")) {
          return { ok: true, json: async () => ({ current: { us_aqi: 32, pm2_5: 5, pm10: 8, nitrogen_dioxide: 3, ozone: 20 } }) } as unknown as Response;
        }
        return { ok: true, json: async () => fakeForecast } as unknown as Response;
      })
    );

    const contextRes = await agent.get("/api/context/today?period=today");
    expect(contextRes.status).toBe(200);
    expect(contextRes.body.configured).toBe(true);
    expect(contextRes.body.kpis.temperature.value).toBe(24);
    expect(contextRes.body.kpis.airQuality.aqi).toBe(32);

    const signalsRes = await agent.get("/api/signals?period=7d");
    const weatherCard = signalsRes.body.signals.find((s: { key: string }) => s.key === "weather");
    expect(weatherCard.status).toBe("ok");
    expect(weatherCard.value).toBe(24);
  });
});
