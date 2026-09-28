-- ============================================================
-- 0042_journal_location_tags_links
-- Evolução do Diário rumo ao protótipo aprovado (feed estilo Apple
-- Journal): localização e etiquetas por entrada, e uma forma leve de
-- vincular o dia a um projeto/meta real do LifeOS. Tudo aditivo —
-- nenhuma coluna ou tabela existente é alterada ou removida.
-- ============================================================

-- Localização real do dia (texto livre + coordenadas opcionais, vindas
-- da busca em /api/context/geocode — nunca inventadas). Tags: JSON
-- string[] livre, digitadas pelo usuário no editor.
ALTER TABLE journal_entries ADD COLUMN location_label TEXT;
ALTER TABLE journal_entries ADD COLUMN location_lat REAL;
ALTER TABLE journal_entries ADD COLUMN location_lng REAL;
ALTER TABLE journal_entries ADD COLUMN tags TEXT;

CREATE INDEX IF NOT EXISTS idx_journal_entries_location ON journal_entries(owner_id, location_label);

-- Vínculo manual "entrada do diário → projeto/meta" (menu "Mover para
-- diário" já cobre coleções; isto é sobre PROJETOS e METAS reais do
-- usuário). Mesmo padrão de journal_entry_journals: tabela de ligação
-- simples, sem duplicar a entidade de origem. Não usa life_map_links
-- de propósito — aquele serviço tem seu próprio grafo/validação por
-- tipo e não deve ser alterado só por causa do Diário.
CREATE TABLE IF NOT EXISTS journal_entry_links (
  id          TEXT PRIMARY KEY,
  entry_id    TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('project', 'goal')),
  target_id   TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (entry_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_journal_entry_links_entry ON journal_entry_links(entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_links_owner ON journal_entry_links(owner_id, target_type, target_id);
