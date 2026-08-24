import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let s3Client: S3Client | null = null;

const obterS3Client = () => s3Client ??= new S3Client({
  region: process.env.AWS_S3_REGION || "us-east-1",
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

export async function gerarUrlUploadFoto(params: { usuarioId: string; nome: string; contentType: string; chaveId: string }) {
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_S3_REGION || "us-east-1";
  if (!bucket) return null;

  const ext = params.nome.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  const chave = `fumigacao/${params.usuarioId}/${new Date().toISOString().slice(0, 10)}/${params.chaveId}.${ext}`;
  const uploadUrl = await getSignedUrl(
    obterS3Client(),
    new PutObjectCommand({ Bucket: bucket, Key: chave, ContentType: params.contentType }),
    { expiresIn: 300 },
  );

  return { uploadUrl, chave, url: `https://${bucket}.s3.${region}.amazonaws.com/${chave}` };
}

export async function assinarUrlObjeto(chave: string) {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) return null;

  return getSignedUrl(
    obterS3Client(),
    new GetObjectCommand({ Bucket: bucket, Key: chave }),
    { expiresIn: 3600 },
  );
}
