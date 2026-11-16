-- ============================================================
-- 0102_loja_arcana_efeitos
-- Loja Arcana — reequilíbrio de preços (usuário relatou "muito caro") e
-- efeitos reais para itens que antes eram só placeholder ("Fase 3"):
--
-- - Boosters: reaproveitam o motor de efeitos já existente da Coleção/
--   Inventário (active_item_effects + itemEffectService) em vez de criar
--   um novo — "Multiplicador de XP 2x" grava um XP_MULTIPLIER_TASK (o
--   mesmo tipo já consumido por claimTaskBoost em gamificationService) e
--   "Bônus de Moedas" grava um COIN_MULTIPLIER_TASK (novo, paralelo ao de
--   XP, consumido do mesmo jeito na conclusão de missões).
-- - Passe de Revisão Semanal: grava um REVIEW_GRACE_WEEKLY que estende a
--   janela de elegibilidade do baú da revisão semanal.
-- - Ticket de Reset de Hábito: usa a nova tabela habit_streak_resets —
--   marca uma data a partir da qual a sequência volta a contar, sem
--   apagar check-ins (histórico, Timeline e Analytics continuam intactos).
-- - Personalização: cosméticos de verdade (aura no avatar, tema de
--   destaque, cursor, brilho no plano de fundo do Perfil, brilho ao
--   concluir missão, filtro nos ícones da barra lateral), guardados em
--   users.rpg_prefs_json (mesma coluna das preferências RPG já existentes)
--   e validados contra a posse real do item — nunca liberado de graça.
-- ============================================================

-- Preços mais acessíveis (corte médio de ~40%, histórico de pedidos já
-- confirmados preserva preço e nome congelados em shop_order_items).
UPDATE shop_products SET price = 500  WHERE key = 'pocao-foco';
UPDATE shop_products SET price = 450  WHERE key = 'elixir-clareza';
UPDATE shop_products SET price = 700  WHERE key = 'tonico-consistencia';
UPDATE shop_products SET price = 550  WHERE key = 'pocao-energia';
UPDATE shop_products SET price = 600  WHERE key = 'frasco-serenidade';
UPDATE shop_products SET price = 1400 WHERE key = 'manto-estrategista';
UPDATE shop_products SET price = 1500 WHERE key = 'capuz-arquimago';
UPDATE shop_products SET price = 1600 WHERE key = 'armadura-executor';
UPDATE shop_products SET price = 900  WHERE key = 'luvas-cronista';
UPDATE shop_products SET price = 800  WHERE key = 'broche-disciplina';
UPDATE shop_products SET price = 650  WHERE key = 'botas-explorador';
UPDATE shop_products SET price = 1800 WHERE key = 'ampulheta-foco';
UPDATE shop_products SET price = 1300 WHERE key = 'orbe-metas';
UPDATE shop_products SET price = 1200 WHERE key = 'grimorio-missoes';
UPDATE shop_products SET price = 1700 WHERE key = 'bussola-prioritario';
UPDATE shop_products SET price = 1800 WHERE key = 'cristal-planejamento';
UPDATE shop_products SET price = 1400 WHERE key = 'chave-portais';
UPDATE shop_products SET price = 700  WHERE key = 'moldura-epica-avatar';
UPDATE shop_products SET price = 400  WHERE key = 'trilhas-brilho';
UPDATE shop_products SET price = 900  WHERE key = 'tema-noite-astral';
UPDATE shop_products SET price = 900  WHERE key = 'tema-castelo-dourado';
UPDATE shop_products SET price = 500  WHERE key = 'pack-icones-misticos';
UPDATE shop_products SET price = 350  WHERE key = 'cursor-arcano';
UPDATE shop_products SET price = 800  WHERE key = 'fundo-biblioteca-arcana';
UPDATE shop_products SET price = 900  WHERE key = 'multiplicador-xp-2x';
UPDATE shop_products SET price = 700  WHERE key = 'bonus-moedas';
UPDATE shop_products SET price = 1300 WHERE key = 'passe-revisao-semanal';
UPDATE shop_products SET price = 1600 WHERE key = 'ticket-reset-habito';
UPDATE shop_products SET price = 900  WHERE key = 'estatua-disciplina';
UPDATE shop_products SET price = 700  WHERE key = 'banner-guilda';
UPDATE shop_products SET price = 600  WHERE key = 'tocha-mistica';
UPDATE shop_products SET price = 1800 WHERE key = 'moldura-conquistas-lendaria';
UPDATE shop_products SET price = 250  WHERE key = 'fragmento-cristal-arcano';
UPDATE shop_products SET price = 120  WHERE key = 'pergaminho-em-branco';
UPDATE shop_products SET price = 90   WHERE key = 'ametista-conquista';

-- Textos de efeito honestos (o item descreve o que ele realmente faz agora).
UPDATE shop_products SET effect_text = 'Aura arcana ao redor do seu retrato — aparece em Painel do Herói, Dashboard e Hoje. Ative em Inventário do Herói.' WHERE key = 'moldura-epica-avatar';
UPDATE shop_products SET effect_text = 'Pequeno brilho ao concluir uma missão. Ative em Inventário do Herói.' WHERE key = 'trilhas-brilho';
UPDATE shop_products SET effect_text = 'Recolore o destaque do cabeçalho do Perfil com tons de noite estrelada. Ative em Inventário do Herói.' WHERE key = 'tema-noite-astral';
UPDATE shop_products SET effect_text = 'Recolore o destaque do cabeçalho do Perfil com tons dourados solenes. Ative em Inventário do Herói.' WHERE key = 'tema-castelo-dourado';
UPDATE shop_products SET effect_text = 'Aplica um acabamento dourado-arcano aos ícones da barra lateral. Ative em Inventário do Herói.' WHERE key = 'pack-icones-misticos';
UPDATE shop_products SET effect_text = 'Cursor personalizado com brilho sutil em todo o LifeOS. Ative em Inventário do Herói.' WHERE key = 'cursor-arcano';
UPDATE shop_products SET effect_text = 'Brilho arcano no cabeçalho do Perfil. Ative em Inventário do Herói.' WHERE key = 'fundo-biblioteca-arcana';
UPDATE shop_products SET effect_text = 'Dobra o XP da próxima missão concluída (ou estende, se já houver um bônus ativo) — respeita o teto diário oficial de XP. Use em Inventário do Herói.' WHERE key = 'multiplicador-xp-2x';
UPDATE shop_products SET effect_text = '+50% de moedas nas próximas missões concluídas por 24h. Use em Inventário do Herói.' WHERE key = 'bonus-moedas';
UPDATE shop_products SET effect_text = 'Estende por 7 dias a janela para abrir o baú de uma revisão semanal perdida. Use em Inventário do Herói.' WHERE key = 'passe-revisao-semanal';
UPDATE shop_products SET effect_text = 'Reinicia a sequência atual de um hábito (o histórico de check-ins continua intacto). Use em Inventário do Herói e escolha o hábito.' WHERE key = 'ticket-reset-habito';

-- Reset de sequência de hábito sem apagar histórico: a partir de reset_at,
-- os check-ins anteriores deixam de contar para a sequência ATUAL (o
-- recorde e os check-ins em si continuam intactos para Analytics/Timeline).
CREATE TABLE IF NOT EXISTS habit_streak_resets (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  habit_id    TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  reset_at    TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'shop_item',
  source_id   TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source_type, source_id)
);
CREATE INDEX IF NOT EXISTS idx_habit_streak_resets_habit ON habit_streak_resets(habit_id, reset_at DESC);
