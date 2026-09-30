// =====================================================================
// Acesso aos dados.
//
// Nenhuma tela chama o Supabase direto: tudo passa por aqui. Assim o
// preenchimento de user_id, a ordenacao e a traducao de erro ficam num
// lugar so, em vez de repetidos em cada tela.
//
// Observe que nenhuma consulta filtra por user_id. Nao e esquecimento:
// o RLS ja devolve apenas as linhas do dono. Repetir o filtro aqui daria
// a falsa impressao de que a seguranca depende deste arquivo.
// Na ESCRITA o user_id e obrigatorio, porque o banco compara o valor
// gravado com auth.uid() -- e e o que impede gravar em nome de outro.
// =====================================================================

import { db, traduzirErro } from './supabase.js';
import { uuid } from './lib/id.js';
import { enfileirar, pendentes, ehFalhaDeRede } from './lib/fila.js';
import { ordenarMovimentos } from './lib/movimentos.js';

async function meuId() {
  const { data } = await db.auth.getSession();
  const id = data.session?.user?.id;
  if (!id) throw new Error('Sessao expirada. Entre de novo.');
  return id;
}

function conferir({ data, error }) {
  if (error) throw new Error(traduzirErro(error));
  return data;
}


// --- Categorias -------------------------------------------------------

export async function listarCategorias(tipo) {
  let consulta = db.from('categories').select('*').order('nome');
  if (tipo) consulta = consulta.eq('tipo', tipo);
  return conferir(await consulta);
}

export async function criarCategoria(tipo, nome) {
  return conferir(
    await db
      .from('categories')
      .insert({ user_id: await meuId(), tipo, nome: nome.trim() })
      .select()
      .single()
  );
}


// --- Transacoes -------------------------------------------------------

/** Lancamentos do periodo, mais recentes primeiro. */
export async function listarTransacoes({ de, ate, tipo = null, limite = 500 }) {
  let consulta = db
    .from('transactions')
    .select('*, categoria:categories(id, nome, icone)')
    .gte('data', de)
    .lte('data', ate)
    .order('data', { ascending: false })
    .order('hora', { ascending: false, nullsFirst: false })
    .order('criado_em', { ascending: false })
    .limit(limite);

  if (tipo) consulta = consulta.eq('tipo', tipo);
  return conferir(await consulta);
}

export async function criarTransacao(campos) {
  // O id nasce aqui, nao no banco: e o que permite reenviar depois sem
  // risco de criar o mesmo lancamento duas vezes (ver lib/fila.js).
  const registro = { ...campos, id: uuid(), user_id: await meuId() };

  const { data, error } = await db
    .from('transactions')
    .insert(registro)
    .select('*, categoria:categories(id, nome, icone)')
    .single();

  if (!error) return data;

  if (ehFalhaDeRede(error)) {
    enfileirar('transactions', registro);
    return { ...registro, pendente: true };
  }

  throw new Error(traduzirErro(error));
}

export async function atualizarTransacao(id, campos) {
  // Sem user_id no update: trocar o dono de um lancamento nunca e a
  // intencao, e o RLS recusaria de qualquer forma.
  return conferir(
    await db
      .from('transactions')
      .update(campos)
      .eq('id', id)
      .select('*, categoria:categories(id, nome, icone)')
      .single()
  );
}

export async function excluirTransacao(id) {
  const { error } = await db.from('transactions').delete().eq('id', id);
  if (error) throw new Error(traduzirErro(error));
}


// --- Abastecimentos ---------------------------------------------------

export async function listarAbastecimentos({ de = null, ate = null, limite = 200 } = {}) {
  let consulta = db
    .from('fuel_logs')
    .select('*')
    .order('data', { ascending: false })
    .order('odometro', { ascending: false, nullsFirst: false })
    .limit(limite);

  if (de) consulta = consulta.gte('data', de);
  if (ate) consulta = consulta.lte('data', ate);
  return conferir(await consulta);
}

export async function criarAbastecimento(campos) {
  return conferir(
    await db
      .from('fuel_logs')
      .insert({ ...campos, user_id: await meuId() })
      .select()
      .single()
  );
}

export async function atualizarAbastecimento(id, campos) {
  return conferir(
    await db.from('fuel_logs').update(campos).eq('id', id).select().single()
  );
}

