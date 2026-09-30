// =====================================================================
// Contas sobre a lista unificada de movimentos.
//
// Separado de dados.js de proposito: aqui nao ha rede nem Supabase, so
// aritmetica sobre uma lista. E o calculo que responde "quanto sobrou",
// entao precisa poder ser testado sozinho.
// =====================================================================

/**
 * Totais do periodo.
 *
 * Toda saida entra em `gastos`, venha de lancamento manual,
 * abastecimento ou oficina. `combustivel` e `manutencao` sao recortes
 * do mesmo total, para exibicao -- nao parcelas a somar de novo.
 */
export function resumirMovimentos(movimentos, dias = 1) {
  let ganhos = 0;
  let gastos = 0;
  let corridas = 0;
  let combustivel = 0;
  let manutencao = 0;

  for (const m of movimentos) {
    if (m.tipo === 'entrada') {
      ganhos += m.valor;
      corridas += 1;
      continue;
    }

    gastos += m.valor;
    if (m.origem === 'abastecimento') combustivel += m.valor;
    else if (m.origem === 'manutencao') manutencao += m.valor;
  }

  const liquido = ganhos - gastos;

  return {
    ganhos,
    gastos,
    liquido,
    corridas,
    combustivel,
    manutencao,
    mediaDiaria: dias > 0 ? liquido / dias : liquido,
    porCorrida: corridas > 0 ? ganhos / corridas : 0,
  };
}

/** Agrupa por data, preservando a ordem decrescente que ja veio. */
export function agruparMovimentos(movimentos) {
  const mapa = new Map();
  for (const m of movimentos) {
    if (!mapa.has(m.data)) mapa.set(m.data, []);
    mapa.get(m.data).push(m);
  }
  return [...mapa.entries()];
}

/**
 * Ordena do mais recente para o mais antigo.
 *
 * A hora desempata dentro do mesmo dia. Abastecimento e manutencao nao
 * tem hora, entao ficam depois dos lancamentos daquele dia.
 */
export function ordenarMovimentos(movimentos) {
  return [...movimentos].sort((a, b) => {
    if (a.data !== b.data) return a.data < b.data ? 1 : -1;
    return (b.hora ?? '').localeCompare(a.hora ?? '');
  });
}


// --- Agregacoes para os relatorios ------------------------------------

/**
 * Como cada saida deve ser rotulada no relatorio.
 *
 * Abastecimento e manutencao nao tem categoria no banco -- nem
 * precisam, porque a tabela ja diz o que sao. Aqui ganham um rotulo
 * para caberem na mesma comparacao dos lancamentos manuais.
 */
function rotuloDe(m) {
  if (m.origem === 'abastecimento') return 'Combustivel';
  if (m.origem === 'manutencao') return 'Manutencao';
  return m.titulo || 'Sem categoria';
}

/**
 * Gastos somados por categoria, do maior para o menor.
 * `fatia` e a proporcao dentro do total, ja pronta para virar barra.
 */
export function gastosPorCategoria(movimentos) {
  const soma = new Map();
  let total = 0;

  for (const m of movimentos) {
    if (m.tipo !== 'saida' || m.valor <= 0) continue;
    const rotulo = rotuloDe(m);
    soma.set(rotulo, (soma.get(rotulo) ?? 0) + m.valor);
    total += m.valor;
  }

  return [...soma.entries()]
    .map(([rotulo, valor]) => ({
      rotulo,
      valor,
      fatia: total > 0 ? valor / total : 0,
    }))
    .sort((a, b) => b.valor - a.valor);
}

/**
 * Entradas e saidas mes a mes, do mais antigo para o mais novo.
 *
 * Ordem crescente de proposito: o grafico de evolucao le da esquerda
 * para a direita, como uma linha do tempo.
 */
export function porMes(movimentos) {
  const meses = new Map();

  for (const m of movimentos) {
    const chave = m.data.slice(0, 7);   // AAAA-MM
    if (!meses.has(chave)) {
      meses.set(chave, { mes: chave, ganhos: 0, gastos: 0, corridas: 0 });
    }
    const alvo = meses.get(chave);
    if (m.tipo === 'entrada') {
      alvo.ganhos += m.valor;
      alvo.corridas += 1;
    } else {
      alvo.gastos += m.valor;
    }
  }

  return [...meses.values()]
    .map((m) => ({ ...m, liquido: m.ganhos - m.gastos }))
    .sort((a, b) => a.mes.localeCompare(b.mes));
}

/** Entradas por plataforma, para saber de onde vem o faturamento. */
export function ganhosPorPlataforma(movimentos) {
  const soma = new Map();
  let total = 0;

  for (const m of movimentos) {
    if (m.tipo !== 'entrada') continue;
    const rotulo = m.registro?.plataforma?.trim() || 'Nao informada';
    soma.set(rotulo, (soma.get(rotulo) ?? 0) + m.valor);
    total += m.valor;
  }

  return [...soma.entries()]
    .map(([rotulo, valor]) => ({
      rotulo,
      valor,
      fatia: total > 0 ? valor / total : 0,
    }))
    .sort((a, b) => b.valor - a.valor);
}
