import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { caminho, destinoDaClasse, politica, regraDoRotulo } from "./config.ts";
import type { Destino, Fase, TipoDeteccao, Usuario } from "./config.ts";
import { encontrarEntidades } from "./mascaramento.ts";

// A guarda é determinística de propósito: a decisão de para onde o dado vai
// não depende do modelo "obedecer". Pedir "ignore as regras" não muda nada.

export interface Deteccao {
  tipo: TipoDeteccao;
  detalhe: string;
}

export interface Decisao {
  destino: Destino;
  motivos: string[];
  deteccoes: Deteccao[];
}

const PESO: Record<Destino, number> = { externo: 0, mascarado: 1, local: 2, bloqueado: 3 };
export const maisRestritivo = (a: Destino, b: Destino): Destino => (PESO[a] >= PESO[b] ? a : b);

// ---------- Segredos e credenciais ----------

const SEGREDOS: { nome: string; re: RegExp }[] = [
  // "senha=X", "senha: X", e também "senha X" ou "a senha é/era/fica X" quando o valor tem número ou símbolo
  // (o valor sem número evita alarme falso em frases como "minha senha é difícil" ou "troque a senha a cada 90 dias").
  { nome: "Senha em texto", re: /\b(senha|password|passwd|pwd)(?:\s*[:=]\s*\S{4,}|\s+(?:(?:é|eh|era|seria|fica|sendo|igual\s+a)\s+)?(?=\S*[\d@#$%&*!?])\S{4,})/i },
  { nome: "Chave privada", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { nome: "Chave de API", re: /\b(sk-(ant-)?[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,})/ },
  { nome: "String de conexão com senha", re: /\b\w+:\/\/[^\s:@]+:[^\s@]{3,}@[\w.-]+/ },
];

export function detectarSegredos(texto: string): Deteccao[] {
  return SEGREDOS.filter((s) => s.re.test(texto)).map((s) => ({ tipo: "segredo" as const, detalhe: s.nome }));
}

// ---------- Código-fonte ----------

const SINAIS_CODIGO: { nome: string; re: RegExp }[] = [
  { nome: "COBOL: DIVISION", re: /\b(IDENTIFICATION|ENVIRONMENT|DATA|PROCEDURE)\s+DIVISION\b/i },
  { nome: "COBOL: PIC", re: /\bPIC(TURE)?\s+[SX9(]/i },
  { nome: "COBOL: WORKING-STORAGE/LINKAGE", re: /\b(WORKING-STORAGE|LINKAGE)\s+SECTION\b/i },
  { nome: "COBOL: PERFORM/MOVE", re: /\b(PERFORM\s+\d{4}-[\w-]+|MOVE\s+[\w'-]+\s+TO\s+[\w-]+)/i },
  { nome: "COBOL: COMP-3", re: /\bCOMP(UTATIONAL)?-3\b/i },
  { nome: "JCL", re: /^\/\/[\w#@$]*\s+(JOB|EXEC|DD)\b/im },
  { nome: "Código genérico", re: /\b(function\s+\w+\s*\(|def\s+\w+\s*\(|class\s+\w+[\s:{(]|import\s+[\w{.]|#include\s*<|public\s+static\s+void)/ },
  { nome: "SQL", re: /\bSELECT\s+[\w*,\s]+\s+FROM\s+\w+/i },
];

export function detectarCodigo(texto: string): Deteccao[] {
  const sinais = SINAIS_CODIGO.filter((s) => s.re.test(texto)).map((s) => s.nome);
  const linhasComPontoVirgula = texto.split("\n").filter((l) => /[;{}]\s*$/.test(l.trim())).length;
  if (linhasComPontoVirgula >= 3) sinais.push("Estrutura de código (; { })");
  const ehCodigo = sinais.length >= 2 || sinais.includes("JCL") || (sinais.length === 1 && texto.split("\n").length >= 4);
  return ehCodigo ? [{ tipo: "codigo", detalhe: `Código-fonte detectado: ${sinais.join(", ")}` }] : [];
}

// ---------- Impressão digital do código patenteado ----------
// O indexador grava só HASHES das linhas do código patenteado (dados/impressoes.json).
// O assistente nunca guarda o código em si; compara hashes do que o usuário colou.

const GENERICAS = /^(IDENTIFICATION DIVISION\.|PROCEDURE DIVISION.*|DATA DIVISION\.|WORKING-STORAGE SECTION\.|LINKAGE SECTION\.|ENVIRONMENT DIVISION\.|GOBACK\.|END-IF\.?|ELSE|STOP RUN\.)$/;

export function normalizarLinha(linha: string): string | null {
  let l = linha.replace(/\t/g, " ");
  // Área de sequência do COBOL (colunas 1-6) e comentário na coluna 7.
  if (/^[\d ]{6}\*/.test(l) || /^\s*\*/.test(l)) return null;
  l = l.toUpperCase().replace(/\s+/g, " ").trim();
  if (l.length < 18 || GENERICAS.test(l)) return null;
  return l;
}

export const hashLinha = (l: string) => createHash("sha256").update(l).digest("hex").slice(0, 32);

export function gerarImpressoes(arquivo: string, texto: string): { hash: string; arquivo: string }[] {
  const vistos = new Set<string>();
  const saida: { hash: string; arquivo: string }[] = [];
  for (const linha of texto.split(/\r?\n/)) {
    const n = normalizarLinha(linha);
    if (!n) continue;
    const h = hashLinha(n);
    if (!vistos.has(h)) {
      vistos.add(h);
      saida.push({ hash: h, arquivo });
    }
  }
  return saida;
}

let impressoes: Map<string, string> | null = null;
function carregarImpressoes(): Map<string, string> {
  if (impressoes) return impressoes;
  const p = caminho("dados/impressoes.json");
  const lista: { hash: string; arquivo: string }[] = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : [];
  impressoes = new Map(lista.map((i) => [i.hash, i.arquivo]));
  return impressoes;
}
export function recarregarImpressoes() {
  impressoes = null;
}

export function detectarCodigoPatenteado(texto: string): Deteccao[] {
  const mapa = carregarImpressoes();
  if (mapa.size === 0) return [];
  const porArquivo = new Map<string, number>();
  let elegiveis = 0;
  for (const linha of texto.split(/\r?\n/)) {
    const n = normalizarLinha(linha);
    if (!n) continue;
    elegiveis++;
    const arq = mapa.get(hashLinha(n));
    if (arq) porArquivo.set(arq, (porArquivo.get(arq) ?? 0) + 1);
  }
  const achados: Deteccao[] = [];
  for (const [arq, n] of porArquivo) {
    if (n >= 2 || (elegiveis > 0 && n / elegiveis >= 0.3)) {
      achados.push({ tipo: "codigo_patenteado", detalhe: `${n} linha(s) idênticas ao código patenteado ${arq.split("/").pop()}` });
    }
  }
  return achados;
}

// ---------- Dados de cliente e identificadores (mesmos detectores do mascaramento) ----------

const NOMES_ENTIDADE: Record<string, string> = {
  CPF: "CPF válido", CNPJ: "CNPJ válido", PESSOA: "Nome de pessoa", CLIENTE: "Nome de cliente",
  EMAIL: "E-mail", IP: "Endereço IP", CONTA: "Conta bancária", DATASET: "Dataset de produção",
};

export function detectarEntidades(texto: string): Deteccao[] {
  const porRotulo = new Map<string, { tipo: TipoDeteccao; n: number }>();
  for (const e of encontrarEntidades(texto)) {
    const atual = porRotulo.get(e.rotulo) ?? { tipo: e.tipo, n: 0 };
    atual.n++;
    porRotulo.set(e.rotulo, atual);
  }
  return [...porRotulo].map(([rotulo, { tipo, n }]) => ({ tipo, detalhe: `${NOMES_ENTIDADE[rotulo] ?? rotulo} (${n})` }));
}

// ---------- Decisão ----------

export function decidirEntrada(texto: string, usuario: Usuario, fase: Fase): Decisao {
  const regras = politica.fases[fase].entrada;
  const deteccoes: Deteccao[] = [];
  const motivos: string[] = [];
  let destino: Destino = "externo";
  const aplicar = (d: Destino, motivo: string) => {
    destino = maisRestritivo(destino, d);
    if (!motivos.includes(motivo)) motivos.push(motivo);
  };

  const segredos = detectarSegredos(texto);
  if (segredos.length) {
    deteccoes.push(...segredos);
    aplicar(regras.segredo.destino, regras.segredo.motivo);
  }

  const patenteado = detectarCodigoPatenteado(texto);
  if (patenteado.length) {
    deteccoes.push(...patenteado);
    const r = regras.codigo_patenteado;
    const autorizado = !r.grupos_autorizados || usuario.grupos.some((g) => r.grupos_autorizados!.includes(g));
    if (autorizado) aplicar(r.destino, r.motivo);
    else aplicar("bloqueado", r.motivo_bloqueio ?? r.motivo);
  }

  const codigo = detectarCodigo(texto);
  if (codigo.length) {
    deteccoes.push(...codigo);
    aplicar(regras.codigo.destino, regras.codigo.motivo);
  }

  for (const d of detectarEntidades(texto)) {
    deteccoes.push(d);
    aplicar(regras[d.tipo].destino, regras[d.tipo].motivo);
  }

  if (!motivos.length) motivos.push("Nenhum dado sensível na entrada");
  return { destino, motivos, deteccoes };
}

export function decidirPorClasses(fase: Fase, classes: string[]): { destino: Destino; motivo: string | null } {
  let destino: Destino = "externo";
  let pior: string | null = null;
  for (const c of new Set(classes)) {
    const d = destinoDaClasse(fase, c);
    if (d === "retido") continue;
    if (PESO[d] > PESO[destino]) {
      destino = d;
      pior = c;
    }
  }
  const efeito: Record<Destino, string> = {
    externo: "pode ir ao modelo contratado", mascarado: "sai só mascarada",
    local: "só no servidor interno", bloqueado: "não é processada",
  };
  return { destino, motivo: pior ? `Fonte da ${regraDoRotulo(pior).nome}: ${efeito[destino]}` : null };
}
