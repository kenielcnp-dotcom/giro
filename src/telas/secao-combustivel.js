// =====================================================================
// Secao Combustivel da aba Carro.
// =====================================================================

import { listarAbastecimentos, excluirAbastecimento } from '../dados.js';
import {
  kmRodados, kmPorLitro, totalCombustivel, totalLitros, precoMedioLitro,
} from '../lib/consumo.js';
import { moeda, numero, dataRelativa } from '../lib/format.js';
import { esc } from '../lib/html.js';
import { vazio } from '../ui/vazio.js';
import { abrirAbastecimento } from '../ui/abastecimento.js';
import { confirmar } from '../ui/confirmar.js';
import { toast, toastErro } from '../ui/toast.js';

export function secaoCombustivel(alvo) {
  let abastecimentos = [];

  async function carregar() {
    alvo.innerHTML = '<div class="cartao"><div class="carregando-bloco"></div></div>';
    try {
      abastecimentos = await listarAbastecimentos();
    } catch (e) {
      alvo.innerHTML = `<div class="aviso aviso-erro">${esc(e.message)}</div>`;
      return;
    }
    desenhar();
  }

  function desenhar() {
    if (!abastecimentos.length) {
      alvo.innerHTML = `
        <button class="btn btn-principal btn-bloco acao" type="button" data-novo>
          Registrar abastecimento
        </button>
        ${vazio({
          arte: 'combustivel',
          titulo: 'Nenhum abastecimento ainda.',
          apoio: 'Informe o km do painel a cada abastecida: com dois registros '
               + 'o app ja calcula consumo e custo por km.',
        })}`;
      ligar();
      return;
    }

    const km = kmRodados(abastecimentos);
    const media = kmPorLitro(abastecimentos);
    const precoMedio = precoMedioLitro(abastecimentos);

    alvo.innerHTML = `
      <button class="btn btn-principal btn-bloco acao" type="button" data-novo>
        Registrar abastecimento
      </button>

      <section class="metricas" aria-label="Resumo de combustivel">
        <div class="metrica">
          <span class="rotulo">Gasto</span>
          <strong class="num">${moeda(totalCombustivel(abastecimentos))}</strong>
        </div>
        <div class="metrica">
          <span class="rotulo">Litros</span>
          <strong class="num">${numero(totalLitros(abastecimentos))}</strong>
        </div>
        <div class="metrica">
          <span class="rotulo">Medio/L</span>
          <strong class="num">${precoMedio ? moeda(precoMedio) : '--'}</strong>
        </div>
      </section>

      ${km || media ? `
        <div class="faixa-consumo">
          ${km ? `<div><span class="rotulo">Rodados</span><strong class="num">${numero(km)} km</strong></div>` : ''}
          ${media ? `<div><span class="rotulo">Consumo medio</span><strong class="num">${media.toFixed(1)} km/l</strong></div>` : ''}
        </div>
        ${media ? `<p class="apoio nota-premissa">
          Media aproximada: so fecha exato se todos os abastecimentos forem de tanque cheio.
        </p>` : ''}
      ` : ''}

      <section class="pilha-sm">
        <h2>Historico</h2>
        <ul class="lista">${abastecimentos.map(linha).join('')}</ul>
      </section>
    `;
    ligar();
  }

  function linha(a) {
    const detalhe = [
      a.litros ? `${numero(a.litros)} L` : null,
      a.preco_litro ? `${moeda(a.preco_litro)}/L` : null,
      a.odometro ? `${numero(a.odometro)} km` : null,
      a.posto,
    ].filter(Boolean).join(' &middot; ');

    return `
      <li>
        <button type="button" class="lista-item lista-item-toque" data-id="${a.id}">
          <span class="ponto neg" aria-hidden="true"></span>
          <div class="lista-texto">
            <strong>${esc(dataRelativa(a.data))}${a.comprovante ? ' &#128206;' : ''}</strong>
            ${detalhe ? `<span class="apoio">${esc(detalhe)}</span>` : ''}
          </div>
          <span class="num lista-valor neg">${moeda(a.valor)}</span>
        </button>
      </li>`;
  }

  function ligar() {
    alvo.querySelector('[data-novo]')?.addEventListener('click', () =>
      abrirAbastecimento({ aoSalvar: carregar })
    );

    alvo.querySelectorAll('[data-id]').forEach((b) =>
      b.addEventListener('click', () => {
        const registro = abastecimentos.find((a) => a.id === b.dataset.id);
        if (registro) abrir(registro);
      })
    );
  }

  function abrir(registro) {
    abrirAbastecimento({
      registro,
      aoSalvar: carregar,
      aoExcluir: async () => {
        const certeza = await confirmar({
          titulo: 'Excluir abastecimento?',
          texto: `${moeda(registro.valor)} de ${dataRelativa(registro.data).toLowerCase()}.${
            registro.comprovante ? ' O comprovante tambem sera apagado.' : ''
          } Nao da para desfazer.`,
          acao: 'Excluir',
          perigo: true,
        });
        if (!certeza) return false;

        try {
          await excluirAbastecimento(registro.id, registro.comprovante);
          toast('Abastecimento excluido.');
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
