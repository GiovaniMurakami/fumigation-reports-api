export function obterJwtSecret() {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET não configurado");
  return process.env.JWT_SECRET;
}

export function obterCorsOrigin() {
  if (process.env.CORS_ORIGIN === "*") return true;
  return process.env.CORS_ORIGIN?.split(",").map(valor => valor.trim()).filter(Boolean);
}

export function validarConfiguracaoRuntime() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI não configurada");
  obterJwtSecret();
}
