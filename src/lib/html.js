// =====================================================================
// Escape de HTML.
//
// Todo texto vindo do banco (observacao, plataforma, nome de posto) passa
// por aqui antes de entrar numa template string. Os dados sao do proprio
// usuario, mas "so eu uso" nao e defesa: basta colar uma descricao
// copiada de algum lugar para que a pagina passe a executar aquilo.
// =====================================================================

const MAPA = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const esc = (v) =>
  v == null ? '' : String(v).replace(/[&<>"']/g, (c) => MAPA[c]);