export async function excluirAbastecimento(id, comprovante = null) {
  // A imagem sai antes da linha. Na ordem inversa, uma falha no meio
  // deixaria o arquivo orfao no Storage, sem nada que aponte para ele.
  if (comprovante) await apagarComprovante(comprovante);
  const { error } = await db.from('fuel_logs').delete().eq('id', id);
  if (error) throw new Error(traduzirErro(error));
}


// --- Manutencao (historico) -------------------------------------------

export async function listarManutencoes({ limite = 200 } = {}) {
  return conferir(
    await db
      .from('maintenance')
      .select('*')
      .order('data', { ascending: false })
      .order('criado_em', { ascending: false })
      .limit(limite)
  );
}

export async function criarManutencao(campos) {
  return conferir(
    await db
      .from('maintenance')
      .insert({ ...campos, user_id: await meuId() })
      .select()
      .single()
  );
}

export async function atualizarManutencao(id, campos) {
  return conferir(
    await db.from('maintenance').update(campos).eq('id', id).select().single()
  );
}

export async function excluirManutencao(id, comprovante = null) {
  if (comprovante) await apagarComprovante(comprovante);
  const { error } = await db.from('maintenance').delete().eq('id', id);
  if (error) throw new Error(traduzirErro(error));
}


// --- Manutencao planejada (calendario) --------------------------------

export async function listarPlanos({ incluirConcluidos = false } = {}) {
  let consulta = db
    .from('maintenance_plan')
    .select('*')
    .order('data_alvo', { ascending: true, nullsFirst: false })
    .order('km_alvo', { ascending: true, nullsFirst: false });

  if (!incluirConcluidos) consulta = consulta.eq('concluido', false);
  return conferir(await consulta);
}

export async function criarPlano(campos) {
  return conferir(
    await db
      .from('maintenance_plan')
      .insert({ ...campos, user_id: await meuId() })
      .select()
      .single()
  );
}

export async function atualizarPlano(id, campos) {
  return conferir(
    await db.from('maintenance_plan').update(campos).eq('id', id).select().single()
  );
}

export async function excluirPlano(id) {
  const { error } = await db.from('maintenance_plan').delete().eq('id', id);
  if (error) throw new Error(traduzirErro(error));
}

/**
 * Maior quilometragem ja registrada, entre abastecimentos e manutencoes.
 *
 * E o "onde o carro esta agora" que os alertas por km comparam. Vem das
 * duas tabelas porque o odometro pode ter sido anotado na oficina sem
 * ter havido abastecimento depois.
 */
export async function odometroAtual() {
  const [combustivel, oficina] = await Promise.all([
    db.from('fuel_logs').select('odometro')
      .not('odometro', 'is', null)
      .order('odometro', { ascending: false }).limit(1),
    db.from('maintenance').select('odometro')
      .not('odometro', 'is', null)
      .order('odometro', { ascending: false }).limit(1),
  ]);

  const valores = [
    combustivel.data?.[0]?.odometro,
    oficina.data?.[0]?.odometro,
  ].filter((n) => Number.isFinite(n));

  return valores.length ? Math.max(...valores) : null;
}


// --- Checklists -------------------------------------------------------

/** Checklists com seus itens, em ordem. */
export async function listarChecklists() {
  const dados = conferir(
    await db
      .from('checklists')
      .select('*, itens:checklist_items(id, texto, ordem)')
      .order('criado_em', { ascending: true })
  );

  // O Postgres nao garante ordem nas linhas aninhadas; ordenamos aqui.
  for (const c of dados) c.itens.sort((a, b) => a.ordem - b.ordem);
  return dados;
}

export async function criarChecklist(titulo, textos = []) {
  const id = await meuId();

  const checklist = conferir(
    await db
      .from('checklists')
      .insert({ user_id: id, titulo: titulo.trim() })
      .select()
      .single()
  );

  if (textos.length) {
    conferir(
      await db.from('checklist_items').insert(
        textos.map((texto, ordem) => ({
          user_id: id,
          checklist_id: checklist.id,
          texto: texto.trim(),
          ordem,
        }))
      ).select()
    );
  }

  return checklist;
}

export async function renomearChecklist(id, titulo) {
  return conferir(
    await db.from('checklists').update({ titulo: titulo.trim() })
      .eq('id', id).select().single()
  );
}

export async function excluirChecklist(id) {
  // Itens e conclusoes saem junto pelo on delete cascade.
  const { error } = await db.from('checklists').delete().eq('id', id);
  if (error) throw new Error(traduzirErro(error));
}

