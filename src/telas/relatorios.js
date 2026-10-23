// =====================================================================
// Relatorios.
//
// Fica fora da barra de abas, acessivel pelo Inicio: e uma tela de
// sentar e analisar, nao de usar entre uma corrida e outra. Virar uma
// quinta aba custaria area de toque nas quatro que sao usadas todo dia.
//
// Responde, de cima para baixo: quanto entrou, quanto saiu e quanto
// sobrou; qual foi o melhor e o pior dia; como foi cada dia; quanto
// rende um dia de trabalho; para onde vai o dinheiro.
//
// GRAFICOS SEM BIBLIOTECA: cada barra e um <button> com altura
// proporcional (ver ui/grafico.js). Trazer um Chart.js de 200 KB para
// desenhar retangulos seria peso puro num app que abre no 4G.
//
// As contas moram em lib/relatorio.js e sao testadas sozinhas; esta
// tela so desenha o que elas devolvem.
// =====================================================================

import { listarMovimentos } from '../dados.js';
import {
  resumirMovimentos, gastosPorCategoria, ganhosPorPlataforma,
  agruparMovimentos, ordenarMovimentos,
} from '../lib/movimentos.js';
import { indicadoresPorKm, kmPorLitro } from '../lib/consumo.js';
import { resolver, periodoAnterior, PERIODOS_LONGOS, ROTULOS } from '../lib/periodo.js';
import {
  resumoPorDia, agrupar, escalasPossiveis, escalaInicial, ROTULOS_ESCALA,
  mediasPorDiaTrabalhado, destaques, variacao, escalaFaturamento, escalaLucro,
} from '../lib/relatorio.js';
import {
  moeda, valor, numero, iso, intervalo, dataCurta, dataComSemana,
  dataExtensa, dataRelativa,
} from '../lib/format.js';
import { esc } from '../lib/html.js';
import { vazio } from '../ui/vazio.js';
import { abrirSheet } from '../ui/sheet.js';
import { escolherPeriodo } from '../ui/escolher-periodo.js';
import { desenharGrafico, ligarGrafico } from '../ui/grafico.js';

// Desempate sempre pela data mais recente: dois dias com o mesmo
// faturamento aparecem na ordem em que a pessoa lembra deles.
const recente = (a, b) => (a.de < b.de ? 1 : -1);
const ORDENS = {
  data:        ['Mais recentes',     recente],
  faturamento: ['Maior faturamento', (a, b) => b.ganhos - a.ganhos || recente(a, b)],
  lucro:       ['Maior lucro',       (a, b) => b.liquido - a.liquido || recente(a, b)],
  despesa:     ['Maior despesa',     (a, b) => b.gastos - a.gastos || recente(a, b)],
};

// Um mes de linhas. "Este ano" teria 250; elas so aparecem se pedidas.
const LINHAS_INICIAIS = 31;

const NOME_ESCALA = { dia: 'por dia', semana: 'por semana', mes: 'por mes' };
const UNIDADE = { dia: 'dia', semana: 'semana', mes: 'mes' };
const ORIGEM = { transacao: '', abastecimento: 'Combustivel', manutencao: 'Oficina' };

const plural = (n, um, varios) => `${numero(n)} ${n === 1 ? um : varios}`;
const capitalizar = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/** "+ R$ 240,40" / "− R$ 85,00": o sinal na frente, legivel de longe. */
const comSinal = (v) => `${v > 0 ? '+ ' : v < 0 ? '− ' : ''}${moeda(Math.abs(v))}`;

/** Resultado com o sinal de menos tipografico, como no resto do app. */
const resultado = (v) => (v < 0 ? `−${moeda(-v)}` : moeda(v));

