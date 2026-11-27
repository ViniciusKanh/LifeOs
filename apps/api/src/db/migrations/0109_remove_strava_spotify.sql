-- 0109_remove_strava_spotify
-- Strava e Trilha Sonora (Spotify) saíram do LifeOS: as duas APIs passaram a
-- exigir assinatura paga. As tabelas ficam (nada de DROP: histórico preservado),
-- mas credenciais e tokens guardados são apagados por higiene de segurança, e
-- as conquistas que ninguém desbloqueou deixam de aparecer no catálogo.
DELETE FROM admin_settings WHERE integration IN ('strava', 'spotify');
DELETE FROM strava_connections;
DELETE FROM spotify_connections;
DELETE FROM achievements WHERE code IN ('strava_first', 'strava_50', 'music_first')
  AND id NOT IN (SELECT achievement_id FROM user_achievements);
