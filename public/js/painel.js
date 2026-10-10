import { chamar, estado } from "./api.js";
import { formularioLogin } from "./login.js";
import { avisar, dia, h, moeda, numero, quando } from "./util.js";

const SVG = "http://www.w3.org/2000/svg";
const svg = (tag, attrs = {}, texto) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (texto != null) el.textContent = texto;
  return el;
};

// ---------- gráfico: entradas e saídas por dia (SVG, sem biblioteca) ----------
function graficoMovimentos(dias) {
  const L = 640, A = 220, ml = 34, mb = 24, mt = 8;
  const maximo = Math.max(10, ...dias.flatMap((d) => [d.entradas, d.saidas]));
  const passo = Math.pow(10, Math.floor(Math.log10(maximo)));
  const topo = Math.ceil(maximo / passo) * passo;
  const larg = (L - ml) / dias.length;
  const y = (v) => mt + (A - mt - mb) * (1 - v / topo);

  const g = svg("svg", { class: "grafico", viewBox: `0 0 ${L} ${A}`, role: "img", "aria-label": `Entradas e saídas de estoque nos últimos ${dias.length} dias. Total de entradas: ${numero(dias.reduce((s, d) => s + d.entradas, 0))}. Total de saídas: ${numero(dias.reduce((s, d) => s + d.saidas, 0))}.` });
  for (let i = 0; i <= 4; i++) {
    const v = (topo / 4) * i;
    g.append(svg("line", { class: "grade", x1: ml, x2: L, y1: y(v), y2: y(v) }), svg("text", { x: ml - 6, y: y(v) + 4, "text-anchor": "end" }, numero(Math.round(v))));
  }
  dias.forEach((d, i) => {
    const x = ml + i * larg;
    const bw = Math.max(3, larg * 0.32);
    const e = svg("rect", { class: "barra-entrada", x: x + larg * 0.14, y: y(d.entradas), width: bw, height: Math.max(0, A - mb - y(d.entradas)), rx: 1.5 });
    e.append(svg("title", {}, `${dia(d.dia)}: ${d.entradas} entradas`));
    const s = svg("rect", { class: "barra-saida", x: x + larg * 0.14 + bw + 2, y: y(d.saidas), width: bw, height: Math.max(0, A - mb - y(d.saidas)), rx: 1.5 });
    s.append(svg("title", {}, `${dia(d.dia)}: ${d.saidas} saídas`));
    g.append(e, s);
    if (i % 2 === 1 || dias.length < 8) g.append(svg("text", { x: x + larg / 2, y: A - 6, "text-anchor": "middle" }, dia(d.dia)));
  });
  return g;
}

function tabelaMovimentos(dias) {
  return h("details", { style: null }, h("summary", { class: "pequeno mut" }, "Ver os números do gráfico"), h("div", { class: "rolagem" }, h("table", { class: "tabela num" }, h("thead", {}, h("tr", {}, ["dia", "entradas", "saídas"].map((t, i) => h("th", { scope: "col", class: i ? "direita" : null }, t)))), h("tbody", {}, dias.map((d) => h("tr", {}, h("td", {}, dia(d.dia)), h("td", {}, d.entradas), h("td", {}, d.saidas)))))));
}

function listaBarras(itens, { nome, sub, valor, proporcao, alerta, acao }) {
  return h(
    "ul",
    { class: "lista-barras" },
    itens.map((i) => {
      const prop = Math.max(2, Math.min(100, proporcao(i)));
      const trilho = h("span", { class: `trilho ${alerta?.(i) ? "alerta" : ""}`, role: "img", "aria-label": `${Math.round(prop)}%` }, h("span", {}));
      trilho.firstChild.style.width = `${prop}%`;
      return h("li", {}, h("span", { class: "nome" }, nome(i), sub ? h("small", {}, sub(i)) : null), h("span", { class: "valor" }, valor(i), acao ? [" ", acao(i)] : null), trilho);
    }),
  );
}

