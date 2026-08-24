import mongoose from "mongoose";

let connectionPromise: Promise<typeof mongoose> | null = null;

export async function conectarMongo() {
  if (mongoose.connection.readyState === 1) return;
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI não configurada");

  connectionPromise ??= mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB_NAME || "galpex",
    maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE || (process.env.AWS_LAMBDA_FUNCTION_NAME ? 1 : 10)),
    serverSelectionTimeoutMS: 7000,
  });

  try {
    await connectionPromise;
  } finally {
    connectionPromise = null;
  }
}
