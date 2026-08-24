import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { Express, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { gerarNumeroOs } from "../../../casosDeUso/relatorio/numeroOs";
import { comFotosAssinadas } from "../../../casosDeUso/relatorio/serializarRelatorio";
import { obterJwtSecret } from "../../../helpers/env";
import { escaparRegex, normalizarLote } from "../../../helpers/texto";
import { tokenHash } from "../../../helpers/token";
import { CadastroGlobal, Empresa, Funcionario, Relatorio, Usuario } from "../../mongodb/modelos";
import { assinarUrlObjeto, gerarUrlUploadFoto } from "../../services/s3Servico";
import { autenticarJwt } from "./middlewares/autenticarJwt";
import { cadastroGlobalSchema, cadastroSchema, empresaSchema, funcionariosSchema, loginSchema, relatorioSchema, uploadFotoSchema, validarUsuarioSchema } from "./schemas";

const rolesEscrita = new Set(["admin", "funcionario"]);

const perfilUsuario = (usuario: any) => ({
  id: usuario.id,
  nome: usuario.nome,
  email: usuario.email,
  role: usuario.role || "admin",
  status: usuario.status || "ativo",
  empresa: usuario.empresa || "",
});

const usuarioPublico = (usuario: any) => {
  const perfil = perfilUsuario(usuario);
  return {
    id: perfil.id,
    nome: perfil.nome,
    email: perfil.email,
    role: perfil.role,
    status: perfil.status,
    empresa: perfil.empresa,
  };
};

const empresaPublica = (empresa: any) => {
  const item = empresa.toObject ? empresa.toObject() : empresa;
  const { _id, ...publico } = item;
  return publico;
};

const funcionarioPublico = (funcionario: any) => {
  const item = funcionario.toObject ? funcionario.toObject() : funcionario;
  const { _id, ...publico } = item;
  return publico;
};

const limparLista = (itens: string[]) => [...new Set(itens.map(item => item.trim()).filter(Boolean))];
const cadastroGlobalId = "global";

export function criarRotas(app: Express) {
  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.get("/imagens/proxy", async (req, res) => {
    const valorUrl = typeof req.query.url === "string" ? req.query.url : "";
    const bucket = process.env.AWS_S3_BUCKET || "";
    const region = process.env.AWS_S3_REGION || "us-east-1";
    let url: URL;
    try { url = new URL(valorUrl); } catch { return res.status(400).json({ mensagem: "URL de imagem inválida." }); }

    const hostPermitido = `${bucket}.s3.${region}.amazonaws.com`;
    if (!bucket || url.protocol !== "https:" || url.hostname !== hostPermitido || !url.pathname.startsWith("/fumigacao/")) {
      return res.status(400).json({ mensagem: "A imagem deve pertencer ao bucket autorizado." });
    }

    const chave = decodeURIComponent(url.pathname.slice(1));
    const urlLeitura = url.search ? url.toString() : await assinarUrlObjeto(chave);
    if (!urlLeitura) return res.status(503).json({ mensagem: "Armazenamento de imagens indisponível." });
    const upstream = await fetch(urlLeitura, { redirect: "error" });
    if (!upstream.ok) return res.status(upstream.status === 404 ? 404 : 502).json({ mensagem: "Não foi possível obter a imagem." });
    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) return res.status(400).json({ mensagem: "O conteúdo obtido não é uma imagem." });
    const tamanhoInformado = Number(upstream.headers.get("content-length") || 0);
    if (tamanhoInformado > 10 * 1024 * 1024) return res.status(413).json({ mensagem: "Imagem maior que 10 MB." });
    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (!buffer.length || buffer.length > 10 * 1024 * 1024) return res.status(413).json({ mensagem: "Imagem vazia ou maior que 10 MB." });

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.send(buffer);
  });

  app.post("/auth/cadastro", async (req, res) => {
    const parsed = cadastroSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ mensagem: "Dados inválidos.", erros: z.flattenError(parsed.error).fieldErrors });

    const email = parsed.data.email.toLowerCase();
    if (await Usuario.exists({ email })) return res.status(409).json({ mensagem: "E-mail já cadastrado." });
    const primeiroUsuario = (await Usuario.estimatedDocumentCount()) === 0;

    const usuario = await Usuario.create({
      id: uuid(),
      nome: parsed.data.nome,
      email,
      senhaHash: await bcrypt.hash(parsed.data.senha, 12),
      empresa: "",
      role: primeiroUsuario ? "admin" : "leitor",
      status: primeiroUsuario ? "ativo" : "pendente",
    });

    res.status(201).json({
      ...usuarioPublico(usuario),
      mensagem: primeiroUsuario
        ? "Primeiro usuário criado como admin."
        : "Cadastro recebido. Aguarde um admin validar seu acesso.",
    });
  });

  app.post("/auth/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ mensagem: "E-mail e senha são obrigatórios." });

    const usuario = await Usuario.findOne({ email: parsed.data.email.toLowerCase() });
    if (!usuario || !(await bcrypt.compare(parsed.data.senha, usuario.senhaHash))) {
      return res.status(401).json({ mensagem: "E-mail ou senha inválidos." });
    }
    const perfil = perfilUsuario(usuario);
    if (perfil.status !== "ativo") {
      return res.status(403).json({ mensagem: "Cadastro aguardando validação de um admin." });
    }

    const token = jwt.sign({ id: perfil.id, email: perfil.email, nome: perfil.nome, role: perfil.role }, obterJwtSecret(), { expiresIn: "8h" });
    res.json({ token, usuario: usuarioPublico(usuario) });
  });

  app.get("/usuarios", autenticarJwt, async (req, res) => {
    const admin = await exigirAdmin(req, res);
    if (!admin) return;

    const usuarios = await Usuario.find({}).sort({ createdAt: -1 }).lean();
    res.json({ itens: usuarios.map(usuarioPublico) });
  });

  app.get("/usuarios/pendentes", autenticarJwt, async (req, res) => {
    const admin = await exigirAdmin(req, res);
    if (!admin) return;

    const usuarios = await Usuario.find({ status: "pendente" }).sort({ createdAt: -1 }).lean();
    res.json({ itens: usuarios.map(usuarioPublico) });
  });

  app.patch("/usuarios/:id/validar", autenticarJwt, async (req, res) => {
    const admin = await exigirAdmin(req, res);
    if (!admin) return;

    const parsed = validarUsuarioSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ mensagem: "Informe empresa e perfil válidos.", erros: z.flattenError(parsed.error).fieldErrors });

    const usuario = await Usuario.findOneAndUpdate(
      { id: req.params.id },
      {
        $set: {
          empresa: parsed.data.empresa,
          role: parsed.data.role,
          status: "ativo",
          validadoPor: admin.id,
          validadoEm: new Date(),
        },
      },
      { new: true },
    );

    if (!usuario) return res.status(404).json({ mensagem: "Usuário não encontrado." });
    res.json({ usuario: usuarioPublico(usuario) });
  });

  app.get("/empresas", autenticarJwt, async (req, res) => {
    const usuario = await exigirUsuarioAtivo(req, res);
    if (!usuario) return;

    const perfil = perfilUsuario(usuario);
    const filtro = perfil.role === "admin" && !perfil.empresa ? {} : { nome: perfil.empresa };
    const empresas = await Empresa.find(filtro).sort({ nome: 1 }).lean();
    res.json({ itens: empresas.map(empresaPublica) });
  });

  app.post("/empresas", autenticarJwt, async (req, res) => {
    const admin = await exigirAdmin(req, res);
    if (!admin) return;

    const parsed = empresaSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ mensagem: "Revise os dados da empresa.", erros: z.flattenError(parsed.error).fieldErrors });
    if (await Empresa.exists({ nome: parsed.data.nome })) return res.status(409).json({ mensagem: "Empresa já cadastrada." });

    const empresa = await Empresa.create(normalizarEmpresaPayload(parsed.data));
    res.status(201).json({ empresa: empresaPublica(empresa) });
  });

  app.put("/empresas/:id", autenticarJwt, async (req, res) => {
    const admin = await exigirAdmin(req, res);
    if (!admin) return;

    const parsed = empresaSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ mensagem: "Revise os dados da empresa.", erros: z.flattenError(parsed.error).fieldErrors });
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const empresa = await Empresa.findOneAndUpdate(
      { id },
      { $set: normalizarEmpresaPayload(parsed.data, id) },
      { new: true, upsert: false },
    );

    if (!empresa) return res.status(404).json({ mensagem: "Empresa não encontrada." });
    res.json({ empresa: empresaPublica(empresa) });
  });

  app.get("/cadastros-globais", autenticarJwt, async (req, res) => {
    const usuario = await exigirUsuarioAtivo(req, res);
    if (!usuario) return;

    res.json({ cadastro: await obterCadastroGlobal() });
  });

  app.put("/cadastros-globais", autenticarJwt, async (req, res) => {
    const admin = await exigirAdmin(req, res);
    if (!admin) return;

    const parsed = cadastroGlobalSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ mensagem: "Revise os cadastros globais.", erros: z.flattenError(parsed.error).fieldErrors });

    const cadastro = await CadastroGlobal.findOneAndUpdate(
      { id: cadastroGlobalId },
      { $set: normalizarCadastroGlobalPayload(parsed.data) },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    res.json({ cadastro });
  });

  app.get("/funcionarios", autenticarJwt, async (req, res) => {
    const usuario = await exigirUsuarioAtivo(req, res);
    if (!usuario) return;

    const funcionarios = await Funcionario.find({ ativo: true }).sort({ nome: 1 }).lean();
    res.json({ itens: funcionarios.map(funcionarioPublico) });
  });

  app.put("/funcionarios", autenticarJwt, async (req, res) => {
    const admin = await exigirAdmin(req, res);
    if (!admin) return;

    const parsed = funcionariosSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ mensagem: "Revise os funcionários.", erros: z.flattenError(parsed.error).fieldErrors });

    const nomes = limparLista(parsed.data.funcionarios);
    await Funcionario.updateMany({}, { $set: { ativo: false } });
    await Promise.all(nomes.map(nome => Funcionario.findOneAndUpdate(
      { nome },
      { $set: { nome, ativo: true }, $setOnInsert: { id: uuid() } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )));
    const funcionarios = await Funcionario.find({ ativo: true }).sort({ nome: 1 }).lean();
    res.json({ itens: funcionarios.map(funcionarioPublico) });
  });

  app.post("/uploads/url", autenticarJwt, async (req, res) => {
    const usuario = await exigirEscrita(req, res);
    if (!usuario) return;

    const parsed = uploadFotoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ mensagem: "Foto inválida. Use JPG, PNG ou WebP de até 10 MB." });

    const url = await gerarUrlUploadFoto({
      usuarioId: req.usuarioId!,
      nome: parsed.data.nome,
      contentType: parsed.data.contentType,
      chaveId: uuid(),
    });

    if (!url) return res.status(503).json({ mensagem: "Bucket S3 não configurado." });
    res.json(url);
  });

  app.post("/relatorios", autenticarJwt, async (req, res) => {
    const usuario = await exigirEscrita(req, res);
    if (!usuario) return;

    const parsed = relatorioSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ mensagem: "Revise os dados do relatório.", erros: z.flattenError(parsed.error).fieldErrors });

    if (parsed.data.fotos.some(foto => !foto.chave.startsWith(`fumigacao/${req.usuarioId}/`))) {
      return res.status(400).json({ mensagem: "Uma ou mais evidências não pertencem a este usuário." });
    }

    const dataTratamento = new Date(parsed.data.dataTratamento);
    const empresa = resolverEmpresaRelatorio(usuario, parsed.data.empresa);
    if (!empresa) return res.status(400).json({ mensagem: "Informe a empresa do relatório." });
    const assinaturas = await resolverAssinaturasRelatorio(parsed.data.assinaturaIds || []);

    const relatorioId = uuid();
    const numeroOs = await gerarNumeroOs(dataTratamento, empresa, relatorioId);
    const lotes = [...new Set([...(parsed.data.lotes || []), numeroOs].map(normalizarLote))];
    const relatorio = await Relatorio.create({
      ...parsed.data,
      empresa,
      assinaturas,
      dataTratamento,
      lotes,
      numeroOs,
      formularioTitulo: parsed.data.formularioTitulo || "Registro de controle de pragas",
      id: relatorioId,
      usuarioId: req.usuarioId,
    });

    res.status(201).json(await comFotosAssinadas(relatorio));
  });

  app.get("/relatorios", autenticarJwt, async (req, res) => {
    const usuario = await exigirUsuarioAtivo(req, res);
    if (!usuario) return;

    const lote = typeof req.query.lote === "string" ? normalizarLote(req.query.lote) : "";
    const filtro: any = filtroAcessoRelatorios(usuario);
    if (lote) {
      const termo = escaparRegex(lote);
      filtro.$or = [
        { lotes: { $regex: termo, $options: "i" } },
        { numeroOs: { $regex: termo, $options: "i" } },
        { tipoControle: { $regex: termo, $options: "i" } },
        { unidadeCliente: { $regex: termo, $options: "i" } },
      ];
    }

    const itens = await Relatorio.find(filtro).sort({ dataTratamento: -1 }).limit(100).lean();
    res.json({ itens: await Promise.all(itens.map(comFotosAssinadas)) });
  });

  app.get("/relatorios/:id", autenticarJwt, async (req, res) => {
    const item = await buscarRelatorioUsuario(req, res);
    if (!item) return;
    res.json(await comFotosAssinadas(item));
  });


  app.post("/relatorios/:id/compartilhar", autenticarJwt, async (req, res) => {
    const usuario = await exigirEscrita(req, res);
    if (!usuario) return;

    const item = await buscarRelatorioUsuario(req, res);
    if (!item) return;

    const token = crypto.randomBytes(32).toString("base64url");
    item.compartilhamento = { tokenHash: tokenHash(token), ativo: true, criadoEm: new Date() };
    await item.save();

    const base = (process.env.PUBLIC_APP_URL || "http://localhost:5173").replace(/\/$/, "");
    res.json({ url: `${base}/compartilhado/${token}` });
  });

  app.delete("/relatorios/:id/compartilhar", autenticarJwt, async (req, res) => {
    const usuario = await exigirEscrita(req, res);
    if (!usuario) return;

    const result = await Relatorio.updateOne(
      { id: req.params.id, ...filtroAcessoRelatorios(usuario) },
      { $set: { "compartilhamento.ativo": false, "compartilhamento.tokenHash": null } },
    );
    if (!result.matchedCount) return res.status(404).json({ mensagem: "Relatório não encontrado." });
    res.status(204).send();
  });

  app.get("/publico/relatorios/:token", async (req, res) => {
    const item = await buscarRelatorioPublico(req, res);
    if (!item) return;
    res.json(await comFotosAssinadas(item));
  });

}