export function telaRelatorios(raiz, { ir }) {
  let periodoNome = 'mes';
  let personalizado = null;
  let escala = 'dia';
  let ordem = 'data';
  let mostrarTodos = false;
  let selecao = null;   // uma data dentro do balde selecionado nos graficos
  let pedido = 0;       // descarta a resposta de um filtro que ja foi trocado
  let dados = null;     // o ultimo carregamento que deu certo

  const tela = document.createElement('main');
  tela.className = 'app pilha';
  raiz.replaceChildren(tela);

  tela.innerHTML = `
    <header class="cabecalho pilha-sm">
      <button type="button" class="btn-voltar" data-voltar>
        <span aria-hidden="true">&lsaquo;</span> Inicio
      </button>
      <div class="pilha-sm">
        <p class="rotulo" id="rel-rotulo"></p>
        <h1>Relatorios</h1>
        <p class="apoio" id="rel-intervalo"></p>
      </div>
    </header>

    <nav class="chips chips-filtro" aria-label="Periodo">
      ${[...PERIODOS_LONGOS, 'personalizado'].map((p) => `
        <button type="button" class="chip" data-p="${p}" aria-pressed="false">${ROTULOS[p]}</button>
      `).join('')}
    </nav>

    <div id="conteudo" class="pilha"></div>
  `;

  const conteudo = tela.querySelector('#conteudo');

  tela.querySelector('[data-voltar]').addEventListener('click', () => ir('inicio'));

  tela.querySelectorAll('[data-p]').forEach((botao) =>
    botao.addEventListener('click', async () => {
      const escolha = botao.dataset.p;
      if (escolha === 'personalizado') {
        const escolhido = await escolherPeriodo(personalizado);
        if (!escolhido) return;
        personalizado = escolhido;
      } else if (escolha === periodoNome) {
        return;
      }
      periodoNome = escolha;
      carregar();
    })
  );


  // --- Carga -------------------------------------------------------------

  async function carregar() {
    const meu = ++pedido;
    const periodo = resolver(periodoNome, personalizado);
    const anterior = periodoAnterior(periodo);

    tela.querySelector('#rel-rotulo').textContent =
      periodoNome === 'personalizado' ? 'Periodo personalizado' : periodo.rotulo;
    tela.querySelector('#rel-intervalo').textContent = capitalizar(intervalo(periodo.de, periodo.ate));
    tela.querySelectorAll('[data-p]').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.p === periodoNome))
    );

    // Na primeira abertura, esqueleto. Numa troca de filtro o conteudo
    // anterior fica esmaecido ate o novo chegar: a tela nao pisca e nao
    // perde a rolagem.
    if (dados) conteudo.classList.add('atualizando');
    else conteudo.innerHTML = esqueleto();
    conteudo.setAttribute('aria-busy', 'true');

    let atuais;
    let anteriores;
    try {
      [atuais, anteriores] = await Promise.all([
        listarMovimentos({ de: periodo.de, ate: periodo.ate }),
        // A comparacao e acessoria: se ela falhar, a tela abre sem ela.
        listarMovimentos(anterior).catch(() => null),
      ]);
    } catch (e) {
      if (meu !== pedido) return;
      dados = null;
      conteudo.classList.remove('atualizando');
      conteudo.removeAttribute('aria-busy');
      conteudo.innerHTML = `
        <div class="aviso aviso-erro" role="alert">
          Nao foi possivel carregar os relatorios. ${esc(e.message)}
        </div>
        <button type="button" class="btn btn-secundario btn-bloco" data-tentar>Tentar de novo</button>`;
      conteudo.querySelector('[data-tentar]').addEventListener('click', carregar);
      return;
    }

    // Outro filtro foi tocado enquanto este carregava: a resposta velha
    // nao pode sobrescrever a nova.
    if (meu !== pedido) return;

    dados = montar(periodo, anterior, atuais, anteriores);
    escala = escalaInicial(periodo.de, periodo.fim);
    selecao = selecaoInicial(dados);
    mostrarTodos = false;

    conteudo.classList.remove('atualizando');
    conteudo.removeAttribute('aria-busy');
    desenhar();
  }

  function montar(periodo, anterior, atuais, anteriores) {
    const hoje = iso();
    const totais = resumirMovimentos(atuais);
    const { dias, semDia } = resumoPorDia(atuais, { de: periodo.de, ate: periodo.fim, hoje });

    // Sem rede, a lista anterior traria so os pendentes, e a comparacao
    // diria que o mes passado foi zero. Melhor nao comparar.
    let ant = null;
    let semComparacao = '';
    if (!anteriores) {
      semComparacao = 'Comparacao indisponivel agora.';
    } else if (anteriores.offline) {
      semComparacao = 'Sem conexao para comparar com o periodo anterior.';
    } else if (!anteriores.length) {
      semComparacao = `Sem registros de ${intervalo(anterior.de, anterior.ate)} para comparar.`;
    } else {
      const totaisAnt = resumirMovimentos(anteriores);
      const diasAnt = resumoPorDia(anteriores, { de: anterior.de, ate: anterior.ate, hoje }).dias;
      ant = { totais: totaisAnt, medias: mediasPorDiaTrabalhado(diasAnt, totaisAnt) };
    }

    return {
      periodo,
      anterior,
      movimentos: atuais,
      offline: Boolean(atuais.offline),
      totais,
      dias,
      semDia,
      medias: mediasPorDiaTrabalhado(dias, totais),
      destaques: destaques(dias),
      km: indicadoresPorKm(atuais),
      consumo: kmPorLitro(
        atuais.filter((m) => m.origem === 'abastecimento').map((m) => m.registro)
      ),
      categorias: gastosPorCategoria(atuais),
      plataformas: ganhosPorPlataforma(atuais),
      ant,
      semComparacao,
    };
  }

  /** Abre no dia mais recente com registro: e o que se quer conferir primeiro. */
  function selecaoInicial({ dias, periodo }) {
    const ultimo = [...dias].reverse().find((d) => d.registros > 0);
    return ultimo ? ultimo.de : periodo.ate;
  }


  // --- Desenho -----------------------------------------------------------

  function esqueleto() {
    return `
      <div class="cartao"><div class="carregando-bloco"></div></div>
      <div class="cartao"><div class="carregando-bloco carregando-alto"></div></div>`;
  }

  function desenhar() {
    const d = dados;
    const aviso = d.offline ? `
      <div class="aviso aviso-atencao" role="status">
        Sem conexao. Os numeros abaixo mostram so os lancamentos que estao
        esperando envio; o resto aparece quando a internet voltar.
      </div>` : '';

    if (!d.movimentos.length) {
      conteudo.innerHTML = aviso + vazio({
        arte: 'grafico',
        titulo: `Nenhum registro de ${intervalo(d.periodo.de, d.periodo.ate)}.`,
        apoio: 'Registre ganhos e gastos para ver os numeros aqui.',
      });
      return;
    }

    conteudo.innerHTML = `
      ${aviso}
      ${placar(d)}
      ${notasDados(d)}
      ${blocoDestaques(d)}
      <section class="cartao cartao-grafico" id="graf-faturamento" aria-labelledby="t-fat"></section>
      <section class="cartao cartao-grafico" id="graf-lucro" aria-labelledby="t-lucro"></section>
      ${blocoMedias(d)}
      ${blocoKm(d)}
      ${blocoDespesas(d)}
      ${blocoOrigem(d)}
      <section class="pilha-sm" id="por-dia" aria-labelledby="t-dias"></section>
    `;

    desenharGraficos();
    desenharDias();

    conteudo.querySelectorAll('[data-ir-dia]').forEach((b) =>
      b.addEventListener('click', () => irParaDia(b.dataset.irDia))
    );
    conteudo.querySelectorAll('[data-grupo]').forEach((b) =>
      b.addEventListener('click', () => {
        const [lista, i] = b.dataset.grupo.split(':');
        const g = (lista === 'gasto' ? d.categorias : d.plataformas)[Number(i)];
        const total = lista === 'gasto' ? d.totais.gastos : d.totais.ganhos;
        abrirRegistros(g.rotulo, g.itens,
          `<p class="apoio">${moeda(g.valor)} de ${moeda(total)}
             ${lista === 'gasto' ? 'em despesas' : 'de faturamento'}
             (${g.pct === 0 ? 'menos de 1' : g.pct}%).</p>`);
      })
    );
  }

  /** Seta e numero da variacao. `inverso`: subir e ruim (despesa). */
  function seta(v, { inverso = false, formatar = moeda } = {}) {
    if (!v) return '';
    const sobe = v.diferenca > 0;
    const desce = v.diferenca < 0;
    const bom = inverso ? desce : sobe;
    const ruim = inverso ? sobe : desce;

    const abs = Math.abs(v.valor);
    const quanto = v.tipo === 'pct'
      ? `${abs.toLocaleString('pt-BR', { maximumFractionDigits: abs < 10 ? 1 : 0 })}%`
      : formatar(abs);

    return `
      <span class="variacao ${bom ? 'pos' : ruim ? 'neg' : 'neutra'}">
        <span aria-hidden="true">${sobe ? '↑' : desce ? '↓' : '='}</span>
        <span class="sr">${sobe ? 'subiu' : desce ? 'caiu' : 'igual'}</span>
        ${sobe || desce ? quanto : ''}
      </span>`;
  }

  function placar(d) {
    const t = d.totais;
    const a = d.ant?.totais;
    const positivo = t.liquido >= 0;

    return `
      <section class="placar" aria-label="Resultado do periodo">
        <div class="placar-topo">
          <div class="placar-lado">
            <span class="rotulo">Faturamento</span>
            <strong class="num placar-valor pos">${moeda(t.ganhos)}</strong>
            ${a ? seta(variacao(t.ganhos, a.ganhos)) : ''}
            ${t.ganhos === 0 ? '<span class="placar-nota">nenhum ganho lancado</span>' : ''}
          </div>
          <div class="placar-lado">
            <span class="rotulo">Despesas</span>
            <strong class="num placar-valor neg">${moeda(t.gastos)}</strong>
            ${a ? seta(variacao(t.gastos, a.gastos), { inverso: true }) : ''}
            ${t.gastos === 0 ? '<span class="placar-nota">nenhuma despesa lancada</span>' : ''}
          </div>
        </div>
        <div class="placar-fundo ${positivo ? 'positivo' : 'negativo'}">
          <span class="rotulo">${positivo ? 'Lucro liquido' : 'Prejuizo'}</span>
          <strong class="num placar-liquido">R$ ${valor(Math.abs(t.liquido))}</strong>
          <span class="placar-comparacao">
            ${a ? seta(variacao(t.liquido, a.liquido)) : ''}
            <span>${a
              ? `Comparado com ${esc(intervalo(d.anterior.de, d.anterior.ate))}`
              : esc(d.semComparacao)}</span>
          </span>
        </div>
      </section>`;
  }

  /** Avisos sobre registros que mudam a leitura dos numeros. */
  function notasDados(d) {
    const notas = [];

    const pendentes = d.movimentos.filter((m) => m.pendente).length;
    if (pendentes && !d.offline) {
      notas.push(pendentes === 1
        ? '1 lancamento feito sem sinal ainda nao subiu; ele ja esta somado aqui.'
        : `${pendentes} lancamentos feitos sem sinal ainda nao subiram; eles ja estao somados aqui.`);
    }

    const semValor = d.movimentos.filter((m) => m.origem === 'manutencao' && !(m.valor > 0)).length;
    if (semValor) {
      notas.push(semValor === 1
        ? '1 servico de oficina sem valor anotado nao entra nas despesas.'
        : `${semValor} servicos de oficina sem valor anotado nao entram nas despesas.`);
    }

    if (d.semDia.length) {
      const soma = d.semDia.reduce((s, m) => s + (m.tipo === 'entrada' ? m.valor : -m.valor), 0);
      notas.push(`${moeda(soma)} em registros sem data valida entram nos totais, mas nao nos graficos por dia.`);
    }

    return notas.length
      ? `<ul class="notas">${notas.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`
      : '';
  }

  function blocoDestaques(d) {
    const x = d.destaques;
    if (!x) return '';

    const cartao = (rotulo, dia) => `
      <button type="button" class="destaque" data-ir-dia="${dia.de}">
        <span class="rotulo">${rotulo}</span>
        <strong class="num ${dia.liquido > 0 ? 'pos' : dia.liquido < 0 ? 'neg' : ''}">${comSinal(dia.liquido)}</strong>
        <span class="apoio">${esc(dataComSemana(dia.de))}</span>
      </button>`;

    return `
      <section class="destaques${x.pior ? '' : ' destaques-um'}" aria-label="Melhor e pior dia">
        ${cartao(x.pior ? 'Melhor dia' : 'Unico dia com registro', x.melhor)}
        ${x.pior ? cartao('Pior dia', x.pior) : ''}
      </section>`;
  }

  function metrica(rotulo, texto, extra = '', classe = '') {
    return `
      <div class="metrica">
        <span class="rotulo">${rotulo}</span>
        <strong class="num ${classe}">${texto}</strong>
        ${extra}
      </div>`;
  }

  function blocoMedias(d) {
    const m = d.medias;
    const ma = d.ant?.medias;

    if (!m) {
      return `
        <section class="pilha-sm">
          <h2>Sua media diaria</h2>
          <p class="nota-caixa">Sem dados suficientes: nenhum dia com ganho lancado neste periodo.</p>
        </section>`;
    }

    // "por dia trabalhado" vai uma vez no subtitulo: repetido nos tres
    // rotulos, quebrava em tres linhas e desalinhava os valores.
    return `
      <section class="pilha-sm">
        <div class="titulo-com-apoio">
          <h2>Sua media diaria</h2>
          <p class="apoio">
            Por dia trabalhado: ${plural(m.diasTrabalhados, 'dia', 'dias')} de ${d.periodo.dias}
          </p>
        </div>
        <div class="metricas">
          ${metrica('Faturamento', moeda(m.faturamento),
            ma ? seta(variacao(m.faturamento, ma.faturamento)) : '')}
          ${metrica('Lucro', moeda(m.lucro),
            ma ? seta(variacao(m.lucro, ma.lucro)) : '', m.lucro < 0 ? 'neg' : '')}
          ${metrica('Corridas', numero(m.corridas),
            ma ? seta(variacao(m.corridas, ma.corridas), { formatar: numero }) : '')}
        </div>
        <p class="nota">
          ${plural(d.totais.corridas, 'corrida', 'corridas')} no periodo
          ${m.porCorrida ? `· ${moeda(m.porCorrida)} por corrida` : ''}
        </p>
        <p class="nota">
          Dia trabalhado e o dia com pelo menos um ganho lancado; despesa sozinha
          nao conta. Cada ganho lancado conta como uma corrida. O Giro nao registra
          horas, por isso nao ha media por hora.
        </p>
      </section>`;
  }

  function blocoKm(d) {
    const k = d.km;
    if (!k.km) {
      return `
        <section class="pilha-sm">
          <h2>Quilometragem</h2>
          <p class="nota-caixa">
            Anote o odometro em pelo menos dois abastecimentos do periodo para
            ver km rodados, ganho e custo por km.
          </p>
        </section>`;
    }

    const j = k.janela;
    return `
      <section class="pilha-sm">
        <h2>Quilometragem</h2>
        <div class="metricas">
          ${metrica('Rodados', `${numero(k.km)} km`)}
          ${metrica('Ganho/km', k.ganhoPorKm ? moeda(k.ganhoPorKm) : '--')}
          ${metrica('Custo/km', k.custoPorKm ? moeda(k.custoPorKm) : '--')}
        </div>
        <p class="nota">
          Odometro de ${numero(j.odometroInicial)} km (${dataCurta(j.de)}) a
          ${numero(j.odometroFinal)} km (${dataCurta(j.ate)}). E a distancia do carro,
          inclusive uso pessoal. Ganho e custo por km dividem pelo km o que foi lancado
          nesse intervalo; o abastecimento de ${dataCurta(j.de)} fica fora do custo
          porque serviu ao trecho anterior.${d.consumo
            ? ` Consumo aproximado: ${numero(d.consumo)} km/l.` : ''}
        </p>
      </section>`;
  }

  /**
   * Barras horizontais proporcionais.
   *
   * Horizontal porque os rotulos sao palavras ("Combustivel",
   * "Alimentacao"): na vertical elas teriam que virar de lado ou ser
   * abreviadas, e a comparacao e o que importa aqui.
   */
  function barras(lista, grupos, cor) {
    const maior = grupos[0].valor;
    return `
      <div class="barras">
        ${grupos.map((g, i) => `
          <button type="button" class="barra-linha barra-toque" data-grupo="${lista}:${i}"
                  aria-label="${esc(`${g.rotulo}: ${moeda(g.valor)}, ${g.pct === 0 ? 'menos de 1' : g.pct}%. Ver registros`)}">
            <span class="barra-topo">
              <span>${esc(g.rotulo)}</span>
              <span class="num">${moeda(g.valor)}
                <span class="barra-pct">${g.pct === 0 ? '&lt;1' : g.pct}%</span>
              </span>
            </span>
            <span class="barra-trilho">
              <span class="barra-preenche ${cor}"
                    style="width: ${Math.max(2, (g.valor / maior) * 100)}%"></span>
            </span>
          </button>`).join('')}
      </div>`;
  }

  function blocoDespesas(d) {
    return `
      <section class="pilha-sm">
        <h2>Para onde vai o dinheiro</h2>
        ${d.categorias.length
          ? barras('gasto', d.categorias, 'neg')
          : '<p class="nota-caixa">Nenhuma despesa lancada neste periodo.</p>'}
      </section>`;
  }

  /**
   * So aparece se alguma entrada tem plataforma. Com tudo em "Nao
   * informada", a secao seria uma barra unica de 100% que nao diz nada.
   */
  function blocoOrigem(d) {
    if (!d.plataformas.some((p) => p.rotulo !== 'Nao informada')) return '';
    const semOrigem = d.plataformas.some((p) => p.rotulo === 'Nao informada');
    return `
      <section class="pilha-sm">
        <h2>De onde vem o faturamento</h2>
        ${barras('origem', d.plataformas, 'pos')}
        ${semOrigem ? '<p class="nota">"Nao informada" sao ganhos lancados sem plataforma.</p>' : ''}
      </section>`;
  }


  // --- Graficos ----------------------------------------------------------

  function desenharGraficos() {
    const d = dados;
    const baldes = agrupar(d.dias, escala);
    const possiveis = escalasPossiveis(d.periodo.de, d.periodo.fim);
    const nome = NOME_ESCALA[escala];

    let indice = baldes.findIndex((b) => selecao >= b.de && selecao <= b.ate);
    if (indice < 0) indice = baldes.length - 1;

    const secFat = conteudo.querySelector('#graf-faturamento');
    const secLucro = conteudo.querySelector('#graf-lucro');

    secFat.innerHTML = `
      <h2 id="t-fat">Faturamento ${nome}</h2>
      ${possiveis.length > 1 ? `
        <div class="segmento" role="radiogroup" aria-label="Agrupar por">
          ${possiveis.map((e) => `
            <button type="button" role="radio" data-escala="${e}"
                    aria-checked="${e === escala}">${ROTULOS_ESCALA[e]}</button>`).join('')}
        </div>` : ''}
      ${desenharGrafico({
        modo: 'faturamento', baldes, escala,
        escalaY: escalaFaturamento(baldes), rotulo: `Faturamento ${nome}`,
      })}
      <div class="painel-dia" id="painel"></div>`;

    secLucro.innerHTML = `
      <h2 id="t-lucro">Lucro liquido ${nome}</h2>
      ${desenharGrafico({
        modo: 'lucro', baldes, escala,
        escalaY: escalaLucro(baldes), rotulo: `Lucro liquido ${nome}`,
      })}
      <p class="nota">
        Faturamento menos as despesas lancadas em cada ${UNIDADE[escala]}. Despesa
        grande, como IPVA ou seguro, pesa inteira no dia em que foi paga: nada e
        rateado entre os dias.
      </p>`;

    // Os dois graficos andam juntos: tocar um dia em qualquer um deles
    // seleciona o mesmo dia no outro e atualiza o painel.
    const controles = [];
    const selecionar = (i, origem, opcoes = {}) => {
      const b = baldes[i];
      if (!b) return;
      if (!(selecao >= b.de && selecao <= b.ate)) selecao = b.de;
      for (const c of controles) {
        c.marcar(i, {
          rolar: c !== origem || opcoes.rolar,
          focar: c === origem && opcoes.focar,
        });
      }
      painel(b);
    };

    for (const sec of [secFat, secLucro]) {
      const figura = sec.querySelector('.graf');
      const controle = ligarGrafico(figura, {
        baldes,
        modo: figura.dataset.modo,
        aoSelecionar: (i, opcoes) => selecionar(i, controle, opcoes),
      });
      controles.push(controle);
    }
    selecionar(indice, null, { rolar: true });

    secFat.querySelectorAll('[data-escala]').forEach((b) =>
      b.addEventListener('click', () => {
        if (b.dataset.escala === escala) return;
        escala = b.dataset.escala;
        desenharGraficos();
      })
    );
  }

  /** O resumo do dia (ou semana, ou mes) selecionado, abaixo do grafico. */
  function painel(b) {
    const alvo = conteudo.querySelector('#painel');
    const titulo = `<h3 class="painel-titulo">${esc(capitalizar(b.longo))}</h3>`;

    if (!b.registros) {
      alvo.innerHTML = `
        ${titulo}
        <p class="apoio">${b.futuro
          ? 'Ainda nao chegou.'
          : `Nenhum registro neste ${UNIDADE[escala]}. Nao quer dizer faturamento zero: so que nada foi lancado.`}</p>`;
      return;
    }

    const x = dados.destaques;
    const selo = escala !== 'dia' || !x ? ''
      : b.de === x.melhor.de && x.pior ? 'Melhor dia'
      : b.de === x.pior?.de ? 'Pior dia' : '';

    alvo.innerHTML = `
      <div class="painel-topo">
        ${titulo}
        ${selo ? `<span class="selo selo-ok">${selo}</span>` : ''}
      </div>
      <dl class="numeros">
        <div>
          <dt class="rotulo">Faturamento</dt>
          <dd class="num ${b.ganhos ? 'pos' : 'apagado'}">${b.ganhos ? moeda(b.ganhos) : 'Nenhum ganho'}</dd>
        </div>
        <div>
          <dt class="rotulo">Despesas</dt>
          <dd class="num ${b.gastos ? 'neg' : 'apagado'}">${b.gastos ? moeda(b.gastos) : 'Nenhuma'}</dd>
        </div>
        <div>
          <dt class="rotulo">${b.liquido < 0 ? 'Prejuizo' : 'Lucro liquido'}</dt>
          <dd class="num ${b.liquido > 0 ? 'pos' : b.liquido < 0 ? 'neg' : ''}">${moeda(Math.abs(b.liquido))}</dd>
        </div>
        <div>
          <dt class="rotulo">Corridas</dt>
          <dd class="num">${numero(b.corridas)}${escala === 'dia' ? ''
            : ` <span class="apoio">em ${plural(b.diasTrabalhados, 'dia', 'dias')}</span>`}</dd>
        </div>
      </dl>
      <button type="button" class="btn-texto painel-mais" data-registros>
        Ver ${plural(b.registros, 'registro', 'registros')}
      </button>`;

    alvo.querySelector('[data-registros]').addEventListener('click', () =>
      abrirRegistros(capitalizar(b.longo), b.movimentos, faixa(b))
    );
  }

  /** Destaque tocado: mostra o dia no grafico, na escala diaria. */
  function irParaDia(data) {
    selecao = data;
    escala = 'dia';
    desenharGraficos();
    const calmo = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    conteudo.querySelector('#graf-faturamento')
      .scrollIntoView({ behavior: calmo ? 'auto' : 'smooth', block: 'start' });
  }


  // --- Detalhamento por dia ---------------------------------------------

  function linhaDia(d) {
    const sr = `${dataExtensa(d.de)}: faturamento ${moeda(d.ganhos)}, despesas ${moeda(d.gastos)}, `
      + `resultado ${moeda(d.liquido)}, ${plural(d.corridas, 'corrida', 'corridas')}`;
    return `
      <li>
        <button type="button" class="lista-item lista-item-toque linha-dia"
                data-dia="${d.de}" aria-label="${esc(sr)}">
          <span class="linha-dia-topo">
            <strong>${esc(dataComSemana(d.de))}</strong>
            <span class="apoio">${d.corridas ? plural(d.corridas, 'corrida', 'corridas') : 'sem corrida'}</span>
          </span>
          <span class="linha-dia-nums num" aria-hidden="true">
            <span class="${d.ganhos ? 'pos' : 'apagado'}">${d.ganhos ? moeda(d.ganhos) : '—'}</span>
            <span class="${d.gastos ? 'neg' : 'apagado'}">${d.gastos ? moeda(d.gastos) : '—'}</span>
            <strong class="${d.liquido > 0 ? 'pos' : d.liquido < 0 ? 'neg' : ''}">${resultado(d.liquido)}</strong>
          </span>
        </button>
      </li>`;
  }

  function desenharDias() {
    const sec = conteudo.querySelector('#por-dia');
    const linhas = dados.dias.filter((d) => d.registros > 0).sort(ORDENS[ordem][1]);
    const visiveis = mostrarTodos ? linhas : linhas.slice(0, LINHAS_INICIAIS);

    sec.innerHTML = `
      <h2 id="t-dias">Detalhamento por dia</h2>
      <div class="chips" role="radiogroup" aria-label="Ordenar por">
        ${Object.entries(ORDENS).map(([chave, [rotulo]]) => `
          <button type="button" class="chip" role="radio" data-ordem="${chave}"
                  aria-checked="${chave === ordem}">${rotulo}</button>`).join('')}
      </div>
      <div class="tabela-dias">
        <div class="tabela-cabeca" aria-hidden="true">
          <span>Faturamento</span><span>Despesas</span><span>Resultado</span>
        </div>
        <ul class="lista">${visiveis.map(linhaDia).join('')}</ul>
      </div>
      ${linhas.length > visiveis.length ? `
        <button type="button" class="btn btn-secundario btn-bloco" data-todos>
          Mostrar todos os ${linhas.length} dias
        </button>` : ''}
      <p class="nota">
        So aparecem dias com algum registro. Km por dia nao entra: o Giro so
        conhece o odometro anotado nos abastecimentos.
      </p>`;

    sec.querySelectorAll('[data-ordem]').forEach((b) =>
      b.addEventListener('click', () => {
        if (b.dataset.ordem === ordem) return;
        ordem = b.dataset.ordem;
        desenharDias();
        sec.querySelector(`[data-ordem="${ordem}"]`).focus();
      })
    );

    sec.querySelector('[data-todos]')?.addEventListener('click', () => {
      mostrarTodos = true;
      desenharDias();
    });

    sec.querySelectorAll('[data-dia]').forEach((b) =>
      b.addEventListener('click', () => {
        const dia = dados.dias.find((d) => d.de === b.dataset.dia);
        abrirRegistros(capitalizar(dataExtensa(dia.de)), dia.movimentos, faixa(dia));
      })
    );
  }


  // --- Folha com os registros -------------------------------------------

  function faixa(b) {
    return `
      <div class="resumo-faixa">
        <div><span class="rotulo">Faturamento</span><strong class="num pos">${moeda(b.ganhos)}</strong></div>
        <div><span class="rotulo">Despesas</span><strong class="num neg">${moeda(b.gastos)}</strong></div>
        <div><span class="rotulo">Resultado</span><strong class="num ${b.liquido >= 0 ? 'pos' : 'neg'}">${resultado(b.liquido)}</strong></div>
      </div>`;
  }

  function itemMovimento(m) {
    const entrada = m.tipo === 'entrada';
    const detalhe = [ORIGEM[m.origem], ...m.detalhe].filter(Boolean).join(' · ');
    return `
      <li class="lista-item${m.pendente ? ' pendente' : ''}">
        <span class="ponto ${entrada ? 'pos' : 'neg'}" aria-hidden="true"></span>
        <div class="lista-texto">
          <strong>${esc(m.titulo)}</strong>
          ${detalhe ? `<span class="apoio">${esc(detalhe)}</span>` : ''}
        </div>
        <span class="num lista-valor ${entrada ? 'pos' : 'neg'}">
          ${m.valor > 0 ? `${entrada ? '+' : '−'} ${moeda(m.valor)}` : 'sem valor'}
        </span>
      </li>`;
  }

  /**
   * Os registros por tras de um numero, sem sair do relatorio. So
   * leitura: editar daqui exigiria recarregar tudo a cada alteracao, e
   * a aba Financas ja faz isso bem.
   */
  function abrirRegistros(titulo, movimentos, cabecalho = '') {
    const grupos = agruparMovimentos(ordenarMovimentos(movimentos));
    const corpo = document.createElement('div');
    corpo.className = 'pilha registros';
    corpo.innerHTML = `
      ${cabecalho}
      ${grupos.length > 1
        ? grupos.map(([dia, itens]) => `
            <section class="grupo">
              <div class="grupo-topo"><h2>${esc(dataRelativa(dia))}</h2></div>
              <ul class="lista">${itens.map(itemMovimento).join('')}</ul>
            </section>`).join('')
        : `<ul class="lista">${grupos[0]?.[1].map(itemMovimento).join('') ?? ''}</ul>`}
      <p class="nota">Para corrigir ou excluir um registro, use a aba Financas.</p>`;

    abrirSheet({ titulo: esc(titulo), corpo });
  }

  carregar();
}
