import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { Relatorio, Usuario } from "./models";

declare global { namespace Express { interface Request { usuarioId?: string } } }

let connectionPromise: Promise<typeof mongoose> | null = null;
async function conectar() {
  if (mongoose.connection.readyState === 1) return;
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI não configurada");
  connectionPromise ??= mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB_NAME || "galpex",
    maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE || (process.env.AWS_LAMBDA_FUNCTION_NAME ? 1 : 10)),
    serverSelectionTimeoutMS: 7000,
  });
  try { await connectionPromise; } finally { connectionPromise = null; }
}

const segredo = () => {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET não configurado");
  return process.env.JWT_SECRET;
};
const tokenHash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
const normalizarLote = (lote: string) => lote.trim().toUpperCase();
let s3Client: S3Client | null = null;
const obterS3Client = () => s3Client ??= new S3Client({
  region: process.env.AWS_S3_REGION || "us-east-1",
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});
const semInternos = (doc: any) => {
  const item = doc.toObject ? doc.toObject() : doc;
  const { _id, usuarioId, compartilhamento, ...publico } = item;
  return publico;
};
const comFotosAssinadas = async (doc: any) => {
  const publico = semInternos(doc);
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) return publico;
  publico.fotos = await Promise.all((publico.fotos || []).map(async (foto: any) => ({
    ...foto,
    url: await getSignedUrl(
      obterS3Client(),
      new GetObjectCommand({ Bucket: bucket, Key: foto.chave }),
      { expiresIn: 3600 },
    ),
  })));
  return publico;
};

const auth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const raw = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!raw) return res.status(401).json({ mensagem: "Autenticação necessária." });
    const payload = jwt.verify(raw, segredo()) as { id: string };
    req.usuarioId = payload.id;
    next();
  } catch { res.status(401).json({ mensagem: "Sessão inválida ou expirada." }); }
};

const cadastroSchema = z.object({ nome: z.string().trim().min(2).max(100), email: z.email(), senha: z.string().min(8).max(72) });
const loginSchema = z.object({ email: z.email(), senha: z.string().min(1) });
const fotoSchema = z.object({ url: z.url(), chave: z.string().min(1), nome: z.string().min(1).max(200), contentType: z.string().regex(/^image\/(jpeg|png|webp)$/) });
const relatorioSchema = z.object({
  lotes: z.array(z.string().trim().min(1).max(80)).min(1, "Informe ao menos um lote").max(100),
  dataTratamento: z.iso.datetime(),
  fotos: z.array(fotoSchema).min(1, "Envie ao menos uma foto").max(12),
});

export const app = express();
app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN === "*" ? true : process.env.CORS_ORIGIN?.split(",").map(v => v.trim()), credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(async (_req, res, next) => { try { await conectar(); next(); } catch (e) { console.error(e); res.status(503).json({ mensagem: "Banco de dados indisponível." }); } });

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.post("/auth/cadastro", async (req, res) => {
  const parsed = cadastroSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ mensagem: "Dados inválidos.", erros: z.flattenError(parsed.error).fieldErrors });
  const email = parsed.data.email.toLowerCase();
  if (await Usuario.exists({ email })) return res.status(409).json({ mensagem: "E-mail já cadastrado." });
  const usuario = await Usuario.create({ id: uuid(), nome: parsed.data.nome, email, senhaHash: await bcrypt.hash(parsed.data.senha, 12) });
  res.status(201).json({ id: usuario.id, nome: usuario.nome, email: usuario.email });
});
app.post("/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ mensagem: "E-mail e senha são obrigatórios." });
  const usuario = await Usuario.findOne({ email: parsed.data.email.toLowerCase() });
  if (!usuario || !(await bcrypt.compare(parsed.data.senha, usuario.senhaHash))) return res.status(401).json({ mensagem: "E-mail ou senha inválidos." });
  const token = jwt.sign({ id: usuario.id, email: usuario.email, nome: usuario.nome }, segredo(), { expiresIn: "8h" });
  res.json({ token, usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email } });
});

