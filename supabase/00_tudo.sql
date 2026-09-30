-- =====================================================================
-- Giro - Etapa 1: esquema base
-- Cole este arquivo inteiro no SQL Editor do Supabase e clique Run.
-- =====================================================================

create extension if not exists pgcrypto;

-- Tipo de movimento financeiro -----------------------------------------
do $$ begin
  create type public.tipo_mov as enum ('entrada', 'saida');
exception when duplicate_object then null;
end $$;


-- PERFIL ---------------------------------------------------------------
-- Espelha auth.users. Criado automaticamente pelo trigger no fim do arquivo.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null default '',
  carro      text,
  criado_em  timestamptz not null default now()
);


-- CATEGORIAS -----------------------------------------------------------
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  tipo       public.tipo_mov not null,
  nome       text not null,
  icone      text,
  criado_em  timestamptz not null default now(),
  unique (user_id, tipo, nome)
);
create index if not exists categories_user_idx on public.categories (user_id, tipo);


-- TRANSACOES (entradas e saidas, inclusive corridas) --------------------
create table if not exists public.transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  tipo          public.tipo_mov not null,
  valor         numeric(10,2) not null check (valor > 0),
  categoria_id  uuid references public.categories(id) on delete set null,
  data          date not null default current_date,
  hora          time,
  plataforma    text,
  obs           text,
  criado_em     timestamptz not null default now()
);
-- Indice casado com a consulta do dashboard: "meus registros, neste periodo".
create index if not exists transactions_user_data_idx
  on public.transactions (user_id, data desc);


-- ABASTECIMENTOS -------------------------------------------------------
create table if not exists public.fuel_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  data          date not null default current_date,
  valor         numeric(10,2) not null check (valor > 0),
  litros        numeric(8,3) check (litros > 0),
  -- Calculado pelo banco: nunca fica inconsistente com valor/litros.
  preco_litro   numeric(8,3) generated always as (
                  case when litros > 0 then round(valor / litros, 3) end
                ) stored,
  odometro      integer check (odometro >= 0),
  posto         text,
  combustivel   text,
  obs           text,
  comprovante   text,          -- caminho no Storage, nao URL
  criado_em     timestamptz not null default now()
);
create index if not exists fuel_user_data_idx on public.fuel_logs (user_id, data desc);
-- Usado para calcular km rodados entre abastecimentos.
create index if not exists fuel_user_odometro_idx
  on public.fuel_logs (user_id, odometro) where odometro is not null;


-- MANUTENCAO (historico) -----------------------------------------------
create table if not exists public.maintenance (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  tipo         text not null,
  data         date not null default current_date,
  odometro     integer check (odometro >= 0),
  valor        numeric(10,2) check (valor >= 0),
  oficina      text,
  obs          text,
  comprovante  text,
  criado_em    timestamptz not null default now()
);
create index if not exists maintenance_user_data_idx
  on public.maintenance (user_id, data desc);


-- MANUTENCAO PLANEJADA (calendario + alerta por km) ---------------------
create table if not exists public.maintenance_plan (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  titulo        text not null,
  data_alvo     date,
  km_alvo       integer check (km_alvo >= 0),
  intervalo_km  integer check (intervalo_km > 0),
  concluido     boolean not null default false,
  criado_em     timestamptz not null default now(),
  -- Um plano precisa de pelo menos um gatilho, senao nunca alerta.
  constraint plano_tem_gatilho check (data_alvo is not null or km_alvo is not null)
);
create index if not exists plan_user_pendente_idx
  on public.maintenance_plan (user_id, data_alvo) where not concluido;


-- CHECKLISTS -----------------------------------------------------------
create table if not exists public.checklists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  titulo     text not null,
  criado_em  timestamptz not null default now()
);

create table if not exists public.checklist_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  checklist_id  uuid not null references public.checklists(id) on delete cascade,
  texto         text not null,
  ordem         smallint not null default 0
);
create index if not exists checklist_items_idx
  on public.checklist_items (checklist_id, ordem);

