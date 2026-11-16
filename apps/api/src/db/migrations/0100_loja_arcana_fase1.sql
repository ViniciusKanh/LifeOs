-- ============================================================
-- 0100_loja_arcana_fase1
-- Loja Arcana (Fase 1 — fundação): catálogo, carrinho e pedidos de uma loja
-- virtual real, paga só com moedas/gemas já existentes (coin_ledger /
-- gem_ledger — nenhuma carteira nova). Itens comprados entram no inventário
-- existente (`user_inventory_items` / `inventory_transactions`) com a
-- chave prefixada "shop:" para não colidir com o catálogo de marcos
-- (config/items.ts) nem com Tesouro/Códex — mantém uma só tabela de pilhas
-- e um só ledger de inventário, lidos por uma visão nova (Inventário do
-- Herói) além da Coleção atual.
--
-- Fora desta fase (ver relatório): escolha de crédito do Banco no
-- checkout, Correio da Guilda (entrega com atraso real), equipar em slots,
-- loadouts, consumo de poções/efeitos funcionais, Mercador Arcano (IA),
-- notificações e cancelamento/estorno. A entrega aqui é imediata
-- (confirmado = já está no inventário) até a Fase 2 trazer o Correio.
-- ============================================================

-- Catálogo da loja. Preço só em moedas OU só em gemas (nunca os dois).
-- `active`/`stock` permitem desativar ou limitar um item sem apagar pedidos
-- antigos que o referenciam (por isso o nome/preço também ficam congelados
-- em shop_order_items no momento da compra).
CREATE TABLE IF NOT EXISTS shop_products (
  id            TEXT PRIMARY KEY,
  key           TEXT NOT NULL UNIQUE,
  category      TEXT NOT NULL CHECK (category IN ('pocoes', 'vestimentas', 'artefatos', 'personalizacao', 'boosters', 'decoracao', 'reliquias', 'materiais', 'pacotes')),
  rarity        TEXT NOT NULL CHECK (rarity IN ('comum', 'incomum', 'raro', 'epico', 'lendario', 'mitico')),
  name          TEXT NOT NULL,
  description   TEXT NOT NULL,
  currency      TEXT NOT NULL CHECK (currency IN ('coin', 'gem')),
  price         INTEGER NOT NULL CHECK (price > 0),
  art           TEXT NOT NULL DEFAULT 'box',
  effect_text   TEXT,
  duration_text TEXT,
  stackable     INTEGER NOT NULL DEFAULT 1,
  max_stack     INTEGER NOT NULL DEFAULT 99,
  featured      INTEGER NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1,
  stock         INTEGER,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_shop_products_category ON shop_products(category, active);

-- Um carrinho ativo por usuário.
CREATE TABLE IF NOT EXISTS shop_carts (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shop_cart_items (
  id          TEXT PRIMARY KEY,
  cart_id     TEXT NOT NULL REFERENCES shop_carts(id) ON DELETE CASCADE,
  product_key TEXT NOT NULL REFERENCES shop_products(key),
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  added_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (cart_id, product_key)
);
CREATE INDEX IF NOT EXISTS idx_shop_cart_items_cart ON shop_cart_items(cart_id);

-- Pedido confirmado. `request_id` torna o checkout idempotente (clique
-- duplo/refresh nunca gera dois pedidos nem dois débitos).
CREATE TABLE IF NOT EXISTS shop_orders (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id     TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'confirmado' CHECK (status IN ('confirmado', 'entregue', 'cancelado', 'estornado')),
  payment_method TEXT NOT NULL DEFAULT 'coins' CHECK (payment_method IN ('coins', 'gems')),
  total_amount   INTEGER NOT NULL CHECK (total_amount >= 0),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  delivered_at   TEXT,
  UNIQUE (owner_id, request_id)
);
CREATE INDEX IF NOT EXISTS idx_shop_orders_owner ON shop_orders(owner_id, created_at);

-- Linhas do pedido com preço e nome CONGELADOS no momento da compra — o
-- catálogo pode mudar de preço depois sem reescrever o histórico.
CREATE TABLE IF NOT EXISTS shop_order_items (
  id              TEXT PRIMARY KEY,
  order_id        TEXT NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
  product_key     TEXT NOT NULL,
  product_name    TEXT NOT NULL,
  rarity          TEXT NOT NULL,
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  unit_price      INTEGER NOT NULL CHECK (unit_price >= 0),
  line_total      INTEGER NOT NULL CHECK (line_total >= 0)
);
CREATE INDEX IF NOT EXISTS idx_shop_order_items_order ON shop_order_items(order_id);

-- Linha do tempo do pedido (histórico simples; a Fase 2 estende com os
-- status do Correio da Guilda).
CREATE TABLE IF NOT EXISTS shop_order_events (
  id         TEXT PRIMARY KEY,
  order_id   TEXT NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  message    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_shop_order_events_order ON shop_order_events(order_id, created_at);

-- Catálogo inicial (preços em moedas, exceto quando indicado). Nomes e
-- categorias seguem a referência visual aprovada pelo usuário.
INSERT OR IGNORE INTO shop_products (id, key, category, rarity, name, description, currency, price, art, effect_text, duration_text, stackable, max_stack, featured, sort_order) VALUES
('sp-001', 'pocao-foco',               'pocoes',        'incomum', 'Poção de Foco',               'Um gole antes de uma sessão longa de concentração.',            'coin', 800,  'potion',   'Visual — efeito funcional chega na Fase 3 (Mercador/Efeitos).', NULL, 1, 99, 1, 1),
('sp-002', 'elixir-clareza',           'pocoes',        'incomum', 'Elixir da Clareza',           'Clareia a mente para decisões difíceis do dia.',                 'coin', 750,  'potion',   NULL, NULL, 1, 99, 0, 2),
('sp-003', 'tonico-consistencia',      'pocoes',        'raro',    'Tônico de Consistência',      'Para quem quer manter a sequência de hábitos.',                  'coin', 1200, 'potion',   NULL, NULL, 1, 99, 0, 3),
('sp-004', 'pocao-energia',            'pocoes',        'incomum', 'Poção de Energia',            'Um empurrão extra nos dias mais cansativos.',                    'coin', 900,  'potion',   NULL, NULL, 1, 99, 0, 4),
('sp-005', 'frasco-serenidade',        'pocoes',        'raro',    'Frasco de Serenidade',        'Acalma antes de uma revisão ou decisão importante.',             'coin', 1000, 'potion',   NULL, NULL, 1, 99, 0, 5),
('sp-006', 'manto-estrategista',       'vestimentas',   'epico',   'Manto do Estrategista',       'Veste de quem planeja cada semana com cuidado.',                 'coin', 2500, 'cloak',    NULL, NULL, 0, 1, 1, 10),
('sp-007', 'capuz-arquimago',          'vestimentas',   'epico',   'Capuz do Arquimago',          'Para quem domina o próprio conhecimento.',                       'coin', 2800, 'hood',     NULL, NULL, 0, 1, 0, 11),
('sp-008', 'armadura-executor',        'vestimentas',   'epico',   'Armadura do Executor',        'Proteção de quem termina o que começa.',                         'coin', 2900, 'armor',    NULL, NULL, 0, 1, 0, 12),
('sp-009', 'luvas-cronista',           'vestimentas',   'raro',    'Luvas do Cronista',           'Para registrar a jornada todos os dias.',                        'coin', 1600, 'gloves',   NULL, NULL, 0, 1, 0, 13),
('sp-010', 'broche-disciplina',        'vestimentas',   'raro',    'Broche da Disciplina',        'Um lembrete visível da própria constância.',                     'coin', 1400, 'brooch',   NULL, NULL, 0, 1, 0, 14),
('sp-011', 'botas-explorador',         'vestimentas',   'incomum', 'Botas do Explorador',         'Para dias de muita movimentação e novos projetos.',              'coin', 1100, 'boots',    NULL, NULL, 0, 1, 0, 15),
('sp-012', 'ampulheta-foco',           'artefatos',     'lendario','Ampulheta do Foco',           'Marca o tempo das sessões mais importantes.',                    'coin', 3500, 'hourglass',NULL, NULL, 0, 1, 1, 20),
('sp-013', 'orbe-metas',               'artefatos',     'epico',   'Orbe das Metas',              'Reflete o caminho até cada objetivo.',                           'coin', 2400, 'orb',      NULL, NULL, 0, 1, 0, 21),
('sp-014', 'grimorio-missoes',         'artefatos',     'epico',   'Grimório de Missões',         'Registra as missões mais importantes da jornada.',               'coin', 2200, 'grimoire', NULL, NULL, 0, 1, 0, 22),
('sp-015', 'bussola-prioritario',      'artefatos',     'lendario','Bússola do Prioritário',      'Aponta sempre para o que importa primeiro.',                     'coin', 3200, 'compass',  NULL, NULL, 0, 1, 0, 23),
('sp-016', 'cristal-planejamento',     'artefatos',     'lendario','Cristal do Planejamento',     'Concentra a energia de planejar bem a semana.',                  'coin', 3500, 'crystal',  NULL, NULL, 0, 1, 0, 24),
('sp-017', 'chave-portais',            'artefatos',     'epico',   'Chave dos Portais',           'Abre atalhos entre áreas da jornada.',                           'coin', 2600, 'key',      NULL, NULL, 0, 1, 0, 25),
('sp-018', 'moldura-epica-avatar',     'personalizacao','epico',   'Moldura Épica de Avatar',     'Uma moldura de destaque para o retrato do personagem.',          'coin', 1500, 'frame',    'Cosmético — aplica no Perfil (Fase 3).', NULL, 0, 1, 0, 30),
('sp-019', 'trilhas-brilho',           'personalizacao','raro',    'Trilhas de Brilho',           'Um rastro sutil ao concluir uma missão.',                        'coin', 900,  'sparkle',  NULL, NULL, 0, 1, 0, 31),
('sp-020', 'tema-noite-astral',        'personalizacao','epico',   'Tema Noite Astral',           'Uma paleta escura e estrelada para o LifeOS.',                   'coin', 2200, 'theme',    NULL, NULL, 0, 1, 0, 32),
('sp-021', 'tema-castelo-dourado',     'personalizacao','epico',   'Tema Castelo Dourado',        'Uma paleta dourada e solene para o LifeOS.',                     'coin', 2200, 'theme',    NULL, NULL, 0, 1, 0, 33),
('sp-022', 'pack-icones-misticos',     'personalizacao','raro',    'Pack de Ícones Místicos',     'Um conjunto de ícones alternativos para o sistema.',             'coin', 1100, 'icon',     NULL, NULL, 0, 1, 0, 34),
('sp-023', 'cursor-arcano',            'personalizacao','incomum', 'Cursor Arcano',               'Um cursor personalizado com brilho sutil.',                      'coin', 800,  'cursor',   NULL, NULL, 0, 1, 0, 35),
('sp-024', 'fundo-biblioteca-arcana',  'personalizacao','epico',   'Plano de Fundo Biblioteca Arcana','Um cenário de fundo inspirado em bibliotecas antigas.',      'coin', 2000, 'wallpaper',NULL, NULL, 0, 1, 0, 36),
('sp-025', 'multiplicador-xp-2x',      'boosters',      'raro',    'Multiplicador de XP 2x',      'Dobra o XP ganho por um período limitado — respeita o teto oficial de XP.', 'coin', 1800, 'booster', 'Funcional — ligado ao motor de efeitos na Fase 3.', '24 h', 1, 5, 1, 40),
('sp-026', 'bonus-moedas',             'boosters',      'raro',    'Bônus de Moedas',             'Um acréscimo percentual nas moedas ganhas por um período limitado.', 'coin', 1200, 'booster', 'Funcional — ligado ao motor de efeitos na Fase 3.', '24 h', 1, 5, 0, 41),
('sp-027', 'passe-revisao-semanal',    'boosters',      'epico',   'Passe de Revisão Semanal',    'Garante o resgate da recompensa da revisão mesmo em uma semana corrida.', 'coin', 2000, 'pass', NULL, '7 dias', 1, 3, 0, 42),
('sp-028', 'ticket-reset-habito',      'boosters',      'epico',   'Ticket de Reset de Hábito',   'Reinicia a sequência de um hábito sem perder o histórico.',      'coin', 2500, 'ticket',   NULL, NULL, 1, 3, 0, 43),
('sp-029', 'estatua-disciplina',       'decoracao',     'raro',    'Estátua da Disciplina',       'Um troféu decorativo para o Perfil do Herói.',                   'coin', 1500, 'statue',   NULL, NULL, 0, 1, 0, 50),
('sp-030', 'banner-guilda',            'decoracao',     'incomum', 'Banner da Guilda',            'Um estandarte decorativo para o Perfil.',                        'coin', 1200, 'banner',   NULL, NULL, 0, 1, 0, 51),
('sp-031', 'tocha-mistica',            'decoracao',     'incomum', 'Tocha Mística',               'Um item decorativo com brilho constante.',                       'coin', 1000, 'torch',    NULL, NULL, 0, 1, 0, 52),
('sp-032', 'moldura-conquistas-lendaria', 'decoracao',  'lendario','Moldura de Conquistas Lendária', 'Uma moldura de destaque para a vitrine de conquistas.',       'coin', 3000, 'frame',    NULL, NULL, 0, 1, 0, 53),
('sp-033', 'fragmento-cristal-arcano', 'materiais',     'incomum', 'Fragmento de Cristal Arcano', 'Material usado em futuras combinações na Forja.',                'coin', 400,  'crystal',  NULL, NULL, 1, 999, 0, 60),
('sp-034', 'pergaminho-em-branco',     'materiais',     'comum',   'Pergaminho em Branco',        'Material básico para itens futuros.',                            'coin', 200,  'scroll',   NULL, NULL, 1, 999, 0, 61),
('sp-035', 'ametista-conquista',       'reliquias',     'mitico',  'Ametista da Conquista',       'Uma relíquia rara, símbolo de uma trajetória consistente.',      'gem',  120,  'gem',      NULL, NULL, 0, 1, 1, 70);
