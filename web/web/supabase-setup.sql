-- Execute no SQL Editor do Supabase.
-- MVP compartilhado para uma sessão única do grupo de vôlei.
create table if not exists public.volei_estado (
  id text primary key,
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

alter table public.volei_estado enable row level security;

-- ATENÇÃO: esta política permite leitura e alteração a qualquer pessoa que tenha a URL
-- e a chave pública do projeto. Adequada apenas para teste/grupo privado sem dados sensíveis.
-- Antes de uso público, adicione autenticação e políticas por grupo/organizador.
drop policy if exists "volei leitura compartilhada" on public.volei_estado;
create policy "volei leitura compartilhada"
  on public.volei_estado for select to anon, authenticated using (true);
drop policy if exists "volei escrita compartilhada" on public.volei_estado;
create policy "volei escrita compartilhada"
  on public.volei_estado for all to anon, authenticated using (true) with check (true);

-- Habilite Realtime para a tabela volei_estado no Dashboard do Supabase:
-- Database > Publications / Realtime > adicionar public.volei_estado à publicação supabase_realtime.
