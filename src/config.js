// =====================================================================
// Conexao com o Supabase
//
// SOBRE ESTA CHAVE ESTAR VISIVEL:
// A chave "publishable" (antiga "anon") e publica por projeto. Todo app
// Supabase do mundo a envia para o navegador de qualquer visitante -- e
// assim que a biblioteca funciona. Ela sozinha nao da acesso a nada:
// quem decide o que pode ser lido e gravado e o RLS, dentro do banco
// (supabase/02_rls.sql).
//
// NUNCA coloque aqui:
//   sb_secret_...  ou  service_role  -> ignoram o RLS
//   sbp_...                          -> controla a conta inteira
//   a senha do banco
// Se para ver a chave voce precisou clicar em "revelar", e a errada.
// =====================================================================

export const SUPABASE_URL = 'https://fzssxpbixuvnoeelokig.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_lbFh0rB7MHB_mnUpxMy9MA_oWVtdFPW';

export const configurado =
  SUPABASE_URL.startsWith('https://') &&
  /^(sb_publishable_|eyJ)/.test(SUPABASE_KEY);
