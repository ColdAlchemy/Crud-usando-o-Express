import { Router } from "express";
import { conferirSenha, gerarToken, hashSenha } from "../auth.js";
import { ErroApi } from "../erros.js";
import { schemas, validar } from "../validacao.js";

export function rotasAuth({ db, config, autenticar, limitarTentativas }) {
  const r = Router();
  const porEmail = db.prepare("SELECT * FROM usuarios WHERE email = ?");
  // Hash falso para gastar o mesmo tempo quando o e-mail não existe (não revela quais e-mails têm conta).
  const hashFalso = hashSenha("senha-que-ninguem-usa");

  r.post("/registrar", limitarTentativas, (req, res) => {
    const { nome, email, senha } = validar(schemas.registrar, req.body);
    if (porEmail.get(email)) throw new ErroApi(409, "email_em_uso", "Já existe uma conta com esse e-mail.");

    const { lastInsertRowid } = db.prepare("INSERT INTO usuarios (nome, email, senha_hash) VALUES (?, ?, ?)").run(nome, email, hashSenha(senha));
    const usuario = db.prepare("SELECT id, nome, email, criado_em FROM usuarios WHERE id = ?").get(lastInsertRowid);
    res.status(201).json({ usuario });
  });

  r.post("/entrar", limitarTentativas, (req, res) => {
    const { email, senha } = validar(schemas.entrar, req.body);
    const usuario = porEmail.get(email);
    const confere = conferirSenha(senha, usuario?.senha_hash ?? hashFalso);
    if (!usuario || !confere) throw new ErroApi(401, "credenciais_invalidas", "E-mail ou senha incorretos.");

    res.json({
      token: gerarToken(usuario, config),
      tipo: "Bearer",
      expira_em_segundos: config.jwtExpiraSegundos,
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email },
    });
  });

  r.get("/eu", autenticar, (req, res) => res.json({ usuario: req.usuario }));

  return r;
}
