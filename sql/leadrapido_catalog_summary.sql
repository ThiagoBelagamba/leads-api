-- Catálogo agregado para GET /catalog (executar no SQL Editor do Supabase em bases existentes).
-- Retorna estado (UF), segmento e quantidade de leads por par.
-- Ignora linhas cujo "estado" não é uma UF brasileira (evita cidades, CEP, códigos numéricos no filtro Estados).

create or replace function public.leadrapido_catalog_summary()
returns table (
  estado text,
  segmento text,
  available bigint
)
language sql
stable
as $$
  select
    upper(trim(l.estado))::text as estado,
    trim(l.segmento)::text as segmento,
    count(*)::bigint as available
  from public.leadrapido l
  where upper(trim(l.estado)) in (
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
    'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
  )
  and trim(l.segmento) <> ''
  group by upper(trim(l.estado)), trim(l.segmento)
  order by upper(trim(l.estado)), trim(l.segmento);
$$;

grant execute on function public.leadrapido_catalog_summary() to service_role;
