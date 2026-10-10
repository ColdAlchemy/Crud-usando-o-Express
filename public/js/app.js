import { carregarSaude, estado, sair } from "./api.js";
import { montarDocs } from "./docs.js";
import { montarInicio } from "./inicio.js";
import { montarPainel } from "./painel.js";
import { h } from "./util.js";

const main = document.getElementById("conteudo");
const telas = { "": montarInicio, docs: montarDocs, painel: montarPainel };
const titulos = { "": "Começar", docs: "Documentação", painel: "Painel" };
let primeira = true;

function lerRota() {
  const [caminho, consulta = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const [nome = "", arg] = caminho.split("/").filter(Boolean);
  return { nome: nome in telas ? nome : "", arg, params: new URLSearchParams(consulta) };
}

async function renderizar() {
  const rota = lerRota();
  document.querySelectorAll("[data-aba]").forEach((a) => {
    const ativa = a.dataset.aba === (rota.nome || "inicio");
    if (ativa) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  document.title = `${titulos[rota.nome]} — Estoque API`;
  try {
    await telas[rota.nome](main, rota);
  } catch (erro) {
    console.error(erro);
    main.replaceChildren(h("div", { class: "aviso erro", role: "alert" }, "Algo deu errado ao montar esta tela. Recarregue a página."));
  }
  // Ao navegar (não na primeira carga), o foco vai para o conteúdo e a página volta ao topo.
  if (!primeira) { window.scrollTo({ top: 0, behavior: "instant" }); main.focus({ preventScroll: true }); }
  primeira = false;
}

function desenharSessao() {
  const el = document.getElementById("sessao");
  el.replaceChildren(
    h("span", { class: `pilula ${estado.online === false ? "erro" : estado.online ? "ok" : ""}` }, estado.online === false ? "API fora do ar" : estado.online ? `API online${estado.versao ? ` · v${estado.versao}` : ""}${estado.ambiente ? ` · ${estado.ambiente}` : ""}` : "verificando…"),
    ...(estado.token
      ? [h("span", { translate: "no" }, estado.usuario?.email ?? "autenticado"), h("button", { type: "button", class: "botao-link", onclick: () => { sair(); renderizar(); } }, "Sair")]
      : [h("span", {}, "sem token")]),
  );
}

// O link "pular para o conteúdo" não pode mexer no hash (que é o roteador).
document.querySelector("[data-pular]").addEventListener("click", (e) => { e.preventDefault(); main.focus(); });

document.addEventListener("sessao", desenharSessao);
window.addEventListener("hashchange", renderizar);
desenharSessao();
await carregarSaude(); // define o ambiente antes de montar a tela (dica da conta de demonstração)
renderizar();
