// =====================================================================
// Contas sobre a lista unificada de movimentos.
//
// Separado de dados.js de proposito: aqui nao ha rede nem Supabase, so
// aritmetica sobre uma lista. E o calculo que responde "quanto sobrou",
// entao precisa poder ser testado sozinho.
// =====================================================================

/**
 * Arredonda para centavos.
 *
 * Somar valores com centavos em ponto flutuante deixa residuo:
 * 10,10 + 20,20 - 30,30 da -0,0000000000000036, e nao zero. Na tela
 * isso viraria um dia "negativo" que nao existe.
 */
export const centavos = (v) => Math.round(v * 100) / 100;

/**
 * Totais do periodo.
 *
 * Toda saida entra em `gastos`, venha de lancamento manual,
 * abastecimento ou oficina. `combustivel` e `manutencao` sao recortes
 * do mesmo total, para exibicao -- nao parcelas a somar de novo.
 *
 * Cada lancamento de entrada conta como uma corrida: o banco nao tem
 * campo de quantidade, entao quem lanca o total do dia de uma vez ve
 * "1 corrida" naquele dia.
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

  ganhos = centavos(ganhos);
  gastos = centavos(gastos);
  const liquido = centavos(ganhos - gastos);

  return {
    ganhos,
    gastos,
    liquido,
    corridas,
    combustivel: centavos(combustivel),
    manutencao: centavos(manutencao),
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
 * Porcentagens inteiras que somam exatamente 100.
 *
 * Arredondar cada fatia sozinha da 33 + 33 + 33 = 99, ou 101 com outras
 * proporcoes. Aqui cada uma recebe o piso, e os pontos que faltam vao
 * para as que tinham a maior sobra decimal (metodo do maior resto).
 */
export function porcentagens(valores) {
  const total = valores.reduce((s, v) => s + v, 0);
  if (total <= 0) return valores.map(() => 0);

  const brutas = valores.map((v) => (v / total) * 100);
  const inteiras = brutas.map(Math.floor);
  let faltam = 100 - inteiras.reduce((s, v) => s + v, 0);

  brutas
    .map((b, i) => [b - inteiras[i], i])
    .sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => {
      if (faltam > 0) { inteiras[i] += 1; faltam -= 1; }
    });

  return inteiras;
}

/**
 * Soma por rotulo, do maior para o menor.
 * `fatia` e a proporcao exata, para a largura da barra; `pct` e a
 * porcentagem inteira exibida; `itens` sao os movimentos, para a tela
 * poder abrir o detalhe de cada grupo.
 */
function somarPor(movimentos, rotular) {
  const grupos = new Map();

  for (const m of movimentos) {
    const { chave, rotulo } = rotular(m);
    if (!grupos.has(chave)) grupos.set(chave, { rotulo, valor: 0, itens: [] });
    const g = grupos.get(chave);
    g.valor += m.valor;
    g.itens.push(m);
  }

  const lista = [...grupos.values()]
    .map((g) => ({ ...g, valor: centavos(g.valor) }))
    .sort((a, b) => b.valor - a.valor);

  const total = lista.reduce((s, g) => s + g.valor, 0);
  const pcts = porcentagens(lista.map((g) => g.valor));

  return lista.map((g, i) => ({
    ...g,
    fatia: total > 0 ? g.valor / total : 0,
    pct: pcts[i],
  }));
}

/** Gastos somados por categoria, do maior para o menor. */
export function gastosPorCategoria(movimentos) {
  return somarPor(
    movimentos.filter((m) => m.tipo === 'saida' && m.valor > 0),
    (m) => {
      const rotulo = rotuloDe(m);
      return { chave: rotulo, rotulo };
    }
  );
}

/**
 * Entradas por plataforma, para saber de onde vem o faturamento.
 *
 * A plataforma e texto livre, entao "uber" e "Uber " sao agrupadas
 * juntas e exibidas com a grafia que apareceu primeiro. Entrada sem
 * plataforma vai para "Nao informada": atribuir a alguma plataforma
 * por suposicao inventaria um numero.
 */
export function ganhosPorPlataforma(movimentos) {
  return somarPor(
    movimentos.filter((m) => m.tipo === 'entrada'),
    (m) => {
      const nome = m.registro?.plataforma?.trim();
      return nome
        ? { chave: nome.toLowerCase(), rotulo: nome }
        : { chave: '', rotulo: 'Nao informada' };
    }
  );
}
