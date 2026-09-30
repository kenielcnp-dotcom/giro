// =====================================================================
// Periodos do dashboard.
//
// Tudo em data local (ver o aviso de fuso em format.js).
// A semana comeca na SEGUNDA: o motorista pensa em "semana de trabalho",
// e um domingo trabalhado pertence a semana que esta acabando, nao a
// que vai comecar.
// =====================================================================

import { iso, deIso, dataCurta } from './format.js';

function somarDias(d, n) {
  const novo = new Date(d);
  novo.setDate(novo.getDate() + n);
  return novo;
}

function inicioDaSemana(d = new Date()) {
  const dia = d.getDay();               // 0 domingo ... 6 sabado
  const recuo = dia === 0 ? 6 : dia - 1; // domingo recua 6, nao 0
  return somarDias(d, -recuo);
}

export const PERIODOS = ['hoje', 'ontem', 'semana', 'mes'];

// Janelas longas, so para a tela de relatorios: no dia a dia ninguem
// pergunta "quanto rendeu o semestre" antes de saber quanto rendeu hoje.
export const PERIODOS_LONGOS = ['mes', 'mes_passado', 'tres_meses', 'ano'];

export const ROTULOS = {
  hoje: 'Hoje',
  ontem: 'Ontem',
  semana: 'Semana',
  mes: 'Este mes',
  mes_passado: 'Mes passado',
  tres_meses: '3 meses',
  ano: 'Este ano',
  personalizado: 'Escolher',
};

/**
 * Resolve um periodo em { de, ate, rotulo, dias }.
 * `de` e `ate` sao inclusivos, no formato YYYY-MM-DD.
 */
export function resolver(nome, personalizado = null) {
  const hoje = new Date();

  switch (nome) {
    case 'hoje': {
      const d = iso(hoje);
      return { de: d, ate: d, rotulo: 'Hoje', dias: 1 };
    }

    case 'ontem': {
      const d = iso(somarDias(hoje, -1));
      return { de: d, ate: d, rotulo: 'Ontem', dias: 1 };
    }

    case 'semana': {
      const inicio = inicioDaSemana(hoje);
      return {
        de: iso(inicio),
        ate: iso(hoje),
        rotulo: 'Esta semana',
        // Dias ja decorridos, nao 7. Usar 7 numa terca faria a media
        // diaria parecer menor do que esta sendo de verdade.
        dias: diasEntre(iso(inicio), iso(hoje)),
      };
    }

    case 'mes': {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      return {
        de: iso(inicio),
        ate: iso(hoje),
        rotulo: 'Este mes',
        dias: hoje.getDate(),
      };
    }

    case 'mes_passado': {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      // Dia 0 do mes seguinte e o ultimo dia do mes anterior -- assim
      // nao e preciso saber se o mes tem 28, 30 ou 31 dias.
      const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
      return {
        de: iso(inicio),
        ate: iso(fim),
        rotulo: 'Mes passado',
        dias: fim.getDate(),
      };
    }

    case 'tres_meses': {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1);
      return {
        de: iso(inicio),
        ate: iso(hoje),
        rotulo: 'Ultimos 3 meses',
        dias: diasEntre(iso(inicio), iso(hoje)),
      };
    }

    case 'ano': {
      const inicio = new Date(hoje.getFullYear(), 0, 1);
      return {
        de: iso(inicio),
        ate: iso(hoje),
        rotulo: `Ano de ${hoje.getFullYear()}`,
        dias: diasEntre(iso(inicio), iso(hoje)),
      };
    }

    case 'personalizado': {
      const { de, ate } = personalizado ?? {};
      if (!de || !ate) return resolver('hoje');
      const [ini, fim] = de <= ate ? [de, ate] : [ate, de];
      return {
        de: ini,
        ate: fim,
        rotulo: ini === fim ? dataCurta(ini) : `${dataCurta(ini)} a ${dataCurta(fim)}`,
        dias: diasEntre(ini, fim),
      };
    }

    default:
      return resolver('hoje');
  }
}

/** Numero de dias entre duas datas ISO, contando as duas pontas. */
export function diasEntre(de, ate) {
  const ms = deIso(ate) - deIso(de);
  return Math.max(1, Math.round(ms / 86400000) + 1);
}