async function buscarRelatorioUsuario(req: Request, res: Response) {
  const usuario = await exigirUsuarioAtivo(req, res);
  if (!usuario) return null;

  const item = await Relatorio.findOne({ id: req.params.id, ...filtroAcessoRelatorios(usuario) });
  if (!item) {
    res.status(404).json({ mensagem: "Relatório não encontrado." });
    return null;
  }
  return item;
}

async function usuarioAutenticado(req: Request, res: Response) {
  const usuario = await Usuario.findOne({ id: req.usuarioId });
  if (!usuario) {
    res.status(401).json({ mensagem: "Sessão inválida ou expirada." });
    return null;
  }
  return usuario;
}

async function exigirUsuarioAtivo(req: Request, res: Response) {
  const usuario = await usuarioAutenticado(req, res);
  if (!usuario) return null;

  if (perfilUsuario(usuario).status !== "ativo") {
    res.status(403).json({ mensagem: "Cadastro aguardando validação de um admin." });
    return null;
  }
  return usuario;
}

async function exigirEscrita(req: Request, res: Response) {
  const usuario = await exigirUsuarioAtivo(req, res);
  if (!usuario) return null;

  if (!rolesEscrita.has(perfilUsuario(usuario).role)) {
    res.status(403).json({ mensagem: "Seu perfil possui apenas permissão de leitura." });
    return null;
  }
  return usuario;
}

