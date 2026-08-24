import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { obterJwtSecret } from "../../../../helpers/env";

declare global {
  namespace Express {
    interface Request {
      usuarioId?: string;
    }
  }
}

export const autenticarJwt = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const raw = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!raw) return res.status(401).json({ mensagem: "Autenticação necessária." });

    const payload = jwt.verify(raw, obterJwtSecret()) as { id: string };
    req.usuarioId = payload.id;
    next();
  } catch {
    res.status(401).json({ mensagem: "Sessão inválida ou expirada." });
  }
};
