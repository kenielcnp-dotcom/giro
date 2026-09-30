-- =====================================================================
-- Giro - Etapa 1: esquema base
-- Rode este arquivo PRIMEIRO no SQL Editor do Supabase.
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
