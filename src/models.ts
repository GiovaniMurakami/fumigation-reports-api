import mongoose, { Schema } from "mongoose";

const usuarioSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  nome: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  senhaHash: { type: String, required: true },
}, { timestamps: true, versionKey: false, collection: "fumigacao_usuarios" });

const fotoSchema = new Schema({
  url: { type: String, required: true },
  chave: { type: String, required: true },
  nome: { type: String, required: true },
  contentType: { type: String, required: true },
}, { _id: false });

const relatorioSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, index: true },
  lotes: { type: [String], required: true, index: true },
  dataTratamento: { type: Date, required: true },
  fotos: { type: [fotoSchema], default: [] },
  compartilhamento: {
    tokenHash: { type: String, default: null, index: true },
    ativo: { type: Boolean, default: false },
    criadoEm: { type: Date, default: null },
  },
}, { timestamps: true, versionKey: false, collection: "fumigacao_relatorios" });

export const Usuario = mongoose.models.FumigacaoUsuario || mongoose.model("FumigacaoUsuario", usuarioSchema);
export const Relatorio = mongoose.models.FumigacaoRelatorio || mongoose.model("FumigacaoRelatorio", relatorioSchema);
