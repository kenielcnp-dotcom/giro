// =====================================================================
// Situacao de uma manutencao planejada.
//
// Um plano dispara por data, por quilometragem, ou pelos dois. Com os
// dois, vale o que chegar primeiro -- e o que acontece na vida real:
// "a cada 6 meses ou 10.000 km, o que vier antes".
// =====================================================================

import { iso, deIso } from './format.js';

// Um motorista de aplicativo roda muito, entao o aviso por km precisa
// de folga: 1.000 km sao poucos dias de trabalho. Avisar cedo demais
// incomoda; avisar tarde demais custa motor.
const KM_AVISO = 1000;
const DIAS_AVISO = 15;

export const TIPOS = [
  'Troca de oleo', 'Filtro de oleo', 'Filtro de ar', 'Filtro de cabine',
  'Pneus', 'Freios', 'Alinhamento', 'Balanceamento', 'Bateria',
  'Suspensao', 'Correia', 'Velas', 'Revisao', 'Outros',
];

// Intervalos usuais, so como sugestao ao criar um plano. Sempre
// editaveis: cada carro e cada uso tem o seu.
export const INTERVALOS = {
  'Troca de oleo': 10000,
  'Filtro de oleo': 10000,
  'Filtro de ar': 20000,
  'Filtro de cabine': 15000,
  'Pneus': 40000,
  'Freios': 30000,
  'Alinhamento': 10000,
  'Balanceamento': 10000,
  'Correia': 60000,
  'Velas': 40000,
  'Revisao': 10000,
};

/**
 * Avalia um plano contra a data de hoje e o odometro atual.
 * Devolve { status, urgencia, texto, diasRestantes, kmRestantes }.
 *
 * `urgencia` e um numero para ordenar: quanto menor, mais urgente.
 */
export function avaliar(plano, odometro = null) {
  const hoje = iso();

  let diasRestantes = null;
  if (plano.data_alvo) {
    diasRestantes = Math.round((deIso(plano.data_alvo) - deIso(hoje)) / 86400000);
  }

  let kmRestantes = null;
  if (Number.isFinite(plano.km_alvo) && Number.isFinite(odometro)) {
    kmRestantes = plano.km_alvo - odometro;
  }

  const atrasadoPorData = diasRestantes !== null && diasRestantes < 0;
  const atrasadoPorKm = kmRestantes !== null && kmRestantes <= 0;

  const proximoPorData = diasRestantes !== null && diasRestantes >= 0 && diasRestantes <= DIAS_AVISO;
  const proximoPorKm = kmRestantes !== null && kmRestantes > 0 && kmRestantes <= KM_AVISO;

  let status = 'ok';
  if (atrasadoPorData || atrasadoPorKm) status = 'atrasada';
  else if (proximoPorData || proximoPorKm) status = 'proxima';

  return {
    status,
    diasRestantes,
    kmRestantes,
    urgencia: urgenciaDe(status, diasRestantes, kmRestantes),
    texto: descrever(status, diasRestantes, kmRestantes),
  };
}

function urgenciaDe(status, dias, km) {
  const base = status === 'atrasada' ? 0 : status === 'proxima' ? 1000 : 2000;
  // Dentro do mesmo status, ordena pelo gatilho mais perto.
  const porData = dias !== null ? Math.abs(dias) : Infinity;
  const porKm = km !== null ? Math.abs(km) / 100 : Infinity;
  return base + Math.min(porData, porKm);
}

function descrever(status, dias, km) {
  const partes = [];

  if (status === 'atrasada') {
    if (dias !== null && dias < 0) {
      partes.push(dias === -1 ? 'venceu ontem' : `venceu ha ${Math.abs(dias)} dias`);
    }
    if (km !== null && km <= 0) {
      partes.push(km === 0 ? 'no km de hoje' : `passou ${Math.abs(km)} km`);
    }
    return partes.join(' e ') || 'atrasada';
  }

  if (dias !== null && dias >= 0) {
    partes.push(dias === 0 ? 'e hoje' : dias === 1 ? 'e amanha' : `em ${dias} dias`);
  }
  if (km !== null && km > 0) {
    partes.push(`em ${km.toLocaleString('pt-BR')} km`);
  }
  return partes.join(' ou ') || 'sem prazo definido';
}

/** Planos em ordem de urgencia, com a avaliacao anexada. */
export function ordenarPorUrgencia(planos, odometro) {
  return planos
    .map((p) => ({ ...p, aviso: avaliar(p, odometro) }))
    .sort((a, b) => a.aviso.urgencia - b.aviso.urgencia);
}

/** Apenas o que precisa de atencao, para o alerta do dashboard. */
export function pendencias(planos, odometro) {
  return ordenarPorUrgencia(planos, odometro)
    .filter((p) => p.aviso.status !== 'ok');
}
