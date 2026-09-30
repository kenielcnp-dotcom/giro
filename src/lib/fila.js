// =====================================================================
// Fila de envio para quando falta sinal.
//
// Garagem, subsolo, estrada sem cobertura: o lancamento nao pode se
// perder so porque a rede caiu na hora de salvar. O registro fica aqui
// e sobe sozinho quando a internet volta.
//
// DUAS DECISOES QUE SUSTENTAM ISSO:
//
// 1. O id e gerado no aparelho, nao no banco. Como ele vai junto no
//    insert, um reenvio da mesma operacao esbarra na chave primaria e
//    e recusado -- em vez de criar um segundo lancamento igual. E a
//    protecao contra duplicar quando a rede volta no meio do envio.
//
// 2. So lancamento entra na fila. Abastecimento e manutencao carregam
//    foto, e guardar imagem em localStorage estoura a cota do
//    navegador rapido. Esses avisam que precisam de conexao, o que e
//    honesto: a foto precisa subir de qualquer forma.
// =====================================================================

const CHAVE = 'giro:fila';
const ouvintes = new Set();

function ler() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    const lista = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    // Armazenamento bloqueado ou conteudo corrompido: segue sem fila.
    return [];
  }
}

function gravar(lista) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(lista));
  } catch {
    // Sem espaco ou sem permissao. Nao da para enfileirar, e quem
    // chamou ja vai receber o erro de rede original.
  }
  ouvintes.forEach((fn) => fn(lista.length));
}

/** Reconhece falha de rede, que e o unico caso que vale enfileirar. */
export function ehFalhaDeRede(erro) {
  if (!navigator.onLine) return true;
  const msg = String(erro?.message ?? erro ?? '');
  return /failed to fetch|networkerror|load failed|network request failed/i.test(msg);
}

export function enfileirar(tabela, registro) {
  const lista = ler();
  lista.push({ tabela, registro, criadoEm: Date.now() });
  gravar(lista);
}

export function pendentes() {
  return ler();
}

export const tamanhoFila = () => ler().length;

export function aoMudarFila(callback) {
  ouvintes.add(callback);
  return () => ouvintes.delete(callback);
}

/**
 * Tenta enviar tudo que esta esperando.
 *
 * Devolve quantos subiram. Item que falha por rede fica para a
 * proxima; item recusado pelo banco (duplicado, ou regra violada) sai
 * da fila, porque tentar de novo daria no mesmo para sempre.
 */
export async function processarFila(db) {
  if (!navigator.onLine) return 0;

  const lista = ler();
  if (!lista.length) return 0;

  const sobraram = [];
  let enviados = 0;

  for (const item of lista) {
    try {
      const { error } = await db.from(item.tabela).insert(item.registro);

      if (!error) {
        enviados += 1;
        continue;
      }

      // 23505 = chave duplicada. Significa que este registro ja subiu
      // numa tentativa anterior: o objetivo foi cumprido.
      if (error.code === '23505') {
        enviados += 1;
        continue;
      }

      if (ehFalhaDeRede(error)) {
        sobraram.push(item);
      } else {
        console.warn('[Giro] lancamento recusado pelo banco, saiu da fila:', error);
      }
    } catch (e) {
      if (ehFalhaDeRede(e)) sobraram.push(item);
      else console.warn('[Giro] lancamento descartado da fila:', e);
    }
  }

  gravar(sobraram);
  return enviados;
}
