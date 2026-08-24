import { OsCounter, Relatorio } from "../../infra/mongodb/modelos";

const chaveDataOs = (date: Date) => {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => partes.find(part => part.type === type)?.value || "";
  return `${get("day")}${get("month")}${get("year")}`;
};

const chaveEmpresa = (empresa: string) => empresa.trim().toUpperCase().replace(/\s+/g, "-");

const chaveContador = (empresa: string, dataKey: string) => `${chaveEmpresa(empresa)}:${dataKey}`;

const maiorSequenciaExistente = async (empresa: string, dataKey: string) => {
  const existentes = await Relatorio.find(
    { empresa, numeroOs: { $regex: `^OS-${dataKey}/\\d{3}$` } },
    { numeroOs: 1, _id: 0 },
  ).lean();

  return existentes.reduce((maior, item: any) => {
    const seq = Number(String(item.numeroOs || "").split("/")[1]);
    return Number.isFinite(seq) ? Math.max(maior, seq) : maior;
  }, 0);
};

export async function gerarNumeroOs(dataTratamento: Date, empresa: string, relatorioId: string) {
  const dataKey = chaveDataOs(dataTratamento);
  const counterKey = chaveContador(empresa, dataKey);

  if (!(await OsCounter.exists({ dataKey: counterKey }))) {
    const seqInicial = await maiorSequenciaExistente(empresa, dataKey);
    try {
      await OsCounter.create({ dataKey: counterKey, dataOs: dataKey, empresa, seq: seqInicial, ultimoRelatorioId: relatorioId });
    } catch {
      // Outro processo pode ter criado o contador entre a leitura e o insert.
    }
  }

  const contador = await OsCounter.findOneAndUpdate(
    { dataKey: counterKey },
    {
      $inc: { seq: 1 },
      $set: { ultimoRelatorioId: relatorioId, empresa, dataOs: dataKey },
      $setOnInsert: { dataKey: counterKey },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean() as any;

  return `OS-${dataKey}/${String(contador?.seq || 1).padStart(3, "0")}`;
}
