// =====================================================================
// Periodos do dashboard.
//
// Tudo em data local (ver o aviso de fuso em format.js).
// A semana comeca na SEGUNDA: o motorista pensa em "semana de trabalho",
// e um domingo trabalhado pertence a semana que esta acabando, nao a
// que vai comecar.
//
// `hoje` e parametro em vez de new Date() solto: e o que deixa os
// testes fixarem a data e conferir virada de mes, ano e fevereiro.
// =====================================================================

import { iso, deIso, dataCurta } from './format.js';

function somarDias(d, n) {
  const novo = new Date(d);
  novo.setDate(novo.getDate() + n);
  return novo;
}

export function inicioDaSemana(d = new Date()) {
  const dia = d.getDay();               // 0 domingo ... 6 sabado
  const recuo = dia === 0 ? 6 : dia - 1; // domingo recua 6, nao 0
  return somarDias(d, -recuo);
}

/** Ultimo dia do mes de `d` -- o dia 0 do mes seguinte. */
function fimDoMes(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export const PERIODOS = ['hoje', 'ontem', 'semana', 'mes'];

// Janelas longas, so para a tela de relatorios: no dia a dia ninguem
// pergunta "quanto rendeu o semestre" antes de saber quanto rendeu hoje.
export const PERIODOS_LONGOS = ['mes', 'mes_passado', 'tres_meses', 'seis_meses', 'ano'];

export const ROTULOS = {
  hoje: 'Hoje',
  ontem: 'Ontem',
  semana: 'Semana',
  mes: 'Este mes',
  mes_passado: 'Mes passado',
  tres_meses: '3 meses',
  seis_meses: '6 meses',
  ano: 'Este ano',
  personalizado: 'Personalizado',
};

/**
 * Resolve um periodo em { nome, de, ate, fim, rotulo, dias }.
 *
 * `de` e `ate` sao inclusivos, no formato YYYY-MM-DD, e delimitam o que
 * se consulta no banco. `fim` e ate onde o grafico desenha: em "este
 * mes" vai ao dia 31, para os dias que ainda nao chegaram aparecerem
 * como futuros em vez de o mes parecer ter acabado hoje.
 */
export function resolver(nome, personalizado = null, hoje = new Date()) {
  const base = (de, ate, rotulo, fim = ate) => ({
    nome, de, ate, fim, rotulo, dias: diasEntre(de, ate),
  });

  switch (nome) {
    case 'hoje': {
      const d = iso(hoje);
      return base(d, d, 'Hoje');
    }

    case 'ontem': {
      const d = iso(somarDias(hoje, -1));
      return base(d, d, 'Ontem');
    }

    // Dias ja decorridos, nao 7. Usar 7 numa terca faria a media
    // diaria parecer menor do que esta sendo de verdade.
    case 'semana':
      return base(iso(inicioDaSemana(hoje)), iso(hoje), 'Esta semana');

    case 'mes': {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      return base(iso(inicio), iso(hoje), 'Este mes', iso(fimDoMes(hoje)));
    }

    case 'mes_passado': {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      // Dia 0 do mes seguinte e o ultimo dia do mes anterior -- assim
      // nao e preciso saber se o mes tem 28, 30 ou 31 dias.
      const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
      return base(iso(inicio), iso(fim), 'Mes passado');
    }

    case 'tres_meses': {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1);
      return base(iso(inicio), iso(hoje), 'Ultimos 3 meses');
    }

    case 'seis_meses': {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1);
      return base(iso(inicio), iso(hoje), 'Ultimos 6 meses');
    }

    case 'ano': {
      const inicio = new Date(hoje.getFullYear(), 0, 1);
      const fim = new Date(hoje.getFullYear(), 11, 31);
      return base(iso(inicio), iso(hoje), `Ano de ${hoje.getFullYear()}`, iso(fim));
    }

    case 'personalizado': {
      const { de, ate } = personalizado ?? {};
      if (!de || !ate) return resolver('hoje', null, hoje);
      const [ini, fim] = de <= ate ? [de, ate] : [ate, de];
      return base(
        ini, fim,
        ini === fim ? dataCurta(ini) : `${dataCurta(ini)} a ${dataCurta(fim)}`
      );
    }

    default:
      return resolver('hoje', null, hoje);
  }
}

/** Numero de dias entre duas datas ISO, contando as duas pontas. */
export function diasEntre(de, ate) {
  const ms = deIso(ate) - deIso(de);
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

/** Desloca uma data ISO em meses, sem estourar o fim do mes (31/03 - 1 = 28/02). */
function deslocarMeses(texto, n) {
  const d = deIso(texto);
  const alvo = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const dia = Math.min(d.getDate(), fimDoMes(alvo).getDate());
  return iso(new Date(alvo.getFullYear(), alvo.getMonth(), dia));
}

const MESES_DO_PERIODO = { mes: 1, mes_passado: 1, tres_meses: 3, seis_meses: 6, ano: 12 };

/**
 * O periodo com que este deve ser comparado.
 *
 * Periodos de calendario recuam o mesmo numero de meses, ponta a ponta:
 * "este mes" no dia 23 compara com o dia 1 a 23 do mes passado, e nao
 * com o mes passado inteiro -- 23 dias contra 30 daria queda todo mes,
 * ate o ultimo dia.
 *
 * Um mes fechado compara com o mes fechado anterior inteiro (30/09 vira
 * 31/08, nao 30/08). Os demais periodos usam a mesma quantidade de dias
 * imediatamente antes.
 */
export function periodoAnterior(periodo) {
  const meses = MESES_DO_PERIODO[periodo.nome];

  if (meses) {
    const de = deslocarMeses(periodo.de, -meses);
    const fechado = periodo.ate === iso(fimDoMes(deIso(periodo.ate)));
    const ate = fechado
      ? iso(fimDoMes(deIso(deslocarMeses(periodo.ate, -meses))))
      : deslocarMeses(periodo.ate, -meses);
    return { de, ate };
  }

  const n = diasEntre(periodo.de, periodo.ate);
  const inicio = deIso(periodo.de);
  return {
    de: iso(somarDias(inicio, -n)),
    ate: iso(somarDias(inicio, -1)),
  };
}
