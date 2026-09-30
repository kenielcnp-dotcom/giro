// =====================================================================
// Financas: a linha do tempo completa do dinheiro, agrupada por dia.
//
// Mostra as tres origens juntas -- lancamento, abastecimento e
// manutencao -- porque do ponto de vista de quem olha o historico,
// R$ 200 de combustivel e R$ 200 de almoco sao a mesma coisa: dinheiro
// que saiu. Em que tabela cada um mora e problema do banco, nao seu.
//
// Tocar em qualquer linha abre o formulario da origem certa.
// =====================================================================

import {
  listarMovimentos,
  excluirTransacao, excluirAbastecimento, excluirManutencao,
} from '../dados.js';
import { resumirMovimentos, agruparMovimentos } from '../lib/movimentos.js';
import { resolver, PERIODOS, ROTULOS } from '../lib/periodo.js';
import { moeda, dataRelativa } from '../lib/format.js';
import { esc } from '../lib/html.js';
import { vazio } from '../ui/vazio.js';
import { abrirLancamento } from '../ui/lancamento.js';
import { abrirAbastecimento } from '../ui/abastecimento.js';
import { abrirManutencao } from '../ui/manutencao.js';
import { confirmar } from '../ui/confirmar.js';
import { toast, toastErro } from '../ui/toast.js';

const MARCA = {
  transacao: '',
  abastecimento: 'Combustivel',
  manutencao: 'Oficina',
};