/**
 * Reconcilia os itens de um checklist.
 *
 * Nao apaga tudo para recriar, embora seja mais curto: o historico
 * (checklist_runs.marcados) guarda os itens por id. Recriar daria ids
 * novos e transformaria todo registro antigo em marcacoes orfas.
 * Entao: atualiza quem ficou, insere quem chegou, apaga quem saiu.
 */
export async function salvarItens(checklistId, itens) {
  const usuario = await meuId();

  const atuais = conferir(
    await db.from('checklist_items').select('id').eq('checklist_id', checklistId)
  );

  const mantidos = new Set(itens.filter((i) => i.id).map((i) => i.id));
  const removidos = atuais.filter((a) => !mantidos.has(a.id)).map((a) => a.id);

  const paraAtualizar = itens
    .map((item, ordem) => ({ ...item, ordem }))
    .filter((item) => item.id);

  const paraInserir = itens
    .map((item, ordem) => ({ ...item, ordem }))
    .filter((item) => !item.id)
    .map((item) => ({
      user_id: usuario,
      checklist_id: checklistId,
      texto: item.texto.trim(),
      ordem: item.ordem,
    }));

  const resultados = await Promise.all([
    ...paraAtualizar.map((item) =>
      db.from('checklist_items')
        .update({ texto: item.texto.trim(), ordem: item.ordem })
        .eq('id', item.id)
    ),
    paraInserir.length
      ? db.from('checklist_items').insert(paraInserir)
      : Promise.resolve({ error: null }),
    removidos.length
      ? db.from('checklist_items').delete().in('id', removidos)
      : Promise.resolve({ error: null }),
  ]);

  // Promise.all resolve mesmo quando o Supabase devolve erro no corpo,
  // em vez de lancar. Sem esta checagem, um item que nao gravou daria
  // "salvo com sucesso" e sumiria no recarregamento.
  const falhou = resultados.find((r) => r?.error);
  if (falhou) throw new Error(traduzirErro(falhou.error));
}

/** A execucao de um checklist num dia, se existir. */
export async function execucaoDoDia(checklistId, data) {
  return conferir(
    await db
      .from('checklist_runs')
      .select('*')
      .eq('checklist_id', checklistId)
      .eq('data', data)
      .maybeSingle()
  );
}

/**
 * Grava o que esta marcado hoje.
 *
 * upsert com a chave (checklist_id, data) -- a mesma do UNIQUE no banco.
 * Marcar e desmarcar durante o dia atualiza a mesma linha em vez de
 * criar uma por toque.
 */
export async function salvarExecucao(checklistId, data, marcados) {
  return conferir(
    await db
      .from('checklist_runs')
      .upsert(
        { user_id: await meuId(), checklist_id: checklistId, data, marcados },
        { onConflict: 'checklist_id,data' }
      )
      .select()
      .single()
  );
}

/** Ultimas execucoes, para o historico. */
export async function historicoChecklists({ limite = 30 } = {}) {
  return conferir(
    await db
      .from('checklist_runs')
      .select('*, checklist:checklists(titulo)')
      .order('data', { ascending: false })
      .limit(limite)
  );
}


// --- Comprovantes (Supabase Storage) ----------------------------------

const BUCKET = 'comprovantes';

/**
 * Envia a imagem para <user_id>/<uuid>.<ext> e devolve o caminho.
 *
 * O caminho comeca com o id do dono porque e disso que a policy do
 * Storage depende (ver supabase/03_storage.sql): ela compara a primeira
 * pasta com auth.uid(). Gravar em outro lugar seria recusado pelo
 * servidor -- o prefixo nao e convencao, e o mecanismo.
 */
export async function enviarComprovante(arquivo) {
  const id = await meuId();
  const ext = (arquivo.name?.split('.').pop() || 'jpg').toLowerCase().slice(0, 5);
  const caminho = `${id}/${uuid()}.${ext}`;

  const { error } = await db.storage
    .from(BUCKET)
    .upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });

  if (error) throw new Error(traduzirErro(error));
  return caminho;
}

/**
 * URL temporaria para exibir a imagem.
 *
 * O bucket e privado, entao nao existe link permanente: cada exibicao
 * pede uma assinatura nova, valida por uma hora.
 */
