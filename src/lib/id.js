// =====================================================================
// Geracao de identificador para o nome do arquivo no Storage.
//
// crypto.randomUUID() so existe em "contexto seguro": HTTPS ou
// localhost. Ao abrir o app pelo celular em http://192.168.x.x -- que e
// exatamente como ele e testado na rede de casa -- a funcao nao existe e
// o envio da foto quebraria com "randomUUID is not a function".
//
// crypto.getRandomValues(), ao contrario, funciona tambem em http, entao
// serve de reserva com a mesma qualidade de aleatoriedade.
// =====================================================================

export function uuid() {
  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  if (typeof crypto?.getRandomValues === 'function') {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;   // versao 4
    b[8] = (b[8] & 0x3f) | 0x80;   // variante RFC 4122
    const hex = [...b].map((n) => n.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // Ultimo recurso. Nao e criptografico, mas o nome do arquivo nao
  // protege nada: quem protege e a policy do Storage, que so aceita
  // gravar dentro da pasta do proprio usuario.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
