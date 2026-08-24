import { Response } from "express";
import PDFDocument from "pdfkit";
import { comFotosAssinadas } from "../../casosDeUso/relatorio/serializarRelatorio";
import { biosafeLogo } from "./biosafeLogo";

const cores = { verde: "#156332", escuro: "#0a2e18", lima: "#a8d63a", texto: "#18312c", cinza: "#64748b", linha: "#dce8df", claro: "#f6faf7" };
const logo = biosafeLogo;
const margem = 42;
const larguraPagina = 511;

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

const formatarData = (valor: unknown) => {
  if (!valor) return "";
  const data = new Date(String(valor));
  if (Number.isNaN(data.getTime())) return String(valor);
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(data);
};

const valorTexto = (valor: unknown): string => {
  if (valor == null || valor === "") return "";
  if (Array.isArray(valor)) return valor.map(valorTexto).filter(Boolean).join(" • ");
  if (typeof valor === "object") {
    const objeto = valor as Record<string, any>;
    if (objeto.nome) return String(objeto.nome);
    return Object.entries(objeto).map(([chave, item]) => `${chave}: ${valorTexto(item)}`).filter(Boolean).join("; ");
  }
  return String(valor);
};

const buscarImagem = async (url: string) => {
  try {
    const resposta = await fetch(url);
    return resposta.ok ? Buffer.from(await resposta.arrayBuffer()) : null;
  } catch { return null; }
};

const cabecalho = (doc: PDFKit.PDFDocument, titulo: string, identificador: string) => {
  doc.rect(0, 0, doc.page.width, 92).fill(cores.escuro);
  doc.rect(0, 88, doc.page.width, 4).fill(cores.lima);
  doc.image(logo, margem, 17, { fit: [58, 58], align: "center", valign: "center" });
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(15).text(titulo, 116, 25, { width: 400 });
  doc.fillColor("#dce8df").font("Helvetica").fontSize(8).text("BIOSAFE PEST  •  SERVIÇOS SANITÁRIOS", 116, 58);
  if (identificador) {
    doc.roundedRect(448, 53, 105, 22, 4).fill(cores.verde);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(7).text(identificador, 454, 57, { width: 93, height: 16, align: "center" });
  }
};

const tituloSecao = (doc: PDFKit.PDFDocument, titulo: string, y: number) => {
  doc.fillColor(cores.verde).font("Helvetica-Bold").fontSize(9).text(titulo.toUpperCase(), margem, y);
  doc.moveTo(margem, y + 14).lineTo(margem + larguraPagina, y + 14).strokeColor(cores.linha).stroke();
  return y + 22;
};

