// =====================================================================
// Carro: abastecimento, manutencao e checklists.
//
// As tres secoes vivem numa aba so porque sao a mesma tarefa mental --
// cuidar do veiculo. Seis abas na barra inferior dariam alvos pequenos
// demais para usar com pressa.
//
// Este arquivo e so a moldura: cada secao se desenha sozinha.
// =====================================================================

import { secaoCombustivel } from './secao-combustivel.js';
import { secaoManutencao } from './secao-manutencao.js';
import { secaoChecklists } from './secao-checklists.js';

const SECOES = [
  ['combustivel', 'Combustivel'],
  ['manutencao', 'Manutencao'],
  ['checklists', 'Checklists'],
];

export function telaCarro(raiz, { secaoInicial = 'combustivel' } = {}) {
  let ativa = secaoInicial;

  const tela = document.createElement('main');
  tela.className = 'app pilha';
  raiz.replaceChildren(tela);

  tela.innerHTML = `
    <header class="cabecalho">
      <div class="pilha-sm">
        <p class="rotulo">Veiculo</p>
        <h1>Carro</h1>
      </div>
    </header>

    <div class="segmento" role="tablist" aria-label="Secao"></div>
    <div id="secao" class="pilha"></div>
  `;

  const barra = tela.querySelector('.segmento');
  const alvo = tela.querySelector('#secao');

  function desenharBarra() {
    barra.innerHTML = SECOES.map(([id, rotulo]) => `
      <button type="button" role="tab" data-s="${id}"
              aria-selected="${id === ativa}">${rotulo}</button>
    `).join('');

    barra.querySelectorAll('[data-s]').forEach((b) =>
      b.addEventListener('click', () => {
        if (b.dataset.s === ativa) return;
        ativa = b.dataset.s;
        desenharBarra();
        abrirSecao();
      })
    );
  }

  function abrirSecao() {
    if (ativa === 'combustivel') return secaoCombustivel(alvo);
    if (ativa === 'manutencao') return secaoManutencao(alvo);
    return secaoChecklists(alvo);
  }

  desenharBarra();
  abrirSecao();
}
