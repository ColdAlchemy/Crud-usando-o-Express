import { entrar, estado, registrar } from "./api.js";
import { h } from "./util.js";

const DEMO = { email: "demo@estoque.test", senha: "demonstracao" };

/**
 * Formulário de entrada / criação de conta. Em desenvolvimento, oferece a conta de demonstração.
 * `aoEntrar` roda depois de um login bem-sucedido.
 */
export function formularioLogin({ aoEntrar } = {}) {
  let criando = false;
  const erro = h("p", { class: "erro-campo", role: "alert", hidden: true });
  const nome = h("input", { id: "login-nome", type: "text", autocomplete: "name", maxlength: "80" });
  const email = h("input", { id: "login-email", type: "email", autocomplete: "email", spellcheck: "false", required: true, value: "" });
  const senha = h("input", { id: "login-senha", type: "password", autocomplete: "current-password", required: true });
  const campoNome = h("div", { class: "campo", hidden: true }, h("label", { for: "login-nome" }, "nome"), nome);
  const botao = h("button", { type: "submit", class: "botao" }, "Entrar");
  const alternar = h("button", { type: "button", class: "botao-link" }, "Criar uma conta");

  const mostrarErro = (r) => {
    const campos = r.json?.erro?.campos?.map((c) => `${c.campo}: ${c.mensagem}`).join(" · ");
    erro.textContent = r.json?.erro?.mensagem ? `${r.json.erro.mensagem}${campos ? ` (${campos})` : ""}` : "Não foi possível falar com a API.";
    erro.hidden = false;
    senha.focus();
  };

  alternar.addEventListener("click", () => {
    criando = !criando;
    campoNome.hidden = !criando;
    botao.textContent = criando ? "Criar conta e entrar" : "Entrar";
    alternar.textContent = criando ? "Já tenho conta" : "Criar uma conta";
    senha.autocomplete = criando ? "new-password" : "current-password";
    erro.hidden = true;
  });

  const form = h(
    "form",
    {
      novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        erro.hidden = true;
        botao.disabled = true;
        botao.textContent = "Enviando…";
        try {
          if (criando) {
            const c = await registrar(nome.value, email.value, senha.value);
            if (!c.ok) return mostrarErro(c);
          }
          const r = await entrar(email.value, senha.value);
          if (!r.ok) return mostrarErro(r);
          aoEntrar?.();
        } catch {
          mostrarErro({});
        } finally {
          botao.disabled = false;
          botao.textContent = criando ? "Criar conta e entrar" : "Entrar";
        }
      },
    },
    campoNome,
    h("div", { class: "form-linha" }, h("div", { class: "campo" }, h("label", { for: "login-email" }, "e-mail"), email), h("div", { class: "campo" }, h("label", { for: "login-senha" }, "senha"), senha)),
    erro,
    h("div", { class: "form-linha", style: null }, botao, alternar),
  );

  const demo = estado.ambiente === "production" ? null : h(
    "p",
    { class: "dica" },
    "Ambiente de desenvolvimento: ",
    h("button", { type: "button", class: "botao-link", onclick: () => { criando && alternar.click(); email.value = DEMO.email; senha.value = DEMO.senha; senha.focus(); } }, "preencher com a conta de demonstração"),
    ` (${DEMO.email}). Rode `,
    h("code", {}, "npm run seed"),
    " antes, se ela ainda não existir.",
  );

  return h("div", {}, form, demo);
}
