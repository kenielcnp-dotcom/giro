// =====================================================================
// Formularios de manutencao: o servico feito e o servico planejado.
// =====================================================================

import {
  criarManutencao, atualizarManutencao,
  criarPlano, atualizarPlano,
  enviarComprovante, apagarComprovante, odometroAtual,
} from '../dados.js';
import { iso, lerValor, valor as fmtValor, numero } from '../lib/format.js';
import { TIPOS, INTERVALOS } from '../lib/manutencao.js';
import { esc } from '../lib/html.js';
import { abrirSheet } from './sheet.js';
import { controleFoto } from './foto.js';
import { toast } from './toast.js';

const listaTipos = (id) => `
  <datalist id="${id}">
    ${TIPOS.map((t) => `<option value="${t}">`).join('')}
  </datalist>`;


// =====================================================================
// Servico realizado
// =====================================================================

export async function abrirManutencao({ registro = null, aoSalvar, aoExcluir }) {
  const editando = Boolean(registro);

  let odometro = null;
  if (!editando) {
    try { odometro = await odometroAtual(); } catch { /* sugestao opcional */ }
  }

  const form = document.createElement('form');
  form.className = 'pilha';
  form.noValidate = true;

  form.innerHTML = `
    <div class="campo">
      <label for="tipo">Servico</label>
      <input class="entrada" id="tipo" name="tipo" type="text" required
             list="tipos-manut" autocomplete="off" autofocus
             placeholder="Troca de oleo, freios, revisao..."
             value="${esc(registro?.tipo ?? '')}">
      ${listaTipos('tipos-manut')}
    </div>

    <div class="valor-campo">
      <span class="valor-moeda" aria-hidden="true">R$</span>
      <input class="valor-entrada num" id="valor" name="valor"
             type="text" inputmode="decimal" autocomplete="off"
             placeholder="0,00" aria-label="Valor pago"
             value="${registro?.valor ? fmtValor(registro.valor) : ''}">
    </div>

    <div class="dupla">
      <div class="campo">
        <label for="data">Data</label>
        <input class="entrada" id="data" name="data" type="date"
               value="${registro?.data ?? iso()}" max="${iso()}">
      </div>
      <div class="campo">
        <label for="odometro">Km do painel</label>
        <input class="entrada num" id="odometro" name="odometro" type="text"
               inputmode="numeric" autocomplete="off"
               placeholder="${odometro ? numero(odometro) : 'opcional'}"
               value="${registro?.odometro ?? ''}">
      </div>
    </div>

    <div data-foto></div>

    <details class="mais" ${editando ? 'open' : ''}>
      <summary>Mais detalhes</summary>
      <div class="pilha" style="padding-top: var(--e-4);">
        <div class="campo">
          <label for="oficina">Oficina</label>
          <input class="entrada" id="oficina" name="oficina" type="text"
                 autocomplete="off" placeholder="opcional"
                 value="${esc(registro?.oficina ?? '')}">
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
      ${editando ? 'Salvar alteracoes' : 'Registrar servico'}
    </button>

    ${editando && aoExcluir ? `
      <button class="btn-texto btn-texto-perigo" type="button" id="excluir">
        Excluir registro
      </button>` : ''}
  `;

  const foto = controleFoto({
    caminhoAtual: registro?.comprovante ?? null,
    rotulo: 'Anexar nota',
  });
  form.querySelector('[data-foto]').replaceWith(foto.elemento);

  const { fechar } = abrirSheet({
    titulo: editando ? 'Editar servico' : 'Registrar servico',
    corpo: form,
  });

  const botao = form.querySelector('#salvar');
  const caixaErro = form.querySelector('#erro');
  const mostrarErro = (t) => { caixaErro.textContent = t; caixaErro.hidden = false; };

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    caixaErro.hidden = true;

    const dados = new FormData(form);
    const tipo = dados.get('tipo')?.trim();
    if (!tipo) {
      form.querySelector('#tipo').focus();
      return mostrarErro('Informe qual servico foi feito.');
    }

    const odoTexto = dados.get('odometro')?.replace(/\D/g, '') ?? '';

    const campos = {
      tipo,
      valor: lerValor(dados.get('valor')),
      data: dados.get('data') || iso(),
      odometro: odoTexto ? Number(odoTexto) : null,
      oficina: dados.get('oficina')?.trim() || null,
      obs: dados.get('obs')?.trim() || null,
    };

    botao.disabled = true;
    botao.innerHTML = '<span class="girando"></span>';

    try {
      if (foto.arquivo) campos.comprovante = await enviarComprovante(foto.arquivo);
      else if (foto.descartar) campos.comprovante = null;

      const salvo = editando
        ? await atualizarManutencao(registro.id, campos)
        : await criarManutencao(campos);

      if (foto.descartar) await apagarComprovante(foto.caminhoAntigo);

      fechar();
      toast(editando ? 'Servico atualizado.' : `${tipo} registrado.`);
      aoSalvar?.(salvo);
    } catch (e) {
      mostrarErro(e.message);
      botao.disabled = false;
      botao.textContent = editando ? 'Salvar alteracoes' : 'Registrar servico';
    }
  });

  form.querySelector('#excluir')?.addEventListener('click', async (ev) => {
    ev.currentTarget.disabled = true;
    const excluiu = await aoExcluir();
    if (excluiu) fechar();
    else ev.currentTarget.disabled = false;
  });
}


