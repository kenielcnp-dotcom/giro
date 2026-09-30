// =====================================================================
// Formulario de abastecimento.
//
// Valor, litros e preco por litro se completam: preencher dois calcula
// o terceiro. No posto voce sabe o valor que mandou por e o preco do
// painel da bomba -- com esses dois o app deduz os litros sozinho.
// =====================================================================

import {
  criarAbastecimento, atualizarAbastecimento,
  enviarComprovante, apagarComprovante, listarAbastecimentos,
} from '../dados.js';
import { iso, lerValor, valor as fmtValor, numero } from '../lib/format.js';
import { esc } from '../lib/html.js';
import { abrirSheet } from './sheet.js';
import { controleFoto } from './foto.js';
import { toast } from './toast.js';

const COMBUSTIVEIS = ['Gasolina', 'Etanol', 'Diesel', 'GNV'];

export async function abrirAbastecimento({ registro = null, aoSalvar, aoExcluir }) {
  const editando = Boolean(registro);

  // Sugere o ultimo odometro conhecido: o numero do painel so cresce, e
  // ver o anterior evita digitar um valor menor por engano.
  let ultimoOdometro = null;
  if (!editando) {
    try {
      const recentes = await listarAbastecimentos({ limite: 1 });
      ultimoOdometro = recentes[0]?.odometro ?? null;
    } catch {
      // Sugestao e conveniencia; sem ela o formulario funciona igual.
    }
  }

  const form = document.createElement('form');
  form.className = 'pilha';
  form.noValidate = true;

  form.innerHTML = `
    <div class="valor-campo">
      <span class="valor-moeda" aria-hidden="true">R$</span>
      <input class="valor-entrada num" id="valor" name="valor"
             type="text" inputmode="decimal" autocomplete="off"
             placeholder="0,00" autofocus aria-label="Valor total"
             value="${registro ? fmtValor(registro.valor) : ''}">
    </div>

    <div class="dupla">
      <div class="campo">
        <label for="litros">Litros</label>
        <input class="entrada num" id="litros" name="litros" type="text"
               inputmode="decimal" autocomplete="off" placeholder="0,000"
               value="${registro?.litros ? numero(registro.litros) : ''}">
      </div>
      <div class="campo">
        <label for="preco">Preco/litro</label>
        <input class="entrada num" id="preco" name="preco" type="text"
               inputmode="decimal" autocomplete="off" placeholder="0,000"
               value="${registro?.preco_litro ? numero(registro.preco_litro) : ''}">
      </div>
    </div>
    <p class="apoio" id="dica-calculo" hidden></p>

    <div class="campo">
      <label for="odometro">Km do painel</label>
      <input class="entrada num" id="odometro" name="odometro" type="text"
             inputmode="numeric" autocomplete="off"
             placeholder="${ultimoOdometro ? `anterior: ${numero(ultimoOdometro)}` : 'opcional'}"
             value="${registro?.odometro ?? ''}">
      <span class="apoio">Usado para calcular consumo e custo por km.</span>
    </div>

    <div class="pilha-sm">
      <span class="rotulo">Combustivel</span>
      <div class="chips" role="radiogroup" aria-label="Tipo de combustivel">
        ${COMBUSTIVEIS.map((c) => `
          <button type="button" class="chip" role="radio" data-comb="${c}"
                  aria-checked="${(registro?.combustivel ?? 'Gasolina') === c}">${c}</button>
        `).join('')}
      </div>
    </div>

    <div data-foto></div>

    <details class="mais" ${editando ? 'open' : ''}>
      <summary>Mais detalhes</summary>
      <div class="pilha" style="padding-top: var(--e-4);">
        <div class="campo">
          <label for="data">Data</label>
          <input class="entrada" id="data" name="data" type="date"
                 value="${registro?.data ?? iso()}" max="${iso()}">
        </div>
        <div class="campo">
          <label for="posto">Posto</label>
          <input class="entrada" id="posto" name="posto" type="text"
                 autocomplete="off" placeholder="opcional"
                 value="${esc(registro?.posto ?? '')}">
        </div>
        <div class="campo">
          <label for="obs">Observacao</label>
          <input class="entrada" id="obs" name="obs" type="text"
                 autocomplete="off" placeholder="opcional"
                 value="${esc(registro?.obs ?? '')}">
        </div>
      </div>
    </details>

    <div id="erro" hidden class="aviso aviso-erro" role="alert"></div>

    <button class="btn btn-principal btn-bloco" type="submit" id="salvar">
      ${editando ? 'Salvar alteracoes' : 'Registrar abastecimento'}
    </button>

    ${editando && aoExcluir ? `
      <button class="btn-texto btn-texto-perigo" type="button" id="excluir">
        Excluir abastecimento
      </button>` : ''}
  `;

  const foto = controleFoto({ caminhoAtual: registro?.comprovante ?? null });
  form.querySelector('[data-foto]').replaceWith(foto.elemento);

  const { fechar } = abrirSheet({
    titulo: editando ? 'Editar abastecimento' : 'Abastecer',
    corpo: form,
  });

  // --- Valor / litros / preco se completam ----------------------------
  const campoValor = form.querySelector('#valor');
  const campoLitros = form.querySelector('#litros');
  const campoPreco = form.querySelector('#preco');
  const dica = form.querySelector('#dica-calculo');

  function completar(origem) {
    const v = lerValor(campoValor.value);
    const l = lerValor(campoLitros.value);
    const p = lerValor(campoPreco.value);

    // Preenche o que falta a partir dos dois que existem. O campo que
    // esta sendo digitado nunca e sobrescrito, senao se apagaria
    // sozinho no meio da digitacao.
    if (v && p && origem !== 'litros') {
      campoLitros.value = numero(Math.round((v / p) * 1000) / 1000);
      avisar(`${(v / p).toFixed(3)} litros a R$ ${p.toFixed(3)}`);
    } else if (v && l && origem !== 'preco') {
      campoPreco.value = numero(Math.round((v / l) * 1000) / 1000);
      avisar(`R$ ${(v / l).toFixed(3)} por litro`);
    } else {
      dica.hidden = true;
    }
  }

  function avisar(texto) {
    dica.textContent = texto;
    dica.hidden = false;
  }

  campoValor.addEventListener('input', () => completar('valor'));
  campoLitros.addEventListener('input', () => completar('litros'));
  campoPreco.addEventListener('input', () => completar('preco'));

  // --- Combustivel ------------------------------------------------------
  let combustivel = registro?.combustivel ?? 'Gasolina';
  const chips = [...form.querySelectorAll('[data-comb]')];
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      combustivel = chip.dataset.comb;
      chips.forEach((c) => c.setAttribute('aria-checked', String(c === chip)));
    });
  });

  // --- Envio ------------------------------------------------------------
  const botao = form.querySelector('#salvar');
  const caixaErro = form.querySelector('#erro');

  function mostrarErro(texto) {
    caixaErro.textContent = texto;
    caixaErro.hidden = false;
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    caixaErro.hidden = true;

    const v = lerValor(campoValor.value);
    if (v === null) {
      campoValor.focus();
      return mostrarErro('Informe o valor do abastecimento.');
    }

    const odometroTexto = form.querySelector('#odometro').value.replace(/\D/g, '');
    const odometro = odometroTexto ? Number(odometroTexto) : null;

    if (odometro !== null && ultimoOdometro && odometro < ultimoOdometro) {
      return mostrarErro(
        `O km do painel (${numero(odometro)}) esta menor que o anterior (${numero(ultimoOdometro)}). Confira o numero.`
      );
    }

    const dados = new FormData(form);
    const campos = {
      valor: v,
      litros: lerValor(campoLitros.value),
      odometro,
      combustivel,
      data: dados.get('data') || iso(),
      posto: dados.get('posto')?.trim() || null,
      obs: dados.get('obs')?.trim() || null,
      // preco_litro nao vai: e coluna calculada pelo banco.
    };

    botao.disabled = true;
    botao.innerHTML = '<span class="girando"></span>';

    try {
      // A imagem sobe primeiro. Se falhar, nada e gravado e da para
      // tentar de novo sem ter criado um registro pela metade.
      if (foto.arquivo) campos.comprovante = await enviarComprovante(foto.arquivo);
      else if (foto.descartar) campos.comprovante = null;

      const salvo = editando
        ? await atualizarAbastecimento(registro.id, campos)
        : await criarAbastecimento(campos);

      // So depois de gravar e que a imagem antiga e descartada.
      if (foto.descartar) await apagarComprovante(foto.caminhoAntigo);

      fechar();
      toast(editando
        ? 'Abastecimento atualizado.'
        : `Abastecimento de R$ ${fmtValor(v)} registrado.`);
      aoSalvar?.(salvo);
    } catch (e) {
      mostrarErro(e.message);
      botao.disabled = false;
      botao.textContent = editando ? 'Salvar alteracoes' : 'Registrar abastecimento';
    }
  });

  form.querySelector('#excluir')?.addEventListener('click', async (ev) => {
    ev.currentTarget.disabled = true;
    const excluiu = await aoExcluir();
    if (excluiu) fechar();
    else ev.currentTarget.disabled = false;
  });
}
