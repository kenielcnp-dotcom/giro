// =====================================================================
// Escolha de periodo personalizado (De / Ate).
//
// Usado pelo Inicio e pelos Relatorios. Resolve com { de, ate } ou com
// null se a folha for fechada sem aplicar -- quem chamou mantem o
// periodo que estava.
// =====================================================================

import { iso } from '../lib/format.js';
import { abrirSheet } from './sheet.js';

export function escolherPeriodo(atual) {
  return new Promise((resolverPromise) => {
    const form = document.createElement('form');
    form.className = 'pilha';
    form.innerHTML = `
      <div class="dupla">
        <div class="campo">
          <label for="de">De</label>
          <input class="entrada" id="de" name="de" type="date" required
                 max="${iso()}" value="${atual?.de ?? iso()}">
        </div>
        <div class="campo">
          <label for="ate">Ate</label>
          <input class="entrada" id="ate" name="ate" type="date" required
                 max="${iso()}" value="${atual?.ate ?? iso()}">
        </div>
      </div>
      <button class="btn btn-principal btn-bloco" type="submit">Aplicar</button>
    `;

    let respondido = false;
    const { fechar } = abrirSheet({
      titulo: 'Escolher periodo',
      corpo: form,
      aoFechar: () => { if (!respondido) resolverPromise(null); },
    });

    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const dados = new FormData(form);
      const de = dados.get('de');
      const ate = dados.get('ate');
      if (!de || !ate) return;
      respondido = true;
      fechar();
      resolverPromise({ de, ate });
    });
  });
}