const identificacao = (doc: PDFKit.PDFDocument, item: any, y: number) => {
  const campos = [["EMPRESA", item.empresa], ["CLIENTE / UNIDADE", item.unidadeCliente || item.formularioTitulo], ["ÁREA / SETOR", item.areaSetor], ["REALIZADO POR", item.realizadoPor], ["DATA", formatarData(item.dataTratamento)], ["TIPO DE CONTROLE", item.tipoControle]];
  const alturasLinhas = [0, 1].map(linha => Math.max(...campos.slice(linha * 3, linha * 3 + 3).map(([, valor]) => {
    doc.font("Helvetica-Bold").fontSize(7.5);
    return Math.max(43, 29 + doc.heightOfString(valorTexto(valor) || "-", { width: 147 }));
  })));
  campos.forEach(([rotulo, valor], indice) => {
    const linha = Math.floor(indice / 3);
    const x = margem + (indice % 3) * 173;
    const topo = y + (linha === 0 ? 0 : alturasLinhas[0] + 6);
    doc.roundedRect(x, topo, 165, alturasLinhas[linha], 5).fillAndStroke(cores.claro, cores.linha);
    doc.fillColor(cores.cinza).font("Helvetica-Bold").fontSize(6.5).text(rotulo, x + 9, topo + 8, { width: 147 });
    doc.fillColor(cores.texto).font("Helvetica-Bold").fontSize(7.5).text(valorTexto(valor) || "-", x + 9, topo + 20, { width: 147 });
  });
  return y + alturasLinhas[0] + alturasLinhas[1] + 12;
};
const dadosServico = (doc: PDFKit.PDFDocument, entradas: Array<{ chave: string; valor: string }>, y: number, alturaMaxima: number) => {
  y = tituloSecao(doc, "Dados do serviço", y);
  if (!entradas.length) {
    doc.fillColor(cores.cinza).font("Helvetica").fontSize(8).text("Nenhum campo adicional informado.", margem, y);
    return y + 18;
  }

  const medir = (tamanho: number) => {
    const alturas: number[] = [];
    for (let indice = 0; indice < entradas.length; indice += 2) {
      const altura = Math.max(...entradas.slice(indice, indice + 2).map(entrada => {
        doc.font("Helvetica-Bold").fontSize(Math.max(4, tamanho - 1));
        const alturaRotulo = doc.heightOfString(entrada.chave.toUpperCase(), { width: 250 });
        doc.font("Helvetica").fontSize(tamanho);
        return alturaRotulo + doc.heightOfString(entrada.valor, { width: 250 }) + 5;
      }));
      alturas.push(altura);
    }
    return alturas;
  };

  let tamanho = 7.5;
  let alturas = medir(tamanho);
  while (alturas.reduce((total, altura) => total + altura, 0) > alturaMaxima && tamanho > 2) {
    tamanho -= 0.25;
    alturas = medir(tamanho);
  }

  let topo = y;
  entradas.forEach((entrada, indice) => {
    const linha = Math.floor(indice / 2);
    if (indice % 2 === 0 && indice > 0) topo += alturas[linha - 1];
    const x = margem + (indice % 2) * 261;
    doc.fillColor(cores.cinza).font("Helvetica-Bold").fontSize(Math.max(4, tamanho - 1)).text(entrada.chave.toUpperCase(), x, topo, { width: 250 });
    const alturaRotulo = doc.heightOfString(entrada.chave.toUpperCase(), { width: 250 });
    doc.fillColor(cores.texto).font("Helvetica").fontSize(tamanho).text(entrada.valor, x, topo + alturaRotulo + 2, { width: 250 });
  });
  return y + alturas.reduce((total, altura) => total + altura, 0) + 4;
};
const assinaturas = async (doc: PDFKit.PDFDocument, itens: any[], y: number) => {
  if (!itens.length) return;
  y = tituloSecao(doc, "Assinaturas", y);
  for (let indice = 0; indice < itens.length; indice += 1) {
    const item = itens[indice];
    const x = margem + larguraPagina - 245;
    const topo = y + indice * 64;
    const imagem = await buscarImagem(item.url);
    if (imagem) try { doc.image(imagem, x + 12, topo, { fit: [221, 34], align: "center", valign: "center" }); } catch { /* assinatura inválida */ }
    doc.moveTo(x + 18, topo + 38).lineTo(x + 227, topo + 38).strokeColor("#9ca3af").stroke();
    doc.fillColor(cores.texto).font("Helvetica-Bold").fontSize(8).text(item.nome || "-", x, topo + 43, { width: 245, align: "center" });
    doc.fillColor(cores.cinza).font("Helvetica").fontSize(6.5).text(item.cargo || "", x, topo + 55, { width: 245, align: "center" });
  }
};
const caixaFoto = (doc: PDFKit.PDFDocument, foto: any, imagem: Buffer | null, x: number, y: number, largura: number, altura: number, indice: number) => {
  doc.roundedRect(x, y, largura, altura, 5).fillAndStroke(cores.claro, cores.linha);
  if (imagem) try { doc.image(imagem, x + 3, y + 3, { fit: [largura - 6, altura - 20], align: "center", valign: "center" }); } catch { /* imagem inválida */ }
  doc.fillColor(cores.cinza).font("Helvetica").fontSize(6).text(foto.nome || `Foto ${indice + 1}`, x + 5, y + altura - 15, { width: largura - 10, align: "center" });
};

