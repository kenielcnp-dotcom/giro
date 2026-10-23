// =====================================================================
// Testes das contas dos Relatorios.
//
//     node --test          (na pasta do projeto)
//
// Usa so o executor de testes que vem com o Node (18+): nada de npm,
// nada para instalar -- o app continua sem etapa de build.
//
// O fuso e fixado em Sao Paulo antes de qualquer data ser criada: e no
// fuso real do app que um ganho das 22h nao pode escorregar para o dia
// seguinte.
// =====================================================================

process.env.TZ = 'America/Sao_Paulo';

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  resumoPorDia, agrupar, mediasPorDiaTrabalhado, destaques, variacao,
  eixo, escalaFaturamento, escalaLucro, escalasPossiveis, escalaInicial, datasEntre,
} from '../src/lib/relatorio.js';
import {
  resumirMovimentos, gastosPorCategoria, ganhosPorPlataforma, porcentagens,
} from '../src/lib/movimentos.js';
import { indicadoresPorKm } from '../src/lib/consumo.js';
import { resolver, periodoAnterior } from '../src/lib/periodo.js';
import { iso, intervalo } from '../src/lib/format.js';


// --- Fabricas de movimento, no formato de listarMovimentos ------------

let seq = 0;
const ganho = (data, valor, extra = {}) => ({
  origem: 'transacao', id: `g${++seq}`, tipo: 'entrada', valor, data,
  titulo: 'Corrida', detalhe: [], registro: { plataforma: extra.plataforma ?? null },
});
const gasto = (data, valor, titulo = 'Alimentacao') => ({
  origem: 'transacao', id: `s${++seq}`, tipo: 'saida', valor, data,
  titulo, detalhe: [], registro: {},
});
const abastecimento = (data, valor, odometro, litros = 40) => ({
  origem: 'abastecimento', id: `a${++seq}`, tipo: 'saida', valor, data,
  titulo: 'Abastecimento', detalhe: [], registro: { odometro, litros, valor },
});
const oficina = (data, valor) => ({
  origem: 'manutencao', id: `m${++seq}`, tipo: 'saida', valor, data,
  titulo: 'Troca de oleo', detalhe: [], registro: {},
});

const OUTUBRO = { de: '2026-10-01', ate: '2026-10-31', hoje: '2026-10-23' };
const dia = (dias, data) => dias.find((d) => d.de === data);
const soma = (lista, campo) => Math.round(lista.reduce((s, x) => s + x[campo], 0) * 100) / 100;


// --- Resumo por dia ------------------------------------------------------

describe('resumoPorDia', () => {
  test('mes com varios dias trabalhados: totais por dia batem com o periodo', () => {
    const movs = [
      ganho('2026-10-01', 120.5), ganho('2026-10-01', 80.25), gasto('2026-10-01', 30),
      ganho('2026-10-02', 200), abastecimento('2026-10-02', 150, 45000),
      ganho('2026-10-15', 285.4), gasto('2026-10-15', 45),
    ];
    const { dias, semDia } = resumoPorDia(movs, OUTUBRO);
    const total = resumirMovimentos(movs);

    assert.equal(dias.length, 31, 'um registro por dia do mes, inclusive futuros');
    assert.equal(semDia.length, 0);
    assert.equal(soma(dias, 'ganhos'), total.ganhos);
    assert.equal(soma(dias, 'gastos'), total.gastos);
    assert.equal(soma(dias, 'liquido'), total.liquido);

    const d1 = dia(dias, '2026-10-01');
    assert.equal(d1.ganhos, 200.75);
    assert.equal(d1.gastos, 30);
    assert.equal(d1.liquido, 170.75);
    assert.equal(d1.corridas, 2);
    assert.equal(d1.registros, 3);
    assert.equal(d1.diasTrabalhados, 1);
  });

  test('dia sem corrida fica com zero registros, nao com faturamento zero confirmado', () => {
    const { dias } = resumoPorDia([ganho('2026-10-01', 100)], OUTUBRO);
    const d2 = dia(dias, '2026-10-02');
    assert.equal(d2.registros, 0);
    assert.equal(d2.diasTrabalhados, 0);
    assert.equal(d2.futuro, false);
  });

  test('datas depois de hoje saem marcadas como futuras', () => {
    const { dias } = resumoPorDia([], OUTUBRO);
    assert.equal(dia(dias, '2026-10-23').futuro, false);
    assert.equal(dia(dias, '2026-10-24').futuro, true);
    assert.equal(dias.filter((d) => d.futuro).length, 8);
  });

  test('dia com despesa maior que o faturamento fica negativo', () => {
    const { dias } = resumoPorDia(
      [ganho('2026-10-05', 90), abastecimento('2026-10-05', 220, 45500)], OUTUBRO
    );
    const d = dia(dias, '2026-10-05');
    assert.equal(d.liquido, -130);
    assert.equal(d.diasTrabalhados, 1);
  });

  test('despesa sem data valida nao entra em dia nenhum, mas aparece em semDia', () => {
    const torto = { ...gasto('2026-10-01', 50), data: null };
    const foraDoPeriodo = gasto('2026-11-02', 70);
    const { dias, semDia } = resumoPorDia([ganho('2026-10-01', 100), torto, foraDoPeriodo], OUTUBRO);
    assert.equal(semDia.length, 2);
    assert.equal(soma(dias, 'gastos'), 0);
  });

  test('centavos: 10,10 + 20,20 contra 30,30 da zero exato, nao residuo negativo', () => {
    const { dias } = resumoPorDia(
      [ganho('2026-10-07', 10.1), ganho('2026-10-07', 20.2), gasto('2026-10-07', 30.3)], OUTUBRO
    );
    assert.equal(dia(dias, '2026-10-07').liquido, 0);
    assert.equal(Object.is(dia(dias, '2026-10-07').liquido, -0), false);
  });

  test('periodo sem registros: todos os dias vazios', () => {
    const { dias } = resumoPorDia([], OUTUBRO);
    assert.ok(dias.every((d) => d.registros === 0));
    assert.equal(destaques(dias), null);
  });
});


