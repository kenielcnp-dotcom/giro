// =====================================================================
// Secao Manutencao da aba Carro.
//
// Duas listas: o que esta agendado (com aviso de atraso ou proximidade)
// e o que ja foi feito.
// =====================================================================

import {
  listarManutencoes, listarPlanos, excluirManutencao,
  excluirPlano, atualizarPlano, criarPlano, odometroAtual,
} from '../dados.js';
import { ordenarPorUrgencia } from '../lib/manutencao.js';
import { moeda, numero, dataRelativa, dataCurta } from '../lib/format.js';
import { esc } from '../lib/html.js';
import { abrirManutencao, abrirPlano } from '../ui/manutencao.js';
import { confirmar } from '../ui/confirmar.js';
import { toast, toastErro } from '../ui/toast.js';

export function secaoManutencao(alvo) {
  let planos = [];
  let historico = [];
  let odometro = null;

  async function carregar() {
    alvo.innerHTML = '<div class="cartao"><div class="carregando-bloco"></div></div>';
    try {
      [planos, historico, odometro] = await Promise.all([
        listarPlanos(),
        listarManutencoes(),
        odometroAtual(),
      ]);
    } catch (e) {
      alvo.innerHTML = `<div class="aviso aviso-erro">${esc(e.message)}</div>`;
      return;
    }
    desenhar();
  }

  function desenhar() {
    const agendados = ordenarPorUrgencia(planos, odometro);

    alvo.innerHTML = `
      <div class="acoes">
        <button class="btn btn-principal acao" type="button" data-novo-servico>
          Registrar servico
        </button>
        <button class="btn btn-secundario acao" type="button" data-novo-plano>
          Agendar
        </button>
      </div>

      ${odometro ? `
        <p class="linha-nota apoio">
          Km atual do carro <strong class="num">${numero(odometro)}</strong>
        </p>` : ''}

      <section class="pilha-sm">
        <h2>Agendado</h2>
        ${agendados.length
          ? `<ul class="lista">${agendados.map(linhaPlano).join('')}</ul>`
          : `<div class="vazio vazio-curto">
               <p class="apoio">Nada agendado. Use <strong>Agendar</strong> para a proxima troca de oleo.</p>
             </div>`}
      </section>

      <section class="pilha-sm">
        <h2>Ja feito</h2>
        ${historico.length
          ? `<ul class="lista">${historico.map(linhaServico).join('')}</ul>`
          : `<div class="vazio vazio-curto">
               <p class="apoio">Nenhum servico registrado ainda.</p>
             </div>`}
      </section>
    `;

    ligar();
  }

  function linhaPlano(p) {
    const { status, texto } = p.aviso;
    const prazo = [
      p.data_alvo ? dataCurta(p.data_alvo) : null,
      p.km_alvo ? `${numero(p.km_alvo)} km` : null,
    ].filter(Boolean).join(' &middot; ');

    return `
      <li class="lista-item item-plano status-${status}">
        <button type="button" class="plano-toque" data-plano="${p.id}">
          <span class="selo selo-${status}">${
            status === 'atrasada' ? 'Atrasada' : status === 'proxima' ? 'Proxima' : 'Agendada'
          }</span>
          <div class="lista-texto">
            <strong>${esc(p.titulo)}</strong>
            <span class="apoio">${esc(texto)}${prazo ? ` &middot; ${prazo}` : ''}</span>
          </div>
        </button>
        <button type="button" class="btn-concluir" data-concluir="${p.id}"
                aria-label="Concluir ${esc(p.titulo)}">Feito</button>
      </li>`;
  }

  function linhaServico(m) {
    const detalhe = [
      m.odometro ? `${numero(m.odometro)} km` : null,
      m.oficina,
    ].filter(Boolean).join(' &middot; ');

    return `
      <li>
        <button type="button" class="lista-item lista-item-toque" data-servico="${m.id}">
          <span class="ponto neg" aria-hidden="true"></span>
          <div class="lista-texto">
            <strong>${esc(m.tipo)}${m.comprovante ? ' &#128206;' : ''}</strong>
            <span class="apoio">${esc(dataRelativa(m.data))}${detalhe ? ` &middot; ${detalhe}` : ''}</span>
          </div>
          <span class="num lista-valor neg">${m.valor ? moeda(m.valor) : ''}</span>
        </button>
      </li>`;
  }

  // --- Eventos -----------------------------------------------------------

  function ligar() {
    alvo.querySelector('[data-novo-servico]').addEventListener('click', () =>
      abrirManutencao({ aoSalvar: carregar })
    );
    alvo.querySelector('[data-novo-plano]').addEventListener('click', () =>
      abrirPlano({ aoSalvar: carregar })
    );

    alvo.querySelectorAll('[data-plano]').forEach((b) =>
      b.addEventListener('click', () => {
        const plano = planos.find((p) => p.id === b.dataset.plano);
        if (plano) editarPlano(plano);
      })
    );

    alvo.querySelectorAll('[data-concluir]').forEach((b) =>
      b.addEventListener('click', () => {
        const plano = planos.find((p) => p.id === b.dataset.concluir);
        if (plano) concluir(plano);
      })
    );

    alvo.querySelectorAll('[data-servico]').forEach((b) =>
      b.addEventListener('click', () => {
        const registro = historico.find((m) => m.id === b.dataset.servico);
        if (registro) editarServico(registro);
      })
    );
  }

  /**
   * Conclui um agendamento e, quando ele e recorrente, ja deixa o
   * proximo no lugar -- senao a recorrencia dependeria de lembrar de
   * recriar na mao, que e justamente o que o app deveria evitar.
   */
  async function concluir(plano) {
    const certeza = await confirmar({
      titulo: `Concluir ${plano.titulo}?`,
      texto: plano.intervalo_km
        ? `O proximo sera agendado para daqui a ${numero(plano.intervalo_km)} km.`
        : 'Sai da lista de agendados.',
      acao: 'Concluir',
    });
    if (!certeza) return;

    try {
      await atualizarPlano(plano.id, { concluido: true });

      if (plano.intervalo_km) {
        // A base do proximo e onde o carro esta agora, nao o alvo
        // antigo: se o servico foi feito atrasado, contar do alvo
        // antigo encurtaria o intervalo seguinte.
        const base = odometro ?? plano.km_alvo ?? 0;
        await criarPlano({
          titulo: plano.titulo,
          km_alvo: base + plano.intervalo_km,
          intervalo_km: plano.intervalo_km,
          data_alvo: null,
        });
      }

      toast(plano.intervalo_km
        ? `${plano.titulo} concluida. Proxima ja agendada.`
        : `${plano.titulo} concluida.`);
      carregar();
    } catch (e) {
      toastErro(e.message);
    }
  }

  function editarPlano(plano) {
    abrirPlano({
      plano,
      aoSalvar: carregar,
      aoExcluir: async () => {
        const certeza = await confirmar({
          titulo: 'Excluir agendamento?',
          texto: `${plano.titulo}. Nao da para desfazer.`,
          acao: 'Excluir',
          perigo: true,
        });
        if (!certeza) return false;
        try {
          await excluirPlano(plano.id);
          toast('Agendamento excluido.');
          carregar();
          return true;
        } catch (e) {
          toastErro(e.message);
          return false;
        }
      },
    });
  }

  function editarServico(registro) {
    abrirManutencao({
      registro,
      aoSalvar: carregar,
      aoExcluir: async () => {
        const certeza = await confirmar({
          titulo: 'Excluir servico?',
          texto: `${registro.tipo} de ${dataRelativa(registro.data).toLowerCase()}.${
            registro.comprovante ? ' O comprovante tambem sera apagado.' : ''
          } Nao da para desfazer.`,
          acao: 'Excluir',
          perigo: true,
        });
        if (!certeza) return false;
        try {
          await excluirManutencao(registro.id, registro.comprovante);
          toast('Servico excluido.');
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
