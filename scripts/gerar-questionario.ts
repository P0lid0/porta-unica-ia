import ExcelJS from "exceljs";
import { caminho } from "../src/config.ts";

// Questionário fictício no formato típico de due diligence de fornecedor de banco.
const PERGUNTAS: [string, string][] = [
  ["Certificações", "A empresa possui certificação ISO/IEC 27001? Informe escopo e validade."],
  ["Governança", "Existe política de segurança da informação aprovada pela alta direção? Com que periodicidade é revisada?"],
  ["Continuidade", "Descreva a política de backup: frequência, retenção, local de armazenamento e testes de restauração."],
  ["Continuidade", "Existe Plano de Continuidade de Negócios testado? Informe a data do último teste."],
  ["Acesso", "Como é feito o controle de acesso lógico? Há MFA e revisão periódica de acessos?"],
  ["Privacidade", "Os dados do Banco Aurora são armazenados ou processados fora do Brasil?"],
  ["IA", "A empresa utiliza ferramentas de IA generativa? Dados do contratante podem ser usados para treinar modelos?"],
  ["Incidentes", "Em quanto tempo o Banco Aurora é notificado de um incidente de segurança que o afete?"],
  ["Pessoas", "Existe programa de conscientização em segurança para colaboradores?"],
  ["Desenvolvimento", "Os desenvolvedores seguem práticas de desenvolvimento seguro (SAST, revisão de código)?"],
  ["Vulnerabilidades", "Há gestão de vulnerabilidades e testes de intrusão periódicos? Quando foi o último?"],
  ["Produto", "Descreva como o produto Orion DataMask protege as chaves de criptografia do contratante."],
  ["Seguros", "A empresa possui apólice de seguro de riscos cibernéticos? Informe a cobertura."],
];

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("Questionário");
ws.addRow(["Questionário de Segurança de Fornecedores — Banco Aurora (FICTÍCIO)"]).font = { bold: true, size: 13 };
ws.addRow([]);
const cab = ws.addRow(["Nº", "Domínio", "Pergunta", "Resposta do fornecedor"]);
cab.font = { bold: true };
PERGUNTAS.forEach(([dom, p], i) => ws.addRow([i + 1, dom, p, ""]).alignment = { wrapText: true, vertical: "top" });
ws.getColumn(1).width = 5;
ws.getColumn(2).width = 16;
ws.getColumn(3).width = 70;
ws.getColumn(4).width = 60;
const destino = caminho("exemplos/questionario-banco-aurora.xlsx");
await wb.xlsx.writeFile(destino);
console.log(`Gerado: ${destino} (${PERGUNTAS.length} perguntas)`);
