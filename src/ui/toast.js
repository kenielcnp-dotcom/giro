// =====================================================================
// Toast: confirmacao curta depois de uma acao.
//
// role="status" faz o leitor de tela anunciar sem roubar o foco -- quem
// estava digitando continua onde estava.
// =====================================================================

let area;

function garantirArea() {
  if (area?.isConnected) return area;
  area = document.createElement('div');
  area.className = 'toast-area';
  area.setAttribute('role', 'status');
  area.setAttribute('aria-live', 'polite');
  document.body.append(area);
  return area;
}

export function toast(texto, tipo = 'ok', ms = 2600) {
  const el = document.createElement('div');
  el.className = `toast toast-${tipo === 'erro' ? 'err' : 'ok'}`;
  el.textContent = texto;
  garantirArea().append(el);

  setTimeout(() => {
    el.style.transition = 'opacity 180ms';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 200);
  }, ms);
}

export const toastErro = (texto) => toast(texto, 'erro', 4000);
