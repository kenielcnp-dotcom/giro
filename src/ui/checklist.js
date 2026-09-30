// =====================================================================
// Editor de checklist: titulo e itens.
// =====================================================================

import { criarChecklist, renomearChecklist, salvarItens } from '../dados.js';
import { esc } from '../lib/html.js';
import { abrirSheet } from './sheet.js';
import { toast } from './toast.js';

export function abrirEditorChecklist({ checklist = null, aoSalvar, aoExcluir }) {
  const editando = Boolean(checklist);

  // Copia local: nada e gravado enquanto a pessoa nao confirma. Itens
  // novos entram sem id; e por isso que salvarItens sabe diferenciar
  // quem inserir de quem atualizar.
  let itens = editando
    ? checklist.itens.map((i) => ({ id: i.id, texto: i.texto }))
    : [{ texto: '' }];

  const form = document.createElement('form');
  form.className = 'pilha';
  form.noValidate = true;

  form.innerHTML = `
    <div class="campo">
      <label for="titulo">Nome do checklist</label>
      <input class="entrada" id="titulo" name="titulo" type="text" required
             autocomplete="off" autofocus placeholder="Conferencia diaria"
             value="${esc(checklist?.titulo ?? '')}">
    </div>

    <div class="pilha-sm">
      <span class="rotulo">Itens</span>
      <div id="itens" class="pilha-sm"></div>
      <button type="button" class="btn btn-secundario btn-bloco" id="adicionar">
        Adicionar item
      </button>
    </div>

    <div id="erro" hidden class="aviso aviso-erro" role="alert"></div>

    <button class="btn btn-principal btn-bloco" type="submit" id="salvar">
      ${editando ? 'Salvar alteracoes' : 'Criar checklist'}
    </button>

    ${editando && aoExcluir ? `
      <button class="btn-texto btn-texto-perigo" type="button" id="excluir">
        Excluir checklist
      </button>` : ''}
  `;

  const caixaItens = form.querySelector('#itens');

  function desenharItens(focarUltimo = false) {
    caixaItens.innerHTML = itens.map((item, i) => `
      <div class="item-edicao">
        <input class="entrada" type="text" data-i="${i}"
               autocomplete="off" placeholder="Conferir pneus"
               value="${esc(item.texto)}" aria-label="Item ${i + 1}">
        <button type="button" class="btn-remover" data-remover="${i}"
                aria-label="Remover item ${i + 1}">&times;</button>
      </div>
    `).join('');

    caixaItens.querySelectorAll('[data-i]').forEach((campo) => {
      // Guarda a digitacao no estado a cada tecla: sem isso, adicionar
      // ou remover uma linha redesenharia a lista e apagaria o que
      // estava escrito nas outras.
      campo.addEventListener('input', () => {
        itens[Number(campo.dataset.i)].texto = campo.value;
      });

      // Enter cria a proxima linha, como numa lista de verdade.
      campo.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        itens.push({ texto: '' });
        desenharItens(true);
      });
    });

    caixaItens.querySelectorAll('[data-remover]').forEach((botao) => {
      botao.addEventListener('click', () => {
        itens.splice(Number(botao.dataset.remover), 1);
        if (!itens.length) itens.push({ texto: '' });
        desenharItens();
      });
    });

    if (focarUltimo) {
      caixaItens.querySelector(`[data-i="${itens.length - 1}"]`)?.focus();
    }
  }

  desenharItens();

  const { fechar } = abrirSheet({
    titulo: editando ? 'Editar checklist' : 'Novo checklist',
    corpo: form,
  });

  form.querySelector('#adicionar').addEventListener('click', () => {
    itens.push({ texto: '' });
    desenharItens(true);
  });

  const botao = form.querySelector('#salvar');
  const caixaErro = form.querySelector('#erro');
  const mostrarErro = (t) => { caixaErro.textContent = t; caixaErro.hidden = false; };

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    caixaErro.hidden = true;

    const titulo = form.querySelector('#titulo').value.trim();
    if (!titulo) {
      form.querySelector('#titulo').focus();
      return mostrarErro('De um nome ao checklist.');
    }

    // Linhas em branco sao descartadas em silencio: deixar um campo
    // vazio no fim e o jeito normal de parar de digitar.
    const limpos = itens.filter((i) => i.texto.trim());
    if (!limpos.length) return mostrarErro('Adicione pelo menos um item.');

    botao.disabled = true;
    botao.innerHTML = '<span class="girando"></span>';

    try {
      if (editando) {
        if (titulo !== checklist.titulo) await renomearChecklist(checklist.id, titulo);
        await salvarItens(checklist.id, limpos);
      } else {
        await criarChecklist(titulo, limpos.map((i) => i.texto));
      }

      fechar();
      toast(editando ? 'Checklist atualizado.' : `${titulo} criado.`);
      aoSalvar?.();
    } catch (e) {
      mostrarErro(e.message);
      botao.disabled = false;
      botao.textContent = editando ? 'Salvar alteracoes' : 'Criar checklist';
    }
  });

  form.querySelector('#excluir')?.addEventListener('click', async (ev) => {
    ev.currentTarget.disabled = true;
    const excluiu = await aoExcluir();
    if (excluiu) fechar();
    else ev.currentTarget.disabled = false;
  });
}
