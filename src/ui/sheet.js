// =====================================================================
// Folha que sobe de baixo (bottom sheet).
//
// Usa <dialog> nativo em vez de uma div: o navegador ja da prisao de
// foco, fechamento no Esc e inercia de fundo de graca, e faz isso
// melhor do que uma reimplementacao manual.
// =====================================================================

export function abrirSheet({ titulo, corpo, aoFechar }) {
  const dialogo = document.createElement('dialog');
  dialogo.className = 'sheet';
  dialogo.setAttribute('aria-label', titulo);

  dialogo.innerHTML = `
    <div class="sheet-topo">
      <span class="sheet-puxador" aria-hidden="true"></span>
      <div class="linha-entre">
        <h2>${titulo}</h2>
        <button class="sheet-fechar" type="button" aria-label="Fechar">&times;</button>
      </div>
    </div>
    <div class="sheet-corpo"></div>
  `;

  dialogo.querySelector('.sheet-corpo').append(corpo);
  document.body.append(dialogo);
  document.body.style.overflow = 'hidden';

  function fechar() {
    dialogo.classList.add('saindo');
    setTimeout(() => {
      dialogo.close();
      dialogo.remove();
      document.body.style.overflow = '';
      aoFechar?.();
    }, 160);
  }

  dialogo.querySelector('.sheet-fechar').addEventListener('click', fechar);

  // Toque no fundo escuro fecha. Comparar com o proprio dialogo funciona
  // porque o ::backdrop conta como area do elemento.
  dialogo.addEventListener('click', (ev) => {
    if (ev.target === dialogo) fechar();
  });

  // Esc dispara "cancel"; interceptamos para animar a saida.
  dialogo.addEventListener('cancel', (ev) => {
    ev.preventDefault();
    fechar();
  });

  dialogo.showModal();

  // Foca o primeiro campo para o teclado ja abrir. E o que transforma
  // "abrir e digitar" em um toque so.
  const primeiro = corpo.querySelector('[autofocus], input, textarea, select');
  primeiro?.focus();

  return { fechar, elemento: dialogo };
}