const fotos = async (doc: PDFKit.PDFDocument, itens: any[], imagens: Array<Buffer | null>, titulo: string, y: number, limitePrimeiraPagina: number) => {
  if (!itens.length) return;
  y = tituloSecao(doc, "Evidências fotográficas", y);
  let indice = 0;
  const quantidadePrimeira = limitePrimeiraPagina - y >= 55 ? Math.min(3, itens.length) : 0;
  const alturaPrimeira = Math.min(125, limitePrimeiraPagina - y);
  for (; indice < quantidadePrimeira; indice += 1) caixaFoto(doc, itens[indice], imagens[indice], margem + indice * 175, y, 160, alturaPrimeira, indice);
  while (indice < itens.length) {
    doc.addPage();
    cabecalho(doc, titulo, "ANEXO FOTOGRÁFICO");
    const inicioY = tituloSecao(doc, "Evidências fotográficas", 112);
    const limite = Math.min(indice + 6, itens.length);
    for (let local = 0; indice < limite; indice += 1, local += 1) caixaFoto(doc, itens[indice], imagens[indice], margem + (local % 2) * 264, inicioY + Math.floor(local / 2) * 218, 247, 205, indice);
  }
};

export const gerarPdfRelatorio = async (item: any) => {
  const publico = await comFotosAssinadas(item);
  const titulo = tipoParaTitulo(publico.tipoControle);
  const itensFotos = publico.fotos || [];
  const itensAssinaturas = publico.assinaturas || [];
  const entradas = Object.entries(publico.dados || {}).map(([chave, valor]) => ({ chave, valor: valorTexto(valor) })).filter(entrada => entrada.valor);
  const imagens = await Promise.all(itensFotos.map((foto: any) => buscarImagem(foto.url)));

  return new Promise<Buffer>(async (resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: margem, bufferPages: true });
    const partes: Buffer[] = [];
    doc.on("data", parte => partes.push(parte));
    doc.on("end", () => resolve(Buffer.concat(partes)));
    doc.on("error", reject);
    try {
      cabecalho(doc, titulo, publico.numeroOs || publico.lotes?.[0] || "");
      let y = identificacao(doc, publico, 112);
      const alturaAssinaturas = itensAssinaturas.length ? 22 + itensAssinaturas.length * 64 : 0;
      const topoAssinaturas = 775 - alturaAssinaturas;
      const limiteConteudo = itensAssinaturas.length ? topoAssinaturas - 8 : 775;
      const reservaFotos = itensFotos.length ? 145 : 0;
      y = dadosServico(doc, entradas, y, Math.max(40, limiteConteudo - y - reservaFotos));
      await assinaturas(doc, itensAssinaturas, topoAssinaturas);
      await fotos(doc, itensFotos, imagens, titulo, y + 3, limiteConteudo);
      const paginas = doc.bufferedPageRange();
      for (let pagina = paginas.start; pagina < paginas.start + paginas.count; pagina += 1) {
        doc.switchToPage(pagina);
        doc.moveTo(margem, 780).lineTo(margem + larguraPagina, 780).strokeColor(cores.linha).stroke();
        doc.fillColor(cores.cinza).font("Helvetica").fontSize(6.5).text("BioSafe Pest • Evidência, controle e confiança", margem, 787, { width: 350 });
        doc.text(`Página ${pagina + 1} de ${paginas.count}`, 430, 787, { width: 123, align: "right" });
      }
      doc.end();
    } catch (erro) { reject(erro); }
  });
};

export const enviarPdf = async (res: Response, item: any) => {
  const pdf = await gerarPdfRelatorio(item);
  const nome = `relatorio-${item.numeroOs || item.id}.pdf`.replace(/[^\w.-]+/g, "-");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
  res.send(pdf);
};
