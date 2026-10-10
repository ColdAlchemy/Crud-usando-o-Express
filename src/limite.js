import { ErroApi } from "./erros.js";

/**
 * Limitador simples de requisições por IP (janela fixa, em memória).
 * Serve para frear tentativas de senha numa instância só; com várias instâncias,
 * o contador teria de morar num armazenamento compartilhado (ex.: Redis).
 */
export function limitador({ max, janelaMs }) {
  const contadores = new Map();
  setInterval(() => {
    const agora = Date.now();
    for (const [chave, c] of contadores) if (c.fim <= agora) contadores.delete(chave);
  }, janelaMs).unref();

  return (req, res, next) => {
    const agora = Date.now();
    let c = contadores.get(req.ip);
    if (!c || c.fim <= agora) {
      c = { usadas: 0, fim: agora + janelaMs };
      contadores.set(req.ip, c);
    }
    c.usadas += 1;

    res.set("RateLimit-Limit", String(max));
    res.set("RateLimit-Remaining", String(Math.max(0, max - c.usadas)));
    if (c.usadas > max) {
      const espera = Math.ceil((c.fim - agora) / 1000);
      res.set("Retry-After", String(espera));
      return next(new ErroApi(429, "limite_excedido", `Muitas tentativas. Tente de novo em ${espera} segundos.`));
    }
    next();
  };
}