// ---------- diálogo de movimentação ----------
function abrirMovimentacao(produto, aoConcluir, tipoInicial = "saida") {
  const dlg = document.getElementById("dialogo-mov");
  const erro = h("p", { class: "erro-campo", role: "alert", hidden: true });
  const qtd = h("input", { id: "mov-qtd", type: "number", min: "0", step: "1", inputmode: "numeric", required: true, autocomplete: "off" });
  const motivo = h("input", { id: "mov-motivo", type: "text", maxlength: "200", autocomplete: "off" });
  const enviar = h("button", { type: "submit", class: "botao" }, "Registrar");
  const radios = ["entrada", "saida", "ajuste"].map((t) => h("label", { class: "linha-opcao", for: `mov-${t}` }, h("input", { id: `mov-${t}`, type: "radio", name: "tipo", value: t, checked: t === tipoInicial }), { entrada: "Entrada", saida: "Saída", ajuste: "Ajuste (contagem)" }[t]));
  const dica = h("p", { class: "dica" });
  const atualizarDica = () => {
    const t = dlg.querySelector("input[name=tipo]:checked").value;
    dica.textContent = { entrada: "Soma ao saldo.", saida: `Subtrai do saldo (atual: ${produto.estoque}). Acima disso a API recusa com 409.`, ajuste: "Informe o saldo contado no inventário; a API calcula a diferença." }[t];
    qtd.min = t === "ajuste" ? "0" : "1";
  };

  dlg.replaceChildren(
    h(
      "form",
      {
        method: "dialog",
        novalidate: true,
        onsubmit: async (e) => {
          e.preventDefault();
          erro.hidden = true;
          const tipo = dlg.querySelector("input[name=tipo]:checked").value;
          enviar.disabled = true;
          enviar.textContent = "Enviando…";
          try {
            const r = await chamar("POST", `/api/v1/produtos/${produto.id}/movimentacoes`, { tipo, quantidade: Number(qtd.value), ...(motivo.value.trim() ? { motivo: motivo.value.trim() } : {}) });
            if (!r.ok) {
              const campos = r.json?.erro?.campos?.map((c) => `${c.campo} ${c.mensagem}`).join("; ");
              erro.textContent = `${r.status} ${r.json?.erro?.codigo ?? ""}: ${campos || r.json?.erro?.mensagem || "erro"}`;
              erro.hidden = false;
              qtd.setAttribute("aria-invalid", "true");
              qtd.focus();
              return;
            }
            dlg.close();
            avisar(`Registrado. Saldo de ${produto.sku}: ${r.json.produto.estoque}.`);
            aoConcluir();
          } catch {
            erro.textContent = "Não foi possível falar com a API.";
            erro.hidden = false;
          } finally {
            enviar.disabled = false;
            enviar.textContent = "Registrar";
          }
        },
        onchange: atualizarDica,
      },
      h("h2", { id: "dialogo-titulo" }, "Movimentar estoque"),
      h("p", { class: "mut" }, h("span", { class: "mono", translate: "no" }, produto.sku), ` · ${produto.nome} · saldo ${produto.estoque}`),
      h("div", { class: "campo" }, h("span", { class: "so-leitor", id: "mov-tipo" }, "Tipo"), radios),
      dica,
      h("div", { class: "campo" }, h("label", { for: "mov-qtd" }, "quantidade"), qtd),
      h("div", { class: "campo" }, h("label", { for: "mov-motivo" }, "motivo (opcional)"), motivo),
      erro,
      h("div", { class: "acoes" }, h("button", { type: "button", class: "botao-contorno", onclick: () => dlg.close() }, "Cancelar"), enviar),
    ),
  );
  atualizarDica();
  dlg.showModal();
  qtd.focus();
}

