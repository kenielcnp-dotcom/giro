-- =====================================================================
-- Giro - Etapa 1: Row Level Security
-- Rode DEPOIS do 01_schema.sql.
--
-- Regra unica em todo o projeto: voce so enxerga e so grava linhas suas.
--
--   using      -> filtra o que pode ser LIDO / alterado / apagado
--   with check -> valida o que pode ser GRAVADO
--
-- Os dois precisam existir. So com "using", a leitura fica protegida
-- mas a escrita passa: daria para gravar uma linha com o user_id de
-- outra pessoa. E o erro classico de RLS.
--
-- "to authenticated" garante que o papel anonimo (visitante sem login)
-- nunca satisfaz a politica, mesmo que a chave publica vaze.
-- =====================================================================

alter table public.profiles          enable row level security;
alter table public.categories        enable row level security;
alter table public.transactions      enable row level security;
alter table public.fuel_logs         enable row level security;
alter table public.maintenance       enable row level security;
alter table public.maintenance_plan  enable row level security;
alter table public.checklists        enable row level security;
alter table public.checklist_items   enable row level security;
alter table public.checklist_runs    enable row level security;


-- PROFILES -------------------------------------------------------------
-- Aqui a chave do dono e a propria PK (id = auth.users.id).
drop policy if exists "dono le o proprio perfil" on public.profiles;
create policy "dono le o proprio perfil"
  on public.profiles for select to authenticated
  using (auth.uid() = id);

drop policy if exists "dono edita o proprio perfil" on public.profiles;
create policy "dono edita o proprio perfil"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Sem INSERT e sem DELETE de proposito: quem cria o perfil e o trigger
-- handle_new_user, e apagar a conta cascateia a partir de auth.users.


-- DEMAIS TABELAS -------------------------------------------------------
drop policy if exists "dono acessa" on public.categories;
create policy "dono acessa" on public.categories for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "dono acessa" on public.transactions;
create policy "dono acessa" on public.transactions for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "dono acessa" on public.fuel_logs;
create policy "dono acessa" on public.fuel_logs for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "dono acessa" on public.maintenance;
create policy "dono acessa" on public.maintenance for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "dono acessa" on public.maintenance_plan;
create policy "dono acessa" on public.maintenance_plan for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "dono acessa" on public.checklists;
create policy "dono acessa" on public.checklists for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "dono acessa" on public.checklist_items;
create policy "dono acessa" on public.checklist_items for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "dono acessa" on public.checklist_runs;
create policy "dono acessa" on public.checklist_runs for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- CONFERENCIA ----------------------------------------------------------
-- Deve listar as 9 tabelas com rls_ativo = true e nenhuma com 0 politicas.
select
  c.relname                                as tabela,
  c.relrowsecurity                         as rls_ativo,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname) as politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;
