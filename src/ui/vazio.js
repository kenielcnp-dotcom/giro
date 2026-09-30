// =====================================================================
// Estado vazio.
//
// Antes isto era um bolinha cinza repetida em sete telas. Agora e um
// componente so, com formas geometricas planas no espirito paper-cut da
// linguagem visual -- recortes de papel colorido, sem contorno, sem
// sombra, direto sobre o papel creme.
//
// Nao ha personagens: a referencia os usa numa home institucional, onde
// a pessoa passa uma vez. Aqui a mesma tela vai ser vista centenas de
// vezes por alguem com pressa, e ilustracao de figura humana cansa e
// pesa. Forma geometrica da o calor sem virar enfeite.
// =====================================================================

import { esc } from '../lib/html.js';

// currentColor nao serve aqui: as formas usam os tons vivos de
// preenchimento, que existem nos dois temas.
const ARTES = {
  // Notas empilhadas: dinheiro entrando e saindo.
  dinheiro: `
    <rect x="8"  y="30" width="80" height="34" rx="10" fill="var(--entrada-fill)"/>
    <rect x="16" y="44" width="80" height="34" rx="10" fill="var(--saida-fill)"/>
    <circle cx="56" cy="61" r="9" fill="var(--papel-alto)"/>`,

  // Bomba de combustivel reduzida a um retangulo e uma gota.
  combustivel: `
    <rect x="22" y="18" width="42" height="62" rx="12" fill="var(--saida-fill)"/>
    <rect x="32" y="30" width="22" height="16" rx="5" fill="var(--papel-alto)"/>
    <path d="M74 34c6 8 10 13 10 19a10 10 0 0 1-20 0c0-6 4-11 10-19z"
          fill="var(--alerta-fill)"/>`,

  // Engrenagem: circulo com quatro dentes quadrados.
  oficina: `
    <rect x="42" y="8"  width="14" height="20" rx="4" fill="var(--info-fill)"/>
    <rect x="42" y="70" width="14" height="20" rx="4" fill="var(--info-fill)"/>
    <rect x="8"  y="42" width="20" height="14" rx="4" fill="var(--info-fill)"/>
    <rect x="70" y="42" width="20" height="14" rx="4" fill="var(--info-fill)"/>
    <circle cx="49" cy="49" r="26" fill="var(--alerta-fill)"/>
    <circle cx="49" cy="49" r="10" fill="var(--papel-alto)"/>`,

  // Lista com itens conferidos.
  lista: `
    <rect x="14" y="16" width="70" height="68" rx="14" fill="var(--papel-fundo)"/>
    <circle cx="32" cy="36" r="7" fill="var(--entrada-fill)"/>
    <rect x="45" y="32" width="26" height="8" rx="4" fill="var(--ink-3)"/>
    <circle cx="32" cy="56" r="7" fill="var(--entrada-fill)"/>
    <rect x="45" y="52" width="20" height="8" rx="4" fill="var(--ink-3)"/>
    <circle cx="32" cy="74" r="7" fill="var(--alerta-fill)"/>
    <rect x="45" y="70" width="24" height="8" rx="4" fill="var(--ink-3)"/>`,

  // Barras de relatorio.
  grafico: `
    <rect x="14" y="54" width="18" height="32" rx="7" fill="var(--info-fill)"/>
    <rect x="40" y="34" width="18" height="52" rx="7" fill="var(--entrada-fill)"/>
    <rect x="66" y="16" width="18" height="70" rx="7" fill="var(--alerta-fill)"/>`,
};

/**
 * Devolve o HTML de um estado vazio.
 *
 * @param {object} opcoes
 * @param {keyof typeof ARTES} opcoes.arte  qual forma desenhar
 * @param {string} opcoes.titulo            a frase principal
 * @param {string} [opcoes.apoio]           explicacao ou proximo passo
 * @param {boolean} [opcoes.curto]          menos respiro, para usar dentro de secao
 */
export function vazio({ arte = 'dinheiro', titulo, apoio = '', curto = false }) {
  return `
    <div class="vazio${curto ? ' vazio-curto' : ''}">
      <svg class="vazio-arte" viewBox="0 0 98 98" aria-hidden="true">
        ${ARTES[arte] ?? ARTES.dinheiro}
      </svg>
      <p><strong>${esc(titulo)}</strong></p>
      ${apoio ? `<p class="apoio">${esc(apoio)}</p>` : ''}
    </div>`;
}
