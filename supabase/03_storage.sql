-- =====================================================================
-- Giro - Etapa 1: Storage dos comprovantes (notas de abastecimento,
-- recibos de manutencao)
-- Rode DEPOIS do 02_rls.sql.
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


-- CONFERENCIA ----------------------------------------------------------
-- O bucket precisa aparecer com publico = false.
select id, name, public as publico, file_size_limit as limite_bytes
from storage.buckets
where id = 'comprovantes';
