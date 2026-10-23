// =====================================================================
// Quilometragem e consumo, calculados a partir do odometro dos
// abastecimentos.
//
// PREMISSA: o metodo padrao (tanque a tanque) so e exato quando os
// abastecimentos sao de tanque cheio. Se voce poe R$ 50 hoje e R$ 30
// amanha, os litros do segundo nao repoem exatamente o que foi gasto,
// e a media sai torta.
//
// Por isso o app nunca apresenta km/l como numero fechado: mostra como
// media aproximada, e some quando nao ha dado suficiente. Preferi um
// campo vazio a um numero que voce usaria para decidir alguma coisa
// sem saber que esta errado.
// =====================================================================

/**
 * Km rodados entre o primeiro e o ultimo odometro informado.
 * Devolve null com menos de dois registros -- nao da para medir
 * distancia com um ponto so.
 */
export function kmRodados(abastecimentos) {
  const odos = abastecimentos
    .map((a) => a.odometro)
    .filter((o) => Number.isFinite(o) && o > 0)
    .sort((a, b) => a - b);

  if (odos.length < 2) return null;

  const km = odos[odos.length - 1] - odos[0];
  return km > 0 ? km : null;
}

/**
 * Media de km por litro, pelo metodo tanque a tanque.
 *
 * Os litros do PRIMEIRO abastecimento ficam de fora: eles abasteceram o
 * trecho anterior ao periodo, nao o trecho que estamos medindo.
 */
export function kmPorLitro(abastecimentos) {
  const validos = abastecimentos
    .filter((a) => Number.isFinite(a.odometro) && a.odometro > 0 && Number(a.litros) > 0)
    .sort((a, b) => a.odometro - b.odometro);

  if (validos.length < 2) return null;

  const km = validos[validos.length - 1].odometro - validos[0].odometro;
  const litros = validos.slice(1).reduce((s, a) => s + Number(a.litros), 0);

  if (km <= 0 || litros <= 0) return null;

  const media = km / litros;
  // Fora dessa faixa e quase certo que o odometro foi digitado errado
  // (um zero a mais, ou o valor do trecho no lugar do total do painel).
  return media > 1 && media < 40 ? media : null;
}

/** Total gasto em combustivel no conjunto. */
export const totalCombustivel = (abastecimentos) =>
  abastecimentos.reduce((s, a) => s + Number(a.valor), 0);

/** Total de litros. */
export const totalLitros = (abastecimentos) =>
  abastecimentos.reduce((s, a) => s + (Number(a.litros) || 0), 0);

/** Preco medio pago por litro, ponderado pelo volume. */
export function precoMedioLitro(abastecimentos) {
  const comLitros = abastecimentos.filter((a) => Number(a.litros) > 0);
  if (!comLitros.length) return null;
  return totalCombustivel(comLitros) / totalLitros(comLitros);
}

/**
 * Indicadores que dependem de distancia, a partir da lista unificada de
 * movimentos (ver listarMovimentos em dados.js).
 *
 * Os km sao a diferenca entre o primeiro e o ultimo odometro anotado
 * em abastecimentos do periodo. E a distancia do CARRO -- inclui ida
 * ao mercado e viagem de fim de semana --, porque e a unica medida que
 * o app tem.
 *
 * Ganho e custo por km contam so o que caiu dentro dessa janela. Dividir
 * o faturamento do mes inteiro pelos km de 3 a 20 misturaria dias que
 * o odometro nao mediu, e o ganho por km sairia inflado.
 *
 * O abastecimento que abre a janela fica fora do custo: ele encheu o
 * tanque para o trecho ANTERIOR. E a mesma premissa de kmPorLitro.
 *
 * Cada indicador vem null quando falta dado, para a tela poder omitir
 * em vez de mostrar zero.
 */
export function indicadoresPorKm(movimentos) {
  const nada = { km: null, custoPorKm: null, ganhoPorKm: null, janela: null };

  const pontos = movimentos
    .filter((m) => m.origem === 'abastecimento'
      && Number.isFinite(m.registro?.odometro) && m.registro.odometro > 0)
    .sort((a, b) => a.registro.odometro - b.registro.odometro);

  if (pontos.length < 2) return nada;

  const primeiro = pontos[0];
  const ultimo = pontos[pontos.length - 1];
  const km = ultimo.registro.odometro - primeiro.registro.odometro;
  if (km <= 0) return nada;

  // Odometro maior com data anterior e erro de digitacao; ordenar as
  // datas evita uma janela invertida que nao conteria nada.
  const [de, ate] = [primeiro.data, ultimo.data].sort();

  let ganhos = 0;
  let gastos = 0;
  for (const m of movimentos) {
    if (m === primeiro || m.data < de || m.data > ate) continue;
    if (m.tipo === 'entrada') ganhos += m.valor;
    else gastos += m.valor;
  }

  return {
    km,
    ganhoPorKm: ganhos > 0 ? ganhos / km : null,
    custoPorKm: gastos > 0 ? gastos / km : null,
    janela: {
      de,
      ate,
      odometroInicial: primeiro.registro.odometro,
      odometroFinal: ultimo.registro.odometro,
    },
  };
}
