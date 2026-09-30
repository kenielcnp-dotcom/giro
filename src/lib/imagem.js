// =====================================================================
// Preparo da foto do comprovante antes de subir.
//
// Uma foto de celular tem 3 a 6 MB. Subir assim custa caro em tres
// frentes: estoura o limite de 5 MB do bucket, consome rapido o 1 GB do
// plano gratuito (uns 200 comprovantes e acabou), e demora no 4G do
// posto, que e exatamente onde a foto e tirada.
//
// Reduzida para 1600px no maior lado e JPEG 0.8, a mesma nota cabe em
// 200-400 KB e continua perfeitamente legivel -- inclusive os numeros
// pequenos do cupom fiscal.
// =====================================================================

const LADO_MAXIMO = 1600;
const QUALIDADE = 0.8;

export async function prepararImagem(arquivo) {
  // PDF nao e imagem: passa direto, sem tentar redimensionar.
  if (arquivo.type === 'application/pdf') return arquivo;

  if (!arquivo.type.startsWith('image/')) {
    throw new Error('Escolha uma imagem ou um PDF.');
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(arquivo);
  } catch {
    // Formato que o navegador nao decodifica (HEIC antigo do iPhone,
    // por exemplo). Sobe o original e deixa o limite do bucket decidir.
    return arquivo;
  }

  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));

  // Ja e pequena: recomprimir so perderia qualidade a toa.
  if (escala === 1 && arquivo.size < 600_000) {
    bitmap.close();
    return arquivo;
  }

  const largura = Math.round(bitmap.width * escala);
  const altura = Math.round(bitmap.height * escala);

  const tela = document.createElement('canvas');
  tela.width = largura;
  tela.height = altura;

  const ctx = tela.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();

  const blob = await new Promise((r) => tela.toBlob(r, 'image/jpeg', QUALIDADE));
  if (!blob) return arquivo;

  // Se a compressao nao ajudou, fica com o original.
  if (blob.size >= arquivo.size) return arquivo;

  return new File([blob], trocarExtensao(arquivo.name), {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}

function trocarExtensao(nome = 'comprovante') {
  return `${nome.replace(/\.[^.]+$/, '')}.jpg`;
}

export function tamanhoLegivel(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