// ---------- tabela de produtos ----------
async function carregarProdutos(contexto) {
  const { params, destino, categorias, recarregarTudo } = contexto;
  const qs = new URLSearchParams({ limite: "10" });
  for (const k of ["q", "categoria_id", "estoque_baixo", "ordem", "pagina"]) if (params.get(k)) qs.set(k, params.get(k));
  const r = await chamar("GET", `/api/v1/produtos?${qs}`);
  if (!r.ok) { destino.replaceChildren(h("div", { class: "aviso erro", role: "alert" }, `Erro ${r.status}: ${r.json?.erro?.mensagem ?? "tente de novo"}`)); return; }

  const ordem = params.get("ordem") ?? "id";
  const ordenarPor = (campo) => {
    const novo = ordem === campo ? `-${campo}` : campo;
    params.set("ordem", novo);
    params.delete("pagina");
    sincronizar(params);
    carregarProdutos(contexto);
  };
  const cabecalho = (campo, titulo, direita) => {
    const ativo = ordem === campo || ordem === `-${campo}`;
    return h("th", { scope: "col", class: direita ? "direita" : null, "aria-sort": ativo ? (ordem.startsWith("-") ? "descending" : "ascending") : "none" }, h("button", { type: "button", onclick: () => ordenarPor(campo) }, titulo, ativo ? (ordem.startsWith("-") ? " ↓" : " ↑") : ""));
  };

  const { dados, meta } = r.json;
  const irPara = (p) => { params.set("pagina", String(p)); sincronizar(params); carregarProdutos(contexto); };

  destino.replaceChildren(
    dados.length === 0
      ? h("div", { class: "vazio", style: null }, "Nenhum produto com esses filtros.")
      : h("div", { class: "rolagem", style: null }, h("table", { class: "tabela tabela-prod" },
        h("caption", { class: "so-leitor" }, "Produtos"),
        h("thead", {}, h("tr", {}, cabecalho("sku", "SKU"), cabecalho("nome", "produto"), h("th", { scope: "col" }, "categoria"), cabecalho("preco_centavos", "preço", true), cabecalho("estoque", "estoque", true), h("th", { scope: "col" }, h("span", { class: "so-leitor" }, "ações")))),
        h("tbody", {}, dados.map((p) => h("tr", {}, h("td", { translate: "no" }, p.sku), h("td", {}, p.nome, p.ativo ? null : [" ", h("span", { class: "selo selo--inativo" }, "inativo")]), h("td", { class: "mut" }, p.categoria?.nome ?? "—"), h("td", { class: "direita" }, moeda(p.preco_centavos)), h("td", { class: "direita" }, p.estoque, " ", p.estoque === 0 && p.ativo ? h("span", { class: "selo selo--zero" }, "zerado") : p.estoque_baixo ? h("span", { class: "selo selo--baixo" }, "baixo") : null), h("td", {}, p.ativo ? h("button", { type: "button", class: "botao-contorno botao-p", onclick: () => abrirMovimentacao(p, recarregarTudo) }, "Movimentar", h("span", { class: "so-leitor" }, ` ${p.nome}`)) : null)))),
      )),
    h("div", { class: "paginacao" }, h("span", {}, `${numero(meta.total)} produtos · página ${meta.pagina} de ${Math.max(1, meta.total_paginas)}`), h("div", { class: "acoes" }, h("button", { type: "button", class: "botao-contorno botao-p", disabled: meta.pagina <= 1, onclick: () => irPara(meta.pagina - 1) }, "← Anterior"), h("button", { type: "button", class: "botao-contorno botao-p", disabled: meta.pagina >= meta.total_paginas, onclick: () => irPara(meta.pagina + 1) }, "Próxima →"))),
  );
}

/** O estado dos filtros vive na URL (#/painel?q=…), então dá para compartilhar e recarregar. */
function sincronizar(params) {
  const qs = params.toString();
  history.replaceState(null, "", `#/painel${qs ? `?${qs}` : ""}`);
}

