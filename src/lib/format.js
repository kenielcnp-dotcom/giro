// =====================================================================
// Formatacao e datas.
//
// ATENCAO AO FUSO: toda data neste app e local, nunca UTC.
// toISOString() devolve UTC. No Brasil (UTC-3) isso joga tudo que e
// registrado depois das 21h para o dia seguinte -- exatamente o horario
// em que um motorista mais trabalha. Um ganho das 22h de sexta cairia
// no sabado e bagunçaria o fechamento do dia inteiro.
// =====================================================================

const MOEDA = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const NUMERO = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

export const moeda = (v) => MOEDA.format(Number(v) || 0);

// Para titulos grandes, onde "R$" repetido polui.
export const valor = (v) =>
  new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(v) || 0);

export const numero = (v) => NUMERO.format(Number(v) || 0);

// Para o eixo dos graficos, onde "R$ 1.500,00" nao cabe: "1,5 mil".
const COMPACTO = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export const compacto = (v) => COMPACTO.format(Number(v) || 0);

// --- Datas -----------------------------------------------------------

/** Data local no formato YYYY-MM-DD (o formato que o Postgres espera). */
export function iso(d = new Date()) {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/** Hora local no formato HH:MM. */
export function hora(d = new Date()) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Converte YYYY-MM-DD em Date local (sem passar por UTC). */
export function deIso(texto) {
  const [ano, mes, dia] = texto.split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

const DIAS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
               'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
                      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "30/09" */
export function dataCurta(texto) {
  const d = deIso(texto);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** "Hoje", "Ontem" ou "segunda, 30 set" */
export function dataRelativa(texto) {
  const hojeIso = iso();
  if (texto === hojeIso) return 'Hoje';

  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  if (texto === iso(ontem)) return 'Ontem';

  const d = deIso(texto);
  return `${DIAS[d.getDay()]}, ${d.getDate()} ${MESES[d.getMonth()]}`;
}

/** "set/2026" */
export function mesAno(texto) {
  const d = deIso(texto);
  return `${MESES[d.getMonth()]}/${d.getFullYear()}`;
}

/** "set" */
export function mesCurto(texto) {
  return MESES[deIso(texto).getMonth()];
}

/** "setembro de 2026" */
export function mesExtenso(texto) {
  const d = deIso(texto);
  return `${MESES_LONGOS[d.getMonth()]} de ${d.getFullYear()}`;
}

/** "15 out" */
export function diaMes(texto) {
  const d = deIso(texto);
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

/** "qua, 15/10" */
export function dataComSemana(texto) {
  return `${DIAS_CURTOS[deIso(texto).getDay()]}, ${dataCurta(texto)}`;
}

/** "quarta, 15 de outubro" */
export function dataExtensa(texto) {
  const d = deIso(texto);
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES_LONGOS[d.getMonth()]}`;
}

/**
 * Intervalo sem repetir o que as duas pontas tem em comum:
 * "1 a 23 de outubro", "1 de agosto a 23 de outubro".
 * Com `curto`: "1 a 23 out", "1 ago a 23 out".
 *
 * O ano so aparece quando nao e o corrente, ou quando as pontas caem em
 * anos diferentes -- "outubro" sozinho ja diz "deste ano" para quem le.
 */
export function intervalo(de, ate, { curto = false, hoje = new Date() } = {}) {
  const a = deIso(de);
  const b = deIso(ate);
  const nomes = curto ? MESES : MESES_LONGOS;
  const liga = curto ? ' ' : ' de ';

  const mesmoAno = a.getFullYear() === b.getFullYear();
  const mesmoMes = mesmoAno && a.getMonth() === b.getMonth();
  const comAno = !mesmoAno || b.getFullYear() !== hoje.getFullYear();

  const ponta = (d, mes, ano) =>
    `${d.getDate()}${mes ? liga + nomes[d.getMonth()] : ''}${ano ? liga + d.getFullYear() : ''}`;

  if (de === ate) return ponta(a, true, comAno);
  return `${ponta(a, !mesmoMes, comAno && !mesmoAno)} a ${ponta(b, true, comAno)}`;
}

// --- Entrada de valor -------------------------------------------------

/**
 * Le o que o motorista digitou no campo de valor.
 * Aceita "42", "42,50" e "42.50" -- todos viram 42 / 42.5.
 *
 * De proposito NAO usa mascara de centavos (aquela em que digitar 42
 * vira R$ 0,42). A maioria dos registros e em reais redondos: digitar
 * "42" tem que dar R$ 42, nao R$ 0,42.
 */
export function lerValor(texto) {
  if (typeof texto !== 'string') texto = String(texto ?? '');
  const limpo = texto.replace(/[^\d,.-]/g, '').replace(',', '.');
  const n = Number.parseFloat(limpo);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}
