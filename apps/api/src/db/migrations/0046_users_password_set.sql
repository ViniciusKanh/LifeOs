-- ============================================================
-- 0046_users_password_set
-- Distingue quem tem uma senha de verdade de quem só entra com o
-- Google (contas criadas pelo Google recebem uma senha aleatória que
-- ninguém conhece). Necessário para permitir desvincular o Google
-- apenas quando o usuário ainda terá como entrar (senha cadastrada).
--
-- Contas que já estão vinculadas ao Google ficam com password_set = 0
-- por precaução: não dá para saber se foram criadas pelo Google ou só
-- vinculadas depois. Elas só precisam definir/confirmar uma senha no
-- Perfil antes de desvincular — o login por senha antigo continua
-- funcionando normalmente.
-- ============================================================

ALTER TABLE users ADD COLUMN password_set INTEGER NOT NULL DEFAULT 1;
UPDATE users SET password_set = 0 WHERE google_id IS NOT NULL;
