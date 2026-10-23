// =====================================================================
// Grafico de barras dos Relatorios, sem biblioteca.
//
// Cada barra e um <button>. Tocar seleciona, arrastar o dedo percorre,
// as setas do teclado andam de uma em uma e o leitor de tela le data e
// valor de cada coluna. Num <canvas> tudo isso teria que ser refeito a
// mao; com Chart.js viriam 200 KB para desenhar retangulos.
//
// Dois modos:
//   'faturamento'  barras que sobem do zero
//   'lucro'        barras que sobem ou descem de uma linha zero
//
// Estados de coluna (data-estado), para nao confundir ausencia de
// registro com zero:
//   ok / pos / neg   tem valor
//   zero             tem registro e o resultado deu exatamente zero
//   sem-ganho        tem registro, mas so de despesa (faturamento)
//   vazio            nenhum registro: nao se sabe se foi folga
//   futuro           a data ainda nao chegou
// =====================================================================

import { moeda, compacto, numero } from '../lib/format.js';
import { esc } from '../lib/html.js';

// Largura minima de coluna, em px. Com 8px um mes de 31 dias cabe
// inteiro num celular de 360px; passou disso, a janela rola de lado.
const COLUNA = { dia: 8, semana: 16, mes: 22 };

const corridas = (n) => `${numero(n)} ${n === 1 ? 'corrida' : 'corridas'}`;

function estadoDe(b, modo) {
  if (b.futuro && !b.registros) return 'futuro';
  if (!b.registros) return 'vazio';
  if (modo === 'faturamento') return b.ganhos > 0 ? 'ok' : 'sem-ganho';
  if (b.liquido > 0) return 'pos';
  if (b.liquido < 0) return 'neg';
  return 'zero';
}

/** O texto da dica que aparece sobre a barra tocada. */
function textoDica(b, modo) {
  const estado = estadoDe(b, modo);
  if (estado === 'futuro') return `${b.curto} · ainda nao chegou`;
  if (estado === 'vazio') return `${b.curto} · sem registro`;

  if (modo === 'faturamento') {
    if (estado === 'sem-ganho') return `${b.curto} · nenhum ganho lancado`;
    return `${b.curto} · ${moeda(b.ganhos)} · ${corridas(b.corridas)}`;
  }

  if (estado === 'zero') return `${b.curto} · resultado zero`;
  return `${b.curto} · ${estado === 'pos' ? 'lucro' : 'prejuizo'} ${moeda(Math.abs(b.liquido))}`;
}

/** O que o leitor de tela le em cada coluna. */
function textoSr(b, modo) {
  return textoDica(b, modo).replace(b.curto, b.longo).replaceAll(' · ', ', ');
}

/**
 * Devolve o HTML do grafico. `escalaY` vem de escalaFaturamento ou
 * escalaLucro (lib/relatorio.js) e define o minimo e o maximo do eixo.
 */
export function desenharGrafico({ modo, baldes, escala, escalaY, rotulo }) {
  const n = baldes.length;
  const amplitude = escalaY.max - escalaY.min || 1;
  const altura = (v) => ((v - escalaY.min) / amplitude) * 100;   // % a partir da base
  const zero = altura(0);
  const estados = new Set();
  let cortou = false;

  const colunas = baldes.map((b, i) => {
    const estado = estadoDe(b, modo);
    estados.add(estado);
    let dentro = '';

    if (modo === 'faturamento' && estado === 'ok') {
      dentro = `<span class="graf-barra" style="--h:${altura(b.ganhos)}%"></span>`;
    } else if (estado === 'pos') {
      dentro = `<span class="graf-barra pos" style="--h:${altura(b.liquido) - zero}%"></span>`;
    } else if (estado === 'neg') {
      const cortada = b.liquido < escalaY.min;
      cortou ||= cortada;
      const h = zero - altura(Math.max(b.liquido, escalaY.min));
      dentro = `<span class="graf-barra neg${cortada ? ' cortada' : ''}" style="--h:${h}%"></span>`;
    } else if (estado === 'zero') {
      dentro = '<span class="graf-barra zero"></span>';
    } else if (estado !== 'futuro') {
      dentro = '<span class="graf-marca"></span>';
    }

    return `
      <button type="button" class="graf-col" data-i="${i}" data-estado="${estado}"
              tabindex="-1" aria-pressed="false" aria-label="${esc(textoSr(b, modo))}">${dentro}</button>`;
  }).join('');

  const linhas = escalaY.marcas.map((v) =>
    `<span class="${v === 0 ? 'zero' : ''}" style="--y:${altura(v)}%"></span>`
  ).join('');

  const numerosY = escalaY.marcas.map((v) =>
    `<span style="--y:${altura(v)}%">${compacto(v)}</span>`
  ).join('');

  const rotulosX = baldes.map((b) =>
    `<span>${b.mostrarEixo ? esc(b.eixo) : ''}</span>`
  ).join('');

  return `
    <figure class="graf graf-${modo}" data-modo="${modo}"
            style="--n:${n}; --col:${COLUNA[escala] ?? 8}px; --z:${zero}%">
      <div class="graf-corpo">
        <div class="graf-eixo" aria-hidden="true">
          <div class="graf-eixo-area">${numerosY}</div>
        </div>
        <div class="graf-janela">
          <div class="graf-trilho">
            <div class="graf-dica-faixa" aria-hidden="true">
              <span class="graf-dica" hidden></span>
            </div>
            <div class="graf-area">
              <div class="graf-grade" aria-hidden="true">${linhas}</div>
              <div class="graf-colunas" role="group" aria-label="${esc(rotulo)}">${colunas}</div>
            </div>
            <div class="graf-x" aria-hidden="true">${rotulosX}</div>
          </div>
        </div>
      </div>
      <figcaption class="graf-legenda">${legenda(modo, estados, cortou)}</figcaption>
    </figure>`;
}

