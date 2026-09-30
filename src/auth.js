// =====================================================================
// Autenticacao: e-mail + senha.
//
// Sem OAuth de proposito. Sao duas contas; um provedor externo exigiria
// configurar dominio e credenciais sem ganho nenhum de seguranca aqui.
// =====================================================================

import { db, traduzirErro } from './supabase.js';

export async function sessaoAtual() {
  const { data } = await db.auth.getSession();
  return data.session ?? null;
}

export async function entrar(email, senha) {
  const { data, error } = await db.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password: senha,
  });
  if (error) throw new Error(traduzirErro(error));
  return data.session;
}

export async function cadastrar(nome, email, senha) {
  const { data, error } = await db.auth.signUp({
    email: email.trim().toLowerCase(),
    password: senha,
    // Vai para raw_user_meta_data e o trigger handle_new_user usa como
    // nome do perfil.
    options: { data: { nome: nome.trim() } },
  });
  if (error) throw new Error(traduzirErro(error));

  // Sem sessao = o projeto exige confirmacao de e-mail.
  return { sessao: data.session, precisaConfirmar: !data.session };
}

export async function sair() {
  await db.auth.signOut();
}

export function aoMudarSessao(callback) {
  const { data } = db.auth.onAuthStateChange((_evento, sessao) => callback(sessao));
  return () => data.subscription.unsubscribe();
}

// Carrega o perfil de quem esta logado.
// Sem filtro por id: o RLS ja devolve so a linha do dono.
export async function meuPerfil() {
  const { data, error } = await db.from('profiles').select('*').maybeSingle();
  if (error) throw new Error(traduzirErro(error));
  return data;
}
