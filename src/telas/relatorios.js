// =====================================================================
// Relatorios.
//
// Fica fora da barra de abas, acessivel pelo Inicio: e uma tela de
// sentar e analisar, nao de usar entre uma corrida e outra. Virar uma
// quinta aba custaria area de toque nas quatro que sao usadas todo dia.
//
// SOBRE OS GRAFICOS: so dois, e nenhum usa biblioteca. Uma barra e uma
// div com largura proporcional -- trazer um Chart.js de 200 KB para
// desenhar retangulos seria peso puro num app que abre no 4G.
// Descartei pizza (angulo e dificil de comparar) e linha (com poucos
// meses, sugere continuidade que o dado nao tem).
// =====================================================================

import { listarMovimentos } from '../dados.js';
import {
  resumirMovimentos, gastosPorCategoria, porMes, ganhosPorPlataforma,
} from '../lib/movimentos.js';
import { indicadoresPorKm, kmPorLitro } from '../lib/consumo.js';
import { resolver, PERIODOS_LONGOS, ROTULOS } from '../lib/periodo.js';
import { moeda, valor, numero, mesAno } from '../lib/format.js';
import { esc } from '../lib/html.js';
import { vazio } from '../ui/vazio.js';

export function telaRelatorios(raiz, { ir }) {
  let periodoNome = 'mes';

  const tela = document.createElement('main');
  tela.className = 'app pilha';
  raiz.replaceChildren(tela);

  async function carregar() {
    const periodo = resolver(periodoNome);
    tela.innerHTML = esqueleto(periodo);
    ligarTopo();

    let movimentos = [];
    try {
      movimentos = await listarMovimentos({ de: periodo.de, ate: periodo.ate });
    } catch (e) {
      tela.querySelector('#conteudo').innerHTML =
        `<div class="aviso aviso-erro">${esc(e.message)}</div>`;
      return;
    }

    tela.querySelector('#conteudo').innerHTML = movimentos.length
      ? corpo(movimentos, periodo)
      : vazio({
          arte: 'grafico',
          titulo: `Sem dados em ${periodo.rotulo.toLowerCase()}.`,
          apoio: 'Registre ganhos e gastos para ver os numeros aqui.',
        });
  }

  function esqueleto(periodo) {
    return `
      <header class="cabecalho pilha-sm">
        <button type="button" class="btn-voltar" data-voltar>
          <span aria-hidden="true">&lsaquo;</span> Inicio
        </button>
        <div class="pilha-sm">
          <p class="rotulo">${esc(periodo.rotulo)}</p>
          <h1>Relatorios</h1>
        </div>
      </header>

      <nav class="chips chips-filtro" aria-label="Periodo">
        ${PERIODOS_LONGOS.map((p) => `
          <button type="button" class="chip" data-p="${p}"
                  aria-pressed="${p === periodoNome}">${ROTULOS[p]}</button>
        `).join('')}
      </nav>

      <div id="conteudo" class="pilha">
        <div class="cartao"><div class="carregando-bloco"></div></div>
      </div>
    `;
  }

  function corpo(movimentos, periodo) {
    const r = resumirMovimentos(movimentos, periodo.dias);

    const abastecimentos = movimentos
      .filter((m) => m.origem === 'abastecimento')
      .map((m) => m.registro);

    const km = indicadoresPorKm({
      abastecimentos,
      ganhos: r.ganhos,
      gastos: r.gastos,
    });
    const consumo = kmPorLitro(abastecimentos);

    const categorias = gastosPorCategoria(movimentos);
    const plataformas = ganhosPorPlataforma(movimentos);
    const meses = porMes(movimentos);
    const positivo = r.liquido >= 0;

    return `
      <section class="placar" aria-label="Resultado">
        <div class="placar-topo">
          <div class="placar-lado">
            <span class="rotulo">Faturado</span>
            <strong class="num placar-valor pos">${moeda(r.ganhos)}</strong>
          </div>
          <div class="placar-lado">
            <span class="rotulo">Gasto</span>
            <strong class="num placar-valor neg">${moeda(r.gastos)}</strong>
          </div>
        </div>
        <div class="placar-fundo ${positivo ? 'positivo' : 'negativo'}">
          <span class="rotulo">${positivo ? 'Lucro liquido' : 'Prejuizo'}</span>
          <strong class="num placar-liquido">R$ ${valor(Math.abs(r.liquido))}</strong>
        </div>
      </section>

      ${bloco('Trabalho', [
        ['Corridas', numero(r.corridas)],
        ['Por corrida', r.corridas ? moeda(r.porCorrida) : '--'],
        ['Media por dia', moeda(r.mediaDiaria)],
      ])}

      ${km.km ? bloco('Quilometragem', [
        ['Rodados', `${numero(km.km)} km`],
        ['Ganho/km', km.ganhoPorKm ? moeda(km.ganhoPorKm) : '--'],
        ['Custo/km', km.custoPorKm ? moeda(km.custoPorKm) : '--'],
      ]) : ''}

      ${bloco('Veiculo', [
        ['Combustivel', moeda(r.combustivel)],
        ['Manutencao', moeda(r.manutencao)],
        ['Consumo', consumo ? `${consumo.toFixed(1)} km/l` : '--'],
      ])}

      ${categorias.length > 1 ? barras('Para onde vai o dinheiro', categorias, 'neg') : ''}

      ${plataformas.length > 1 ? barras('De onde vem o faturamento', plataformas, 'pos') : ''}

      ${meses.length > 1 ? evolucao(meses) : ''}
    `;
  }

  function bloco(titulo, pares) {
    return `
      <section class="pilha-sm">
        <h2>${titulo}</h2>
        <div class="metricas">
          ${pares.map(([rotulo, texto]) => `
            <div class="metrica">
              <span class="rotulo">${rotulo}</span>
              <strong class="num">${texto}</strong>
            </div>`).join('')}
        </div>
      </section>`;
  }

  /**
   * Barras horizontais proporcionais.
   *
   * Horizontal porque os rotulos sao palavras ("Combustivel",
   * "Alimentacao"): na vertical elas teriam que virar de lado ou ser
   * abreviadas, e a comparacao e o que importa aqui.
   */
  function barras(titulo, dados, cor) {
    const maior = dados[0].valor;

    return `
      <section class="pilha-sm">
        <h2>${titulo}</h2>
        <div class="barras">
          ${dados.map((d) => `
            <div class="barra-linha">
              <div class="barra-topo">
                <span>${esc(d.rotulo)}</span>
                <span class="num">${moeda(d.valor)}
                  <span class="barra-pct">${Math.round(d.fatia * 100)}%</span>
                </span>
              </div>
              <div class="barra-trilho">
                <div class="barra-preenche ${cor}"
                     style="width: ${Math.max(2, (d.valor / maior) * 100)}%"></div>
              </div>
            </div>`).join('')}
        </div>
      </section>`;
  }

  /**
   * Resultado liquido mes a mes.
   *
   * Barras verticais partindo de uma linha zero: com meses negativos,
   * a barra desce, e a diferenca entre um mes ruim e um mes bom fica
   * visivel sem precisar ler numero nenhum.
   */
  function evolucao(meses) {
    const teto = Math.max(...meses.map((m) => Math.abs(m.liquido)), 1);

    return `
      <section class="pilha-sm">
        <h2>Resultado por mes</h2>
        <div class="evolucao">
          ${meses.map((m) => {
            const altura = (Math.abs(m.liquido) / teto) * 100;
            const acima = m.liquido >= 0;
            return `
              <div class="evo-col" title="${esc(mesAno(m.mes + '-01'))}: ${moeda(m.liquido)}">
                <div class="evo-area">
                  <div class="evo-metade">
                    ${acima ? `<div class="evo-barra pos" style="height:${altura}%"></div>` : ''}
                  </div>
                  <div class="evo-zero" aria-hidden="true"></div>
                  <div class="evo-metade baixo">
                    ${!acima ? `<div class="evo-barra neg" style="height:${altura}%"></div>` : ''}
                  </div>
                </div>
                <span class="evo-rotulo">${esc(mesAno(m.mes + '-01').split('/')[0])}</span>
                <span class="evo-valor num ${acima ? 'pos' : 'neg'}">${
                  Math.abs(m.liquido) >= 1000
                    ? `${(m.liquido / 1000).toFixed(1)}k`
                    : Math.round(m.liquido)
                }</span>
              </div>`;
          }).join('')}
        </div>
      </section>`;
  }

  function ligarTopo() {
    tela.querySelector('[data-voltar]').addEventListener('click', () => ir('inicio'));
    tela.querySelectorAll('[data-p]').forEach((b) =>
      b.addEventListener('click', () => { periodoNome = b.dataset.p; carregar(); })
    );
  }

  carregar();
}
