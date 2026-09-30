// =====================================================================
// Secao Checklists da aba Carro.
//
// Cada checklist mostra o progresso de HOJE. Marcar grava na mesma
// linha do dia (upsert por checklist + data), entao dar e tirar um
// visto varias vezes nao enche o banco.
// =====================================================================

import {
  listarChecklists, criarChecklist, excluirChecklist,
  execucaoDoDia, salvarExecucao,
} from '../dados.js';
import { iso, dataRelativa } from '../lib/format.js';
import { esc } from '../lib/html.js';
import { vazio } from '../ui/vazio.js';
import { abrirEditorChecklist } from '../ui/checklist.js';
import { confirmar } from '../ui/confirmar.js';
import { toast, toastErro } from '../ui/toast.js';

// O exemplo do briefing, oferecido como atalho em vez de criado sozinho:
// um checklist que a pessoa nao pediu seria so mais uma coisa a apagar.
const DIARIO = [
  'Conferir pneus',
  'Conferir combustivel',
  'Conferir oleo',
  'Conferir documentos',
  'Conferir limpeza',
  'Conferir equipamentos',
];

export function secaoChecklists(alvo) {
  const hoje = iso();
  let checklists = [];
  const execucoes = new Map();   // checklistId -> { marcados }
  const pendentes = new Map();   // checklistId -> timeout de gravacao
  let aberto = null;             // qual checklist esta expandido

  async function carregar() {
    alvo.innerHTML = '<div class="cartao"><div class="carregando-bloco"></div></div>';
    try {
      checklists = await listarChecklists();

      const corridas = await Promise.all(
        checklists.map((c) => execucaoDoDia(c.id, hoje))
      );
      checklists.forEach((c, i) => {
        execucoes.set(c.id, corridas[i]?.marcados ?? {});
      });
    } catch (e) {
      alvo.innerHTML = `<div class="aviso aviso-erro">${esc(e.message)}</div>`;
      return;
    }

    // Com um so, ja abre expandido: esconder o unico conteudo da tela
    // atras de um toque nao ajuda ninguem.
    if (aberto === null && checklists.length === 1) aberto = checklists[0].id;

    desenhar();
  }

  function desenhar() {
    if (!checklists.length) {
      alvo.innerHTML = `
        ${vazio({
          arte: 'lista',
          titulo: 'Nenhum checklist ainda.',
          apoio: 'Use a sugestao abaixo ou monte o seu.',
        })}
        <button class="btn btn-principal btn-bloco acao" type="button" data-sugerido>
          Criar checklist diario
        </button>
        <button class="btn btn-secundario btn-bloco" type="button" data-novo>
          Montar do zero
        </button>`;
      ligar();
      return;
    }

    alvo.innerHTML = `
      <p class="apoio linha-nota">
        <span>Hoje</span>
        <strong>${esc(dataRelativa(hoje))}</strong>
      </p>

      ${checklists.map(cartao).join('')}

      <button class="btn btn-secundario btn-bloco" type="button" data-novo>
        Novo checklist
      </button>`;
    ligar();
  }

  function cartao(c) {
    const marcados = execucoes.get(c.id) ?? {};
    const feitos = c.itens.filter((i) => marcados[i.id]).length;
    const total = c.itens.length;
    const completo = total > 0 && feitos === total;
    const expandido = aberto === c.id;

    return `
      <section class="checklist ${completo ? 'completo' : ''}">
        <div class="checklist-topo">
          <button type="button" class="checklist-abrir" data-abrir="${c.id}"
                  aria-expanded="${expandido}">
            <span class="checklist-anel ${completo ? 'cheio' : ''}" aria-hidden="true">
              ${completo ? '&#10003;' : `${feitos}/${total}`}
            </span>
            <span class="lista-texto">
              <strong>${esc(c.titulo)}</strong>
              <span class="apoio">${
                completo ? 'Tudo conferido' : `${total - feitos} item(ns) faltando`
              }</span>
            </span>
            <span class="alerta-seta" aria-hidden="true">${expandido ? '&#8964;' : '&rsaquo;'}</span>
          </button>
          <button type="button" class="btn-concluir" data-editar="${c.id}"
                  aria-label="Editar ${esc(c.titulo)}">Editar</button>
        </div>

        ${expandido ? `
          <ul class="checklist-itens">
            ${c.itens.map((item) => `
              <li>
                <label class="checklist-item">
                  <input type="checkbox" data-item="${item.id}" data-lista="${c.id}"
                         ${marcados[item.id] ? 'checked' : ''}>
                  <span>${esc(item.texto)}</span>
                </label>
              </li>
            `).join('')}
          </ul>` : ''}
      </section>`;
  }

  // --- Eventos ----------------------------------------------------------

  function ligar() {
    alvo.querySelector('[data-novo]')?.addEventListener('click', () =>
      abrirEditorChecklist({ aoSalvar: carregar })
    );

    alvo.querySelector('[data-sugerido]')?.addEventListener('click', async (ev) => {
      ev.currentTarget.disabled = true;
      try {
        await criarChecklist('Conferencia diaria', DIARIO);
        toast('Checklist diario criado.');
        carregar();
      } catch (e) {
        toastErro(e.message);
        ev.currentTarget.disabled = false;
      }
    });

    alvo.querySelectorAll('[data-abrir]').forEach((b) =>
      b.addEventListener('click', () => {
        aberto = aberto === b.dataset.abrir ? null : b.dataset.abrir;
        desenhar();
      })
    );

    alvo.querySelectorAll('[data-editar]').forEach((b) =>
      b.addEventListener('click', () => {
        const c = checklists.find((x) => x.id === b.dataset.editar);
        if (c) editar(c);
      })
    );

    alvo.querySelectorAll('[data-item]').forEach((caixa) =>
      caixa.addEventListener('change', () => alternar(caixa))
    );
  }

  /**
   * Marca na hora e grava depois.
   *
   * O visto aparece no mesmo instante do toque; a gravacao espera meio
   * segundo. Conferir seis itens seguidos vira uma requisicao em vez de
   * seis, e nenhum toque fica esperando a rede.
   */
  function alternar(caixa) {
    const listaId = caixa.dataset.lista;
    const itemId = caixa.dataset.item;

    const marcados = { ...(execucoes.get(listaId) ?? {}) };
    if (caixa.checked) marcados[itemId] = true;
    else delete marcados[itemId];

    execucoes.set(listaId, marcados);
    atualizarContador(listaId);

    clearTimeout(pendentes.get(listaId));
    pendentes.set(listaId, setTimeout(async () => {
      pendentes.delete(listaId);
      try {
        await salvarExecucao(listaId, hoje, execucoes.get(listaId));
      } catch (e) {
        toastErro(e.message);
        carregar();   // recarrega para a tela nao mentir sobre o estado
      }
    }, 500));
  }

  /**
   * Atualiza so o contador e o anel, sem redesenhar a secao.
   *
   * Um innerHTML aqui recriaria as caixas e faria o foco saltar no meio
   * da conferencia -- justamente quando a pessoa esta tocando em
   * sequencia.
   */
  function atualizarContador(listaId) {
    const c = checklists.find((x) => x.id === listaId);
    if (!c) return;

    const marcados = execucoes.get(listaId) ?? {};
    const feitos = c.itens.filter((i) => marcados[i.id]).length;
    const total = c.itens.length;
    const completo = feitos === total;

    const secao = alvo.querySelector(`[data-abrir="${listaId}"]`)?.closest('.checklist');
    if (!secao) return;

    secao.classList.toggle('completo', completo);

    const anel = secao.querySelector('.checklist-anel');
    anel.classList.toggle('cheio', completo);
    anel.innerHTML = completo ? '&#10003;' : `${feitos}/${total}`;

    secao.querySelector('.lista-texto .apoio').textContent =
      completo ? 'Tudo conferido' : `${total - feitos} item(ns) faltando`;
  }

  function editar(c) {
    abrirEditorChecklist({
      checklist: c,
      aoSalvar: carregar,
      aoExcluir: async () => {
        const certeza = await confirmar({
          titulo: 'Excluir checklist?',
          texto: `${c.titulo} e todo o historico dele. Nao da para desfazer.`,
          acao: 'Excluir',
          perigo: true,
        });
        if (!certeza) return false;
        try {
          await excluirChecklist(c.id);
          if (aberto === c.id) aberto = null;
          toast('Checklist excluido.');
          carregar();
          return true;
        } catch (e) {
          toastErro(e.message);
          return false;
        }
      },
    });
  }

  carregar();
}
