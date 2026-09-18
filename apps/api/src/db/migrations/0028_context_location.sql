-- ============================================================
-- 0028_context_location
-- Configuração de localização do módulo Contexto do Dia — pertence
-- ao usuário (1:1, como o restante de user_settings), nunca vira
-- histórico de localização (só a cidade/coordenada atual escolhida).
-- Coordenadas em texto (REAL) para simplicidade; timezone é o nome
-- IANA devolvido pelo Open-Meteo Geocoding (ex.: "America/Sao_Paulo").
-- ============================================================

ALTER TABLE user_settings ADD COLUMN context_city TEXT;
ALTER TABLE user_settings ADD COLUMN context_region TEXT;
ALTER TABLE user_settings ADD COLUMN context_country TEXT;
ALTER TABLE user_settings ADD COLUMN context_latitude REAL;
ALTER TABLE user_settings ADD COLUMN context_longitude REAL;
ALTER TABLE user_settings ADD COLUMN context_timezone TEXT;
ALTER TABLE user_settings ADD COLUMN context_auto_location INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_settings ADD COLUMN context_temp_unit TEXT NOT NULL DEFAULT 'celsius' CHECK (context_temp_unit IN ('celsius', 'fahrenheit'));
ALTER TABLE user_settings ADD COLUMN context_wind_unit TEXT NOT NULL DEFAULT 'kmh' CHECK (context_wind_unit IN ('kmh', 'mph'));
ALTER TABLE user_settings ADD COLUMN context_show_air_quality INTEGER NOT NULL DEFAULT 1;
ALTER TABLE user_settings ADD COLUMN context_show_uv INTEGER NOT NULL DEFAULT 1;
ALTER TABLE user_settings ADD COLUMN context_weather_alerts INTEGER NOT NULL DEFAULT 0;
