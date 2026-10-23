// =====================================================================
// Contas da tela de Relatorios.
//
// So aritmetica sobre a lista de movimentos (ver listarMovimentos em
// dados.js): sem rede e sem DOM. A tela desenha o que estas funcoes
// devolvem, e testes/relatorio.test.js confere cada regra sem precisar
// de navegador.
//
// TRES REGRAS QUE ATRAVESSAM O ARQUIVO:
//
// 1. Dia sem registro nao e dia de faturamento zero. Pode ter sido
//    folga, pode ter sido esquecimento -- o app nao sabe. Esses dias
//    saem com `registros: 0`, e a tela diz "sem registro" em vez de
//    R$ 0,00.
//
// 2. Dia trabalhado e dia com pelo menos um GANHO registrado. Despesa
//    sozinha nao conta: abastecer na folga ou pagar o IPVA num domingo
//    derrubaria a media por dia trabalhado justamente com dias em que
//    ninguem trabalhou.
//
// 3. Nenhuma despesa e espalhada pelos dias. IPVA pago no dia 10 pesa
//    no dia 10. Ratear seria inventar um valor que nao foi registrado;
//    em vez disso o grafico corta a barra que estoura a escala (ver
//    escalaLucro).
// =====================================================================

import { resumirMovimentos, centavos } from './movimentos.js';
import { inicioDaSemana, diasEntre } from './periodo.js';
import {
  iso, deIso, dataCurta, diaMes, dataExtensa, intervalo,
  mesCurto, mesExtenso, mesAno,
} from './format.js';

const DATA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

/** Todas as datas de `de` a `ate`, inclusive, em data local. */
export function datasEntre(de, ate) {
  const lista = [];
  for (let d = deIso(de); iso(d) <= ate; d.setDate(d.getDate() + 1)) {
    lista.push(iso(d));
  }
  return lista;
}

/** Os numeros de um conjunto de movimentos, no formato dos baldes. */
function consolidar(movimentos, { de, ate, futuro }) {
  const r = resumirMovimentos(movimentos);
  return {
    de,
    ate,
    ganhos: r.ganhos,
    gastos: r.gastos,
    liquido: r.liquido,
    corridas: r.corridas,
    registros: movimentos.length,
    diasTrabalhados: movimentos.some((m) => m.tipo === 'entrada') ? 1 : 0,
    futuro,
    movimentos,
  };
}

/**
 * Um registro por data, de `de` ate `ate` -- inclusive as datas sem
 * nada, que sao justamente as que o grafico precisa mostrar como
 * vazias.
 *
 * Movimento sem data valida, ou fora do intervalo, vai para `semDia`:
 * entra nos totais do periodo (quem chama soma a lista inteira), mas
 * nao em dia nenhum. O banco exige data em todas as tabelas, entao na
 * pratica isto fica vazio; existe para um dado torto nao sumir calado.
 */
export function resumoPorDia(movimentos, { de, ate, hoje = iso() }) {
  const porData = new Map();
  const semDia = [];

  for (const m of movimentos) {
    if (typeof m.data !== 'string' || !DATA_VALIDA.test(m.data)
        || m.data < de || m.data > ate) {
      semDia.push(m);
      continue;
    }
    if (!porData.has(m.data)) porData.set(m.data, []);
    porData.get(m.data).push(m);
  }

  const dias = datasEntre(de, ate).map((data) =>
    consolidar(porData.get(data) ?? [], { de: data, ate: data, futuro: data > hoje })
  );

  return { dias, semDia };
}


// --- Baldes: dia, semana ou mes ---------------------------------------

export const ESCALAS = ['dia', 'semana', 'mes'];
export const ROTULOS_ESCALA = { dia: 'Dia', semana: 'Semana', mes: 'Mes' };

/** Escalas que fazem sentido para o intervalo. */
export function escalasPossiveis(de, ate) {
  const lista = ['dia'];
  if (diasEntre(de, ate) >= 14) lista.push('semana');
  if (de.slice(0, 7) !== ate.slice(0, 7)) lista.push('mes');
  return lista;
}

/**
 * Escala inicial pela duracao. Um mes por dia cabe na tela; tres meses
 * por dia sao 90 barras, e por semana viram 13 que se leem de relance.
 */