-- Um registro por checklist/dia. Os itens marcados vao em jsonb: {"<item_id>": true}
-- Guardar assim gera ~365 linhas/ano em vez de ~2200 com uma linha por item.
create table if not exists public.checklist_runs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  checklist_id  uuid not null references public.checklists(id) on delete cascade,
  data          date not null default current_date,
  marcados      jsonb not null default '{}'::jsonb,
  criado_em     timestamptz not null default now(),
  unique (checklist_id, data)
);
create index if not exists checklist_runs_idx
  on public.checklist_runs (user_id, data desc);


-- CRIACAO AUTOMATICA DO PERFIL -----------------------------------------
-- Sem isto existiria um estado invalido: conta criada e sem perfil.
-- Ja cria as categorias padrao para o app nao abrir vazio.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), split_part(new.email, '@', 1))
  );

  insert into public.categories (user_id, tipo, nome, icone) values
    (new.id, 'entrada', 'Corrida',        'car'),
    (new.id, 'entrada', 'Gorjeta',        'coin'),
    (new.id, 'entrada', 'Outros',         'plus'),
    (new.id, 'saida',   'Combustivel',    'fuel'),
    (new.id, 'saida',   'Alimentacao',    'food'),
    (new.id, 'saida',   'Manutencao',     'wrench'),
    (new.id, 'saida',   'Lavagem',        'drop'),
    (new.id, 'saida',   'Estacionamento', 'parking'),
    (new.id, 'saida',   'Pedagio',        'road'),
    (new.id, 'saida',   'Documentacao',   'doc'),
    (new.id, 'saida',   'Seguro',         'shield'),
    (new.id, 'saida',   'Outros',         'dots');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- =====================================================================
-- Giro - Etapa 1: Row Level Security
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




-- =====================================================================
-- Giro - Etapa 1: Storage dos comprovantes (notas de abastecimento,
-- recibos de manutencao)
-- =====================================================================

-- Bucket PRIVADO. "public => false" significa que nenhuma URL direta
-- funciona: todo acesso passa por uma URL assinada e temporaria.
--
-- O limite de tamanho e a lista de tipos nao sao enfeite. Sem eles,
-- qualquer arquivo de qualquer tamanho entraria na cota do plano free.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprovantes',
  'comprovantes',
  false,
  5242880,   -- 5 MB, suficiente para foto de nota fiscal
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- Todo arquivo e gravado como:  <user_id>/<uuid>.<ext>
--
-- storage.foldername(name) quebra o caminho em pastas, e [1] pega a
-- primeira. Se ela nao for o id de quem esta logado, o Storage recusa.
-- Resultado: mesmo sabendo o caminho exato do arquivo de outra pessoa,
-- nao ha como ler nem sobrescrever.

drop policy if exists "dono le comprovante" on storage.objects;
create policy "dono le comprovante"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'comprovantes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "dono envia comprovante" on storage.objects;
create policy "dono envia comprovante"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'comprovantes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "dono substitui comprovante" on storage.objects;
create policy "dono substitui comprovante"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'comprovantes'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'comprovantes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "dono apaga comprovante" on storage.objects;
create policy "dono apaga comprovante"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'comprovantes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );



-- =====================================================================
-- CONFERENCIA FINAL
--
-- Leia a coluna "situacao". Toda linha deve dizer "ok".
-- Qualquer "FALHA" significa dado desprotegido -- nao siga em frente.
-- =====================================================================
select
  'tabela ' || c.relname as item,
  case
    when not c.relrowsecurity then 'FALHA: RLS desligado'
    when (select count(*) from pg_policies p
           where p.schemaname = 'public' and p.tablename = c.relname) = 0
      then 'FALHA: sem politica'
    else 'ok'
  end as situacao,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname)::text as politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'

union all

select
  'bucket ' || id,
  case when public then 'FALHA: bucket publico' else 'ok' end,
  (select count(*)::text from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like '%comprovante%')
from storage.buckets
where id = 'comprovantes'

order by item;
