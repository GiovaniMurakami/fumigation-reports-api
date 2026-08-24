import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { criarRotas } from "./composicao/rotas";
import { obterCorsOrigin, validarConfiguracaoRuntime } from "./helpers/env";
import { conectarMongo } from "./infra/mongodb/conexao";

export const app = express();
app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: obterCorsOrigin(), credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(async (_req, res, next) => {
  try {
    await conectarMongo();
    next();
  } catch (e) {
    console.error(e);
    res.status(503).json({ mensagem: "Banco de dados indisponível." });
  }
});

validarConfiguracaoRuntime();
criarRotas(app);

app.use((_req, res) => res.status(404).json({ mensagem: "Rota não encontrada." }));
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => { console.error(error); res.status(500).json({ mensagem: "Erro interno inesperado." }); });
