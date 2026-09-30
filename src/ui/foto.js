// =====================================================================
// Controle de comprovante: escolher, pre-visualizar, trocar, remover.
//
// Usado pelo abastecimento e pela manutencao. Guarda o estado de qual
// arquivo sobe e qual caminho antigo deve ser descartado, e entrega
// isso pronto na hora de salvar.
// =====================================================================

import { urlComprovante } from '../dados.js';
import { prepararImagem, tamanhoLegivel } from '../lib/imagem.js';
import { esc } from '../lib/html.js';
import { toastErro } from './toast.js';

export function controleFoto({ caminhoAtual = null, rotulo = 'Fotografar nota' } = {}) {
  let arquivoNovo = null;
  let remover = false;

  const raiz = document.createElement('div');
  raiz.className = 'campo';
  raiz.innerHTML = `
    <span class="rotulo">Comprovante</span>
    <div data-area></div>
    <input type="file" accept="image/*,application/pdf" capture="environment" hidden data-input>
  `;

  const area = raiz.querySelector('[data-area]');
  const input = raiz.querySelector('[data-input]');

  async function desenhar() {
    if (arquivoNovo) {
      const url = URL.createObjectURL(arquivoNovo);
      area.innerHTML = `
        <div class="foto-previa">
          <img src="${url}" alt="Previa do comprovante">
          <div class="foto-info">
            <span class="apoio">${esc(arquivoNovo.name)} &middot; ${tamanhoLegivel(arquivoNovo.size)}</span>
            <button type="button" class="btn-texto btn-texto-perigo" data-acao="tirar">Remover</button>
          </div>
        </div>`;
      // Libera a memoria assim que a imagem e pintada.
      area.querySelector('img').addEventListener('load', () => URL.revokeObjectURL(url), { once: true });

    } else if (caminhoAtual && !remover) {
      area.innerHTML = `<div class="foto-previa"><div class="carregando-bloco" style="height:140px"></div></div>`;
      try {
        const url = await urlComprovante(caminhoAtual);
        const pdf = caminhoAtual.toLowerCase().endsWith('.pdf');
        area.innerHTML = `
          <div class="foto-previa">
            ${pdf
              ? `<a class="btn btn-secundario btn-bloco" href="${url}" target="_blank" rel="noopener">Abrir PDF</a>`
              : `<a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="Comprovante enviado"></a>`}
            <div class="foto-info">
              <span class="apoio">${pdf ? 'Documento anexado' : 'Toque para ampliar'}</span>
              <button type="button" class="btn-texto btn-texto-perigo" data-acao="tirar">Remover</button>
            </div>
          </div>`;
      } catch (e) {
        area.innerHTML = `<div class="aviso aviso-erro">${esc(e.message)}</div>`;
      }

    } else {
      area.innerHTML = `
        <button type="button" class="btn btn-secundario btn-bloco" data-acao="escolher">
          ${esc(rotulo)}
        </button>`;
    }

    area.querySelector('[data-acao="escolher"]')?.addEventListener('click', () => input.click());
    area.querySelector('[data-acao="tirar"]')?.addEventListener('click', () => {
      arquivoNovo = null;
      if (caminhoAtual) remover = true;
      input.value = '';
      desenhar();
    });
  }

  input.addEventListener('change', async () => {
    const escolhido = input.files?.[0];
    if (!escolhido) return;

    area.innerHTML = '<p class="apoio">Preparando imagem...</p>';
    try {
      arquivoNovo = await prepararImagem(escolhido);
      // Trocar a foto tambem descarta a anterior.
      remover = Boolean(caminhoAtual);
    } catch (e) {
      toastErro(e.message);
      arquivoNovo = null;
    }
    desenhar();
  });

  desenhar();

  return {
    elemento: raiz,
    /** File a enviar, ou null. */
    get arquivo() { return arquivoNovo; },
    /** true quando o comprovante antigo deve sair do Storage. */
    get descartar() { return remover && Boolean(caminhoAtual); },
    /** Caminho antigo, para apagar depois de gravar. */
    get caminhoAntigo() { return caminhoAtual; },
  };
}