export function telaFinancas(raiz) {
  let periodoNome = 'mes';
  let filtroTipo = null;           // null | 'entrada' | 'saida'
  let movimentos = [];

  const secao = document.createElement('main');
  secao.className = 'app pilha';
  raiz.replaceChildren(secao);

  async function carregar() {
    const periodo = resolver(periodoNome);
    secao.innerHTML = esqueleto(periodo);
    ligarFiltros();

    try {
      movimentos = await listarMovimentos({ de: periodo.de, ate: periodo.ate });
    } catch (e) {
      secao.querySelector('#lista').innerHTML =
        `<div class="aviso aviso-erro">${esc(e.message)}</div>`;
      return;
    }

    desenharLista(periodo);
  }

  function esqueleto(periodo) {
    return `
      <header class="cabecalho">
        <div class="pilha-sm">
          <p class="rotulo">Historico</p>
          <h1>Financas</h1>
        </div>
      </header>

      <nav class="chips chips-filtro" aria-label="Periodo">
        ${PERIODOS.map((p) => `
          <button type="button" class="chip" data-p="${p}"
                  aria-pressed="${p === periodoNome}">${ROTULOS[p]}</button>
        `).join('')}
      </nav>

      <section class="acoes acoes-tres" aria-label="Registrar">
        <button class="btn btn-entrada acao" type="button" data-acao="entrada">
          <span class="acao-sinal" aria-hidden="true">+</span> Ganho
        </button>
        <button class="btn btn-saida acao" type="button" data-acao="saida">
          <span class="acao-sinal" aria-hidden="true">&minus;</span> Gasto
        </button>
        <button class="btn btn-secundario acao" type="button" data-acao="abastecer">
          Abastecer
        </button>
      </section>

      <div class="segmento" role="tablist" aria-label="Tipo">
        <button type="button" role="tab" data-t="" aria-selected="${filtroTipo === null}">Tudo</button>
        <button type="button" role="tab" data-t="entrada" aria-selected="${filtroTipo === 'entrada'}">Entradas</button>
        <button type="button" role="tab" data-t="saida" aria-selected="${filtroTipo === 'saida'}">Saidas</button>
      </div>

      <div id="lista" class="pilha">
        <div class="cartao"><div class="carregando-bloco"></div></div>
      </div>
    `;
  }

  function desenharLista(periodo) {
    const alvo = secao.querySelector('#lista');

    // O resumo usa SEMPRE a lista inteira: filtrar por tipo muda o que
    // voce ve, nao o que voce ganhou e gastou no periodo.
    const r = resumirMovimentos(movimentos, periodo.dias);
    const visiveis = filtroTipo
      ? movimentos.filter((m) => m.tipo === filtroTipo)
      : movimentos;

    if (!movimentos.length) {
      alvo.innerHTML = `
        ${vazio({
          arte: 'dinheiro',
          titulo: `Nenhum movimento em ${periodo.rotulo.toLowerCase()}.`,
          apoio: 'Ganhos, gastos, abastecimentos e servicos aparecem aqui.',
        })}`;
      return;
    }

    alvo.innerHTML = `
      <div class="resumo-faixa">
        <div><span class="rotulo">Entradas</span><strong class="num pos">${moeda(r.ganhos)}</strong></div>
        <div><span class="rotulo">Saidas</span><strong class="num neg">${moeda(r.gastos)}</strong></div>
        <div><span class="rotulo">Saldo</span><strong class="num ${r.liquido >= 0 ? 'pos' : 'neg'}">${moeda(r.liquido)}</strong></div>
      </div>

      ${r.combustivel > 0 || r.manutencao > 0 ? `
        <p class="apoio reparticao">
          ${r.combustivel > 0 ? `Combustivel <strong class="num">${moeda(r.combustivel)}</strong>` : ''}
          ${r.combustivel > 0 && r.manutencao > 0 ? '<span aria-hidden="true">&middot;</span>' : ''}
          ${r.manutencao > 0 ? `Oficina <strong class="num">${moeda(r.manutencao)}</strong>` : ''}
        </p>` : ''}

      ${visiveis.length
        ? agruparMovimentos(visiveis).map(grupo).join('')
        : `<div class="vazio vazio-curto">
             <p class="apoio">Nenhuma ${filtroTipo === 'entrada' ? 'entrada' : 'saida'} neste periodo.</p>
           </div>`}
    `;

    alvo.querySelectorAll('[data-mov]').forEach((linha) => {
      linha.addEventListener('click', () => {
        const m = movimentos.find(
          (x) => `${x.origem}:${x.id}` === linha.dataset.mov
        );
        if (m) abrir(m);
      });
    });
  }

  function grupo([dia, itens]) {
    const saldo = itens.reduce(
      (s, m) => s + (m.tipo === 'entrada' ? m.valor : -m.valor), 0
    );
    return `
      <section class="grupo">
        <div class="grupo-topo">
          <h2>${esc(dataRelativa(dia))}</h2>
          <span class="num apoio ${saldo >= 0 ? 'pos' : 'neg'}">${moeda(saldo)}</span>
        </div>
        <ul class="lista">${itens.map(item).join('')}</ul>
      </section>`;
  }

  function item(m) {
    const entrada = m.tipo === 'entrada';
    const marca = MARCA[m.origem];
    const detalhe = m.detalhe.join(' · ');

    return `
      <li>
        <button type="button" class="lista-item lista-item-toque${m.pendente ? ' pendente' : ''}"
                data-mov="${m.origem}:${m.id}"${m.pendente ? ' disabled' : ''}>
          <span class="ponto ${entrada ? 'pos' : 'neg'}" aria-hidden="true"></span>
          <div class="lista-texto">
            <strong>${esc(m.titulo)}${m.anexo ? ' \u{1F4CE}' : ''}</strong>
            <span class="apoio">${
              [marca, detalhe].filter(Boolean).map(esc).join(' · ')
            }</span>
          </div>
          <span class="num lista-valor ${entrada ? 'pos' : 'neg'}">
            ${m.valor > 0 ? `${entrada ? '+' : '−'} ${moeda(m.valor)}` : '--'}
          </span>
        </button>
      </li>`;
  }

  // --- Abrir para editar -------------------------------------------------

  function abrir(m) {
    if (m.origem === 'abastecimento') {
      return abrirAbastecimento({
        registro: m.registro,
        aoSalvar: carregar,
        aoExcluir: () => remover(
          'Excluir abastecimento?',
          `${moeda(m.valor)} de ${dataRelativa(m.data).toLowerCase()}.`,
          () => excluirAbastecimento(m.id, m.registro.comprovante),
          m.registro.comprovante
        ),
      });
    }

    if (m.origem === 'manutencao') {
      return abrirManutencao({
        registro: m.registro,
        aoSalvar: carregar,
        aoExcluir: () => remover(
          'Excluir servico?',
          `${m.titulo} de ${dataRelativa(m.data).toLowerCase()}.`,
          () => excluirManutencao(m.id, m.registro.comprovante),
          m.registro.comprovante
        ),
      });
    }

    abrirLancamento({
      tipo: m.tipo,
      transacao: m.registro,
      aoSalvar: carregar,
      aoExcluir: () => remover(
        'Excluir lancamento?',
        `${m.titulo} de ${moeda(m.valor)}.`,
        () => excluirTransacao(m.id)
      ),
    });
  }

  async function remover(titulo, texto, acao, temAnexo = false) {
    const certeza = await confirmar({
      titulo,
      texto: `${texto}${temAnexo ? ' O comprovante tambem sera apagado.' : ''} Nao da para desfazer.`,
      acao: 'Excluir',
      perigo: true,
    });
    if (!certeza) return false;

    try {
      await acao();
      toast('Registro excluido.');
      carregar();
      return true;
    } catch (e) {
      toastErro(e.message);
      return false;
    }
  }

  function ligarFiltros() {
    // As mesmas tres acoes do Inicio. Ficam aqui porque e comum
    // perceber um lancamento que faltou justamente olhando o historico,
    // e voltar ao Inicio so para registrar seria ida e volta a toa.
    secao.querySelectorAll('[data-acao]').forEach((b) =>
      b.addEventListener('click', () => {
        const acao = b.dataset.acao;
        if (acao === 'abastecer') abrirAbastecimento({ aoSalvar: carregar });
        else abrirLancamento({ tipo: acao, aoSalvar: carregar });
      })
    );

    secao.querySelectorAll('[data-p]').forEach((b) =>
      b.addEventListener('click', () => { periodoNome = b.dataset.p; carregar(); })
    );
    // O filtro de tipo nao refaz a consulta: os dados ja estao aqui, e
    // redesenhar e instantaneo.
    secao.querySelectorAll('[data-t]').forEach((b) =>
      b.addEventListener('click', () => {
        filtroTipo = b.dataset.t || null;
        secao.querySelectorAll('[data-t]').forEach((o) =>
          o.setAttribute('aria-selected', String(o === b))
        );
        desenharLista(resolver(periodoNome));
      })
    );
  }

  carregar();
  return { recarregar: carregar };
}
