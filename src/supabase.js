// =====================================================================
// Cliente unico do Supabase.
// Todo o app importa daqui; nunca cria outro createClient.
// =====================================================================

import { createClient } from 'supabase';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    // Mantem a sessao no aparelho: voce loga uma vez e nao loga de novo.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// ---------------------------------------------------------------------
// Traducao de erro.
//
// O Supabase responde em ingles e com jargao de banco. Mostrar isso cru
// para quem esta dirigindo nao ajuda. Aqui vira uma frase acionavel, e o
// erro original continua no console para diagnostico.
// ---------------------------------------------------------------------
const MENSAGENS = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'Email not confirmed': 'Confirme seu e-mail antes de entrar.',
  'User already registered': 'Ja existe uma conta com este e-mail.',
  'Password should be at least 6 characters': 'A senha precisa de pelo menos 6 caracteres.',
  'Unable to validate email address: invalid format': 'E-mail em formato invalido.',
  'For security purposes, you can only request this after 60 seconds':
    'Aguarde um minuto antes de tentar de novo.',
  // Plano free envia poucos e-mails por hora. Quem usa este app tambem
  // administra o projeto, entao a mensagem diz onde resolver.
  'email rate limit exceeded':
    'Limite de e-mails do Supabase atingido. Desligue "Confirm email" no painel (Authentication > Sign In / Providers > Email).',
  'over_email_send_rate_limit':
    'Limite de e-mails do Supabase atingido. Desligue "Confirm email" no painel (Authentication > Sign In / Providers > Email).',
  'Signups not allowed':
    'Criacao de contas esta desativada no painel do Supabase.',
};

export function traduzirErro(erro) {
  if (!erro) return 'Algo deu errado. Tente de novo.';
  console.error('[Giro]', erro);

  const msg = erro.message ?? String(erro);

  for (const [en, pt] of Object.entries(MENSAGENS)) {
    if (msg.includes(en)) return pt;
  }

  // Violacao de RLS: acontece se o app tentar gravar com user_id errado.
  // Nao deve acontecer em uso normal -- se aparecer, e bug nosso.
  if (msg.includes('row-level security')) {
    return 'Este registro nao pertence a sua conta.';
  }
  if (msg.includes('duplicate key')) {
    return 'Este registro ja existe.';
  }
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    return 'Sem conexao. Verifique a internet e tente de novo.';
  }

  return 'Algo deu errado. Tente de novo.';
}
