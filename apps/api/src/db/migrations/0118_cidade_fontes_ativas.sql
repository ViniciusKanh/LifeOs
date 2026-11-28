-- Cidade Inteligente 0.5.42: Diário Oficial, De Olho na Fila, IDHM e Censo saíram do catálogo
-- (fora do ar ou bloqueados pela Prefeitura). As conquistas passam a valer para as fontes ativas.
-- Os alertas do Diário deixam de rodar, mas as tabelas ficam (nada é apagado).

UPDATE achievements SET description = 'Leu registros oficiais da cidade (pedidos do e-SIC, contratos) em dez dias diferentes.' WHERE code = 'city_chronicler';
UPDATE achievements SET description = 'Explorou cinco territórios diferentes (subprefeituras e corredores de trânsito).' WHERE code = 'city_explorer';
UPDATE achievements SET description = 'Comparou órgãos do orçamento municipal cinco vezes.' WHERE code = 'city_indicators';
UPDATE achievements SET description = 'Guardou dez contratos públicos como referência.' WHERE code = 'city_strategist';
UPDATE achievements SET description = 'Consultou com sucesso seis fontes diferentes da Prefeitura.' WHERE code = 'city_diplomat';
UPDATE city_alerts SET active = 0 WHERE active = 1;

-- O cache guardava o envelope do CKAN (help, success, result) como se fosse um registro.
-- Cópias públicas de respostas da Prefeitura, nada pessoal: são buscadas de novo na próxima consulta.
DELETE FROM city_cache;