// ---------- tela ----------
export async function montarPainel(main, { params }) {
  if (!estado.token) {
    main.replaceChildren(
      h("div", { class: "topo-pagina" }, h("h1", {}, "Painel de estoque")),
      h("section", { class: "cartao", style: null }, h("h2", {}, "Entre para ver o painel"), h("p", { class: "mut" }, "O painel usa a mesma API autenticada que você vê na documentação."), formularioLogin({ aoEntrar: () => montarPainel(main, { params }) })),
    );
    return;
  }

  main.replaceChildren(h("p", { class: "mut" }, "Carregando o painel…"));
  const [painel, cats] = await Promise.all([chamar("GET", "/api/v1/painel"), chamar("GET", "/api/v1/categorias?limite=100")]);
  if (!painel.ok) {
    main.replaceChildren(h("div", { class: "aviso erro", role: "alert" }, painel.status === 401 ? "Sua sessão expirou. Entre de novo." : `Erro ${painel.status}: ${painel.json?.erro?.mensagem ?? "tente de novo"}`), formularioLogin({ aoEntrar: () => montarPainel(main, { params }) }));
    return;
  }
  const p = painel.json;
  const t = p.totais;
  const maiorValor = Math.max(1, ...p.por_categoria.map((c) => c.valor_centavos));
  const maiorSaida = Math.max(1, ...p.mais_saidas.itens.map((i) => i.quantidade));
  const tabela = h("div", {});
  const recarregarTudo = () => montarPainel(main, { params });
  const contexto = { params, destino: tabela, categorias: cats.json?.dados ?? [], recarregarTudo };

  const filtroTexto = h("input", { id: "f-q", type: "search", autocomplete: "off", spellcheck: "false", value: params.get("q") ?? "" });
  const filtroCategoria = h("select", { id: "f-cat" }, h("option", { value: "" }, "todas"), contexto.categorias.map((c) => h("option", { value: String(c.id), selected: params.get("categoria_id") === String(c.id) }, c.nome)));
  const filtroBaixo = h("input", { id: "f-baixo", type: "checkbox", checked: params.get("estoque_baixo") === "true" });

  const aplicar = (e) => {
    e?.preventDefault();
    const set = (k, v) => (v ? params.set(k, v) : params.delete(k));
    set("q", filtroTexto.value.trim());
    set("categoria_id", filtroCategoria.value);
    set("estoque_baixo", filtroBaixo.checked ? "true" : "");
    params.delete("pagina");
    sincronizar(params);
    carregarProdutos(contexto);
  };

  main.replaceChildren(
    h("div", { class: "titulo-secao" }, h("h1", { style: null }, "Painel de estoque"), h("span", { class: "mut pequeno mono" }, `dados de GET /api/v1/painel · atualizado ${quando(new Date().toISOString())}`)),
    h(
      "dl",
      { class: "indicadores" },
      [["produtos ativos", numero(t.produtos_ativos), null], ["unidades em estoque", numero(t.unidades), null], ["valor em estoque", moeda(t.valor_centavos), null], ["sem estoque", numero(t.sem_estoque), t.sem_estoque ? "alerta" : null], ["abaixo do mínimo", numero(t.abaixo_do_minimo), t.abaixo_do_minimo ? "atencao" : null]].map(([rotulo, valor, classe]) => h("div", { class: "indicador" }, h("dt", {}, rotulo), h("dd", { class: classe }, valor))),
    ),
    h(
      "div",
      { class: "grade-2" },
      h("section", { class: "cartao", "aria-labelledby": "t-mov" }, h("h2", { id: "t-mov" }, "Movimentação nos últimos 14 dias"), h("div", { class: "legenda-grafico" }, h("span", {}, h("i", { class: "leg-e" }), "entradas"), h("span", {}, h("i", { class: "leg-s" }), "saídas")), graficoMovimentos(p.movimentos_por_dia), tabelaMovimentos(p.movimentos_por_dia)),
      h(
        "section",
        { class: "cartao", "aria-labelledby": "t-baixo" },
        h("h2", { id: "t-baixo" }, "Abaixo do mínimo"),
        p.abaixo_do_minimo.length
          ? listaBarras(p.abaixo_do_minimo, {
            nome: (i) => i.nome,
            sub: (i) => `${i.sku} · mínimo ${i.estoque_minimo}`,
            valor: (i) => `${i.estoque} em estoque · falta ${i.falta}`,
            proporcao: (i) => (i.estoque_minimo ? (i.estoque / i.estoque_minimo) * 100 : 0),
            alerta: (i) => i.estoque === 0,
          })
          : h("div", { class: "vazio" }, "Nenhum produto abaixo do mínimo."),
      ),
    ),
    h(
      "div",
      { class: "grade-2 secao" },
      h("section", { class: "cartao", "aria-labelledby": "t-saidas" }, h("h2", { id: "t-saidas" }, `Mais saídas em ${p.mais_saidas.dias} dias`), p.mais_saidas.itens.length ? listaBarras(p.mais_saidas.itens, { nome: (i) => i.nome, sub: (i) => i.sku, valor: (i) => `${i.quantidade} un.`, proporcao: (i) => (i.quantidade / maiorSaida) * 100 }) : h("div", { class: "vazio" }, "Sem saídas no período.")),
      h("section", { class: "cartao", "aria-labelledby": "t-cat" }, h("h2", { id: "t-cat" }, "Valor em estoque por categoria"), p.por_categoria.length ? listaBarras(p.por_categoria, { nome: (i) => i.categoria, sub: (i) => `${i.produtos} produtos · ${numero(i.unidades)} un.`, valor: (i) => moeda(i.valor_centavos), proporcao: (i) => (i.valor_centavos / maiorValor) * 100 }) : h("div", { class: "vazio" }, "Sem produtos ativos.")),
    ),
    h(
      "section",
      { class: "secao", "aria-labelledby": "t-prod" },
      h("div", { class: "titulo-secao" }, h("h2", { id: "t-prod" }, "Produtos"), h("span", { class: "mut pequeno mono" }, "GET /api/v1/produtos")),
      h("form", { class: "filtros", role: "search", "aria-label": "Filtrar produtos", onsubmit: aplicar }, h("div", { class: "campo" }, h("label", { for: "f-q" }, "buscar (nome, SKU, descrição)"), filtroTexto), h("div", { class: "campo" }, h("label", { for: "f-cat" }, "categoria"), filtroCategoria), h("label", { class: "linha-opcao", for: "f-baixo" }, filtroBaixo, "só abaixo do mínimo"), h("button", { type: "submit", class: "botao" }, "Filtrar")),
      h("div", { class: "cartao cartao--tabela" }, tabela),
    ),
  );

  await carregarProdutos(contexto);
}
