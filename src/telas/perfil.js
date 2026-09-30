// =====================================================================
// Perfil e preferencias.
// =====================================================================

import { db, traduzirErro } from '../supabase.js';
import { sair } from '../auth.js';
import { esc } from '../lib/html.js';
import { confirmar } from '../ui/confirmar.js';
import { toast, toastErro } from '../ui/toast.js';

const TEMAS = [
  ['sistema', 'Sistema'],
  ['claro', 'Claro'],
  ['escuro', 'Escuro'],
];

export function aplicarTemaSalvo() {
  let tema = 'sistema';
  try {
    tema = localStorage.getItem('giro:tema') || 'sistema';
  } catch {
    // Navegacao privada ou armazenamento bloqueado: segue no sistema.
  }
  if (tema === 'sistema') document.documentElement.removeAttribute('data-tema');
  else document.documentElement.setAttribute('data-tema', tema);
  return tema;
}

export function telaPerfil(raiz, { perfil, sessao, aoAtualizarPerfil }) {
  const secao = document.createElement('main');
  secao.className = 'app pilha';
  raiz.replaceChildren(secao);

  const temaAtual = aplicarTemaSalvo();

  secao.innerHTML = `
    <header class="cabecalho">
      <div class="pilha-sm">
        <p class="rotulo">Conta</p>
        <h1>Perfil</h1>
      </div>
    </header>

    <form class="cartao pilha" id="form-perfil">
      <div class="campo">
        <label for="nome">Nome</label>
        <input class="entrada" id="nome" name="nome" type="text"
               autocomplete="name" value="${esc(perfil?.nome ?? '')}">
      </div>

      <div class="campo">
        <label for="carro">Carro</label>
        <input class="entrada" id="carro" name="carro" type="text"
               placeholder="opcional" value="${esc(perfil?.carro ?? '')}">
      </div>

      <div class="campo">
        <label for="email">E-mail</label>
        <input class="entrada" id="email" type="email" value="${esc(sessao.user.email)}"
               disabled aria-describedby="email-nota">
        <span class="apoio" id="email-nota">Trocar o e-mail exige refazer o login.</span>
      </div>

      <button class="btn btn-principal btn-bloco" type="submit" id="salvar">Salvar</button>
    </form>

    <section class="cartao pilha">
      <div class="pilha-sm">
        <h2>Aparencia</h2>
        <p class="apoio">Fica salvo neste aparelho.</p>
      </div>
      <div class="segmento" role="radiogroup" aria-label="Tema">
        ${TEMAS.map(([v, r]) => `
          <button type="button" role="radio" data-tema="${v}"
                  aria-checked="${v === temaAtual}"
                  aria-selected="${v === temaAtual}">${r}</button>
        `).join('')}
      </div>
    </section>

    <button class="btn btn-secundario btn-bloco" type="button" id="sair">Sair da conta</button>
  `;

  // --- Salvar perfil ----------------------------------------------------
  const form = secao.querySelector('#form-perfil');
  const botao = secao.querySelector('#salvar');

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const dados = new FormData(form);
    const nome = dados.get('nome')?.trim();
    if (!nome) return toastErro('O nome nao pode ficar vazio.');

    botao.disabled = true;
    botao.innerHTML = '<span class="girando"></span>';

    // Sem .eq('id', ...): a politica de update de profiles ja restringe
    // a linha do dono.
    const { data, error } = await db
      .from('profiles')
      .update({ nome, carro: dados.get('carro')?.trim() || null })
      .eq('id', sessao.user.id)
      .select()
      .single();

    botao.disabled = false;
    botao.textContent = 'Salvar';

    if (error) return toastErro(traduzirErro(error));
    toast('Perfil salvo.');
    aoAtualizarPerfil?.(data);
  });

  // --- Tema --------------------------------------------------------------
  secao.querySelectorAll('[data-tema]').forEach((b) => {
    b.addEventListener('click', () => {
      const escolha = b.dataset.tema;
      try {
        localStorage.setItem('giro:tema', escolha);
      } catch {
        // Sem armazenamento o tema vale so para esta sessao.
      }
      aplicarTemaSalvo();
      secao.querySelectorAll('[data-tema]').forEach((o) => {
        const ativo = o === b;
        o.setAttribute('aria-checked', String(ativo));
        o.setAttribute('aria-selected', String(ativo));
      });
    });
  });

  // --- Sair --------------------------------------------------------------
  secao.querySelector('#sair').addEventListener('click', async () => {
    const certeza = await confirmar({
      titulo: 'Sair da conta?',
      texto: 'Seus dados ficam salvos. Voce entra de novo com e-mail e senha.',
      acao: 'Sair',
    });
    if (certeza) await sair();
  });
}
