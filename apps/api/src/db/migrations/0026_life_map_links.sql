-- ============================================================
-- 0026_life_map_links
-- Vínculos manuais do Life Map: relações entre entidades que não
-- existem hoje como chave estrangeira (ex.: hábito "Ler 20 min"
-- ligado manualmente à meta "Ler 12 livros no ano"). O Life Map já
-- deriva a maioria das conexões de relações reais do banco — esta
-- tabela cobre só o restante, que só o próprio usuário sabe dizer.
-- Nunca substitui uma relação estrutural (ex.: task.project_id):
-- essas continuam sendo alteradas na entidade de origem, não aqui.
-- ============================================================

CREATE TABLE IF NOT EXISTS life_map_links (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    relationship_type TEXT NOT NULL DEFAULT 'supports',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_life_map_links_user ON life_map_links(user_id);
CREATE INDEX IF NOT EXISTS idx_life_map_links_source ON life_map_links(user_id, source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_life_map_links_target ON life_map_links(user_id, target_type, target_id);

-- Evita duplicar o mesmo vínculo manual (mesmo par, mesma direção, mesmo tipo de relação).
CREATE UNIQUE INDEX IF NOT EXISTS idx_life_map_links_unique
    ON life_map_links(user_id, source_type, source_id, target_type, target_id, relationship_type);
