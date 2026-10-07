import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { caminho, env, faseValida, politica, usuarios } from "./config.ts";
import { atender } from "./assistente.ts";
import type { Tipo } from "./assistente.ts";
import type { Evento, Resultado } from "./assistente.ts";
import { lerEventos, metricas } from "./auditoria.ts";
import { carregarIndice } from "./indice.ts";
import { statusOllama } from "./modelos.ts";
import { lerQuestionario, responderQuestionario } from "./questionario.ts";
import type { LinhaQuestionario } from "./questionario.ts";

const TIPOS: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

// Exemplos que a tela pode carregar (lista fechada; nada além disso é servido).
const EXEMPLOS: Record<string, string> = {
  "CALCJUR.cbl": "exemplos/CALCJUR.cbl",
  "CALCJUR.jcl": "exemplos/CALCJUR.jcl",
  "DMSKNORM.cbl": "base-restrita/codigo-patenteado/DMSKNORM.cbl",
  "chamado.txt": "exemplos/chamado-48213.txt",
};

interface Job {
  usuario: string;
  linhas: LinhaQuestionario[];
  resultados: Resultado[];
  status: "rodando" | "concluido" | "erro";
  arquivo?: string;
  erro?: string;
}
const jobs = new Map<string, Job>();
let proximoJob = 1;

function json(res: ServerResponse, status: number, dados: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(dados));
}

async function corpo(req: IncomingMessage): Promise<Buffer> {
  const partes: Buffer[] = [];
  for await (const p of req) partes.push(p as Buffer);
  return Buffer.concat(partes);
}

function transmitir(res: ServerResponse) {
  res.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-cache" });
  return (e: Evento) => res.write(JSON.stringify(e) + "\n");
}

async function rotear(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const p = url.pathname;

  if (req.method === "GET" && p === "/api/estado") {
    const ollama = await statusOllama();
    let catalogo: unknown[] = [];
    let trechos = 0;
    try {
      const idx = carregarIndice();
      catalogo = idx.catalogo;
      trechos = idx.trechos.length;
    } catch {}
    return json(res, 200, {
      usuarios, catalogo, trechos, politica,
      modelos: {
        externo: env.claudeModel, externoDisponivel: env.temChaveClaude,
        local: env.modeloLocal, localDisponivel: ollama.ativo && ollama.modelos.some((m) => m.startsWith(env.modeloLocal)),
        embed: env.modeloEmbed, ollamaAtivo: ollama.ativo,
      },
    });
  }

  const TIPOS_API: Record<string, Tipo> = { "/api/perguntar": "pergunta", "/api/operar": "operacao", "/api/documentar": "documentar" };
  if (req.method === "POST" && TIPOS_API[p]) {
    const { usuario, texto, fase } = JSON.parse((await corpo(req)).toString("utf8") || "{}");
    if (!usuario || !texto) return json(res, 400, { erro: "Informe usuario e texto" });
    const emitir = transmitir(res);
    try {
      await atender(usuario, String(texto), emitir, { tipo: TIPOS_API[p], fase: faseValida(fase) });
    } catch (e) {
      emitir({ tipo: "erro", mensagem: e instanceof Error ? e.message : String(e) });
    }
    return res.end();
  }

  if (req.method === "POST" && p === "/api/questionario") {
    const usuario = url.searchParams.get("usuario") || "carla";
    const origem = url.searchParams.get("origem") === "cliente" ? "cliente" : "padronizado";
    const fase = faseValida(url.searchParams.get("fase"));
    const bytes = await corpo(req);
    const linhas = bytes.length
      ? await lerQuestionario(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
      : await lerQuestionario(caminho("exemplos/questionario-banco-aurora.xlsx"));
    const id = String(proximoJob++);
    const job: Job = { usuario, linhas, resultados: [], status: "rodando" };
    jobs.set(id, job);
    responderQuestionario(usuario, linhas, origem, fase, (_i, r) => job.resultados.push(r))
      .then(({ arquivo }) => {
        job.status = "concluido";
        job.arquivo = arquivo;
      })
      .catch((e) => {
        job.status = "erro";
        job.erro = e instanceof Error ? e.message : String(e);
      });
    return json(res, 200, { id, total: linhas.length });
  }

  const mJob = p.match(/^\/api\/questionario\/(\d+)$/);
  if (req.method === "GET" && mJob) {
    const job = jobs.get(mJob[1]);
    if (!job) return json(res, 404, { erro: "Job não encontrado" });
    return json(res, 200, job);
  }

  if (req.method === "GET" && p === "/api/baixar") {
    const nome = path.basename(url.searchParams.get("arquivo") || "");
    const arq = path.join(caminho("dados/saidas"), nome);
    if (!nome.endsWith(".xlsx") || !existsSync(arq)) return json(res, 404, { erro: "Arquivo não encontrado" });
    res.writeHead(200, {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${nome}"`,
    });
    return res.end(readFileSync(arq));
  }

  if (req.method === "GET" && p === "/api/exemplo-questionario") {
    return json(res, 200, await lerQuestionario(caminho("exemplos/questionario-banco-aurora.xlsx")));
  }

  if (req.method === "GET" && p === "/api/exemplo") {
    const rel = EXEMPLOS[url.searchParams.get("nome") || ""];
    if (!rel) return json(res, 404, { erro: "Exemplo não encontrado" });
    return json(res, 200, { texto: readFileSync(caminho(rel), "utf8") });
  }

  if (req.method === "GET" && p === "/api/auditoria") {
    return json(res, 200, { eventos: lerEventos(100), metricas: metricas() });
  }

  if (req.method === "GET") {
    const nome = p === "/" ? "index.html" : path.basename(p);
    const arq = caminho("public", nome);
    if (existsSync(arq)) {
      res.writeHead(200, { "content-type": TIPOS[path.extname(nome)] ?? "application/octet-stream", "cache-control": "no-store" });
      return res.end(readFileSync(arq));
    }
  }
  json(res, 404, { erro: "Não encontrado" });
}

createServer((req, res) => {
  rotear(req, res).catch((e) => {
    console.error(e);
    if (!res.headersSent) json(res, 500, { erro: e instanceof Error ? e.message : String(e) });
    else res.end();
  });
}).listen(env.porta, "127.0.0.1", () => {
  console.log(`Demo no ar: http://localhost:${env.porta}`);
  console.log(`Externo: ${env.claudeModel} ${env.temChaveClaude ? "(chave configurada)" : "(SEM chave: a rota externa não funciona)"}`);
  console.log(`Local: ${env.modeloLocal} via ${env.ollamaUrl}`);
});
