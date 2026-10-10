import { chamar, entrar, estado } from "./api.js";
import { avisar, blocoCodigo, construirCurl, copiar, h, realcarJson } from "./util.js";

let spec = null;
let filtro = "";
const METODOS = ["get", "post", "put", "patch", "delete"];

async function carregarSpec() {
  spec ??= await (await fetch("/api/v1/openapi.json")).json();
  return spec;
}

function listarOperacoes() {
  const ops = [];
  for (const [caminho, item] of Object.entries(spec.paths)) {
    for (const metodo of METODOS.filter((m) => item[m])) {
      const op = item[metodo];
      ops.push({ id: op.operationId, metodo, caminho, op, parametros: [...(item.parameters ?? []), ...(op.parameters ?? [])], tag: op.tags?.[0] ?? "Outros" });
    }
  }
  return ops;
}

// ---------- helpers de schema ----------
const nomeRef = (s) => s?.$ref?.split("/").pop();
const resolver = (s) => (s?.$ref ? spec.components.schemas[nomeRef(s)] : s);

function tipoDe(s) {
  if (!s) return "—";
  if (s.$ref) return nomeRef(s);
  if (s.enum && !s.type) return "enum";
  const tipo = Array.isArray(s.type) ? s.type.join(" | ") : s.type;
  if (tipo === "array") return `${tipoDe(s.items)}[]`;
  return s.format ? `${tipo} (${s.format})` : (tipo ?? "objeto");
}

function restricoes(s) {
  const r = [];
  if (s.minimum !== undefined) r.push(`mín ${s.minimum}`);
  if (s.maximum !== undefined) r.push(`máx ${s.maximum}`);
  if (s.minLength !== undefined) r.push(`mín ${s.minLength} caracteres`);
  if (s.maxLength !== undefined) r.push(`máx ${s.maxLength} caracteres`);
  if (s.pattern) r.push(`padrão ${s.pattern}`);
  if (s.enum) r.push(`valores: ${s.enum.join(", ")}`);
  if (s.default !== undefined) r.push(`padrão: ${JSON.stringify(s.default)}`);
  return r.join(" · ");
}

/** Gera um exemplo a partir do schema (usado quando a especificação não traz um). */
function exemploDe(schema, nivel = 0) {
  const s = resolver(schema);
  if (!s || nivel > 4) return null;
  if (s.example !== undefined) return s.example;
  const tipo = Array.isArray(s.type) ? s.type.find((t) => t !== "null") : s.type;
  if (s.enum) return s.enum[0];
  if (tipo === "object" || s.properties) return Object.fromEntries(Object.entries(s.properties ?? {}).map(([k, v]) => [k, exemploDe(v, nivel + 1)]));
  if (tipo === "array") return [exemploDe(s.items, nivel + 1)];
  if (tipo === "integer" || tipo === "number") return s.default ?? s.minimum ?? 0;
  if (tipo === "boolean") return s.default ?? true;
  if (s.format === "date-time") return "2026-10-09T12:00:00.000Z";
  if (s.format === "date") return "2026-10-09";
  if (s.format === "email") return "pessoa@exemplo.com";
  return "texto";
}

