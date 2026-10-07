import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { caminho, RAIZ } from "./config.ts";

export interface Documento {
  id: string;
  titulo: string;
  rotulo: string;
  acesso: string[];
  dono: string;
  origem: string;
  revisado_em: string;
  validade_meses: number;
  status?: string;
  substituido_por?: string;
  arquivo: string;
  texto: string;
}

export interface ArquivoCodigo {
  arquivo: string;
  patenteado: boolean;
  texto: string;
}

// Pastas que simulam as fontes reais (SharePoint, File Server, OneDrive).
export const FONTES = ["base", "base-restrita"];
const EXTENSOES_CODIGO = new Set([".cbl", ".cob", ".cpy", ".jcl", ".java", ".py", ".ts", ".js", ".c", ".sql"]);

function listar(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) saida.push(...listar(p));
    else saida.push(p);
  }
  return saida;
}

function lerFrontMatter(conteudo: string): { meta: Record<string, string>; corpo: string } {
  const m = conteudo.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return { meta: {}, corpo: conteudo };
  const meta: Record<string, string> = {};
  for (const linha of m[1].split(/\r?\n/)) {
    const i = linha.indexOf(":");
    if (i > 0) meta[linha.slice(0, i).trim()] = linha.slice(i + 1).trim();
  }
  return { meta, corpo: m[2] };
}

const lista = (v?: string) =>
  (v ?? "").replace(/^\[|\]$/g, "").split(",").map((s) => s.trim()).filter(Boolean);

export function carregarFontes(): { documentos: Documento[]; codigos: ArquivoCodigo[]; ignorados: string[] } {
  const documentos: Documento[] = [];
  const codigos: ArquivoCodigo[] = [];
  const ignorados: string[] = [];
  for (const fonte of FONTES) {
    for (const arquivo of listar(caminho(fonte))) {
      const rel = path.relative(RAIZ, arquivo).replaceAll("\\", "/");
      const ext = path.extname(arquivo).toLowerCase();
      const texto = readFileSync(arquivo, "utf8");
      if (EXTENSOES_CODIGO.has(ext)) {
        // Todo código é classe 4. "Patenteado" vem da pasta (como uma biblioteca rotulada no SharePoint).
        codigos.push({ arquivo: rel, patenteado: rel.includes("/codigo-patenteado/"), texto });
        continue;
      }
      if (ext !== ".md") {
        ignorados.push(rel);
        continue;
      }
      const { meta, corpo } = lerFrontMatter(texto);
      documentos.push({
        id: meta.id || path.basename(arquivo, ext),
        titulo: meta.titulo || path.basename(arquivo),
        // Sem classe = tratado como classe 3 (regra de desempate da política).
        rotulo: meta.classe || meta.rotulo || "sem-classe",
        acesso: lista(meta.acesso),
        dono: meta.dono || "não definido",
        origem: meta.origem || rel,
        revisado_em: meta.revisado_em || "",
        validade_meses: Number(meta.validade_meses || 0),
        status: meta.status,
        substituido_por: meta.substituido_por,
        arquivo: rel,
        texto: corpo.trim(),
      });
    }
  }
  return { documentos, codigos, ignorados };
}

export function situacaoValidade(revisadoEm: string, validadeMeses: number, hoje = new Date()) {
  if (!revisadoEm || !validadeMeses) return { vencido: false, venceEm: "" };
  const vence = new Date(revisadoEm + "T00:00:00");
  vence.setMonth(vence.getMonth() + validadeMeses);
  return { vencido: vence < hoje, venceEm: vence.toISOString().slice(0, 10) };
}

export function podeAcessar(acesso: string[], grupos: string[]): boolean {
  return acesso.some((g) => grupos.includes(g));
}
