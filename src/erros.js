/**
 * Todo erro da API tem o mesmo formato:
 *   { "erro": { "codigo": "validacao", "mensagem": "…", "campos": [{ "campo": "preco_centavos", "mensagem": "…" }] } }
 * "codigo" é estável (para o código do cliente); "mensagem" é para pessoas.
 */
export class ErroApi extends Error {
  constructor(status, codigo, mensagem, extra = {}) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.extra = extra;
  }
}

export const naoEncontrado = (o) => new ErroApi(404, "nao_encontrado", `${o} não encontrado.`);
export const conflito = (codigo, mensagem) => new ErroApi(409, codigo, mensagem);

export function rotaInexistente(req, res) {
  res.status(404).json({ erro: { codigo: "rota_inexistente", mensagem: `Não existe a rota ${req.method} ${req.path}. Veja /api/v1/openapi.json.` } });
}

// Express chama este tratador (4 argumentos) para qualquer erro lançado nas rotas.
export function tratadorErros(logger = console) {
  return (err, req, res, _next) => {
    if (err instanceof ErroApi) {
      return res.status(err.status).json({ erro: { codigo: err.codigo, mensagem: err.message, ...err.extra } });
    }
    if (err.type === "entity.parse.failed") {
      return res.status(400).json({ erro: { codigo: "json_invalido", mensagem: "O corpo da requisição não é um JSON válido." } });
    }
    if (err.type === "entity.too.large") {
      return res.status(413).json({ erro: { codigo: "corpo_grande_demais", mensagem: "O corpo da requisição passa do limite de 100 KB." } });
    }
    logger.error(err);
    res.status(500).json({ erro: { codigo: "erro_interno", mensagem: "Algo deu errado do nosso lado. Tente de novo em instantes." } });
  };
}
