import { chamar, estado } from "./api.js";
import { formularioLogin } from "./login.js";
import { blocoCodigo, construirCurl, h, realcarJson } from "./util.js";

/** Resposta ao vivo, no estilo terminal: status, tempo e corpo. */
function saidaResposta(r) {
  const classe = `status status--${String(r.status)[0]}`;
  return h(
    "div",
    {},
    h("div", { class: "resultado-cab" }, h("span", { class: classe }, r.status), h("span", {}, `${r.ms} ms`), h("span", {}, `${r.bytes} bytes`)),
    h("div", { class: "codigo" }, h("pre", { tabindex: "0", "aria-label": "Resposta" }, h("code", { translate: "no" }, r.json ? realcarJson(r.json) : r.texto || "(sem corpo)"))),
  );
}

/** Passo com o curl pronto para copiar e um botão que executa a mesma chamada aqui no console. */
function passoExecutavel({ metodo, caminho, corpo, comToken = true, rotulo }) {
  const saida = h("div", { "aria-live": "polite" });
  const botao = h(
    "button",
    {
      type: "button",
      class: "botao",
      onclick: async () => {
        if (comToken && !estado.token) {
          saida.replaceChildren(h("p", { class: "erro-campo" }, "Faça o passo 1 primeiro para receber um token."));
          return;
        }
        botao.disabled = true;
        botao.textContent = "Enviando…";
        try {
          saida.replaceChildren(saidaResposta(await chamar(metodo, caminho, corpo)));
        } catch {
          saida.replaceChildren(h("p", { class: "erro-campo" }, "Não foi possível falar com a API."));
        } finally {
          botao.disabled = false;
          botao.textContent = rotulo;
        }
      },
    },
    rotulo,
  );
  return h("div", {}, blocoCodigo("curl", construirCurl(metodo, caminho, corpo, comToken)), h("p", { style: null }, botao), saida);
}

export async function montarInicio(main) {
  const origem = location.origin;
  const terminal = h("div", { "aria-live": "polite" }, h("p", { class: "mut" }, "Chamando a API…"));

  main.replaceChildren(
    h(
      "section",
      { class: "hero", "aria-labelledby": "hero-titulo" },
      h(
        "div",
        {},
        h("h1", { id: "hero-titulo" }, "Estoque, ", h("em", {}, "por API"), "."),
        h("p", { class: "lide" }, "Produtos, categorias e movimentações com histórico, autenticação JWT, paginação, filtros e uma especificação OpenAPI que você pode testar aqui mesmo."),
        h("div", { class: "acoes" }, h("a", { class: "botao", href: "#/docs" }, "Ver a documentação"), h("a", { class: "botao-contorno", href: "#/painel" }, "Abrir o painel de estoque")),
        h(
          "ul",
          { class: "pontos" },
          h("li", {}, "preço em centavos inteiros (nada de ponto flutuante)"),
          h("li", {}, "saldo só muda por movimentação: entrada, saída ou ajuste"),
          h("li", {}, "saída acima do saldo? 409, sem gravar nada"),
          h("li", {}, "erros sempre no mesmo formato, com código estável"),
        ),
      ),
      h("div", {}, blocoCodigo("GET /api/v1/saude · ao vivo", construirCurl("GET", "/api/v1/saude", undefined, false), { copiavel: true }), h("div", { style: null }, terminal)),
    ),
  );

  chamar("GET", "/api/v1/saude", undefined, { token: null })
    .then((r) => terminal.replaceChildren(saidaResposta(r)))
    .catch(() => terminal.replaceChildren(h("p", { class: "erro-campo" }, "A API não respondeu.")));

  const login = h("div", {});
  const resumoToken = h("p", { class: "dica", "aria-live": "polite" });
  const atualizarToken = () => {
    resumoToken.textContent = estado.token ? `Autenticado como ${estado.usuario?.email}. Token (início): ${estado.token.slice(0, 24)}… guardado só nesta aba.` : "";
  };
  login.append(formularioLogin({ aoEntrar: atualizarToken }), resumoToken);
  atualizarToken();

  main.append(
    h("h2", { class: "so-leitor" }, "Primeiros passos"),
    h(
      "ol",
      { class: "passos", style: null },
      h("li", { class: "passo" }, h("span", { class: "num", "aria-hidden": "true" }), h("div", { class: "corpo" }, h("h3", {}, "Entre e receba um token"), h("p", { class: "mut" }, "Crie uma conta ou entre. A API devolve um JWT que vale por 2 horas; mande-o em ", h("code", {}, "Authorization: Bearer"), "."), login)),
      h("li", { class: "passo" }, h("span", { class: "num", "aria-hidden": "true" }), h("div", { class: "corpo" }, h("h3", {}, "Liste os produtos"), h("p", { class: "mut" }, "Paginado, com busca, filtros e ordenação. Aqui, os 3 mais caros:"), passoExecutavel({ metodo: "GET", caminho: "/api/v1/produtos?limite=3&ordem=-preco_centavos", rotulo: "Executar" }))),
      h("li", { class: "passo" }, h("span", { class: "num", "aria-hidden": "true" }), h("div", { class: "corpo" }, h("h3", {}, "Registre uma saída de estoque"), h("p", { class: "mut" }, "O saldo e o histórico são gravados na mesma transação. Repita até zerar o saldo e veja o ", h("code", {}, "409 estoque_insuficiente"), "."), passoExecutavel({ metodo: "POST", caminho: "/api/v1/produtos/1/movimentacoes", corpo: { tipo: "saida", quantidade: 1, motivo: "Venda de teste" }, rotulo: "Executar saída" }))),
    ),
    h("p", { class: "mut pequeno", style: null }, `Base da API: ${origem}/api/v1 · especificação: `, h("a", { href: "/api/v1/openapi.json" }, "/api/v1/openapi.json")),
  );
}
