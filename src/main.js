// =====================================================================
// Giro - ponto de entrada.
//
// Decide entre tela de login e app conforme a sessao, e reage a qualquer
// mudanca (login, logout, token expirado) num lugar so.
// =====================================================================

import { configurado } from './config.js';

const raiz = document.querySelector('#raiz');

// Antes de tudo: sem chaves, nada funciona. Falhar aqui com instrucao
// clara e melhor que falhar depois com "Failed to fetch".
if (!configurado) {
  raiz.innerHTML = `
    <div class="auth">
      <div class="auth-caixa">
        <header class="auth-marca">
          <div class="auth-logo" aria-hidden="true">G</div>
          <h1>Falta conectar</h1>
        </header>
        <div class="cartao pilha">
          <p>Abra <code>src/config.js</code> e cole os dois valores do seu projeto Supabase.</p>
          <p class="apoio">
            Painel do Supabase &rarr; Settings &rarr; API &rarr;
            <strong>Project URL</strong> e a chave <strong>publishable</strong>.
          </p>
        </div>
      </div>
    </div>`;
} else {
  iniciar();
}

/**
 * Registra o service worker, que e o que permite instalar na tela
 * inicial e abrir sem sinal.
 *
 * Fora de HTTPS (ou localhost) o navegador nem expoe a API -- por isso
 * a checagem, e nao um try mudo: em http://192.168.x.x, que e como o
 * app roda na rede de casa, simplesmente nao ha service worker.
 */
function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => {
      console.warn('[Giro] service worker nao registrado:', e);
    });
  });
}

/**
 * Sobe o que ficou esperando rede.
 *
 * Roda ao abrir e sempre que a conexao volta. O evento 'online' do
 * navegador e otimista -- avisa que ha interface de rede, nao que ha
 * internet de verdade -- mas o proprio envio falha de novo e o item
 * continua na fila, entao tentar cedo demais nao custa nada.
 */
async function cuidarDaFila() {
  const { processarFila } = await import('./lib/fila.js');
  const { db } = await import('./supabase.js');
  const { toast } = await import('./ui/toast.js');

  async function tentar() {
    try {
      const enviados = await processarFila(db);
      if (enviados > 0) {
        toast(enviados === 1
          ? 'Lancamento pendente foi enviado.'
          : `${enviados} lancamentos pendentes foram enviados.`);
      }
    } catch (e) {
      console.warn('[Giro] fila nao processada:', e);
    }
  }

  window.addEventListener('online', tentar);
  tentar();
}

async function iniciar() {
  registrarServiceWorker();

  const { sessaoAtual, aoMudarSessao, meuPerfil } = await import('./auth.js');
  const { telaLogin } = await import('./telas/login.js');
  const { montarApp } = await import('./router.js');

  let idAtual = null;

  async function desenhar(sessao) {
    // Ignora eventos que nao trocam de usuario (renovacao de token,
    // volta do app ao primeiro plano). Redesenhar ali apagaria o
    // formulario que estivesse aberto.
    if (sessao?.user?.id && sessao.user.id === idAtual) return;
    idAtual = sessao?.user?.id ?? null;

    if (!sessao) return telaLogin(raiz);

    raiz.innerHTML = '<div class="tela-carregando"><span class="girando"></span></div>';

    let perfil = null;
    try {
      perfil = await meuPerfil();
    } catch {
      // O app funciona sem o perfil: o nome e enfeite, os dados nao
      // dependem dele. Melhor entrar sem saudacao que travar na porta.
    }

    const contexto = {
      sessao,
      perfil,
      aoAtualizarPerfil: (novo) => { contexto.perfil = novo; },
    };

    montarApp(raiz, contexto);

    // Só depois de haver sessao: a fila grava em nome do usuario, e
    // sem login o insert seria recusado pelo RLS.
    cuidarDaFila();
  }

  desenhar(await sessaoAtual());
  aoMudarSessao(desenhar);
}