// --- Dia trabalhado e medias -------------------------------------------

describe('mediasPorDiaTrabalhado', () => {
  test('divide pelos dias com ganho, nao pelos dias do calendario', () => {
    const movs = [
      ganho('2026-10-01', 200), ganho('2026-10-02', 300), ganho('2026-10-02', 100),
      gasto('2026-10-02', 50),
      gasto('2026-10-04', 400, 'Documentacao'), // dia de folga: so despesa
    ];
    const { dias } = resumoPorDia(movs, OUTUBRO);
    const m = mediasPorDiaTrabalhado(dias, resumirMovimentos(movs));

    assert.equal(m.diasTrabalhados, 2, 'despesa isolada nao conta como dia trabalhado');
    assert.equal(m.faturamento, 300);
    assert.equal(m.lucro, (600 - 450) / 2, 'o lucro inclui a despesa do dia de folga');
    assert.equal(m.corridas, 1.5);
    assert.equal(m.porCorrida, 200);
  });

  test('um dia trabalhado so', () => {
    const movs = [ganho('2026-10-10', 150), ganho('2026-10-10', 50)];
    const { dias } = resumoPorDia(movs, OUTUBRO);
    const m = mediasPorDiaTrabalhado(dias, resumirMovimentos(movs));
    assert.equal(m.diasTrabalhados, 1);
    assert.equal(m.faturamento, 200);

    const x = destaques(dias);
    assert.equal(x.melhor.de, '2026-10-10');
    assert.equal(x.pior, null, 'com um dia so nao existe pior dia');
  });

  test('sem dia trabalhado devolve null em vez de dividir por zero', () => {
    const movs = [gasto('2026-10-03', 80), abastecimento('2026-10-04', 200, 46000)];
    const { dias } = resumoPorDia(movs, OUTUBRO);
    assert.equal(mediasPorDiaTrabalhado(dias, resumirMovimentos(movs)), null);
  });
});

describe('destaques', () => {
  test('melhor e pior pelo resultado liquido, contando dias so de despesa', () => {
    const movs = [
      ganho('2026-10-01', 200), ganho('2026-10-02', 350), gasto('2026-10-02', 20),
      gasto('2026-10-09', 2160.9, 'Documentacao'),
    ];
    const { dias } = resumoPorDia(movs, OUTUBRO);
    const x = destaques(dias);
    assert.equal(x.melhor.de, '2026-10-02');
    assert.equal(x.pior.de, '2026-10-09');
    assert.equal(x.pior.liquido, -2160.9);
  });
});


// --- Baldes: semana e mes -----------------------------------------------

