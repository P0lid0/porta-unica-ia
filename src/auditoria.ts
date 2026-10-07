import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { caminho, politica } from "./config.ts";
import type { Destino, Fase } from "./config.ts";

export interface EventoAuditoria {
  quando: string;
  usuario: string;
  tipo: "pergunta" | "questionario" | "operacao" | "documentar";
  fase: Fase;
  destino: Destino | "sem-base";
  modelo: string;
  motivos: string[];
  deteccoes: string[];
  fontes: string[];
  retidas: number;
  mascarados: Record<string, number>;
  ocultadosPorPermissao: number;
  confianca: string;
  revisar: boolean;
  ms: number;
  tokensEntrada?: number;
  tokensSaida?: number;
  // Resumo já mascarado; código e conteúdo bloqueado nunca são gravados.
  resumoEntrada: string;
  // Pedido que a Fase 1 não atende e o servidor interno destravaria.
  represado: boolean;
}

const ARQ = caminho("dados/auditoria.jsonl");

export function registrar(ev: EventoAuditoria) {
  mkdirSync(caminho("dados"), { recursive: true });
  appendFileSync(ARQ, JSON.stringify(ev) + "\n");
}

export function lerEventos(limite = 200): EventoAuditoria[] {
  if (!existsSync(ARQ)) return [];
  const linhas = readFileSync(ARQ, "utf8").trim().split("\n").filter(Boolean);
  return linhas.slice(-limite).map((l) => JSON.parse(l) as EventoAuditoria).reverse();
}

export function metricas() {
  const eventos = lerEventos(100000);
  const lb = politica.linha_de_base;
  const porDestino: Record<string, number> = { externo: 0, mascarado: 0, local: 0, bloqueado: 0, "sem-base": 0 };
  const porTipo: Record<string, number> = { pergunta: 0, questionario: 0, operacao: 0, documentar: 0 };
  let msTotal = 0;
  let respondidas = 0;
  let dadosMascarados = 0;
  let represados = 0;
  for (const e of eventos) {
    porDestino[e.destino] = (porDestino[e.destino] ?? 0) + 1;
    porTipo[e.tipo] = (porTipo[e.tipo] ?? 0) + 1;
    dadosMascarados += Object.values(e.mascarados ?? {}).reduce((s, n) => s + n, 0);
    if (e.represado) represados++;
    if (e.destino !== "bloqueado" && e.destino !== "sem-base") {
      msTotal += e.ms;
      respondidas++;
    }
  }
  const util = (e: EventoAuditoria) => e.destino !== "bloqueado" && e.destino !== "sem-base";
  const itensQuestionario = eventos.filter((e) => e.tipo === "questionario" && util(e)).length;
  const programas = eventos.filter((e) => e.tipo === "documentar" && util(e)).length;
  const minutosEconomizados =
    itensQuestionario * (lb.minutos_manual_por_pergunta_questionario - lb.minutos_revisao_por_pergunta) +
    programas * (lb.minutos_manual_documentar_programa - lb.minutos_revisao_documentacao);
  return {
    total: eventos.length,
    porDestino,
    porTipo,
    dadosMascarados,
    represados,
    tempoMedioSeg: respondidas ? Math.round(msTotal / respondidas / 100) / 10 : 0,
    estimativa: {
      itensQuestionario,
      programas,
      minutosEconomizados,
      reaisEquivalentes: Math.round((minutosEconomizados / 60) * lb.custo_hora_profissional_reais),
      premissas: lb,
    },
  };
}