export async function urlComprovante(caminho, segundos = 3600) {
  const { data, error } = await db.storage
    .from(BUCKET)
    .createSignedUrl(caminho, segundos);
  if (error) throw new Error(traduzirErro(error));
  return data.signedUrl;
}

export async function apagarComprovante(caminho) {
  const { error } = await db.storage.from(BUCKET).remove([caminho]);
  // Falhar aqui nao pode impedir o resto: um arquivo orfao incomoda
  // menos que um registro que o usuario nao consegue apagar.
  if (error) console.warn('[Giro] comprovante nao removido:', error);
}


// --- Movimentos: a linha do tempo financeira unificada ----------------

/**
 * Dinheiro sai de tres lugares -- lancamento manual, abastecimento e
 * manutencao -- e cada um mora na sua tabela para nao duplicar nada.
 *
 * Esta funcao junta os tres numa lista so, normalizada. Existe porque
 * cada tela decidir sozinha o que conta como gasto foi exatamente o que
 * fez o Inicio e o Financas mostrarem numeros diferentes: um somava o
 * combustivel, o outro nao via nem isso, e nenhum dos dois contava a
 * manutencao.
 *
 * Toda tela que fala em dinheiro passa a ler daqui.
 */
export async function listarMovimentos({ de, ate }) {
  let transacoes = [];
  let abastecimentos = [];
  let manutencoes = [];
  let offline = false;

  try {
    [transacoes, abastecimentos, manutencoes] = await Promise.all([
      listarTransacoes({ de, ate }),
      listarAbastecimentos({ de, ate }),
      listarManutencoesPeriodo({ de, ate }),
    ]);
  } catch (e) {
    // Sem rede, ainda da para mostrar o que esta esperando para subir.
    // Melhor uma tela parcial e avisada do que um erro que apaga o
    // lancamento que a pessoa acabou de fazer.
    if (!ehFalhaDeRede(e)) throw e;
    offline = true;
  }

  const movimentos = [
    ...transacoes.map((t) => ({
      origem: 'transacao',
      id: t.id,
      tipo: t.tipo,
      valor: Number(t.valor),
      data: t.data,
      hora: t.hora ?? null,
      titulo: t.categoria?.nome ?? (t.tipo === 'entrada' ? 'Entrada' : 'Saida'),
      detalhe: [t.hora?.slice(0, 5), t.plataforma, t.obs].filter(Boolean),
      anexo: false,
      registro: t,
    })),

    ...abastecimentos.map((a) => ({
      origem: 'abastecimento',
      id: a.id,
      tipo: 'saida',
      valor: Number(a.valor),
      data: a.data,
      hora: null,
      titulo: 'Abastecimento',
      detalhe: [
        a.litros ? `${Number(a.litros).toLocaleString('pt-BR')} L` : null,
        a.posto,
        a.combustivel,
      ].filter(Boolean),
      anexo: Boolean(a.comprovante),
      registro: a,
    })),

    ...manutencoes.map((m) => ({
      origem: 'manutencao',
      id: m.id,
      tipo: 'saida',
      // Servico sem valor anotado entra na linha do tempo, mas soma
      // zero: melhor aparecer no historico do que sumir.
      valor: Number(m.valor) || 0,
      data: m.data,
      hora: null,
      titulo: m.tipo,
      detalhe: [m.oficina, m.obs].filter(Boolean),
      anexo: Boolean(m.comprovante),
      registro: m,
    })),
  ];

  // O que ainda nao subiu entra na lista igual, marcado. Sem isto, o
  // lancamento feito sem sinal sumiria da tela ate a rede voltar -- e
  // a pessoa registraria de novo, achando que tinha falhado.
  for (const item of pendentes()) {
    const r = item.registro;
    if (r.data < de || r.data > ate) continue;

    movimentos.push({
      origem: 'transacao',
      id: r.id,
      tipo: r.tipo,
      valor: Number(r.valor),
      data: r.data,
      hora: r.hora ?? null,
      titulo: r.tipo === 'entrada' ? 'Ganho' : 'Gasto',
      detalhe: ['aguardando envio'],
      anexo: false,
      pendente: true,
      registro: r,
    });
  }

  const lista = ordenarMovimentos(movimentos);
  lista.offline = offline;
  return lista;
}

async function listarManutencoesPeriodo({ de, ate }) {
  return conferir(
    await db
      .from('maintenance')
      .select('*')
      .gte('data', de)
      .lte('data', ate)
      .order('data', { ascending: false })
  );
}
