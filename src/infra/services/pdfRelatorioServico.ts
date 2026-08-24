import { Response } from "express";
import PDFDocument from "pdfkit";
import { comFotosAssinadas } from "../../casosDeUso/relatorio/serializarRelatorio";

const tipoParaTitulo = (tipo: string) => {
  const mapa: Record<string, string> = {
    "Captura de pombos": "RELATÓRIO DE CAPTURA DE POMBOS",
    "Retirada de ninhos": "RELATÓRIO DE RETIRADA DE NINHOS, OVOS E FILHOTES",
    "Isca roedores - Ratol / GS": "RELATÓRIO DE ISCAS PARA ROEDORES",
    "Armadilhas luminósas": "RELATÓRIO DE ARMADILHAS LUMINOSAS",
    "Arm. Feromônio - Coleopterus": "RELATÓRIO DE ARMADILHAS FEROMÔNIO - COLEÓPTERUS",
    "Arm. Feromônio - Epdópterus": "RELATÓRIO DE ARMADILHAS FEROMÔNIO - LEPDÓPTEROS",
    "Pulverização Manual": "RELATÓRIO DE REALIZAÇÃO DE SERVIÇO DE PULVERIZAÇÃO",
    "Pulverização Mecanizada": "RELATÓRIO DE REALIZAÇÃO DE SERVIÇO DE PULVERIZAÇÃO MECANIZADA",
    "Fumigação": "RELATÓRIO DE FUMIGAÇÃO",
    "Termonebulização": "RELATÓRIO DE TERMONEBULIZAÇÃO",
    "Limpeza de armazém": "RELATÓRIO DE LIMPEZA DE ARMAZÉM",
    "Serviços de manutenção": "RELATÓRIO DE SERVIÇO DE MANUTENÇÃO",
  };
  return mapa[tipo] || "RELATÓRIO DE CONTROLE DE PRAGAS";
};

