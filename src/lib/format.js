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
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
               'jul', 'ago', 'set', 'out', 'nov', 'dez'];

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
