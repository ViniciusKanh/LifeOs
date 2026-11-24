-- 0108_steam_conquistas_status
-- Situação da leitura de conquistas por jogo (para a tela mostrar o motivo real
-- quando um jogo não traz conquistas: sem conquistas, estatísticas privadas ou erro).
ALTER TABLE steam_games ADD COLUMN ach_status TEXT;
ALTER TABLE steam_games ADD COLUMN ach_error TEXT;
