// =====================================================================
// Inicio.
//
// Responde em uma tela: quanto ganhei, quanto gastei, quanto sobrou --
// e permite registrar sem sair daqui.
// =====================================================================

import { listarMovimentos, listarPlanos, odometroAtual } from '../dados.js';
import { resumirMovimentos } from '../lib/movimentos.js';
import { indicadoresPorKm } from '../lib/consumo.js';
import { pendencias } from '../lib/manutencao.js';
import { resolver, PERIODOS, ROTULOS } from '../lib/periodo.js';
import { moeda, valor, numero, iso } from '../lib/format.js';
import { esc } from '../lib/html.js';
import { vazio } from '../ui/vazio.js';
import { abrirLancamento } from '../ui/lancamento.js';
import { abrirAbastecimento } from '../ui/abastecimento.js';

export function telaDashboard(raiz, { perfil, ir }) {
  let periodoNome = 'hoje';
  let personalizado = null;

  const secao = document.createElement('main');
  secao.className = 'app pilha';
  raiz.replaceChildren(secao);

  async function carregar() {
    const periodo = resolver(periodoNome, personalizado);

    secao.innerHTML = esqueleto(periodo);
    ligarFiltros();

    let movimentos = [];
    let planos = [];
    let odometro = null;
    try {
      // Nenhuma consulta depende da outra: em paralelo o dashboard abre
      // numa fracao do tempo que levaria em sequencia.
      [movimentos, planos, odometro] = await Promise.all([
        listarMovimentos({ de: periodo.de, ate: periodo.ate }),
        listarPlanos(),
        odometroAtual(),
      ]);
    } catch (e) {
      secao.querySelector('#conteudo').innerHTML =
        `<div class="aviso aviso-erro">${esc(e.message)}</div>`;
      return;
    }

    secao.querySelector('#conteudo').innerHTML = corpo(
      consolidar(movimentos, periodo),
      movimentos,
      periodo,
      pendencias(planos, odometro)
    );
    ligarAcoes();
  }

  /**
   * Resume o periodo a partir da lista unificada.
   *
   * Os abastecimentos saem da propria lista em vez de uma consulta
   * separada: o dado ja veio, e buscar de novo so criaria a chance de
   * as duas copias discordarem.
   */
  function consolidar(movimentos, periodo) {
    const r = resumirMovimentos(movimentos, periodo.dias);

    const abastecimentos = movimentos
      .filter((m) => m.origem === 'abastecimento')
      .map((m) => m.registro);

    return {
      ...r,
      ...indicadoresPorKm({
        abastecimentos,
        ganhos: r.ganhos,
        gastos: r.gastos,
      }),
    };
  }

  // --- Marcacao --------------------------------------------------------

  function esqueleto(periodo) {
    const nome = (perfil?.nome || '').split(' ')[0];
    return `
      <header class="cabecalho">
        <div class="pilha-sm">
          <p class="rotulo">${esc(periodo.rotulo)}</p>
          <h1>${nome ? `Ola, ${esc(nome)}` : 'Giro'}</h1>
        </div>
      </header>

      <nav class="chips chips-filtro" aria-label="Periodo">
        ${PERIODOS.map((p) => `
          <button type="button" class="chip" data-p="${p}"
                  aria-pressed="${p === periodoNome}">${ROTULOS[p]}</button>
        `).join('')}
        <button type="button" class="chip" data-p="personalizado"
                aria-pressed="${periodoNome === 'personalizado'}">Escolher</button>
      </nav>

      <div id="conteudo" class="pilha">
        <div class="cartao"><div class="carregando-bloco"></div></div>
      </div>
    `;
  }

  /**
   * Alerta de manutencao.
   *
   * Aparece logo abaixo do placar, antes dos indicadores: uma correia
   * vencida importa mais do que o ganho por km. Some por completo
   * quando nao ha nada pendente -- um cartao verde dizendo "tudo em dia"
   * seria ruido em todas as aberturas do app.
   */
  function alerta(lista) {
    if (!lista.length) return '';

    const atrasadas = lista.filter((p) => p.aviso.status === 'atrasada');
    const grave = atrasadas.length > 0;
    const primeira = lista[0];
    const resto = lista.length - 1;

    return `
      <button type="button" class="alerta-manut ${grave ? 'grave' : ''}" data-ir="manutencao">
        <span class="selo selo-${primeira.aviso.status}">
          ${grave ? 'Atrasada' : 'Proxima'}
        </span>
        <span class="alerta-texto">
          <strong>${esc(primeira.titulo)}</strong>
          <span class="apoio">${esc(primeira.aviso.texto)}${
            resto > 0 ? ` &middot; e mais ${resto}` : ''
          }</span>
        </span>
        <span class="alerta-seta" aria-hidden="true">&rsaquo;</span>
      </button>`;
  }

  function corpo(r, movimentos, periodo, avisos) {
    const positivo = r.liquido >= 0;
    const recentes = movimentos.slice(0, 5);

    return `
      <section class="placar" aria-label="Resumo do periodo">
        <div class="placar-topo">
          <div class="placar-lado">
            <span class="rotulo">Ganhos</span>
            <strong class="num placar-valor pos">${moeda(r.ganhos)}</strong>
          </div>
          <div class="placar-lado">
            <span class="rotulo">Gastos</span>
            <strong class="num placar-valor neg">${moeda(r.gastos)}</strong>
          </div>
        </div>
        <div class="placar-fundo ${positivo ? 'positivo' : 'negativo'}">
          <span class="rotulo">${positivo ? 'Sobrou' : 'Faltou'}</span>
          <strong class="num placar-liquido">R$ ${valor(Math.abs(r.liquido))}</strong>
        </div>
      </section>

      ${alerta(avisos)}

      <section class="metricas" aria-label="Indicadores">
        ${metrica('Corridas', numero(r.corridas))}
        ${metrica('Por corrida', r.corridas ? moeda(r.porCorrida) : '--')}
        ${metrica(periodo.dias > 1 ? 'Media/dia' : 'Liquido', moeda(r.mediaDiaria))}
      </section>

      ${r.km ? `
        <section class="metricas" aria-label="Indicadores por quilometro">
          ${metrica('Rodados', `${numero(r.km)} km`)}
          ${metrica('Custo/km', r.custoPorKm ? moeda(r.custoPorKm) : '--')}
          ${metrica('Ganho/km', r.ganhoPorKm ? moeda(r.ganhoPorKm) : '--')}
        </section>` : ''}

      ${r.combustivel > 0 || r.manutencao > 0 ? `
        <p class="apoio reparticao">
          ${r.combustivel > 0 ? `Combustivel <strong class="num">${moeda(r.combustivel)}</strong>` : ''}
          ${r.combustivel > 0 && r.manutencao > 0 ? '<span aria-hidden="true">&middot;</span>' : ''}
          ${r.manutencao > 0 ? `Oficina <strong class="num">${moeda(r.manutencao)}</strong>` : ''}
        </p>` : ''}

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

      ${recentes.length ? `
        <section class="pilha-sm">
          <div class="linha-entre">
            <h2>Ultimos lancamentos</h2>
            <button class="btn-texto" type="button" data-ir="financas">Ver todos</button>
          </div>
          <ul class="lista">
            ${recentes.map(item).join('')}
          </ul>
        </section>
      ` : `
        ${vazio({
          arte: 'dinheiro',
          titulo: `Nada registrado ${periodo.rotulo.toLowerCase()}.`,
          apoio: 'Toque em Ganho, Gasto ou Abastecer para comecar.',
        })}
      `}

      <button type="button" class="link-relatorios" data-ir="relatorios">
        <span>
          <strong>Relatorios</strong>
          <span class="apoio">Periodos longos, gastos por categoria e evolucao</span>
        </span>
        <span class="alerta-seta" aria-hidden="true">&rsaquo;</span>
      </button>
    `;
  }

  function metrica(rotulo, texto) {
    return `
      <div class="metrica">
        <span class="rotulo">${rotulo}</span>
        <strong class="num">${texto}</strong>
      </div>`;
  }

  function item(m) {
    const entrada = m.tipo === 'entrada';
    const detalhe = m.detalhe.join(' · ');
    return `
      <li class="lista-item${m.pendente ? ' pendente' : ''}">
        <span class="ponto ${entrada ? 'pos' : 'neg'}" aria-hidden="true"></span>
        <div class="lista-texto">
          <strong>${esc(m.titulo)}${m.anexo ? ' \u{1F4CE}' : ''}</strong>
          ${detalhe ? `<span class="apoio">${esc(detalhe)}</span>` : ''}
        </div>
        <span class="num lista-valor ${entrada ? 'pos' : 'neg'}">
          ${m.valor > 0 ? `${entrada ? '+' : '−'} ${moeda(m.valor)}` : '--'}
        </span>
      </li>`;
  }

  // --- Eventos ----------------------------------------------------------

  function ligarFiltros() {
    secao.querySelectorAll('[data-p]').forEach((botao) => {
      botao.addEventListener('click', async () => {
        const escolha = botao.dataset.p;
        if (escolha === 'personalizado') {
          const intervalo = await escolherPeriodo(personalizado);
          if (!intervalo) return;
          personalizado = intervalo;
        }
        periodoNome = escolha;
        carregar();
      });
    });
  }

  function ligarAcoes() {
    secao.querySelectorAll('[data-acao]').forEach((botao) => {
      botao.addEventListener('click', () => {
        const acao = botao.dataset.acao;
        if (acao === 'abastecer') abrirAbastecimento({ aoSalvar: carregar });
        else abrirLancamento({ tipo: acao, aoSalvar: carregar });
      });
    });

    secao.querySelector('[data-ir="financas"]')
      ?.addEventListener('click', () => ir('financas'));

    secao.querySelector('[data-ir="manutencao"]')
      ?.addEventListener('click', () => ir('carro', { secaoInicial: 'manutencao' }));

    secao.querySelector('[data-ir="relatorios"]')
      ?.addEventListener('click', () => ir('relatorios'));
  }

  carregar();
  return { recarregar: carregar };
}


// --- Escolha de periodo personalizado ---------------------------------

function escolherPeriodo(atual) {
  return new Promise(async (resolverPromise) => {
    const { abrirSheet } = await import('../ui/sheet.js');

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