describe('agrupar', () => {
  test('semana comeca na segunda e soma os dias', () => {
    // 05/10/2026 e uma segunda-feira.
    const movs = [ganho('2026-10-04', 100), ganho('2026-10-05', 200), ganho('2026-10-11', 50)];
    const { dias } = resumoPorDia(movs, OUTUBRO);
    const semanas = agrupar(dias, 'semana');

    assert.equal(semanas[0].de, '2026-10-01', 'a primeira semana e cortada no inicio do periodo');
    assert.equal(semanas[0].ate, '2026-10-04');
    assert.equal(semanas[1].de, '2026-10-05');
    assert.equal(semanas[1].ate, '2026-10-11');
    assert.equal(semanas[1].ganhos, 250);
    assert.equal(semanas[1].diasTrabalhados, 2);
    assert.equal(soma(semanas, 'ganhos'), 350);
  });

  test('mes agrupa e marca como futuro so o mes que ainda nao comecou', () => {
    const ano = { de: '2026-01-01', ate: '2026-12-31', hoje: '2026-10-23' };
    const { dias } = resumoPorDia([ganho('2026-03-10', 500), ganho('2026-10-02', 90)], ano);
    const meses = agrupar(dias, 'mes');

    assert.equal(meses.length, 12);
    assert.equal(meses[2].ganhos, 500);
    assert.equal(meses[9].futuro, false, 'outubro esta em andamento');
    assert.equal(meses[10].futuro, true);
    assert.equal(meses[2].eixo, 'mar');
  });

  test('rotulos do eixo: mes de 31 dias mostra so os marcos', () => {
    const { dias } = resumoPorDia([], OUTUBRO);
    const baldes = agrupar(dias, 'dia');
    const visiveis = baldes.filter((b) => b.mostrarEixo).map((b) => b.eixo);
    assert.deepEqual(visiveis, ['01', '05', '10', '15', '20', '25', '30']);
    assert.equal(baldes[14].longo, 'quinta, 15 de outubro');
  });
});

describe('escalas', () => {
  test('a escala inicial acompanha a duracao do periodo', () => {
    assert.equal(escalaInicial('2026-10-01', '2026-10-31'), 'dia');
    assert.equal(escalaInicial('2026-08-01', '2026-10-23'), 'semana');
    assert.equal(escalaInicial('2026-01-01', '2026-12-31'), 'mes');
    assert.deepEqual(escalasPossiveis('2026-10-20', '2026-10-23'), ['dia']);
  });
});


// --- Variacao ------------------------------------------------------------

describe('variacao', () => {
  test('percentual quando a base e positiva', () => {
    const v = variacao(120, 100);
    assert.equal(v.tipo, 'pct');
    assert.equal(Math.round(v.valor), 20);
  });

  test('em reais quando a base e zero ou negativa', () => {
    assert.deepEqual(variacao(50, -100), { tipo: 'reais', valor: 150, diferenca: 150 });
    assert.equal(variacao(80, 0).tipo, 'reais');
  });

  test('sem periodo anterior nao inventa comparacao', () => {
    assert.equal(variacao(100, null), null);
    assert.equal(variacao(100, undefined), null);
  });
});


// --- Escalas dos graficos -------------------------------------------------

describe('eixo e escalas', () => {
  test('eixo usa divisoes redondas', () => {
    assert.deepEqual(eixo(0, 312), { min: 0, max: 400, marcas: [0, 100, 200, 300, 400] });
  });

  test('sem nenhum valor o eixo ainda tem altura', () => {
    assert.equal(eixo(0, 0).max, 100);
  });

  test('faturamento vai do zero ao maior dia', () => {
    const { dias } = resumoPorDia([ganho('2026-10-01', 285.4)], OUTUBRO);
    const e = escalaFaturamento(dias);
    assert.equal(e.min, 0);
    assert.ok(e.max >= 285.4);
  });

  test('um IPVA nao achata o grafico de lucro: a barra e cortada', () => {
    const movs = [
      ganho('2026-10-01', 250), ganho('2026-10-02', 180),
      gasto('2026-10-09', 2160.9, 'Documentacao'),
    ];
    const { dias } = resumoPorDia(movs, OUTUBRO);
    const e = escalaLucro(dias);
    assert.ok(e.max >= 250);
    assert.ok(e.min >= -300, `o lado negativo fica no tamanho do positivo (min ${e.min})`);
    assert.ok(-2160.9 < e.min, 'o dia do IPVA passa da escala e sera desenhado cortado');
  });

  test('sem ganho nenhum o lado negativo nao e cortado', () => {
    const { dias } = resumoPorDia([gasto('2026-10-03', 80)], OUTUBRO);
    assert.ok(escalaLucro(dias).min <= -80);
  });
});


// --- Categorias, origem e porcentagens -----------------------------------

describe('distribuicao', () => {
  test('porcentagens somam exatamente 100', () => {
    assert.deepEqual(porcentagens([1, 1, 1]), [34, 33, 33]);
    assert.equal(porcentagens([2160.9, 1312.96, 11]).reduce((s, v) => s + v, 0), 100);
    assert.deepEqual(porcentagens([0, 0]), [0, 0]);
  });

  test('gastos por categoria juntam abastecimento como Combustivel', () => {
    const cats = gastosPorCategoria([
      abastecimento('2026-10-02', 150, 45000), gasto('2026-10-03', 20),
      oficina('2026-10-04', 0), // servico sem valor nao vira categoria de 0%
    ]);
    assert.deepEqual(cats.map((c) => c.rotulo), ['Combustivel', 'Alimentacao']);
    assert.equal(cats[0].itens.length, 1);
    assert.equal(cats.reduce((s, c) => s + c.pct, 0), 100);
  });

  test('receita sem origem vai para "Nao informada", sem chute', () => {
    const origem = ganhosPorPlataforma([
      ganho('2026-10-01', 100, { plataforma: 'Uber' }),
      ganho('2026-10-01', 50, { plataforma: ' uber ' }),
      ganho('2026-10-01', 30),
    ]);
    assert.deepEqual(origem.map((o) => [o.rotulo, o.valor]), [['Uber', 150], ['Nao informada', 30]]);
  });
});


