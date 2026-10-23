// =====================================================================
// Substituto de src/dados.js para testes/previa.html.
//
// A previa troca o modulo de dados por este via import map, e a tela de
// Relatorios roda sem login e sem Supabase. NUNCA e carregado pelo app:
// fica em testes/, que esta no .vercelignore.
//
// Gera ~22 meses de historico deterministico (a mesma data sempre gera
// os mesmos numeros), no formato exato de listarMovimentos.
//
// ?cenario=  normal | vazio | erro | um-dia | so-despesa | offline | lento
// =====================================================================

import { ordenarMovimentos } from '../src/lib/movimentos.js';
import { iso } from '../src/lib/format.js';

const cenario = new URLSearchParams(location.search).get('cenario') || 'normal';
const HOJE = iso();

// Gerador pseudoaleatorio com semente: mulberry32.
function sorteio(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function semente(texto) {
  let h = 2166136261;
  for (const c of texto) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h;
}

const reais = (v) => Math.round(v * 100) / 100;
let seq = 0;

function transacao(data, tipo, valor, categoria, extra = {}) {
  const registro = {
    id: `t${++seq}`, tipo, valor, data, hora: extra.hora ?? null,
    plataforma: extra.plataforma ?? null, obs: null,
    categoria: { nome: categoria },
  };
  return {
    origem: 'transacao', id: registro.id, tipo, valor, data, hora: registro.hora,
    titulo: categoria,
    detalhe: [registro.hora?.slice(0, 5), registro.plataforma].filter(Boolean),
    anexo: false, registro, pendente: extra.pendente,
  };
}

function abastecimento(data, valor, litros, odometro) {
  const registro = { id: `a${++seq}`, data, valor, litros, odometro, posto: 'Posto Avenida' };
  return {
    origem: 'abastecimento', id: registro.id, tipo: 'saida', valor, data, hora: null,
    titulo: 'Abastecimento',
    detalhe: [`${litros.toLocaleString('pt-BR')} L`, registro.posto],
    anexo: false, registro,
  };
}

function manutencao(data, valor, tipo) {
  const registro = { id: `m${++seq}`, data, valor, tipo, oficina: 'Auto Center' };
  return {
    origem: 'manutencao', id: registro.id, tipo: 'saida', valor: Number(valor) || 0,
    data, hora: null, titulo: tipo, detalhe: [registro.oficina], anexo: false, registro,
  };
}

let historico = null;

function gerar() {
  const lista = [];
  let odometro = 41250;
  let desdeAbastecer = 0;

  for (let d = new Date(2025, 0, 1); iso(d) <= HOJE; d.setDate(d.getDate() + 1)) {
    const data = iso(d);
    const r = sorteio(semente(data));
    const domingo = d.getDay() === 0;
    const trabalha = domingo ? r() < 0.2 : r() < 0.86;

    if (trabalha) {
      const corridas = 3 + Math.floor(r() * 8);
      for (let i = 0; i < corridas; i++) {
        const p = r();
        lista.push(transacao(data, 'entrada', reais(13 + r() * 40), 'Corrida', {
          hora: `${String(7 + i).padStart(2, '0')}:${String(Math.floor(r() * 60)).padStart(2, '0')}`,
          plataforma: p < 0.55 ? 'Uber' : p < 0.85 ? '99' : null,
        }));
      }
      if (r() < 0.1) lista.push(transacao(data, 'entrada', reais(5 + r() * 10), 'Gorjeta'));
      if (r() < 0.3) lista.push(transacao(data, 'saida', reais(18 + r() * 20), 'Alimentacao'));
      if (r() < 0.06) lista.push(transacao(data, 'saida', reais(8 + r() * 12), 'Lavagem'));
      const km = 90 + Math.floor(r() * 110);
      odometro += km;
      desdeAbastecer += km;
    } else if (r() < 0.4) {
      const km = 15 + Math.floor(r() * 40);   // uso pessoal na folga
      odometro += km;
      desdeAbastecer += km;
    }

    if (desdeAbastecer > 360) {
      const litros = Math.round((desdeAbastecer / (10.5 + r() * 2)) * 1000) / 1000;
      lista.push(abastecimento(data, reais(litros * 6.19), litros, odometro));
      desdeAbastecer = 0;
    }
  }

  // Despesas grandes e esporadicas -- as que achatariam o grafico de
  // lucro se ele nao cortasse a barra.
  lista.push(transacao('2026-10-09', 'saida', 2160.9, 'Documentacao'));
  lista.push(transacao('2026-01-20', 'saida', 1840, 'Documentacao'));
  lista.push(transacao('2026-04-10', 'saida', 1290, 'Seguro'));
  lista.push(manutencao('2026-09-14', 380, 'Troca de oleo'));
  lista.push(manutencao('2026-10-17', null, 'Alinhamento'));  // sem valor anotado
  lista.push(transacao('2026-10-21', 'saida', 11, 'Estacionamento'));

  return lista;
}

function cenarioUmDia() {
  return [
    transacao('2026-10-14', 'entrada', 42.5, 'Corrida', { plataforma: 'Uber', hora: '09:10' }),
    transacao('2026-10-14', 'entrada', 31.9, 'Corrida', { plataforma: 'Uber', hora: '10:02' }),
    transacao('2026-10-14', 'saida', 25, 'Alimentacao'),
  ];
}

function cenarioSoDespesa() {
  return [
    transacao('2026-10-03', 'saida', 80, 'Alimentacao'),
    abastecimento('2026-10-04', 210.5, 34, 46000),
  ];
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export async function listarMovimentos({ de, ate }) {
  if (cenario === 'lento') await espera(1500);
  else await espera(120);

  if (cenario === 'erro') throw new Error('Sem resposta do servidor.');
  if (cenario === 'vazio') return [];

  if (cenario === 'offline') {
    const lista = [transacao(HOJE, 'entrada', 38, 'Ganho', { pendente: true })]
      .filter((m) => m.data >= de && m.data <= ate);
    lista.offline = true;
    return lista;
  }

  const base = cenario === 'um-dia' ? cenarioUmDia()
    : cenario === 'so-despesa' ? cenarioSoDespesa()
    : (historico ??= gerar());

  return ordenarMovimentos(base.filter((m) => m.data >= de && m.data <= ate));
}
