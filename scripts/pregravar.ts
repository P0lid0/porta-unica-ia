import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { caminho } from "../src/config.ts";
import { atender } from "../src/assistente.ts";
import type { Opcoes } from "../src/assistente.ts";

// Pré-grava respostas lentas (Fase 2, modelo local no notebook) para mostrar na apresentação.
// Uso: npm run pregravar

const casos: { arquivo: string; usuario: string; entrada: string; opcoes: Opcoes }[] = [
  { arquivo: "fase2-chamado.md", usuario: "ana", entrada: readFileSync(caminho("exemplos/chamado-48213.txt"), "utf8"), opcoes: { tipo: "operacao", fase: "2" } },
  { arquivo: "fase2-documentar-CALCJUR.md", usuario: "bruno", entrada: readFileSync(caminho("exemplos/CALCJUR.cbl"), "utf8"), opcoes: { tipo: "documentar", fase: "2" } },
];

mkdirSync(caminho("exemplos/pregravado"), { recursive: true });
for (const c of casos) {
  console.log(`Gerando ${c.arquivo}…`);
  const r = await atender(c.usuario, c.entrada, undefined, c.opcoes);
  const cabecalho = [
    `# ${c.arquivo.replace(".md", "")}`,
    "",
    `- Fase ${r.fase}, caminho: **${r.destino}**`,
    `- Motivos: ${r.motivos.join("; ")}`,
    `- Modelo: ${r.modelo}`,
    `- Tempo: ${(r.ms / 1000).toFixed(0)} s no notebook (CPU, sem GPU)`,
    `- Gerado em: ${new Date().toISOString()}`,
    "",
    "---",
    "",
  ].join("\n");
  writeFileSync(caminho("exemplos/pregravado", c.arquivo), cabecalho + r.resposta + "\n");
  console.log(`  ${r.destino} em ${(r.ms / 1000).toFixed(0)} s → exemplos/pregravado/${c.arquivo}`);
}
