-- Requisito para: REFRESH MATERIALIZED VIEW CONCURRENTLY public.resumo_leads_mv;
-- O Postgres exige pelo menos um índice UNIQUE na materialized view.
-- Ajuste as colunas ao esquema real da MV antes de aplicar na VPS.

-- Exemplo (substitua colunas pela chave natural ou surrogate da sua MV):
-- CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS resumo_leads_mv_refresh_key
--   ON public.resumo_leads_mv (estado, segmento);
