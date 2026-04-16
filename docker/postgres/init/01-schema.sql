-- Schema Lead Rapido para Postgres local (Docker).
-- Equivale a sql/supabase_schema_leadrapido.sql, com grants para uso sem role service_role do Supabase.

CREATE TABLE IF NOT EXISTS public.leadrapido (
  id bigserial PRIMARY KEY,
  place_id text NOT NULL UNIQUE,
  estado text NOT NULL,
  segmento text NOT NULL,
  nome text,
  whatsapp text,
  telefone text,
  email text,
  site text,
  endereco text,
  cidade text,
  uf text,
  whatsapp_valido_evolution boolean,
  telefone_valido_evolution boolean,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leadrapido_estado ON public.leadrapido (estado);
CREATE INDEX IF NOT EXISTS idx_leadrapido_segmento ON public.leadrapido (segmento);
CREATE INDEX IF NOT EXISTS idx_leadrapido_estado_segmento ON public.leadrapido (estado, segmento);

CREATE TABLE IF NOT EXISTS public.leadrapido_staging (
  id bigserial PRIMARY KEY,
  place_id text,
  estado text,
  segmento text,
  nome text,
  whatsapp text,
  telefone text,
  email text,
  site text,
  endereco text,
  cidade text,
  uf text,
  whatsapp_valido_evolution boolean,
  telefone_valido_evolution boolean,
  payload jsonb,
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leadrapido_staging_estado ON public.leadrapido_staging (estado);
CREATE INDEX IF NOT EXISTS idx_leadrapido_staging_segmento ON public.leadrapido_staging (segmento);
CREATE INDEX IF NOT EXISTS idx_leadrapido_staging_estado_segmento ON public.leadrapido_staging (estado, segmento);

CREATE OR REPLACE FUNCTION public.truncate_leadrapido_staging()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  TRUNCATE TABLE public.leadrapido_staging;
END;
$$;

CREATE OR REPLACE FUNCTION public.leadrapido_catalog_summary()
RETURNS TABLE (
  estado text,
  segmento text,
  available bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    upper(trim(l.estado))::text AS estado,
    trim(l.segmento)::text AS segmento,
    count(*)::bigint AS available
  FROM public.leadrapido l
  WHERE upper(trim(l.estado)) IN (
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
    'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
  )
  AND trim(l.segmento) <> ''
  GROUP BY upper(trim(l.estado)), trim(l.segmento)
  ORDER BY upper(trim(l.estado)), trim(l.segmento);
$$;

GRANT EXECUTE ON FUNCTION public.leadrapido_catalog_summary() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.truncate_leadrapido_staging() TO PUBLIC;
