-- Executar no SQL Editor do Supabase em bases já existentes (antes de usar o novo CSV).
-- Adiciona colunas de verificação Evolution API.

alter table public.leadrapido
  add column if not exists whatsapp_valido_evolution boolean,
  add column if not exists telefone_valido_evolution boolean;

alter table public.leadrapido_staging
  add column if not exists whatsapp_valido_evolution boolean,
  add column if not exists telefone_valido_evolution boolean;
