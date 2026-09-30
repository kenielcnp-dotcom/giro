// =====================================================================
// Navegacao entre as quatro abas.
//
// Sem biblioteca de rotas e sem URL: o app tem quatro destinos e nenhum
// deles precisa ser compartilhavel por link. Um roteador de verdade aqui
// seria peso sem uso.
//
// Cada aba e redesenhada ao ser aberta, de proposito: voltar para o
// Inicio depois de lancar um gasto tem que mostrar o numero novo, nunca
// um valor velho em cache.
// =====================================================================

import { telaDashboard } from './telas/dashboard.js';
import { telaFinancas } from './telas/financas.js';
import { telaCarro } from './telas/carro.js';
import { telaPerfil } from './telas/perfil.js';
import { telaRelatorios } from './telas/relatorios.js';

// Icones em stroke, herdando currentColor: um arquivo a menos e nada
// para carregar da rede.
const ICONES = {
  inicio: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/>',
  financas: '<path d="M4 19V10"/><path d="M10 19V5"/><path d="M16 19v-6"/><path d="M22 19H2"/>',
  carro: '<path d="M5 17h14M4 17l1.6-5.2A2 2 0 0 1 7.5 10h9a2 2 0 0 1 1.9 1.8L20 17"/><circle cx="7.5" cy="17.5" r="1.6"/><circle cx="16.5" cy="17.5" r="1.6"/>',
  perfil: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5"/>',
};

const ABAS = [
  ['inicio', 'Inicio'],
  ['financas', 'Financas'],
  ['carro', 'Carro'],
  ['perfil', 'Perfil'],
];

export function montarApp(raiz, contexto) {
  let atual = null;

  raiz.innerHTML = `
    <div id="tela"></div>
    <nav class="abas" aria-label="Navegacao principal">
      ${ABAS.map(([id, rotulo]) => `
        <button type="button" class="aba" data-aba="${id}" aria-current="false">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            ${ICONES[id]}
          </svg>
          <span>${rotulo}</span>
        </button>
      `).join('')}
    </nav>
  `;

  const tela = raiz.querySelector('#tela');
  const botoes = [...raiz.querySelectorAll('[data-aba]')];

  // `opcoes` deixa um destino ser aberto ja numa sub-secao -- o alerta
  // de manutencao do Inicio leva direto para a lista de agendados, em
  // vez de largar o usuario na primeira aba do Carro.
  function ir(destino, opcoes = {}) {
    const mesmaAba = destino === atual;
    if (mesmaAba && !opcoes.forcar) return;
    atual = destino;

    // Relatorios nao tem aba propria: e uma tela filha do Inicio, entao
    // o Inicio continua marcado enquanto ela esta aberta.
    const abaAtiva = destino === 'relatorios' ? 'inicio' : destino;
    botoes.forEach((b) =>
      b.setAttribute('aria-current', String(b.dataset.aba === abaAtiva))
    );

    // Volta ao topo: manter a rolagem da aba anterior desorienta.
    window.scrollTo({ top: 0 });

    const ctx = { ...contexto, ...opcoes, ir };
    switch (destino) {
      case 'inicio':     return telaDashboard(tela, ctx);
      case 'financas':   return telaFinancas(tela, ctx);
      case 'carro':      return telaCarro(tela, ctx);
      case 'perfil':     return telaPerfil(tela, ctx);
      case 'relatorios': return telaRelatorios(tela, ctx);
    }
  }

  botoes.forEach((b) => b.addEventListener('click', () => ir(b.dataset.aba)));

  ir('inicio');
  return { ir };
}