/** Legenda so com o que aparece neste grafico. */
function legenda(modo, estados, cortou) {
  const itens = [];
  const item = (classe, texto) =>
    `<span><i class="leg leg-${classe}" aria-hidden="true"></i>${texto}</span>`;

  if (modo === 'faturamento') {
    if (estados.has('ok')) itens.push(item('pos', 'Faturamento'));
    if (estados.has('sem-ganho')) itens.push(item('so-gasto', 'So despesa'));
  } else {
    if (estados.has('pos')) itens.push(item('pos', 'Lucro'));
    if (estados.has('neg')) itens.push(item('neg', 'Prejuizo'));
    if (estados.has('zero')) itens.push(item('zero', 'Zero'));
    if (cortou) itens.push(item('cortada', 'Barra cortada: passa da escala'));
  }
  if (estados.has('vazio')) itens.push(item('vazio', 'Sem registro'));
  if (estados.has('futuro')) itens.push(item('futuro', 'Ainda nao chegou'));

  return itens.join('');
}

/**
 * Liga a interacao de um grafico ja inserido na pagina.
 *
 * Quem decide o que fica selecionado e a tela (os dois graficos andam
 * juntos), entao aqui o toque so avisa `aoSelecionar(indice)` e a tela
 * chama `marcar` de volta em cada grafico.
 */
export function ligarGrafico(figura, { baldes, modo, aoSelecionar }) {
  const janela = figura.querySelector('.graf-janela');
  const trilho = figura.querySelector('.graf-trilho');
  const colunas = figura.querySelector('.graf-colunas');
  const botoes = [...colunas.querySelectorAll('.graf-col')];
  const dica = figura.querySelector('.graf-dica');
  let atual = -1;

  const rolavel = () => janela.scrollWidth > janela.clientWidth + 1;

  // A dica acompanha a barra, mas nao sai pela borda do grafico.
  function posicionarDica() {
    if (atual < 0) return;
    const largura = trilho.clientWidth;
    const centro = ((atual + 0.5) / botoes.length) * largura;
    const w = dica.offsetWidth;
    dica.style.left = `${Math.min(Math.max(centro - w / 2, 0), Math.max(0, largura - w))}px`;
  }

  function marcar(i, { rolar = false, focar = false } = {}) {
    const antigo = botoes[atual];
    if (antigo) {
      antigo.classList.remove('sel');
      antigo.setAttribute('aria-pressed', 'false');
      antigo.tabIndex = -1;
    }

    atual = i;
    const botao = botoes[i];
    if (!botao) {
      dica.hidden = true;
      if (botoes[0]) botoes[0].tabIndex = 0;
      return;
    }

    botao.classList.add('sel');
    botao.setAttribute('aria-pressed', 'true');
    botao.tabIndex = 0;

    dica.textContent = textoDica(baldes[i], modo);
    dica.hidden = false;
    posicionarDica();

    if (rolar && rolavel()) {
      const centro = ((i + 0.5) / botoes.length) * trilho.clientWidth;
      janela.scrollLeft = centro - janela.clientWidth / 2;
    }
    if (focar) botao.focus({ preventScroll: true });
  }

  // --- Toque e arrasto ------------------------------------------------
  // Arrastar o dedo sobre as barras percorre os dias, como num grafico
  // de cotacao. So quando o grafico cabe na tela: se ele rola de lado,
  // o arrasto horizontal e da rolagem.
  let arrastando = false;
  let arrastou = false;

  colunas.addEventListener('pointerdown', () => {
    arrastando = !rolavel();
    arrastou = false;
  });

  colunas.addEventListener('pointermove', (ev) => {
    if (!arrastando) return;
    const r = colunas.getBoundingClientRect();
    const i = Math.floor(((ev.clientX - r.left) / r.width) * botoes.length);
    if (i >= 0 && i < botoes.length && i !== atual) {
      arrastou = true;
      aoSelecionar(i);
    }
  });

  for (const fim of ['pointerup', 'pointercancel']) {
    colunas.addEventListener(fim, () => { arrastando = false; });
  }

  colunas.addEventListener('click', (ev) => {
    // Depois de um arrasto o navegador ainda dispara o clique na barra
    // onde o dedo ENCOSTOU -- o que devolveria a selecao para o comeco.
    if (arrastou) { arrastou = false; return; }
    const botao = ev.target.closest('.graf-col');
    if (botao) aoSelecionar(Number(botao.dataset.i));
  });

  // --- Teclado: um so ponto de tabulacao, setas andam -----------------
  colunas.addEventListener('keydown', (ev) => {
    const ultimo = botoes.length - 1;
    const destino = {
      ArrowRight: Math.min(atual + 1, ultimo),
      ArrowLeft: Math.max(atual - 1, 0),
      Home: 0,
      End: ultimo,
    }[ev.key];
    if (destino === undefined) return;
    ev.preventDefault();
    aoSelecionar(destino, { focar: true, rolar: true });
  });

  // Girar o celular muda a largura: a dica e o modo de arrasto se
  // recalculam sozinhos.
  new ResizeObserver(() => {
    figura.classList.toggle('rolavel', rolavel());
    posicionarDica();
  }).observe(janela);
  figura.classList.toggle('rolavel', rolavel());

  return { marcar };
}
