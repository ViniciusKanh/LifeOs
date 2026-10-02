-- ============================================================
-- 0050_journal_free_text
-- Diário vira "diário de verdade": um texto corrido "Como foi meu dia"
-- (coluna thoughts, que já é o texto principal lido por busca, IA,
-- PDF, insights e embeddings) + "O que levo para amanhã" (night_takeaway).
--
-- As perguntas guiadas que saíram da tela (intenção, desafios, dia mais
-- leve, o que me fez bem, o que ajudou hoje) têm o conteúdo já escrito
-- MOVIDO para dentro do texto do dia, com um subtítulo em negrito — nada
-- é perdido. Antes disso, uma cópia fiel vai para uma tabela de backup
-- (nenhuma coluna é removida; a migration só zera os campos já copiados).
-- O humor da noite (night_mood) não é tocado: não dá pra migrar pra
-- mood_entries sem inventar a energia, então fica como registro antigo.
-- Atenção: o runner divide por ponto e vírgula — não usar esse caractere em strings.
-- ============================================================

CREATE TABLE IF NOT EXISTS journal_entries_guided_backup (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL,
  entry_date    TEXT NOT NULL,
  intention     TEXT,
  thoughts      TEXT,
  challenges    TEXT,
  lighter_plan  TEXT,
  feel_good     TEXT,
  night_helped  TEXT,
  backed_up_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO journal_entries_guided_backup (id, owner_id, entry_date, intention, thoughts, challenges, lighter_plan, feel_good, night_helped)
SELECT id, owner_id, entry_date, intention, thoughts, challenges, lighter_plan, feel_good, night_helped
FROM journal_entries
WHERE COALESCE(TRIM(intention), '') != '' OR COALESCE(TRIM(challenges), '') != '' OR COALESCE(TRIM(lighter_plan), '') != ''
   OR COALESCE(TRIM(feel_good), '') != '' OR COALESCE(TRIM(night_helped), '') != '';

-- Texto antigo em texto puro (antes do editor rico) ganha um <p> para virar parágrafo.
UPDATE journal_entries SET
  thoughts =
    COALESCE(thoughts, '')
    || CASE WHEN COALESCE(TRIM(intention), '') = '' THEN '' ELSE '<p><strong>Intenção do dia</strong></p>' || CASE WHEN SUBSTR(TRIM(intention), 1, 1) = '<' THEN intention ELSE '<p>' || intention || '</p>' END END
    || CASE WHEN COALESCE(TRIM(feel_good), '') = '' THEN '' ELSE '<p><strong>O que me fez bem</strong></p>' || CASE WHEN SUBSTR(TRIM(feel_good), 1, 1) = '<' THEN feel_good ELSE '<p>' || feel_good || '</p>' END END
    || CASE WHEN COALESCE(TRIM(challenges), '') = '' THEN '' ELSE '<p><strong>Desafios</strong></p>' || CASE WHEN SUBSTR(TRIM(challenges), 1, 1) = '<' THEN challenges ELSE '<p>' || challenges || '</p>' END END
    || CASE WHEN COALESCE(TRIM(lighter_plan), '') = '' THEN '' ELSE '<p><strong>Para um dia mais leve</strong></p>' || CASE WHEN SUBSTR(TRIM(lighter_plan), 1, 1) = '<' THEN lighter_plan ELSE '<p>' || lighter_plan || '</p>' END END
    || CASE WHEN COALESCE(TRIM(night_helped), '') = '' THEN '' ELSE '<p><strong>O que me ajudou</strong></p>' || CASE WHEN SUBSTR(TRIM(night_helped), 1, 1) = '<' THEN night_helped ELSE '<p>' || night_helped || '</p>' END END,
  intention = NULL,
  challenges = NULL,
  lighter_plan = NULL,
  feel_good = NULL,
  night_helped = NULL,
  updated_at = datetime('now')
WHERE id IN (SELECT id FROM journal_entries_guided_backup);
