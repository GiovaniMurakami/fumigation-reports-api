import { assinarUrlObjeto } from "../../infra/services/s3Servico";

export const semInternos = (doc: any) => {
  const item = doc.toObject ? doc.toObject() : doc;
  const { _id, usuarioId, compartilhamento, ...publico } = item;
  return publico;
};

export const comFotosAssinadas = async (doc: any) => {
  const publico = semInternos(doc);
  if (!process.env.AWS_S3_BUCKET) return publico;

  publico.fotos = await Promise.all((publico.fotos || []).map(async (foto: any) => ({
    ...foto,
    url: await assinarUrlObjeto(foto.chave) || foto.url,
  })));
  publico.assinaturas = await Promise.all((publico.assinaturas || []).map(async (assinatura: any) => ({
    ...assinatura,
    url: await assinarUrlObjeto(assinatura.chave) || assinatura.url,
  })));

  return publico;
};
