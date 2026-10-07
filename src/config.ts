import { readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const caminho = (...partes: string[]) => path.join(RAIZ, ...partes);

// externo: modelo contratado; mascarado: modelo contratado, com dado sensível trocado por código;
// local: servidor interno (Fase 2); bloqueado: não é processado.
export type Destino = "externo" | "mascarado" | "local" | "bloqueado";
export type Fase = "1" | "2";
export type TipoDeteccao = "segredo" | "codigo_patenteado" | "codigo" | "dado_pessoal" | "nome_cliente" | "identificador";

export interface Usuario {
  id: string;
  nome: string;
  area: string;
  grupos: string[];
}

export interface RegraRotulo {
  indexar: boolean;
  nome: string;
  descricao: string;
}

export interface RegraEntrada {
  destino: Destino;
  motivo: string;
  grupos_autorizados?: string[];
  motivo_bloqueio?: string;
}

export interface RegraFase {
  nome: string;
  // "retido": o trecho não é enviado a modelo nenhum nesta fase.
  classes: Record<string, Destino | "retido">;
  entrada: Record<TipoDeteccao, RegraEntrada>;
}

export interface Politica {
  rotulos: Record<string, RegraRotulo>;
  fases: Record<Fase, RegraFase>;
  clientes: string[];
  linha_de_base: Record<string, number>;
}

export const usuarios: Usuario[] = JSON.parse(readFileSync(caminho("config/usuarios.json"), "utf8"));
export const politica: Politica = JSON.parse(readFileSync(caminho("config/politica.json"), "utf8"));

export const env = {
  claudeModel: process.env.CLAUDE_MODEL || "claude-opus-5-5",
  ollamaUrl: (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, ""),
  modeloLocal: process.env.LOCAL_MODEL || "gpt-oss:20b",
  modeloEmbed: process.env.EMBED_MODEL || "bge-m3",
  threadsLocal: Number(process.env.LOCAL_THREADS || Math.max(2, availableParallelism() - 2)),
  porta: Number(process.env.PORTA || 3340),
  temChaveClaude: Boolean(process.env.ANTHROPIC_API_KEY),
};

export function usuarioPorId(id: string): Usuario {
  const u = usuarios.find((x) => x.id === id);
  if (!u) throw new Error(`Usuário desconhecido: ${id}`);
  return u;
}

export const faseValida = (f: unknown): Fase => (String(f) === "2" ? "2" : "1");

export function regraDoRotulo(rotulo: string): RegraRotulo {
  const r = politica.rotulos[rotulo];
  if (r) return r;
  // Sem classe (ou classe desconhecida) vale classe 3: falha fechada.
  return { ...politica.rotulos["3-cliente"], nome: "Sem classe (tratado como classe 3)" };
}

export function destinoDaClasse(fase: Fase, classe: string): Destino | "retido" {
  const c = politica.rotulos[classe] ? classe : "3-cliente";
  return politica.fases[fase].classes[c] ?? "bloqueado";
}
