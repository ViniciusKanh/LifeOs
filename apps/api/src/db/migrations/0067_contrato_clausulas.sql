-- Contrato como documento de verdade: vigência (início), dedicação semanal,
-- motivação ("considerando que…"), recompensa pessoal e consequência
-- combinada. Tudo opcional e aditivo — contratos antigos seguem válidos.
ALTER TABLE contracts ADD COLUMN start_date TEXT;
ALTER TABLE contracts ADD COLUMN weekly_hours INTEGER;
ALTER TABLE contracts ADD COLUMN why TEXT;
ALTER TABLE contracts ADD COLUMN reward_text TEXT;
ALTER TABLE contracts ADD COLUMN stakes TEXT;
