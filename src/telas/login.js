// =====================================================================
// Tela de entrada / criacao de conta.
// =====================================================================

import { entrar, cadastrar } from '../auth.js';
import { toast } from '../ui/toast.js';
import { esc } from '../lib/html.js';

// O mesmo velocimetro do icone do app, para a marca ser uma so: arco
// aberto embaixo com ponteiro, que le como painel de carro e como
// "giro" ao mesmo tempo.
const MARCA = `
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M7.57 17.29A6.9 6.9 0 1 1 16.43 17.29"
          stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M12 12 17.1 8.4" stroke="currentColor" stroke-width="2.2"
          stroke-linecap="round"/>
    <circle cx="12" cy="12" r="2" fill="currentColor"/>
  </svg>`;

export function telaLogin(raiz) {
  let modo = 'entrar'; // 'entrar' | 'cadastrar'

  function desenhar() {
    const criando = modo === 'cadastrar';

    raiz.innerHTML = `
      <div class="auth">
        <div class="auth-caixa">
          <header class="auth-marca">
            <div class="auth-logo">${MARCA}</div>
            <h1>Giro</h1>
            <p class="apoio">Seu ganho, seu gasto, o que sobrou.</p>
          </header>

          <form class="cartao pilha" id="form" novalidate>
            ${criando ? `
              <div class="campo">
                <label for="nome">Nome</label>
                <input class="entrada" id="nome" name="nome" type="text"
                       autocomplete="name" required placeholder="Como quer ser chamado">
              </div>` : ''}

            <div class="campo">
              <label for="email">E-mail</label>
              <input class="entrada" id="email" name="email" type="email"
                     autocomplete="email" inputmode="email" required
                     placeholder="voce@exemplo.com">
            </div>

            <div class="campo">
              <label for="senha">Senha</label>
              <input class="entrada" id="senha" name="senha" type="password"
                     autocomplete="${criando ? 'new-password' : 'current-password'}"
                     required minlength="6" placeholder="${criando ? 'Minimo 6 caracteres' : ''}">
            </div>

            <div id="erro" hidden class="aviso aviso-erro" role="alert"></div>

            <button class="btn btn-principal btn-bloco" type="submit" id="enviar">
              ${criando ? 'Criar conta' : 'Entrar'}
            </button>
          </form>

          <p class="auth-troca">
            ${criando ? 'Ja tem conta?' : 'Ainda nao tem conta?'}
            <button class="btn-texto" type="button" id="trocar">
              ${criando ? 'Entrar' : 'Criar agora'}
            </button>
          </p>
        </div>
      </div>
    `;

    const form = raiz.querySelector('#form');
    const botao = raiz.querySelector('#enviar');
    const caixaErro = raiz.querySelector('#erro');

    raiz.querySelector('#trocar').addEventListener('click', () => {
      modo = criando ? 'entrar' : 'cadastrar';
      desenhar();
    });

    function mostrarErro(texto) {
      caixaErro.textContent = texto;
      caixaErro.hidden = false;
    }

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      caixaErro.hidden = true;

      const dados = new FormData(form);
      const email = dados.get('email')?.trim() ?? '';
      const senha = dados.get('senha') ?? '';
      const nome = dados.get('nome')?.trim() ?? '';

      if (!email || !senha) return mostrarErro('Preencha e-mail e senha.');
      if (senha.length < 6) return mostrarErro('A senha precisa de pelo menos 6 caracteres.');
      if (criando && !nome) return mostrarErro('Informe seu nome.');

      botao.disabled = true;
      botao.innerHTML = '<span class="girando"></span>';

      try {
        if (criando) {
          const { precisaConfirmar } = await cadastrar(nome, email, senha);
          if (precisaConfirmar) {
            raiz.querySelector('.auth-caixa').innerHTML = `
              <header class="auth-marca">
                <div class="auth-logo">${MARCA}</div>
                <h1>Confirme seu e-mail</h1>
              </header>
              <div class="cartao pilha">
                <p>Enviamos um link para <strong>${esc(email)}</strong>.</p>
                <p class="apoio">Abra o link para ativar a conta e depois volte aqui para entrar.</p>
              </div>`;
            return;
          }
          toast(`Conta criada. Bem-vindo, ${nome.split(' ')[0]}.`);
        } else {
          await entrar(email, senha);
        }
        // O onAuthStateChange no main.js assume a partir daqui.
      } catch (e) {
        mostrarErro(e.message);
        botao.disabled = false;
        botao.textContent = criando ? 'Criar conta' : 'Entrar';
      }
    });
  }

  desenhar();
}
