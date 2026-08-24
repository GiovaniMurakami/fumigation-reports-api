export const normalizarLote = (lote: string) => lote.trim().toUpperCase();

export const escaparRegex = (valor: string) => valor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