const formatarData = (value: unknown) => {
  if (!value) return "";
  const data = new Date(String(value));
  if (Number.isNaN(data.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(data);
};

const valorTexto = (value: unknown): string => {
  if (value == null || value === "") return "";
  if (Array.isArray(value)) return value.map(valorTexto).filter(Boolean).join(", ");
  if (typeof value === "object") {
    const obj = value as Record<string, any>;
    if (obj.nome) return String(obj.nome);
    if (obj.url) return String(obj.url);
    return Object.entries(obj).map(([key, val]) => `${key}: ${valorTexto(val)}`).filter(Boolean).join("; ");
  }
  return String(value);
};

const buscarImagem = async (url: string) => {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
};

export const gerarPdfRelatorio = async (item: any) => new Promise<Buffer>(async (resolve, reject) => {
  const doc = new PDFDocument({ size: "A4", margin: 42, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", chunk => chunks.push(chunk));
  doc.on("end", () => resolve(Buffer.concat(chunks)));
  doc.on("error", reject);

  const publico = await comFotosAssinadas(item);
  const titulo = tipoParaTitulo(publico.tipoControle);
  const azul = "#0f766e";
  const cinza = "#4b5563";

  doc.rect(0, 0, doc.page.width, 88).fill(azul);
  doc.fillColor("#ffffff").fontSize(16).font("Helvetica-Bold").text(titulo, 42, 28, { width: 510, align: "center" });
  doc.fontSize(9).font("Helvetica").text("BioSafe Pest - relatório técnico", 42, 56, { width: 510, align: "center" });

  doc.fillColor("#111827");
  let y = 112;
  const linhaInfo = (rotulo: string, valor: string, x = 42, w = 240) => {
    doc.fontSize(8).fillColor(cinza).font("Helvetica-Bold").text(rotulo, x, y);
    doc.fontSize(10).fillColor("#111827").font("Helvetica").text(valor || "-", x, y + 12, { width: w });
  };
  linhaInfo("Empresa", publico.empresa || "-", 42, 160);
  linhaInfo("Cliente / unidade", publico.unidadeCliente || publico.formularioTitulo || "-", 220, 170);
  linhaInfo("Área / setor", publico.areaSetor || "-", 410, 140);
  y += 42;
  linhaInfo("Nº O.S.", publico.numeroOs || publico.lotes?.join(", ") || "-", 42, 150);
  linhaInfo("Realizado por", publico.realizadoPor || "-", 210, 170);
  linhaInfo("Data", formatarData(publico.dataTratamento), 410, 120);
  y += 50;

  doc.moveTo(42, y).lineTo(553, y).strokeColor("#d1d5db").stroke();
  y += 18;
  doc.fillColor(azul).fontSize(12).font("Helvetica-Bold").text("Dados do serviço", 42, y);
  y += 22;

  const entradas = Object.entries(publico.dados || {})
    .map(([chave, valor]) => ({ chave, valor: valorTexto(valor) }))
    .filter(item => item.valor);

  if (!entradas.length) {
    doc.fillColor(cinza).fontSize(10).font("Helvetica").text("Nenhum campo adicional informado.", 42, y);
    y += 20;
  }

  for (const entrada of entradas) {
    if (y > 720) { doc.addPage(); y = 42; }
    doc.fillColor(cinza).fontSize(8).font("Helvetica-Bold").text(entrada.chave, 42, y, { width: 190 });
    doc.fillColor("#111827").fontSize(9).font("Helvetica").text(entrada.valor, 240, y, { width: 310 });
    y += Math.max(22, doc.heightOfString(entrada.valor, { width: 310 }) + 8);
  }

  const fotos = publico.fotos || [];
  if (fotos.length) {
    if (y > 610) { doc.addPage(); y = 42; }
    doc.fillColor(azul).fontSize(12).font("Helvetica-Bold").text("Evidências fotográficas", 42, y);
    y += 22;
    const imageW = 154;
    const imageH = 104;
    for (let i = 0; i < Math.min(fotos.length, 9); i += 1) {
      const col = i % 3;
      if (col === 0 && i > 0) y += imageH + 28;
      if (y > 690) { doc.addPage(); y = 42; }
      const x = 42 + col * 170;
      doc.rect(x, y, imageW, imageH).strokeColor("#d1d5db").stroke();
      const buffer = await buscarImagem(fotos[i].url);
      if (buffer) {
        try {
          doc.image(buffer, x + 2, y + 2, { fit: [imageW - 4, imageH - 4], align: "center", valign: "center" });
        } catch {
          doc.fontSize(8).fillColor(cinza).text(fotos[i].nome || "Imagem", x + 8, y + 44, { width: imageW - 16, align: "center" });
        }
      } else {
        doc.fontSize(8).fillColor(cinza).text(fotos[i].nome || "Imagem", x + 8, y + 44, { width: imageW - 16, align: "center" });
      }
      doc.fontSize(7).fillColor(cinza).text(fotos[i].nome || `Foto ${i + 1}`, x, y + imageH + 4, { width: imageW, align: "center" });
    }
  }

  const assinaturas = publico.assinaturas || [];
  if (assinaturas.length) {
    if (y > 650) { doc.addPage(); y = 42; }
    y += fotos.length ? 150 : 10;
    if (y > 650) { doc.addPage(); y = 42; }
    doc.fillColor(azul).fontSize(12).font("Helvetica-Bold").text("Assinaturas", 42, y);
    y += 26;
    const boxW = 235;
    const boxH = 86;
    for (let i = 0; i < Math.min(assinaturas.length, 4); i += 1) {
      const col = i % 2;
      if (col === 0 && i > 0) y += boxH + 34;
      if (y > 720) { doc.addPage(); y = 42; }
      const x = 42 + col * 270;
      doc.rect(x, y, boxW, boxH).strokeColor("#d1d5db").stroke();
      const buffer = await buscarImagem(assinaturas[i].url);
      if (buffer) {
        try {
          doc.image(buffer, x + 12, y + 10, { fit: [boxW - 24, 42], align: "center", valign: "center" });
        } catch {
          doc.fontSize(8).fillColor(cinza).text("Assinatura cadastrada", x + 12, y + 20, { width: boxW - 24, align: "center" });
        }
      }
      doc.moveTo(x + 18, y + 55).lineTo(x + boxW - 18, y + 55).strokeColor("#9ca3af").stroke();
      doc.fontSize(9).fillColor("#111827").font("Helvetica-Bold").text(assinaturas[i].nome || "-", x + 12, y + 62, { width: boxW - 24, align: "center" });
      doc.fontSize(7).fillColor(cinza).font("Helvetica").text(assinaturas[i].cargo || "", x + 12, y + 74, { width: boxW - 24, align: "center" });
    }
  }

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc.fontSize(8).fillColor(cinza).text(`Página ${i + 1} de ${range.count}`, 42, 806, { width: 510, align: "right" });
  }

  doc.end();
});

export const enviarPdf = async (res: Response, item: any) => {
  const pdf = await gerarPdfRelatorio(item);
  const nome = `relatorio-${item.numeroOs || item.id}.pdf`.replace(/[^\w.-]+/g, "-");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
  res.send(pdf);
};
