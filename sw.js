/* =====================================================================
   Service worker do Giro.

   Faz duas coisas, e so duas:
   1. Guarda os arquivos do app para ele abrir instantaneo e funcionar
      sem sinal.
   2. Sai da frente de tudo que for dado.

   O ponto 2 importa mais que o 1. As respostas do Supabase sao
   autenticadas e mudam a cada lancamento: guardar qualquer uma delas
   em cache mostraria saldo velho como se fosse o de agora, e deixaria
   dado de conta no armazenamento do navegador depois do logout.
   Por isso toda chamada que nao seja deste dominio passa direto.
   ===================================================================== */

// Trocar esta versao a cada publicacao: e o que faz o navegador buscar
// os arquivos novos em vez de servir os guardados.
const VERSAO = 'giro-v1';

// O minimo para a primeira tela aparecer sem rede.
const CONCHA = [
  '/',
  '/index.html',
  '/manifest.json',
  '/src/main.js',
  '/src/config.js',
  '/src/supabase.js',
  '/src/auth.js',
  '/src/router.js',
  '/src/dados.js',
  '/src/styles/tokens.css',
  '/src/styles/app.css',
  '/src/styles/componentes.css',
  '/icones/icone-192.png',
  '/icones/icone-512.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSAO)
      // addAll falha inteiro se um arquivo falhar. Aqui cada um e
      // tratado sozinho: um icone que nao baixou nao pode impedir o
      // app de instalar.
      .then((cache) => Promise.allSettled(CONCHA.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(
        chaves.filter((c) => c !== VERSAO).map((c) => caches.delete(c))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  const url = new URL(request.url);

  // Só GET: POST, PATCH e DELETE nunca passam por cache.
  if (request.method !== 'GET') return;

  // Outro dominio -- Supabase, Google Fonts -- passa direto. As fontes
  // ate poderiam ser guardadas, mas o proprio navegador ja faz isso, e
  // misturar dominios aqui e o caminho mais curto para guardar sem
  // querer uma resposta autenticada.
  if (url.origin !== self.location.origin) return;

  evento.respondWith(
    // Rede primeiro: com sinal, voce sempre ve a versao publicada.
    // O cache e a rede de seguranca, nao a fonte principal -- o
    // contrario faria uma correcao demorar dias para chegar.
    fetch(request)
      .then((resposta) => {
        if (resposta.ok) {
          const copia = resposta.clone();
          caches.open(VERSAO).then((cache) => cache.put(request, copia));
        }
        return resposta;
      })
      .catch(async () => {
        const guardado = await caches.match(request);
        if (guardado) return guardado;

        // Navegacao sem rede e sem cache da pagina: devolve a casca.
        if (request.mode === 'navigate') {
          const raiz = await caches.match('/index.html');
          if (raiz) return raiz;
        }

        return new Response('Sem conexao.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      })
  );
});