app.post("/uploads/url", auth, async (req, res) => {
  const parsed = z.object({ nome: z.string().min(1).max(200), contentType: z.string().regex(/^image\/(jpeg|png|webp)$/), tamanho: z.number().int().positive().max(10 * 1024 * 1024) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ mensagem: "Foto inválida. Use JPG, PNG ou WebP de até 10 MB." });
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_S3_REGION || "us-east-1";
  if (!bucket) return res.status(503).json({ mensagem: "Bucket S3 não configurado." });
  const ext = parsed.data.nome.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  const chave = `fumigacao/${req.usuarioId}/${new Date().toISOString().slice(0, 10)}/${uuid()}.${ext}`;
  const uploadUrl = await getSignedUrl(obterS3Client(), new PutObjectCommand({ Bucket: bucket, Key: chave, ContentType: parsed.data.contentType }), { expiresIn: 300 });
  res.json({ uploadUrl, chave, url: `https://${bucket}.s3.${region}.amazonaws.com/${chave}` });
});

app.post("/relatorios", auth, async (req, res) => {
  const parsed = relatorioSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ mensagem: "Revise os dados do relatório.", erros: z.flattenError(parsed.error).fieldErrors });
  if (parsed.data.fotos.some(foto => !foto.chave.startsWith(`fumigacao/${req.usuarioId}/`))) {
    return res.status(400).json({ mensagem: "Uma ou mais evidências não pertencem a este usuário." });
  }
  const lotes = [...new Set(parsed.data.lotes.map(normalizarLote))];
  const relatorio = await Relatorio.create({ ...parsed.data, lotes, id: uuid(), usuarioId: req.usuarioId });
  res.status(201).json(await comFotosAssinadas(relatorio));
});
app.get("/relatorios", auth, async (req, res) => {
  const lote = typeof req.query.lote === "string" ? normalizarLote(req.query.lote) : "";
  const filtro: any = { usuarioId: req.usuarioId };
  if (lote) filtro.lotes = { $regex: lote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  const itens = await Relatorio.find(filtro).sort({ dataTratamento: -1 }).limit(100).lean();
  res.json({ itens: await Promise.all(itens.map(comFotosAssinadas)) });
});
app.get("/relatorios/:id", auth, async (req, res) => {
  const item = await Relatorio.findOne({ id: req.params.id, usuarioId: req.usuarioId });
  if (!item) return res.status(404).json({ mensagem: "Relatório não encontrado." });
  res.json(await comFotosAssinadas(item));
});
app.post("/relatorios/:id/compartilhar", auth, async (req, res) => {
  const item = await Relatorio.findOne({ id: req.params.id, usuarioId: req.usuarioId });
  if (!item) return res.status(404).json({ mensagem: "Relatório não encontrado." });
  const token = crypto.randomBytes(32).toString("base64url");
  item.compartilhamento = { tokenHash: tokenHash(token), ativo: true, criadoEm: new Date() };
  await item.save();
  const base = (process.env.PUBLIC_APP_URL || "http://localhost:5173").replace(/\/$/, "");
  res.json({ url: `${base}/compartilhado/${token}` });
});
app.delete("/relatorios/:id/compartilhar", auth, async (req, res) => {
  const result = await Relatorio.updateOne({ id: req.params.id, usuarioId: req.usuarioId }, { $set: { "compartilhamento.ativo": false, "compartilhamento.tokenHash": null } });
  if (!result.matchedCount) return res.status(404).json({ mensagem: "Relatório não encontrado." });
  res.status(204).send();
});
app.get("/publico/relatorios/:token", async (req, res) => {
  const item = await Relatorio.findOne({ "compartilhamento.tokenHash": tokenHash(req.params.token), "compartilhamento.ativo": true });
  if (!item) return res.status(404).json({ mensagem: "Este compartilhamento não existe ou foi revogado." });
  res.json(await comFotosAssinadas(item));
});

app.use((_req, res) => res.status(404).json({ mensagem: "Rota não encontrada." }));
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => { console.error(error); res.status(500).json({ mensagem: "Erro interno inesperado." }); });
