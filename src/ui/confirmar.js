// =====================================================================
// Confirmacao para acao destrutiva.
//
// Promise em vez de callback: quem chama escreve
//   if (await confirmar(...)) ...
// que le como a decisao que e.
// =====================================================================

export function confirmar({
  titulo,
  texto,
  acao = 'Confirmar',
  perigo = false,
}) {
  return new Promise((resolver) => {
    const dialogo = document.createElement('dialog');
    dialogo.className = 'confirma';
    dialogo.innerHTML = `
      <div class="pilha">
        <div class="pilha-sm">
          <h2>${titulo}</h2>
          ${texto ? `<p class="apoio">${texto}</p>` : ''}
        </div>
        <div class="confirma-botoes">
          <button class="btn btn-secundario" type="button" data-r="nao">Cancelar</button>
          <button class="btn ${perigo ? 'btn-perigo' : 'btn-principal'}" type="button" data-r="sim">
            ${acao}
          </button>
        </div>
      </div>
    `;

    document.body.append(dialogo);

    function responder(valor) {
      dialogo.close();
      dialogo.remove();
      resolver(valor);
    }

    dialogo.querySelector('[data-r="nao"]').addEventListener('click', () => responder(false));
    dialogo.querySelector('[data-r="sim"]').addEventListener('click', () => responder(true));
    dialogo.addEventListener('cancel', (ev) => {
      ev.preventDefault();
      responder(false);
    });
    dialogo.addEventListener('click', (ev) => {
      if (ev.target === dialogo) responder(false);
    });

    dialogo.showModal();
    // Foco no Cancelar: numa acao destrutiva, o Enter distraido nao
    // pode cair no botao que apaga.
    dialogo.querySelector('[data-r="nao"]').focus();
  });
}
