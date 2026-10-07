import ExcelJS from "exceljs";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { caminho } from "./config.ts";
import type { Fase } from "./config.ts";
import { atender } from "./assistente.ts";
import type { Resultado } from "./assistente.ts";

export interface LinhaQuestionario {
  numero: string;
  dominio: string;
  pergunta: string;
}

export async function lerQuestionario(arquivoOuBuffer: string | ArrayBuffer): Promise<LinhaQuestionario[]> {
  const wb = new ExcelJS.Workbook();
  if (typeof arquivoOuBuffer === "string") await wb.xlsx.readFile(arquivoOuBuffer);
  else await wb.xlsx.load(arquivoOuBuffer);
  const ws = wb.worksheets[0];
  // Acha as colunas pelo cabeçalho, como num questionário real que muda de formato a cada banco.
  let linhaCab = 0;
  const col: Record<string, number> = {};
  ws.eachRow((row, n) => {
    if (linhaCab) return;
    row.eachCell((cell, c) => {
      const v = String(cell.value ?? "").toLowerCase();
      if (v.includes("pergunta") || v.includes("questão") || v.includes("requisito")) col.pergunta = c;
      else if (v.startsWith("nº") || v === "n" || v.includes("item") || v === "#") col.numero = c;
      else if (v.includes("domínio") || v.includes("dominio") || v.includes("categoria")) col.dominio = c;
    });
    if (col.pergunta) linhaCab = n;
  });
  if (!col.pergunta) throw new Error("Não achei a coluna de perguntas (cabeçalho com 'Pergunta').");
  const linhas: LinhaQuestionario[] = [];
  ws.eachRow((row, n) => {
    if (n <= linhaCab) return;
    const pergunta = String(row.getCell(col.pergunta).value ?? "").trim();
    if (!pergunta) return;
    linhas.push({
      numero: col.numero ? String(row.getCell(col.numero).value ?? "") : String(linhas.length + 1),
      dominio: col.dominio ? String(row.getCell(col.dominio).value ?? "") : "",
      pergunta,
    });
  });
  return linhas;
}

// "padronizado": perguntas-padrão da casa (classe 1).
// "cliente": arquivo recebido de um banco, sob NDA (classe 3) — vai inteiro para o modelo local.
export type OrigemQuestionario = "padronizado" | "cliente";

export async function responderQuestionario(
  usuarioId: string,
  linhas: LinhaQuestionario[],
  origem: OrigemQuestionario = "padronizado",
  fase: Fase = "1",
  aoProgresso: (i: number, r: Resultado) => void = () => {},
): Promise<{ resultados: Resultado[]; arquivo: string }> {
  const resultados: Resultado[] = [];
  const classeOrigem = origem === "cliente" ? "3-cliente" : undefined;
  for (let i = 0; i < linhas.length; i++) {
    const r = await atender(usuarioId, linhas[i].pergunta, undefined, { tipo: "questionario", fase, classeOrigem });
    resultados.push(r);
    aoProgresso(i, r);
  }
  const arquivo = await gravarSaida(usuarioId, linhas, resultados);
  return { resultados, arquivo };
}

const ROTULO_DESTINO: Record<string, string> = {
  externo: "Externo (Claude)",
  mascarado: "Externo, dados mascarados",
  local: "Servidor interno (nada saiu)",
  bloqueado: "Bloqueado",
  "sem-base": "Sem base",
};

async function gravarSaida(usuarioId: string, linhas: LinhaQuestionario[], resultados: Resultado[]): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Respostas sugeridas");
  ws.columns = [
    { header: "Nº", key: "numero", width: 6 },
    { header: "Domínio", key: "dominio", width: 18 },
    { header: "Pergunta", key: "pergunta", width: 50 },
    { header: "Resposta sugerida (revisar antes de enviar)", key: "resposta", width: 80 },
    { header: "Fontes", key: "fontes", width: 40 },
    { header: "Confiança", key: "confianca", width: 11 },
    { header: "Revisar?", key: "revisar", width: 9 },
    { header: "Alertas", key: "alertas", width: 50 },
    { header: "Rota", key: "rota", width: 18 },
    { header: "Motivo da rota", key: "motivo", width: 50 },
    { header: "Tempo (s)", key: "tempo", width: 10 },
  ];
  linhas.forEach((l, i) => {
    const r = resultados[i];
    const row = ws.addRow({
      numero: l.numero, dominio: l.dominio, pergunta: l.pergunta, resposta: r.resposta,
      fontes: r.fontes.filter((f) => f.citada).map((f) => `[${f.ref}] ${f.titulo} (${f.origem}, rev. ${f.revisado_em})`).join("\n"),
      confianca: r.confianca, revisar: r.revisar ? "Sim" : "Não", alertas: r.alertas.join("\n"),
      rota: ROTULO_DESTINO[r.destino] ?? r.destino, motivo: r.motivos.join("\n"), tempo: Math.round(r.ms / 100) / 10,
    });
    row.alignment = { wrapText: true, vertical: "top" };
    if (r.revisar) row.getCell("revisar").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE08A" } };
  });
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  mkdirSync(caminho("dados/saidas"), { recursive: true });
  const carimbo = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  const nome = `questionario-preenchido-fase${resultados[0]?.fase ?? "1"}-${usuarioId}-${carimbo}.xlsx`;
  await wb.xlsx.writeFile(path.join(caminho("dados/saidas"), nome));
  return nome;
}