// --- Quilometragem --------------------------------------------------------

describe('indicadoresPorKm', () => {
  test('conta ganho e custo so dentro da janela do odometro', () => {
    const movs = [
      ganho('2026-10-01', 1000),                 // antes do primeiro odometro
      abastecimento('2026-10-03', 200, 45000),   // abre a janela: fora do custo
      ganho('2026-10-05', 300), gasto('2026-10-05', 40),
      abastecimento('2026-10-20', 180, 45500),
      ganho('2026-10-22', 999),                  // depois do ultimo odometro
    ];
    const k = indicadoresPorKm(movs);
    assert.equal(k.km, 500);
    assert.equal(k.ganhoPorKm, 300 / 500);
    assert.equal(k.custoPorKm, (40 + 180) / 500);
    assert.deepEqual([k.janela.de, k.janela.ate], ['2026-10-03', '2026-10-20']);
  });

  test('com menos de dois odometros nao calcula nada', () => {
    const k = indicadoresPorKm([abastecimento('2026-10-03', 200, 45000), ganho('2026-10-03', 100)]);
    assert.equal(k.km, null);
    assert.equal(k.ganhoPorKm, null);
  });
});


// --- Periodos e datas locais ----------------------------------------------

describe('periodos', () => {
  const hoje = new Date(2026, 9, 23, 22, 30); // 23/10/2026 as 22h30, horario de Brasilia

  test('22h30 continua sendo o mesmo dia (sem escorregar para UTC)', () => {
    assert.equal(iso(hoje), '2026-10-23');
    assert.notEqual(hoje.toISOString().slice(0, 10), iso(hoje), 'em UTC ja seria dia 24');
  });

  test('este mes vai ate hoje na consulta e ate o dia 31 no grafico', () => {
    const p = resolver('mes', null, hoje);
    assert.deepEqual([p.de, p.ate, p.fim], ['2026-10-01', '2026-10-23', '2026-10-31']);
  });

  test('6 meses e ano', () => {
    assert.equal(resolver('seis_meses', null, hoje).de, '2026-05-01');
    const ano = resolver('ano', null, hoje);
    assert.deepEqual([ano.de, ano.ate, ano.fim], ['2026-01-01', '2026-10-23', '2026-12-31']);
  });

  test('alteracao entre meses: mes parcial compara com os mesmos dias do anterior', () => {
    assert.deepEqual(periodoAnterior(resolver('mes', null, hoje)), { de: '2026-09-01', ate: '2026-09-23' });
    assert.deepEqual(
      periodoAnterior(resolver('mes', null, new Date(2026, 2, 31))),
      { de: '2026-02-01', ate: '2026-02-28' },
      '31 de marco recua para o ultimo dia de fevereiro'
    );
  });

  test('mes fechado compara com o mes fechado anterior inteiro', () => {
    const setembro = resolver('mes_passado', null, hoje);
    assert.deepEqual([setembro.de, setembro.ate], ['2026-09-01', '2026-09-30']);
    assert.deepEqual(periodoAnterior(setembro), { de: '2026-08-01', ate: '2026-08-31' });
  });

  test('periodo personalizado compara com o mesmo numero de dias antes', () => {
    const p = resolver('personalizado', { de: '2026-10-10', ate: '2026-10-19' }, hoje);
    assert.equal(p.dias, 10);
    assert.deepEqual(periodoAnterior(p), { de: '2026-09-30', ate: '2026-10-09' });
  });

  test('personalizado invertido e corrigido', () => {
    const p = resolver('personalizado', { de: '2026-10-19', ate: '2026-10-10' }, hoje);
    assert.deepEqual([p.de, p.ate], ['2026-10-10', '2026-10-19']);
  });

  test('datasEntre atravessa a virada de ano em data local', () => {
    assert.deepEqual(datasEntre('2025-12-30', '2026-01-02'),
      ['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02']);
  });

  test('intervalo por extenso', () => {
    assert.equal(intervalo('2026-10-01', '2026-10-23', { hoje }), '1 a 23 de outubro');
    assert.equal(intervalo('2026-08-01', '2026-10-23', { hoje }), '1 de agosto a 23 de outubro');
    assert.equal(intervalo('2025-11-01', '2026-01-31', { curto: true, hoje }), '1 nov 2025 a 31 jan 2026');
  });
});
