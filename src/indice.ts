import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { caminho, env, regraDoRotulo } from "./config.ts";
import type { Usuario } from "./config.ts";
import { carregarFontes, podeAcessar, situacaoValidade } from "./documentos.ts";
import type { Documento } from "./documentos.ts";
import { gerarImpressoes, recarregarImpressoes } from "./guarda.ts";
import { embed } from "./modelos.ts";

export interface Trecho {
  id: string;
  docId: string;
  titulo: string;
  rotulo: string;
  acesso: string[];
  dono: string;
  origem: string;
  revisado_em: string;
  validade_meses: number;
  texto: string;
  vetor: number[];
}

export interface ItemCatalogo {
  id: string;
  titulo: string;
  rotulo: string;
  origem: string;
  acesso: string[];
  dono: string;
  revisado_em: string;
  situacao: "indexado" | "excluido";
  motivo: string;
  vencido: boolean;
}

export interface Indice {
  geradoEm: string;
  modeloEmbed: string;
  trechos: Trecho[];
  catalogo: ItemCatalogo[];
}

const ARQ_INDICE = caminho("dados/indice.json");
const ARQ_IMPRESSOES = caminho("dados/impressoes.json");

function fatiar(doc: Documento, tamanho = 700): string[] {
  // Fatia por parágrafo/seção, juntando até ~700 caracteres.
  const blocos = doc.texto.split(/\n(?=#)|\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const fatias: string[] = [];
  let atual = "";
  for (const b of blocos) {
    if (atual && (atual + "\n" + b).length > tamanho) {
      fatias.push(atual);
      atual = b;
    } else atual = atual ? atual + "\n" + b : b;
  }
  if (atual) fatias.push(atual);
  return fatias;
}

function motivoExclusao(doc: Documento, ids: Set<string>): string | null {
  if (doc.status === "obsoleto") {
    const sub = doc.substituido_por && ids.has(doc.substituido_por) ? ` (substituído por ${doc.substituido_por})` : "";
    return `Versão obsoleta${sub}: não entra para não competir com a vigente`;
  }
  const regra = regraDoRotulo(doc.rotulo);
  if (!regra.indexar) return `${regra.nome}: ${regra.descricao}`;
  if (!doc.acesso.length) return "Sem permissão definida: falha fechada, não entra";
  return null;
}

export async function construirIndice(log: (m: string) => void = console.log): Promise<Indice> {
  const { documentos, codigos } = carregarFontes();
  const ids = new Set(documentos.map((d) => d.id));
  const hoje = new Date();
  const catalogo: ItemCatalogo[] = [];
  const paraIndexar: Documento[] = [];

  for (const doc of documentos) {
    const motivo = motivoExclusao(doc, ids);
    const { vencido } = situacaoValidade(doc.revisado_em, doc.validade_meses, hoje);
    catalogo.push({
      id: doc.id, titulo: doc.titulo, rotulo: doc.rotulo, origem: doc.origem, acesso: doc.acesso,
      dono: doc.dono, revisado_em: doc.revisado_em, vencido,
      situacao: motivo ? "excluido" : "indexado",
      motivo: motivo ?? (vencido ? "Indexado com alerta: prazo de revisão vencido" : "Indexado"),
    });
    if (!motivo) paraIndexar.push(doc);
  }

  // Código-fonte nunca entra na base; o patenteado vira só impressão digital (hashes).
  const impressoes = codigos.filter((c) => c.patenteado).flatMap((c) => gerarImpressoes(c.arquivo, c.texto));
  for (const c of codigos) {
    catalogo.push({
      id: c.arquivo.split("/").pop()!, titulo: `Código-fonte ${c.arquivo.split("/").pop()}`, rotulo: "4-ip-critico",
      origem: c.arquivo, acesso: ["engenharia"], dono: "Engenharia", revisado_em: "", vencido: false,
      situacao: "excluido",
      motivo: c.patenteado
        ? `Código patenteado: nunca entra na base; só ${impressoes.filter((i) => i.arquivo === c.arquivo).length} hashes de linha, usados para detectar vazamento`
        : "Código-fonte nunca entra na base de conhecimento",
    });
  }

  const pendentes: Omit<Trecho, "vetor">[] = [];
  for (const doc of paraIndexar) {
    fatiar(doc).forEach((texto, i) => {
      pendentes.push({
        id: `${doc.id}#${i + 1}`, docId: doc.id, titulo: doc.titulo, rotulo: doc.rotulo, acesso: doc.acesso,
        dono: doc.dono, origem: doc.origem, revisado_em: doc.revisado_em, validade_meses: doc.validade_meses, texto,
      });
    });
  }
  log(`Gerando embeddings de ${pendentes.length} trechos com ${env.modeloEmbed} (local)...`);
  const vetores = await embed(pendentes.map((t) => `${t.titulo}\n${t.texto}`));
  const trechos: Trecho[] = pendentes.map((t, i) => ({ ...t, vetor: vetores[i] }));

  const indice: Indice = { geradoEm: new Date().toISOString(), modeloEmbed: env.modeloEmbed, trechos, catalogo };
  mkdirSync(caminho("dados"), { recursive: true });
  writeFileSync(ARQ_INDICE, JSON.stringify(indice));
  writeFileSync(ARQ_IMPRESSOES, JSON.stringify(impressoes, null, 1));
  recarregarImpressoes();
  indiceEmMemoria = indice;
  return indice;
}

let indiceEmMemoria: Indice | null = null;
export function carregarIndice(): Indice {
  if (indiceEmMemoria) return indiceEmMemoria;
  if (!existsSync(ARQ_INDICE)) throw new Error("Índice não encontrado. Rode: npm run indexar");
  indiceEmMemoria = JSON.parse(readFileSync(ARQ_INDICE, "utf8")) as Indice;
  return indiceEmMemoria;
}

function cosseno(a: number[], b: number[]): number {
  let p = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    p += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return p / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface ResultadoBusca {
  trechos: (Trecho & { score: number })[];
  ocultadosPorPermissao: number;
  melhorScore: number;
}

export const SCORE_MINIMO = 0.45;
const DISTANCIA_MAXIMA = 0.12;

export async function buscar(pergunta: string, usuario: Usuario, k = 5): Promise<ResultadoBusca> {
  const indice = carregarIndice();
  const [q] = await embed([pergunta]);
  const ranqueados = indice.trechos
    .map((t) => ({ ...t, score: cosseno(q, t.vetor) }))
    .filter((t) => t.score >= SCORE_MINIMO)
    .sort((a, b) => b.score - a.score);
  // Filtro de permissão ANTES de qualquer coisa chegar ao modelo (security trimming).
  const permitidos = ranqueados.filter((t) => podeAcessar(t.acesso, usuario.grupos));
  const topGeral = ranqueados.slice(0, k);
  const ocultadosPorPermissao = topGeral.filter((t) => !podeAcessar(t.acesso, usuario.grupos)).length;
  // Relevância relativa: só entra o que está perto do melhor trecho (evita fonte "permitida, mas fora do assunto").
  const corte = Math.max(SCORE_MINIMO, (permitidos[0]?.score ?? 0) - DISTANCIA_MAXIMA);
  const trechos = permitidos.filter((t) => t.score >= corte).slice(0, k);
  return { trechos, ocultadosPorPermissao, melhorScore: trechos[0]?.score ?? 0 };
}
