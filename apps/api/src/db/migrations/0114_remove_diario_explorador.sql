-- 0114_remove_diario_explorador
-- Continuação da remoção do Diário (0111): o "Diário do Explorador" do Atlas
-- (anotações e fotos por lugar) também sai do app, a pedido do usuário, com os
-- dados apagados direto (mesma escolha feita para o Diário principal).
-- Lugares, check-ins, rotas, névoa do mapa e o XP ganho continuam intactos.
DROP INDEX IF EXISTS idx_atlas_journal_owner;
DROP TABLE IF EXISTS atlas_journal;
