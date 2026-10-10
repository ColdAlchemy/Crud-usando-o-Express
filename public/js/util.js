/** Cria elementos DOM sem usar innerHTML (todo texto entra como texto, nunca como HTML). */
export function h(tag, props = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [chave, valor] of Object.entries(props ?? {})) {
    if (valor == null || valor === false) continue;
    if (chave === "class") el.className = valor;
    else if (chave === "dataset") Object.assign(el.dataset, valor);
    else if (chave.startsWith("on")) el.addEventListener(chave.slice(2), valor);
    else if (valor === true) el.setAttribute(chave, "");
    else el.setAttribute(chave, valor);
  }
  for (const filho of filhos.flat(Infinity)) {
    if (filho == null || filho === false) continue;
    el.append(filho.nodeType ? filho : document.createTextNode(String(filho)));
  }
  return el;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const inteiros = new Intl.NumberFormat("pt-BR");
const diaMes = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export const moeda = (centavos) => brl.format((centavos ?? 0) / 100);
export const numero = (n) => inteiros.format(n ?? 0);
export const dia = (iso) => diaMes.format(new Date(`${iso}T00:00:00Z`));
export const quando = (iso) => dataHora.format(new Date(iso));

/** Avisos rápidos no rodapé (leitores de tela anunciam: a região é aria-live). */
export function avisar(mensagem, tipo = "ok") {
  const el = h("div", { class: `toast ${tipo === "erro" ? "erro" : ""}` }, mensagem);
  document.getElementById("avisos").append(el);
  setTimeout(() => el.remove(), tipo === "erro" ? 6000 : 3500);
}

export async function copiar(texto, rotulo = "Copiado") {
  try {
    await navigator.clipboard.writeText(texto);
    avisar(`${rotulo} para a área de transferência.`);
  } catch {
    avisar("Não foi possível copiar. Selecione o texto e use Ctrl+C.", "erro");
  }
}

/** Monta o comando curl equivalente (com $TOKEN no lugar do token, para não vazar credencial ao copiar). */
export function construirCurl(metodo, caminho, corpo, comToken) {
  const partes = [`curl -X ${metodo}`, `"${location.origin}${caminho}"`];
  if (comToken) partes.push('-H "Authorization: Bearer $TOKEN"');
  if (corpo !== undefined) partes.push('-H "Content-Type: application/json"', `-d '${typeof corpo === "string" ? corpo : JSON.stringify(corpo)}'`);
  return partes.join(" \\\n  ");
}

/** JSON → elementos coloridos (chaves, textos, números, booleanos). */
export function realcarJson(valor) {
  const texto = typeof valor === "string" ? valor : JSON.stringify(valor, null, 2);
  const frag = document.createDocumentFragment();
  const re = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  let ultimo = 0;
  for (const m of texto.matchAll(re)) {
    if (m.index > ultimo) frag.append(texto.slice(ultimo, m.index));
    const t = m[0];
    const classe = t.startsWith('"') ? (m[2] ? "js-k" : "js-s") : /^(true|false)$/.test(t) ? "js-b" : t === "null" ? "js-z" : "js-n";
    frag.append(h("span", { class: classe }, t));
    ultimo = m.index + t.length;
  }
  frag.append(texto.slice(ultimo));
  return frag;
}

/** Bloco de código com título e botão de copiar. */
export function blocoCodigo(titulo, conteudo, { json = false, copiavel = true } = {}) {
  const texto = typeof conteudo === "string" ? conteudo : JSON.stringify(conteudo, null, 2);
  return h(
    "div",
    { class: "codigo" },
    h("div", { class: "codigo-cab" }, h("span", {}, titulo), copiavel ? h("button", { type: "button", class: "botao-contorno botao-p", onclick: () => copiar(texto, "Código copiado") }, "Copiar") : null),
    h("pre", { tabindex: "0", "aria-label": titulo }, h("code", { translate: "no" }, json ? realcarJson(texto) : texto)),
  );
}