export function escalaInicial(de, ate) {
  const n = diasEntre(de, ate);
  const possiveis = escalasPossiveis(de, ate);
  if (n <= 45) return 'dia';
  if (n <= 200 && possiveis.includes('semana')) return 'semana';
  return possiveis.at(-1);
}

/**
 * Agrupa os dias na escala pedida e da rotulo a cada balde.
 *
 * A semana comeca na segunda (ver periodo.js). Semana e mes nas pontas
 * do periodo ficam cortados: "3 meses" que comeca numa quarta tem a
 * primeira semana de quarta a domingo, e o rotulo diz isso.
 */
export function agrupar(dias, escala) {
  let baldes;

  if (escala === 'dia') {
    baldes = dias.map((d) => ({ ...d }));
  } else {
    const chaveDe = escala === 'semana'
      ? (data) => iso(inicioDaSemana(deIso(data)))
      : (data) => data.slice(0, 7);

    const mapa = new Map();
    for (const dia of dias) {
      const chave = chaveDe(dia.de);
      const b = mapa.get(chave);
      if (!b) {
        mapa.set(chave, { ...dia, movimentos: [...dia.movimentos] });
        continue;
      }
      b.ate = dia.ate;
      b.ganhos = centavos(b.ganhos + dia.ganhos);
      b.gastos = centavos(b.gastos + dia.gastos);
      b.liquido = centavos(b.liquido + dia.liquido);
      b.corridas += dia.corridas;
      b.registros += dia.registros;
      b.diasTrabalhados += dia.diasTrabalhados;
      b.futuro = b.futuro && dia.futuro;
      b.movimentos.push(...dia.movimentos);
    }
    baldes = [...mapa.values()];
  }

  return rotular(baldes, escala);
}

/**
 * Tres textos por balde:
 *   eixo   o que cabe embaixo da barra ("15", "06/10", "out")
 *   curto  a dica do toque ("15 out")
 *   longo  o titulo do detalhe ("quarta, 15 de outubro")
 *
 * Com 31 barras num celular nao ha espaco para 31 numeros: so os dias
 * 1, 5, 10... ganham rotulo, o resto fica para o toque.
 */
function rotular(baldes, escala) {
  const n = baldes.length;
  const variosMeses = n > 0 && baldes[0].de.slice(0, 7) !== baldes[n - 1].ate.slice(0, 7);

  return baldes.map((b, i) => {
    if (escala === 'dia') {
      const dia = Number(b.de.slice(8));
      const marcos = variosMeses ? [1, 10, 20] : [1, 5, 10, 15, 20, 25, 30];
      return {
        ...b,
        eixo: variosMeses && dia === 1 ? mesCurto(b.de) : String(dia).padStart(2, '0'),
        mostrarEixo: n <= 16 || marcos.includes(dia),
        curto: diaMes(b.de),
        longo: dataExtensa(b.de),
      };
    }

    if (escala === 'semana') {
      return {
        ...b,
        eixo: dataCurta(b.de),
        mostrarEixo: n <= 8 || i % 2 === 0,
        curto: intervalo(b.de, b.ate, { curto: true }),
        longo: `Semana de ${intervalo(b.de, b.ate)}`,
      };
    }

    const inteiro = b.de.endsWith('-01') && b.ate === iso(
      new Date(deIso(b.de).getFullYear(), deIso(b.de).getMonth() + 1, 0)
    );
    return {
      ...b,
      eixo: mesCurto(b.de),
      mostrarEixo: true,
      curto: mesAno(b.de),
      longo: inteiro ? mesExtenso(b.de) : intervalo(b.de, b.ate),
    };
  });
}


// --- Medias e destaques -----------------------------------------------

/**
 * Medias por dia TRABALHADO (regra 2 do topo do arquivo).
 *
 * O lucro usa o resultado do periodo inteiro, inclusive despesas de
 * dias de folga: o IPVA tambem sai do que se ganhou nos dias de
 * trabalho. Devolve null sem nenhum dia trabalhado -- dividir por zero
 * dias nao tem resposta, e "R$ 0,00 por dia" seria mentira.
 */
export function mediasPorDiaTrabalhado(dias, totais) {
  const n = dias.filter((d) => d.diasTrabalhados > 0).length;
  if (!n) return null;

  return {
    diasTrabalhados: n,
    faturamento: totais.ganhos / n,
    lucro: totais.liquido / n,
    corridas: totais.corridas / n,
    porCorrida: totais.corridas > 0 ? totais.ganhos / totais.corridas : null,
  };
}