async function exigirAdmin(req: Request, res: Response) {
  const usuario = await exigirUsuarioAtivo(req, res);
  if (!usuario) return null;

  if (perfilUsuario(usuario).role !== "admin") {
    res.status(403).json({ mensagem: "Apenas administradores podem validar usuários." });
    return null;
  }
  return usuario;
}

function resolverEmpresaRelatorio(usuario: any, empresaBody?: string) {
  const perfil = perfilUsuario(usuario);
  if (perfil.empresa) return perfil.empresa;
  if (perfil.role === "admin") return empresaBody?.trim() || "";
  return "";
}

function filtroAcessoRelatorios(usuario: any) {
  const perfil = perfilUsuario(usuario);
  if (perfil.role === "admin" && !perfil.empresa) return {};
  if (!perfil.empresa) return { empresa: "__sem_empresa_vinculada__" };
  return { empresa: perfil.empresa };
}

function normalizarEmpresaPayload(data: any, id = uuid()) {
  return {
    id,
    nome: data.nome.trim(),
    unidades: limparLista(data.unidades || []),
    areasSetores: limparLista(data.areasSetores || []),
  };
}

function normalizarCadastroGlobalPayload(data: any) {
  return {
    id: cadastroGlobalId,
    assinaturas: (data.assinaturas || []).map((assinatura: any) => ({
      id: assinatura.id || uuid(),
      nome: assinatura.nome.trim(),
      cargo: assinatura.cargo?.trim() || "",
      url: assinatura.url,
      chave: assinatura.chave,
      contentType: assinatura.contentType,
    })),
  };
}

async function obterCadastroGlobal() {
  const cadastro = await CadastroGlobal.findOne({ id: cadastroGlobalId }).lean();
  return cadastro || { id: cadastroGlobalId, assinaturas: [] };
}

async function resolverAssinaturasRelatorio(assinaturaIds: string[]) {
  if (!assinaturaIds.length) return [];
  const cadastro = await obterCadastroGlobal() as any;
  const ids = new Set(assinaturaIds);
  return (cadastro.assinaturas || []).filter((assinatura: any) => ids.has(assinatura.id));
}

function filtroAcessoEmpresas(usuario: any) {
  const perfil = perfilUsuario(usuario);
  if (perfil.role === "admin" && !perfil.empresa) return {};
  return { nome: perfil.empresa };
}

async function buscarRelatorioPublico(req: Request, res: Response) {
  const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
  const item = await Relatorio.findOne({
    "compartilhamento.tokenHash": tokenHash(token),
    "compartilhamento.ativo": true,
  });
  if (!item) {
    res.status(404).json({ mensagem: "Este compartilhamento não existe ou foi revogado." });
    return null;
  }
  return item;
}
