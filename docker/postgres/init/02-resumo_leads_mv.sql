-- MV usada pelo CacheRefreshService (REFRESH MATERIALIZED VIEW CONCURRENTLY).
-- Índice UNIQUE obrigatório para CONCURRENTLY.

DROP MATERIALIZED VIEW IF EXISTS public.resumo_leads_mv;

CREATE MATERIALIZED VIEW public.resumo_leads_mv AS
SELECT
  upper(trim(estado))::text AS estado,
  trim(segmento)::text AS segmento,
  count(*)::bigint AS available
FROM public.leadrapido
WHERE upper(trim(estado)) IN (
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
)
AND trim(segmento) <> ''
GROUP BY upper(trim(estado)), trim(segmento);

CREATE UNIQUE INDEX resumo_leads_mv_estado_segmento_uidx
  ON public.resumo_leads_mv (estado, segmento);
