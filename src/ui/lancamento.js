// =====================================================================
// Formulario de lancamento (entrada ou saida).
//
// A meta e tres toques: abrir, digitar o valor, salvar. Por isso o campo
// de valor ja vem focado, a categoria ja vem escolhida, e data, hora,
// plataforma e observacao ficam recolhidos -- presentes para quem
// precisa, invisiveis para quem nao precisa.
// =====================================================================

import { listarCategorias, criarTransacao, atualizarTransacao } from '../dados.js';
import { iso, hora, lerValor, valor as fmtValor } from '../lib/format.js';
import { esc } from '../lib/html.js';
import { abrirSheet } from './sheet.js';
import { toast, toastErro } from './toast.js';

export async function abrirLancamento({ tipo, transacao = null, aoSalvar, aoExcluir }) {
  const editando = Boolean(transacao);
  const entrada = tipo === 'entrada';

  let categorias = [];
  try {
    categorias = await listarCategorias(tipo);
  } catch (e) {
    return toastErro(e.message);
  }

  // Ao criar, a primeira categoria ja vem marcada: para entrada e
  // "Corrida", que cobre a maioria esmagadora dos registros.
  const categoriaInicial =
    transacao?.categoria_id ?? categorias[0]?.id ?? null;

  const form = document.createElement('form');
  form.className = 'pilha';
  form.noValidate = true;

  form.innerHTML = `
    <div class="valor-campo">
      <span class="valor-moeda" aria-hidden="true">R$</span>
      <input class="valor-entrada num" id="valor" name="valor"
             type="text" inputmode="decimal" autocomplete="off"
             placeholder="0,00" autofocus
             aria-label="Valor em reais"
             value="${transacao ? fmtValor(transacao.valor) : ''}">
    </div>

    <div class="pilha-sm">
      <span class="rotulo">Categoria</span>
      <div class="chips" role="radiogroup" aria-label="Categoria">
        ${categorias.map((c) => `
          <button type="button" class="chip" role="radio"
                  data-id="${c.id}"
                  aria-checked="${c.id === categoriaInicial}">${esc(c.nome)}</button>
        `).join('')}
      </div>
    </div>

    <details class="mais" ${editando ? 'open' : ''}>
      <summary>Mais detalhes</summary>
      <div class="pilha" style="padding-top: var(--e-4);">
        <div class="dupla">
          <div class="campo">
            <label for="data">Data</label>
            <input class="entrada" id="data" name="data" type="date"
                   value="${transacao?.data ?? iso()}" max="${iso()}">
          </div>
          <div class="campo">
            <label for="hora">Hora</label>
            <input class="entrada" id="hora" name="hora" type="time"
                   value="${transacao?.hora?.slice(0, 5) ?? hora()}">
          </div>
        </div>

        ${entrada ? `
          <div class="campo">
            <label for="plataforma">Plataforma</label>
            <input class="entrada" id="plataforma" name="plataforma" type="text"
                   list="plataformas" autocomplete="off" placeholder="Uber, 99, particular..."
                   value="${esc(transacao?.plataforma ?? '')}">
            <datalist id="plataformas">
              <option value="Uber"><option value="99"><option value="inDrive">
              <option value="Particular"><option value="Cabify">
            </datalist>
          </div>` : ''}

        <div class="campo">
          <label for="obs">Observacao</label>
          <input class="entrada" id="obs" name="obs" type="text"
                 autocomplete="off" placeholder="opcional"
                 value="${esc(transacao?.obs ?? '')}">
        </div>
      </div>
    </details>

    <div id="erro" hidden class="aviso aviso-erro" role="alert"></div>

    <button class="btn ${entrada ? 'btn-entrada' : 'btn-saida'} btn-bloco" type="submit" id="salvar">
      ${editando ? 'Salvar alteracoes' : (entrada ? 'Registrar ganho' : 'Registrar gasto')}
    </button>

    ${editando && aoExcluir ? `
      <button class="btn-texto btn-texto-perigo" type="button" id="excluir">
        Excluir lancamento
      </button>` : ''}
  `;

  const { fechar } = abrirSheet({
    titulo: editando
      ? 'Editar lancamento'
      : (entrada ? 'Registrar ganho' : 'Registrar gasto'),
    corpo: form,
  });

  // --- Chips de categoria ---------------------------------------------
  let categoriaId = categoriaInicial;
  const chips = [...form.querySelectorAll('.chip')];

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      categoriaId = chip.dataset.id;
      chips.forEach((c) => c.setAttribute('aria-checked', String(c === chip)));
    });
  });

  // --- Envio ------------------------------------------------------------
  const botao = form.querySelector('#salvar');
  const campoValor = form.querySelector('#valor');
  const caixaErro = form.querySelector('#erro');

  function mostrarErro(texto) {
    caixaErro.textContent = texto;
    caixaErro.hidden = false;
    campoValor.setAttribute('aria-invalid', 'true');
  }

  campoValor.addEventListener('input', () => {
    caixaErro.hidden = true;
    campoValor.removeAttribute('aria-invalid');
  });

  // A confirmacao e a recarga da lista sao responsabilidade de quem
  // chamou; aqui so fechamos se a exclusao foi levada a cabo.
  form.querySelector('#excluir')?.addEventListener('click', async (ev) => {
    ev.currentTarget.disabled = true;
    const excluiu = await aoExcluir();
    if (excluiu) fechar();
    else ev.currentTarget.disabled = false;
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();

    const v = lerValor(campoValor.value);
    if (v === null) {
      campoValor.focus();
      return mostrarErro('Informe um valor maior que zero.');
    }

    const dados = new FormData(form);
    const campos = {
      tipo,
      valor: v,
      categoria_id: categoriaId,
      data: dados.get('data') || iso(),
      hora: dados.get('hora') || null,
      obs: dados.get('obs')?.trim() || null,
    };
    if (entrada) campos.plataforma = dados.get('plataforma')?.trim() || null;

    botao.disabled = true;
    botao.innerHTML = '<span class="girando"></span>';

    try {
      const salvo = editando
        ? await atualizarTransacao(transacao.id, campos)
        : await criarTransacao(campos);

      fechar();
      toast(
        editando
          ? 'Lancamento atualizado.'
          : `${entrada ? 'Ganho' : 'Gasto'} de R$ ${fmtValor(v)} registrado.`
      );
      aoSalvar?.(salvo);
    } catch (e) {
      mostrarErro(e.message);
      botao.disabled = false;
      botao.textContent = editando
        ? 'Salvar alteracoes'
        : (entrada ? 'Registrar ganho' : 'Registrar gasto');
    }
  });
}