// =====================================================================
// Servico planejado (calendario)
// =====================================================================

export async function abrirPlano({ plano = null, aoSalvar, aoExcluir }) {
  const editando = Boolean(plano);

  let odometro = null;
  try { odometro = await odometroAtual(); } catch { /* opcional */ }

  const form = document.createElement('form');
  form.className = 'pilha';
  form.noValidate = true;

  form.innerHTML = `
    <div class="campo">
      <label for="titulo">O que</label>
      <input class="entrada" id="titulo" name="titulo" type="text" required
             list="tipos-plano" autocomplete="off" autofocus
             placeholder="Troca de oleo, revisao, IPVA..."
             value="${esc(plano?.titulo ?? '')}">
      ${listaTipos('tipos-plano')}
    </div>

    <p class="apoio">
      Preencha a data, a quilometragem, ou as duas.
      Com as duas, o aviso vem pelo que chegar primeiro.
    </p>

    <div class="dupla">
      <div class="campo">
        <label for="data_alvo">Data</label>
        <input class="entrada" id="data_alvo" name="data_alvo" type="date"
               value="${plano?.data_alvo ?? ''}">
      </div>
      <div class="campo">
        <label for="km_alvo">No km</label>
        <input class="entrada num" id="km_alvo" name="km_alvo" type="text"
               inputmode="numeric" autocomplete="off"
               placeholder="${odometro ? `hoje: ${numero(odometro)}` : 'ex: 90000'}"
               value="${plano?.km_alvo ?? ''}">
      </div>
    </div>

    <div class="campo">
      <label for="intervalo_km">Repetir a cada (km)</label>
      <input class="entrada num" id="intervalo_km" name="intervalo_km" type="text"
             inputmode="numeric" autocomplete="off" placeholder="opcional"
             value="${plano?.intervalo_km ?? ''}">
      <span class="apoio">
        Ao concluir, o app ja cria o proximo somando este intervalo.
      </span>
    </div>

    <div id="erro" hidden class="aviso aviso-erro" role="alert"></div>

    <button class="btn btn-principal btn-bloco" type="submit" id="salvar">
      ${editando ? 'Salvar alteracoes' : 'Agendar'}
    </button>

    ${editando && aoExcluir ? `
      <button class="btn-texto btn-texto-perigo" type="button" id="excluir">
        Excluir agendamento
      </button>` : ''}
  `;

  const { fechar } = abrirSheet({
    titulo: editando ? 'Editar agendamento' : 'Agendar manutencao',
    corpo: form,
  });

  const campoTitulo = form.querySelector('#titulo');
  const campoKm = form.querySelector('#km_alvo');
  const campoIntervalo = form.querySelector('#intervalo_km');

  // Ao escolher um servico conhecido, sugere o intervalo usual e ja
  // projeta o km alvo a partir de onde o carro esta. Continua editavel:
  // e chute informado, nao regra.
  campoTitulo.addEventListener('change', () => {
    if (editando) return;
    const intervalo = INTERVALOS[campoTitulo.value.trim()];
    if (!intervalo) return;

    if (!campoIntervalo.value) campoIntervalo.value = intervalo;
    if (!campoKm.value && odometro) campoKm.value = odometro + intervalo;
  });

  const botao = form.querySelector('#salvar');
  const caixaErro = form.querySelector('#erro');
  const mostrarErro = (t) => { caixaErro.textContent = t; caixaErro.hidden = false; };

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    caixaErro.hidden = true;

    const dados = new FormData(form);
    const titulo = dados.get('titulo')?.trim();
    if (!titulo) {
      campoTitulo.focus();
      return mostrarErro('Diga o que precisa ser feito.');
    }

    const kmTexto = dados.get('km_alvo')?.replace(/\D/g, '') ?? '';
    const intervaloTexto = dados.get('intervalo_km')?.replace(/\D/g, '') ?? '';
    const dataAlvo = dados.get('data_alvo') || null;
    const kmAlvo = kmTexto ? Number(kmTexto) : null;

    // O banco tem a mesma regra como CHECK. Validar aqui evita que o
    // usuario receba um erro de constraint em ingles.
    if (!dataAlvo && !kmAlvo) {
      return mostrarErro('Informe pelo menos uma data ou uma quilometragem.');
    }

    const campos = {
      titulo,
      data_alvo: dataAlvo,
      km_alvo: kmAlvo,
      intervalo_km: intervaloTexto ? Number(intervaloTexto) : null,
    };

    botao.disabled = true;
    botao.innerHTML = '<span class="girando"></span>';

    try {
      const salvo = editando
        ? await atualizarPlano(plano.id, campos)
        : await criarPlano(campos);
      fechar();
      toast(editando ? 'Agendamento atualizado.' : `${titulo} agendado.`);
      aoSalvar?.(salvo);
    } catch (e) {
      mostrarErro(e.message);
      botao.disabled = false;
      botao.textContent = editando ? 'Salvar alteracoes' : 'Agendar';
    }
  });

  form.querySelector('#excluir')?.addEventListener('click', async (ev) => {
    ev.currentTarget.disabled = true;
    const excluiu = await aoExcluir();
    if (excluiu) fechar();
    else ev.currentTarget.disabled = false;
  });
}