/** `código` e **negrito** em linha. Nada de HTML vindo da especificação: tudo entra como texto. */
function inline(t) {
  const frag = document.createDocumentFragment();
  for (const parte of String(t ?? "").split(/(`[^`]+`|\*\*[^*]+\*\*)/g)) {
    if (!parte) continue;
    if (parte.startsWith("`")) frag.append(h("code", {}, parte.slice(1, -1)));
    else if (parte.startsWith("**")) frag.append(h("strong", {}, parte.slice(2, -2)));
    else frag.append(parte);
  }
  return frag;
}

/** Parágrafos e listas com "- ". */
function textoRico(texto) {
  if (!texto) return [];
  return texto.split(/\n\n+/).map((bloco) => {
    const linhas = bloco.split("\n");
    if (linhas.every((l) => l.startsWith("- "))) return h("ul", {}, linhas.map((l) => h("li", {}, inline(l.slice(2)))));
    return h("p", {}, inline(bloco.replaceAll("\n", " ")));
  });
}

const rolagem = (tabela) => h("div", { class: "rolagem" }, tabela);

// ---------- lateral ----------
function lateral(ops, atualId) {
  const caixa = h("input", { id: "busca-docs", type: "search", autocomplete: "off", spellcheck: "false", value: filtro });
  const lista = h("div", {});

  const desenhar = () => {
    const termo = filtro.trim().toLowerCase();
    lista.replaceChildren();
    for (const tag of spec.tags) {
      const doGrupo = ops.filter((o) => o.tag === tag.name && (!termo || `${o.metodo} ${o.caminho} ${o.op.summary}`.toLowerCase().includes(termo)));
      if (!doGrupo.length) continue;
      lista.append(
        h("h2", {}, tag.name),
        h("ul", {}, doGrupo.map((o) => h("li", {}, h("a", { href: `#/docs/${o.id}`, "aria-current": o.id === atualId ? "true" : null }, h("span", { class: `metodo metodo--${o.metodo}` }, o.metodo.toUpperCase()), h("span", {}, o.caminho.replace("/api/v1", ""))))) ),
      );
    }
    if (!lista.children.length) lista.append(h("p", { class: "mut pequeno" }, "Nenhum endpoint com esse texto."));
  };
  caixa.addEventListener("input", () => { filtro = caixa.value; desenhar(); });
  desenhar();

  return h("nav", { class: "docs-lateral", "aria-label": "Endpoints" }, h("div", { class: "campo" }, h("label", { for: "busca-docs" }, "filtrar endpoints"), caixa), lista);
}

// ---------- detalhe ----------
function tabelaParametros(parametros) {
  if (!parametros.length) return null;
  return rolagem(
    h(
      "table",
      { class: "tabela" },
      h("thead", {}, h("tr", {}, ["nome", "em", "tipo", "descrição"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", {}, parametros.map((p) => h("tr", {}, h("td", {}, p.name, p.required ? h("span", { class: "obrig" }, " *") : null), h("td", {}, p.in), h("td", { class: "tipo" }, tipoDe(p.schema)), h("td", {}, [p.description && inline(p.description), restricoes(p.schema ?? {}) && h("div", { class: "mut" }, restricoes(p.schema))])))),
    ),
  );
}

function tabelaSchema(schema) {
  const s = resolver(schema);
  if (!s?.properties) return null;
  const obrigatorios = new Set(s.required ?? []);
  return rolagem(
    h(
      "table",
      { class: "tabela" },
      h("thead", {}, h("tr", {}, ["campo", "tipo", "descrição"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", {}, Object.entries(s.properties).map(([nome, prop]) => {
        const p = resolver(prop);
        return h("tr", {}, h("td", {}, nome, obrigatorios.has(nome) ? h("span", { class: "obrig", title: "obrigatório" }, " *") : null), h("td", { class: "tipo" }, tipoDe(prop)), h("td", {}, [inline(p?.description ?? prop.description), restricoes(p ?? {}) && h("div", { class: "mut" }, restricoes(p ?? {}))]));
      })),
    ),
  );
}

function respostas(op) {
  return Object.entries(op.responses).map(([codigo, r]) => {
    const schema = r.content?.["application/json"]?.schema;
    const exemplo = r.content?.["application/json"]?.example ?? (schema ? exemploDe(schema) : undefined);
    return h(
      "details",
      { class: "resposta-item" },
      h("summary", {}, h("span", { class: `status status--${codigo[0]}` }, codigo), h("span", {}, inline(r.description)), schema ? h("span", { class: "mut mono" }, tipoDe(schema)) : null),
      exemplo !== undefined ? blocoCodigo("exemplo", exemplo, { json: true }) : null,
    );
  });
}

// ---------- playground ----------
function playground(o) {
  const requerToken = Boolean(o.op.security?.length);
  const valores = {};
  const campos = [];

  const caminhoParams = o.parametros.filter((p) => p.in === "path");
  const consultaParams = o.parametros.filter((p) => p.in === "query");

  const campoParametro = (p) => {
    const id = `pg-${p.in}-${p.name}`;
    const s = p.schema ?? {};
    const entrada = s.enum || s.type === "boolean"
      ? h("select", { id }, h("option", { value: "" }, p.required ? "escolha…" : "(não enviar)"), (s.enum ?? ["true", "false"]).map((v) => h("option", { value: v }, v)))
      : h("input", { id, type: "text", autocomplete: "off", spellcheck: "false", inputmode: s.type === "integer" ? "numeric" : null, value: p.in === "path" ? String(p.example ?? 1) : "" });
    valores[`${p.in}:${p.name}`] = entrada;
    return h("div", { class: "campo" }, h("label", { for: id }, `${p.name}${p.required ? " *" : ""}  ·  ${tipoDe(s)}`), entrada, p.description ? h("p", { class: "dica" }, p.description) : null);
  };
  caminhoParams.forEach((p) => campos.push(campoParametro(p)));
  consultaParams.forEach((p) => campos.push(campoParametro(p)));

  const corpoSchema = o.op.requestBody?.content?.["application/json"];
  const exemploCorpo = corpoSchema ? (corpoSchema.example ?? exemploDe(corpoSchema.schema)) : undefined;
  const area = corpoSchema ? h("textarea", { id: "pg-corpo", spellcheck: "false", autocomplete: "off", rows: "8", "aria-describedby": "pg-corpo-erro" }, JSON.stringify(exemploCorpo, null, 2)) : null;
  const erroCorpo = h("p", { class: "erro-campo", id: "pg-corpo-erro", role: "alert", hidden: true });
  if (area) campos.push(h("div", { class: "campo" }, h("label", { for: "pg-corpo" }, "corpo (JSON)"), area, erroCorpo));

  const resultado = h("div", { class: "resultado", hidden: true, "aria-live": "polite" });
  const avisoToken = h("div", { class: "aviso", hidden: true });
  const botao = h("button", { type: "submit", class: "botao" }, "Enviar requisição");

  const montarCaminho = () => {
    let caminho = o.caminho;
    for (const p of caminhoParams) caminho = caminho.replace(`{${p.name}}`, encodeURIComponent(valores[`path:${p.name}`].value.trim()));
    const qs = new URLSearchParams();
    for (const p of consultaParams) {
      const v = valores[`query:${p.name}`].value.trim();
      if (v !== "") qs.set(p.name, v);
    }
    return qs.size ? `${caminho}?${qs}` : caminho;
  };

  const atualizarAviso = () => {
    if (!requerToken || estado.token) { avisoToken.hidden = true; return; }
    avisoToken.hidden = false;
    avisoToken.replaceChildren(
      "Este endpoint exige um token. ",
      h("a", { href: "#/" }, "Entre na página inicial"),
      ...(estado.ambiente === "production"
        ? ["."]
        : [" ou ", h("button", { type: "button", class: "botao-link", onclick: async () => { const r = await entrar("demo@estoque.test", "demonstracao"); r.ok ? avisar("Conta de demonstração conectada.") : avisar("Conta de demonstração não encontrada. Rode npm run seed.", "erro"); } }, "use a conta de demonstração"), "."]),
    );
  };
  document.addEventListener("sessao", atualizarAviso, { once: true });
  atualizarAviso();

  const form = h(
    "form",
    {
      novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        let corpo;
        erroCorpo.hidden = true;
        area?.removeAttribute("aria-invalid");
        if (area) {
          try { corpo = JSON.parse(area.value); } catch (err) {
            erroCorpo.textContent = `JSON inválido: ${err.message}`;
            erroCorpo.hidden = false;
            area.setAttribute("aria-invalid", "true");
            area.focus();
            return;
          }
        }
        botao.disabled = true;
        botao.textContent = "Enviando…";
        const caminho = montarCaminho();
        try {
          const r = await chamar(o.metodo.toUpperCase(), caminho, corpo);
          const interessantes = ["content-type", "location", "ratelimit-remaining", "retry-after", "www-authenticate"].map((n) => [n, r.headers.get(n)]).filter(([, v]) => v);
          resultado.hidden = false;
          resultado.replaceChildren(
            h("div", { class: "resultado-cab" }, h("span", { class: `status status--${String(r.status)[0]}` }, r.status), h("span", {}, `${r.ms} ms`), h("span", {}, `${r.bytes} bytes`), h("button", { type: "button", class: "botao-contorno botao-p", onclick: () => copiar(construirCurl(o.metodo.toUpperCase(), caminho, corpo, requerToken), "cURL copiado") }, "Copiar cURL"), r.texto ? h("button", { type: "button", class: "botao-contorno botao-p", onclick: () => copiar(r.json ? JSON.stringify(r.json, null, 2) : r.texto, "Resposta copiada") }, "Copiar resposta") : null),
            interessantes.length ? h("p", { class: "cabecalhos" }, interessantes.map(([n, v]) => h("span", {}, h("b", {}, n), `: ${v}  `))) : null,
            h("div", { class: "codigo" }, h("pre", { tabindex: "0", "aria-label": "Corpo da resposta" }, h("code", { translate: "no" }, r.json ? realcarJson(r.json) : r.texto || "(sem corpo)"))),
          );
        } catch {
          resultado.hidden = false;
          resultado.replaceChildren(h("p", { class: "erro-campo" }, "Não foi possível falar com a API."));
        } finally {
          botao.disabled = false;
          botao.textContent = "Enviar requisição";
        }
      },
    },
    ...campos,
    avisoToken,
    botao,
  );

  return h("section", { class: "playground", "aria-labelledby": "pg-titulo" }, h("header", {}, h("h2", { id: "pg-titulo" }, "Experimente"), h("span", { class: "mut pequeno mono" }, requerToken ? "usa o token da sua sessão" : "não precisa de token")), form, resultado);
}

// ---------- visão ----------
function detalhe(o) {
  const parametros = o.parametros.filter((p) => p.in !== "header");
  const corpo = o.op.requestBody?.content?.["application/json"];
  return h(
    "article",
    { class: "op" },
    h("div", { class: "op-cab" }, h("span", { class: `metodo metodo--${o.metodo}` }, o.metodo.toUpperCase()), h("span", { class: "caminho", translate: "no" }, o.caminho), o.op.security?.length ? h("span", { class: "cadeado" }, "requer token") : null),
    h("h1", {}, o.op.summary),
    textoRico(o.op.description),
    parametros.length ? [h("h2", {}, "parâmetros"), tabelaParametros(parametros)] : null,
    corpo ? [h("h2", {}, "corpo da requisição"), tabelaSchema(corpo.schema), blocoCodigo("exemplo", corpo.example ?? exemploDe(corpo.schema), { json: true })] : null,
    h("h2", {}, "respostas"),
    respostas(o.op),
    playground(o),
  );
}

function visaoGeral() {
  return h(
    "article",
    { class: "op" },
    h("h1", {}, spec.info.title, h("span", { class: "mut mono", style: null }, ` v${spec.info.version}`)),
    textoRico(spec.info.description),
    h("h2", {}, "como autenticar"),
    h("p", {}, "Chame ", h("code", {}, "POST /api/v1/auth/entrar"), " e mande o token em ", h("code", {}, "Authorization: Bearer <token>"), " nas demais rotas."),
    h("h2", {}, "formato de erro"),
    blocoCodigo("sempre assim", { erro: { codigo: "validacao", mensagem: "Dados inválidos no corpo da requisição.", campos: [{ campo: "preco_centavos", mensagem: "deve ser maior ou igual a 0" }] } }, { json: true }),
    h("h2", {}, "códigos de status"),
    rolagem(h("table", { class: "tabela" }, h("tbody", {}, [
      ["200 / 201 / 204", "Sucesso (204 = sem corpo)."],
      ["400", "JSON malformado ou id inválido na URL."],
      ["401", "Token ausente, inválido ou expirado."],
      ["404", "Recurso ou rota inexistente."],
      ["409", "Conflito: SKU repetido, saldo insuficiente, categoria em uso…"],
      ["422", "Dados inválidos; veja `campos`."],
      ["429", "Muitas tentativas de login; veja Retry-After."],
    ].map(([c, d]) => h("tr", {}, h("td", {}, c), h("td", {}, d)))))),
    h("p", { class: "mut", style: null }, "Escolha um endpoint na lista para ver detalhes e testar."),
  );
}

export async function montarDocs(main, { arg }) {
  main.replaceChildren(h("p", { class: "mut" }, "Carregando a especificação…"));
  try {
    await carregarSpec();
  } catch {
    main.replaceChildren(h("div", { class: "aviso erro" }, "Não foi possível carregar /api/v1/openapi.json."));
    return;
  }
  const ops = listarOperacoes();
  const atual = ops.find((o) => o.id === arg);
  document.title = `${atual ? atual.op.summary : "Documentação"} — Estoque API`;
  main.replaceChildren(h("div", { class: "docs" }, lateral(ops, atual?.id), h("div", {}, atual ? detalhe(atual) : visaoGeral())));
}
