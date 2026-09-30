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
 * Indicadores que dependem de distancia.
 * Cada um vem null quando falta dado, para a tela poder omitir em vez
 * de mostrar zero.
 */
export function indicadoresPorKm({ abastecimentos, ganhos, gastos }) {
  const km = kmRodados(abastecimentos);
  if (!km) return { km: null, custoPorKm: null, ganhoPorKm: null };

  return {
    km,
    custoPorKm: gastos > 0 ? gastos / km : null,
    ganhoPorKm: ganhos > 0 ? ganhos / km : null,
  };
}
