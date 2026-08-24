import { z } from "zod";

export const cadastroSchema = z.object({
  nome: z.string().trim().min(2).max(100),
  email: z.email(),
  senha: z.string().min(8).max(72),
});

export const loginSchema = z.object({
  email: z.email(),
  senha: z.string().min(1),
});

export const uploadFotoSchema = z.object({
  nome: z.string().min(1).max(200),
  contentType: z.string().regex(/^image\/(jpeg|png|webp)$/),
  tamanho: z.number().int().positive().max(10 * 1024 * 1024),
});

const fotoSchema = z.object({
  url: z.url(),
  chave: z.string().min(1),
  nome: z.string().min(1).max(200),
  contentType: z.string().regex(/^image\/(jpeg|png|webp)$/),
});

const assinaturaSchema = fotoSchema.extend({
  id: z.string().min(1).optional(),
  cargo: z.string().trim().max(120).optional(),
});

export const relatorioSchema = z.object({
  empresa: z.string().trim().max(120).optional(),
  assinaturaIds: z.array(z.string().trim().min(1)).max(10).optional(),
  lotes: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
  dataTratamento: z.iso.datetime(),
  formularioTitulo: z.string().trim().max(120).optional(),
  unidadeCliente: z.string().trim().max(120).optional(),
  areaSetor: z.string().trim().max(180).optional(),
  tipoControle: z.string().trim().max(120).optional(),
  numeroOs: z.string().trim().max(80).optional(),
  realizadoPor: z.string().trim().max(120).optional(),
  dados: z.record(z.string(), z.unknown()).optional(),
  fotos: z.array(fotoSchema).max(60).default([]),
});

export const validarUsuarioSchema = z.object({
  empresa: z.string().trim().min(2).max(120),
  role: z.enum(["admin", "funcionario", "leitor"]).default("leitor"),
});

const listaTextoSchema = z.array(z.string().trim().min(1).max(160)).max(200).default([]);

export const empresaSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  unidades: listaTextoSchema,
  areasSetores: listaTextoSchema,
});

export const cadastroGlobalSchema = z.object({
  assinaturas: z.array(assinaturaSchema.extend({
    nome: z.string().trim().min(2).max(120),
  })).max(20).default([]),
});

export const funcionariosSchema = z.object({
  funcionarios: listaTextoSchema,
});
