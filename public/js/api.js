const CHAVE = "estoque.sessao";

function lerSessao() {
  try {
    return JSON.parse(sessionStorage.getItem(CHAVE)) ?? { token: null, usuario: null };
  } catch {
    return { token: null, usuario: null };
  }
}

/** Estado compartilhado: o token fica só nesta aba (sessionStorage) e some ao fechá-la. */
export const estado = { ...lerSessao(), ambiente: null, versao: null, online: null };

function avisarMudanca() {
  document.dispatchEvent(new CustomEvent("sessao"));
}

export function guardarSessao(token, usuario) {
  estado.token = token;
  estado.usuario = usuario;
  try { sessionStorage.setItem(CHAVE, JSON.stringify({ token, usuario })); } catch { /* armazenamento bloqueado: segue só em memória */ }
  avisarMudanca();
}

export function sair() {
  guardarSessao(null, null);
}

/**
 * Chama a API e devolve { status, ok, json, texto, ms, bytes, headers }.
 * Se o servidor disser que o token expirou, a sessão é encerrada.
 */
export async function chamar(metodo, caminho, corpo, { token = estado.token } = {}) {
  const inicio = performance.now();
  const resposta = await fetch(caminho, {
    method: metodo,
    headers: { ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo === undefined ? undefined : typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
  const texto = await resposta.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* resposta que não é JSON */ }

  if (resposta.status === 401 && token && token === estado.token && ["token_expirado", "token_invalido"].includes(json?.erro?.codigo)) sair();

  return {
    status: resposta.status,
    ok: resposta.ok,
    json,
    texto,
    ms: Math.round(performance.now() - inicio),
    bytes: new TextEncoder().encode(texto).length,
    headers: resposta.headers,
  };
}

export async function entrar(email, senha) {
  const r = await chamar("POST", "/api/v1/auth/entrar", { email, senha }, { token: null });
  if (r.ok) guardarSessao(r.json.token, r.json.usuario);
  return r;
}

export async function registrar(nome, email, senha) {
  return chamar("POST", "/api/v1/auth/registrar", { nome, email, senha }, { token: null });
}

export async function carregarSaude() {
  try {
    const r = await chamar("GET", "/api/v1/saude", undefined, { token: null });
    estado.online = r.ok;
    estado.ambiente = r.json?.ambiente ?? null;
    estado.versao = r.json?.versao ?? null;
  } catch {
    estado.online = false;
  }
  avisarMudanca();
}
