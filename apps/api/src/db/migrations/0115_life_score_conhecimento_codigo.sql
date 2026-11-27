-- Life Score com 6 dimensões (0.5.38): Produtividade (missões da semana),
-- Saúde, Hábitos, Educação, Conhecimento e Código.
-- Metas, Leitura e Profissional saem do cálculo. As colunas antigas ficam
-- só como histórico (não são apagadas) e deixam de ser gravadas.
ALTER TABLE life_scores ADD COLUMN knowledge INTEGER;
ALTER TABLE life_scores ADD COLUMN code INTEGER;
