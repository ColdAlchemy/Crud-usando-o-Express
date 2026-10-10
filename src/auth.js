import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { ErroApi } from "./erros.js";

const ALGORITMO = "HS256";

/** Senha → "salt:hash" (scrypt, com sal aleatório por usuário). Nunca guardamos a senha. */
export function hashSenha(senha) {
  const sal = randomBytes(16).toString("hex");
  return `${sal}:${scryptSync(senha, sal, 64).toString("hex")}`;
}

export function conferirSenha(senha, armazenado) {
  const [sal, hash] = armazenado.split(":");
  const calculado = scryptSync(senha, sal, 64);
  const esperado = Buffer.from(hash, "hex");
  // timingSafeEqual: compara em tempo constante (não vaza onde a diferença está)
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

export function gerarToken(usuario, config) {
  return jwt.sign({ sub: String(usuario.id), nome: usuario.nome }, config.jwtSecret, {
    algorithm: ALGORITMO,
    expiresIn: config.jwtExpiraSegundos,
  });
}

/** Middleware: exige "Authorization: Bearer <token>" e coloca o usuário em req.usuario. */
export function exigirAuth(db, config) {
  const buscar = db.prepare("SELECT id, nome, email FROM usuarios WHERE id = ?");

  return (req, res, next) => {
    const cabecalho = req.get("authorization") ?? "";
    const [tipo, token] = cabecalho.split(" ");
    const recusar = (codigo, mensagem) => {
      res.set("WWW-Authenticate", `Bearer error="${codigo}"`);
      return next(new ErroApi(401, codigo, mensagem));
    };

    if (tipo?.toLowerCase() !== "bearer" || !token) {
      return recusar("nao_autenticado", "Envie o token no cabeçalho Authorization: Bearer <token>.");
    }
    try {
      // algorithms fixo: impede aceitar tokens "alg: none" ou assinados com outro algoritmo
      const dados = jwt.verify(token, config.jwtSecret, { algorithms: [ALGORITMO] });
      const usuario = buscar.get(Number(dados.sub));
      if (!usuario) return recusar("nao_autenticado", "O usuário deste token não existe mais.");
      req.usuario = usuario;
      next();
    } catch (e) {
      if (e.name === "TokenExpiredError") return recusar("token_expirado", "O token expirou. Entre de novo para receber outro.");
      return recusar("token_invalido", "O token é inválido.");
    }
  };
}
