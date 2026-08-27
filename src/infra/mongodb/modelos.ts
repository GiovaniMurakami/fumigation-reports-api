import mongoose, { Schema } from "mongoose";

const usuarioSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  nome: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  senhaHash: { type: String, required: true },
  role: { type: String, enum: ["admin", "funcionario", "leitor"], default: "leitor", index: true },
  status: { type: String, enum: ["pendente", "ativo"], default: "pendente", index: true },
  empresa: { type: String, default: "", trim: true, index: true },
  empresas: { type: [String], default: [], index: true },
  validadoPor: { type: String, default: null },
  validadoEm: { type: Date, default: null },
}, { timestamps: true, versionKey: false, collection: "fumigacao_usuarios" });

const fotoSchema = new Schema({
  url: { type: String, required: true },
  chave: { type: String, required: true },
  nome: { type: String, required: true },
  contentType: { type: String, required: true },
}, { _id: false });

const assinaturaSchema = new Schema({
  id: { type: String, required: true },
  nome: { type: String, required: true, trim: true },
  cargo: { type: String, default: "", trim: true },
  url: { type: String, required: true },
  chave: { type: String, required: true },
  contentType: { type: String, required: true },
}, { _id: false });

const empresaSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  nome: { type: String, required: true, unique: true, trim: true, index: true },
  unidades: { type: [String], default: [] },
  areasSetores: { type: [String], default: [] },
}, { timestamps: true, versionKey: false, collection: "fumigacao_empresas" });

const cadastroGlobalSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  assinaturas: { type: [assinaturaSchema], default: [] },
}, { timestamps: true, versionKey: false, collection: "fumigacao_cadastros_globais" });

const funcionarioSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  nome: { type: String, required: true, trim: true, index: true },
  ativo: { type: Boolean, default: true, index: true },
}, { timestamps: true, versionKey: false, collection: "fumigacao_funcionarios" });

const clienteSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  nome: { type: String, required: true, trim: true, index: true },
  ativo: { type: Boolean, default: true, index: true },
}, { timestamps: true, versionKey: false, collection: "fumigacao_clientes" });

const relatorioSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, index: true },
  empresa: { type: String, required: true, trim: true, index: true },
  cliente: { type: String, default: "", trim: true, index: true },
  produto: { type: String, default: "", trim: true, index: true },
  quantidade: { type: String, default: "", trim: true, index: true },
  placaVeiculo: { type: String, default: "", trim: true, index: true },
  lotes: { type: [String], required: true, index: true },
  dataTratamento: { type: Date, required: true },
  dataInicio: { type: Date, default: null },
  dataFim: { type: Date, default: null },
  formularioTitulo: { type: String, default: "Registro de controle de pragas", trim: true },
  unidadeCliente: { type: String, default: "", trim: true, index: true },
  areaSetor: { type: String, default: "", trim: true },
  tipoControle: { type: String, default: "", trim: true, index: true },
  numeroOs: { type: String, default: "", trim: true, index: true },
  realizadoPor: { type: String, default: "", trim: true },
  assinaturas: { type: [assinaturaSchema], default: [] },
  dados: { type: Schema.Types.Mixed, default: {} },
  fotos: { type: [fotoSchema], default: [] },
  compartilhamento: {
    tokenHash: { type: String, default: null, index: true },
    ativo: { type: Boolean, default: false },
    criadoEm: { type: Date, default: null },
  },
}, { timestamps: true, versionKey: false, collection: "fumigacao_relatorios" });

const osCounterSchema = new Schema({
  dataKey: { type: String, required: true, unique: true, index: true },
  dataOs: { type: String, default: "", index: true },
  empresa: { type: String, default: "", trim: true, index: true },
  seq: { type: Number, required: true, default: 0 },
  ultimoRelatorioId: { type: String, default: "", index: true },
}, { timestamps: true, versionKey: false, collection: "fumigacao_os_counters" });

export const Usuario = mongoose.models.FumigacaoUsuario || mongoose.model("FumigacaoUsuario", usuarioSchema);
export const Relatorio = mongoose.models.FumigacaoRelatorio || mongoose.model("FumigacaoRelatorio", relatorioSchema);
export const OsCounter = mongoose.models.FumigacaoOsCounter || mongoose.model("FumigacaoOsCounter", osCounterSchema);
export const Empresa = mongoose.models.FumigacaoEmpresa || mongoose.model("FumigacaoEmpresa", empresaSchema);
export const CadastroGlobal = mongoose.models.FumigacaoCadastroGlobal || mongoose.model("FumigacaoCadastroGlobal", cadastroGlobalSchema);
export const Funcionario = mongoose.models.FumigacaoFuncionario || mongoose.model("FumigacaoFuncionario", funcionarioSchema);
export const Cliente = mongoose.models.FumigacaoCliente || mongoose.model("FumigacaoCliente", clienteSchema);