/**
 * Melhor e pior resultado do periodo, entre os dias com algum registro.
 * Com um dia so, nao existe "pior": `pior` vem null.
 */
export function destaques(dias) {
  const comRegistro = dias.filter((d) => d.registros > 0);
  if (!comRegistro.length) return null;

  const melhor = comRegistro.reduce((a, b) => (b.liquido > a.liquido ? b : a));
  const pior = comRegistro.reduce((a, b) => (b.liquido < a.liquido ? b : a));
  return { melhor, pior: pior === melhor ? null : pior };
}

/**
 * Variacao em relacao ao periodo anterior.
 *
 * Percentual so quando a base e positiva. De um prejuizo de R$ 100 para
 * um lucro de R$ 50, "-150%" nao quer dizer nada para ninguem; nesses
 * casos a variacao vem em reais.
 *
 * `anterior` null significa "sem dados para comparar", e a resposta
 * tambem e null: comparar com um zero que so quer dizer "nada foi
 * lancado" inventaria uma alta de 100%.
 */
export function variacao(atual, anterior) {
  if (anterior == null || !Number.isFinite(anterior) || !Number.isFinite(atual)) {
    return null;
  }
  const diferenca = centavos(atual - anterior);
  if (anterior > 0) {
    return { tipo: 'pct', valor: (diferenca / anterior) * 100, diferenca };
  }
  return { tipo: 'reais', valor: diferenca, diferenca };
}


// --- Escalas dos graficos ---------------------------------------------

/**
 * Eixo com divisoes "redondas" (100, 250, 500...) cobrindo min e max.
 * Sem isto o eixo marcaria 0, 78, 156, 234 -- correto e ilegivel.
 *
 * Testa 3, 4 e 5 divisoes e fica com a que sobra menos espaco vazio:
 * com 4 fixas, -250 a +250 viraria -400 a +400, e as barras ocupariam
 * so 60% da altura. No empate, a que der perto de 5 marcas.
 */
export function eixo(minimo, maximo) {
  if (maximo <= 0 && minimo >= 0) maximo = 100;

  const opcoes = [3, 4, 5].map((divisoes) => {
    const bruto = (maximo - minimo) / divisoes;
    const grandeza = 10 ** Math.floor(Math.log10(bruto));
    const fator = bruto / grandeza;
    const passo = Math.max(1, (
      fator <= 1 ? 1 : fator <= 2 ? 2 : fator <= 2.5 ? 2.5 : fator <= 5 ? 5 : 10
    ) * grandeza);

    const min = Math.floor(minimo / passo) * passo;
    const max = Math.ceil(maximo / passo) * passo;
    const marcas = [];
    for (let v = min; v <= max + passo / 2; v += passo) marcas.push(Math.round(v * 100) / 100);
    return { min, max, marcas };
  });

  const folga = (e) => e.max - e.min;
  return opcoes.reduce((melhor, e) => {
    if (folga(e) !== folga(melhor)) return folga(e) < folga(melhor) ? e : melhor;
    return Math.abs(e.marcas.length - 5) < Math.abs(melhor.marcas.length - 5) ? e : melhor;
  });
}

/** Escala do faturamento: do zero ao maior balde. */
export function escalaFaturamento(baldes) {
  return eixo(0, Math.max(0, ...baldes.map((b) => b.ganhos)));
}

/**
 * Escala do lucro, com zero no meio.
 *
 * O lado negativo vai no maximo ate o tamanho do positivo. Um dia de
 * IPVA (-R$ 2.000) num mes de dias de +R$ 200 achataria todas as outras
 * barras numa linha. A barra que passa do limite e desenhada cortada,
 * e o valor inteiro aparece no toque -- nada e escondido ou rateado.
 */
export function escalaLucro(baldes) {
  const comDado = baldes.filter((b) => b.registros > 0);
  const maxPos = Math.max(0, ...comDado.map((b) => b.liquido));
  const maxNeg = Math.max(0, ...comDado.map((b) => -b.liquido));
  const limiteNeg = maxPos > 0 ? Math.min(maxNeg, maxPos) : maxNeg;
  return eixo(-limiteNeg, maxPos);
}
