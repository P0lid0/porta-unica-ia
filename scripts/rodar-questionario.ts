import { caminho } from "../src/config.ts";
import { lerQuestionario, responderQuestionario } from "../src/questionario.ts";

// Uso: npm run questionario -- [usuario] [padronizado|cliente] [fase 1|2] [arquivo.xlsx]
const usuario = process.argv[2] || "carla";
const origem = process.argv[3] === "cliente" ? "cliente" : "padronizado";
const fase = process.argv[4] === "2" ? "2" : "1";
const arquivo = process.argv[5] || caminho("exemplos/questionario-banco-aurora.xlsx");

const linhas = await lerQuestionario(arquivo);
console.log(`${linhas.length} perguntas — respondendo como "${usuario}", origem "${origem}", fase ${fase}...\n`);
const inicio = performance.now();
const { resultados, arquivo: saida } = await responderQuestionario(usuario, linhas, origem, fase, (i, r) => {
  console.log(`${String(i + 1).padStart(2)}. [${r.destino.padEnd(9)}] ${(r.ms / 1000).toFixed(1).padStart(6)}s  conf=${r.confianca.padEnd(5)} ${r.revisar ? "REVISAR" : "ok     "}  ${linhas[i].pergunta.slice(0, 60)}`);
});
const total = (performance.now() - inicio) / 1000;
const revisar = resultados.filter((r) => r.revisar).length;
console.log(`\nTotal: ${total.toFixed(0)}s para ${linhas.length} perguntas; ${revisar} marcadas para revisão.`);
console.log(`Saída: dados/saidas/${saida}`);
