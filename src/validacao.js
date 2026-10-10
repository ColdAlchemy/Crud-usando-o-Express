import { z } from "zod";
import { ErroApi } from "./erros.js";

/** Mensagens de validação em português (o zod vem com as mensagens em inglês). */
z.setErrorMap((issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === "undefined") return { message: "é obrigatório" };
      if (issue.received === "null") return { message: "não pode ser nulo" };
      return { message: `deve ser do tipo ${{ string: "texto", number: "número", integer: "inteiro", boolean: "verdadeiro/falso" }[issue.expected] ?? issue.expected}` };
    case z.ZodIssueCode.too_small:
      if (issue.type === "string") return { message: issue.minimum === 1 ? "não pode ser vazio" : `precisa ter pelo menos ${issue.minimum} caracteres` };
      return { message: `deve ser maior ou igual a ${issue.minimum}` };
    case z.ZodIssueCode.too_big:
      if (issue.type === "string") return { message: `pode ter no máximo ${issue.maximum} caracteres` };
      return { message: `deve ser menor ou igual a ${issue.maximum}` };
    case z.ZodIssueCode.invalid_string:
      if (issue.validation === "email") return { message: "não parece um e-mail válido" };
      if (issue.validation === "regex") return { message: "tem caracteres não permitidos" };
      return { message: "formato inválido" };
    case z.ZodIssueCode.invalid_enum_value:
      return { message: `deve ser um destes valores: ${issue.options.join(", ")}` };
    case z.ZodIssueCode.unrecognized_keys:
      return { message: `campo(s) desconhecido(s): ${issue.keys.join(", ")}` };
    default:
      return { message: ctx.defaultError };
  }
});

/** Valida e devolve os dados limpos; se falhar, lança 422 com a lista de campos. */
export function validar(schema, dados, onde = "corpo") {
  const r = schema.safeParse(dados ?? {});
  if (r.success) return r.data;
  throw new ErroApi(422, "validacao", `Dados inválidos no ${onde} da requisição.`, {
    campos: r.error.issues.map((i) => ({ campo: i.path.join(".") || onde, mensagem: i.message })),
  });
}

/** "12" → 12, com erro 400 se não for um inteiro positivo (ids na URL). */
export function idDaUrl(valor) {
  if (!/^[1-9]\d{0,15}$/.test(String(valor))) throw new ErroApi(400, "id_invalido", "O id na URL precisa ser um número inteiro positivo.");
  return Number(valor);
}

const texto = (min, max) => z.string().trim().min(min).max(max);
const inteiro = z.number().int();

export const schemas = {
  registrar: z.object({
    nome: texto(2, 80),
    email: z.string().trim().toLowerCase().email().max(150),
    senha: z.string().min(8).max(72),
  }).strict(),

  entrar: z.object({
    email: z.string().trim().toLowerCase().email(),
    senha: z.string().min(1),
  }).strict(),

  categoria: z.object({
    nome: texto(2, 60),
    descricao: z.string().trim().max(200).nullable().optional(),
  }).strict(),

  produtoNovo: z.object({
    sku: z.string().trim().regex(/^[A-Za-z0-9._-]{2,40}$/),
    nome: texto(2, 120),
    descricao: z.string().trim().max(500).nullable().optional(),
    preco_centavos: inteiro.min(0).max(100_000_000),
    estoque_minimo: inteiro.min(0).max(1_000_000).default(0),
    ativo: z.boolean().default(true),
    categoria_id: inteiro.positive().nullable().optional(),
    // Opcional: já registra uma entrada "Estoque inicial".
    estoque_inicial: inteiro.min(0).max(1_000_000).default(0),
  }).strict(),

  movimentacao: z.object({
    tipo: z.enum(["entrada", "saida", "ajuste"]),
    quantidade: inteiro.min(0).max(1_000_000),
    motivo: z.string().trim().max(200).optional(),
  }).strict().refine((m) => m.tipo === "ajuste" || m.quantidade > 0, {
    path: ["quantidade"],
    message: "deve ser maior que zero para entrada e saída",
  }),
};

// PATCH: mesmos campos do cadastro, todos opcionais, e sem "estoque_inicial" (saldo só muda por movimentação).
const { estoque_inicial, ...camposEditaveis } = schemas.produtoNovo.shape;
schemas.produtoEdicao = z.object(camposEditaveis).partial().strict().refine((d) => Object.keys(d).length > 0, {
  message: "envie ao menos um campo para atualizar",
});

const pagina = z.coerce.number().int().min(1).default(1);
const limite = z.coerce.number().int().min(1).max(100).default(20);
const booleanoDeUrl = z.enum(["true", "false"]).transform((v) => v === "true");
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ORDENS_PRODUTO = ["id", "nome", "sku", "preco_centavos", "estoque", "criado_em"];

export const consultas = {
  produtos: z.object({
    pagina, limite,
    q: z.string().trim().max(100).optional(),
    categoria_id: z.coerce.number().int().positive().optional(),
    ativo: booleanoDeUrl.optional(),
    estoque_baixo: booleanoDeUrl.optional(),
    ordem: z.enum(ORDENS_PRODUTO.flatMap((c) => [c, `-${c}`])).default("id"),
  }),
  movimentacoes: z.object({
    pagina, limite,
    produto_id: z.coerce.number().int().positive().optional(),
    tipo: z.enum(["entrada", "saida", "ajuste"]).optional(),
    de: dia.optional(),
    ate: dia.optional(),
  }),
  paginacao: z.object({ pagina, limite }),
};
