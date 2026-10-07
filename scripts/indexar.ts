import { construirIndice } from "../src/indice.ts";

const inicio = performance.now();
const indice = await construirIndice();
const incl = indice.catalogo.filter((c) => c.situacao === "indexado");
const excl = indice.catalogo.filter((c) => c.situacao === "excluido");

console.log(`\nVarridos ${indice.catalogo.length} itens nas fontes simuladas (SharePoint, File Server, OneDrive).`);
console.log(`\nINDEXADOS (${incl.length}) — ${indice.trechos.length} trechos:`);
for (const c of incl) console.log(`  + ${c.id.padEnd(20)} [${c.rotulo}] acesso=${c.acesso.join("/")}${c.vencido ? "  ⚠ revisão vencida" : ""}`);
console.log(`\nEXCLUÍDOS (${excl.length}):`);
for (const c of excl) console.log(`  - ${c.id.padEnd(20)} ${c.motivo}`);
console.log(`\nConcluído em ${((performance.now() - inicio) / 1000).toFixed(1)}s.`);
