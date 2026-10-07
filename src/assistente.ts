import { destinoDaClasse, env, usuarioPorId } from "./config.ts";
import type { Destino, Fase } from "./config.ts";
import { registrar } from "./auditoria.ts";
import { situacaoValidade } from "./documentos.ts";
import { decidirEntrada, decidirPorClasses, maisRestritivo } from "./guarda.ts";
import type { Deteccao } from "./guarda.ts";
import { buscar } from "./indice.ts";
import type { Trecho } from "./indice.ts";
import { criarMascarador } from "./mascaramento.ts";
import { descreverErroClaude, gerarExterno, gerarLocal } from "./modelos.ts";
import type { Geracao } from "./modelos.ts";

export type Tipo = "pergunta" | "questionario" | "operacao" | "documentar";
export type DestinoFinal = Destino | "sem-base";

export type Evento =
  | { tipo: "etapa"; etapa: string; detalhe: string }
  | { tipo: "rota"; destino: DestinoFinal; motivos: string[]; modelo: string }
  | { tipo: "saida"; destino: DestinoFinal; conteudo: string | null; mascarados: Record<string, number> }
  | { tipo: "token"; texto: string }
  | { tipo: "fim"; resultado: Resultado }
  | { tipo: "erro"; mensagem: string };

export interface Fonte {
  ref: string;
  id: string;
  titulo: string;
  rotulo: string;
  origem: string;
  dono: string;
  revisado_em: string;
  vencido: boolean;
  venceEm: string;
  score: number;
  citada: boolean;
}

export interface Resultado {
  usuario: string;
  tipo: Tipo;
  fase: Fase;
  entrada: string;
  destino: DestinoFinal;
  motivos: string[];
  deteccoes: Deteccao[];
  resposta: string;
  fontes: Fonte[];
  retidas: number;
  mascarados: Record<string, number>;
  alertas: string[];
  confianca: "alta" | "média" | "baixa" | "—";
  revisar: boolean;
  ocultadosPorPermissao: number;
  modelo: string;
  ms: number;
}

export interface Opcoes {
  tipo?: Tipo;
  fase?: Fase;
  // Classe da ORIGEM do texto (ex.: questionário recebido de um banco sob NDA = classe 3).
  classeOrigem?: string;
}

const REGRA_CODIGOS = `Dados identificáveis podem vir substituídos por códigos entre colchetes, como [CLIENTE_1], [CPF_1] ou [DATASET_1]. Mantenha esses códigos exatamente como estão e não tente adivinhar o valor original.`;

const SYSTEM: Record<Tipo, string> = {
  pergunta: `Você é o assistente corporativo da Orion Software (empresa fictícia usada em uma demonstração).
Responda em português do Brasil, de forma objetiva, usando SOMENTE as fontes fornecidas.
Regras:
- Depois de cada afirmação, cite a fonte entre colchetes, como [S1] ou [S2].
- Se as fontes não sustentarem a resposta completa, diga exatamente o que falta e não complete com suposições.
- Se duas fontes se contradisserem, prefira a mais recente e diga isso.
- Seja conciso: no máximo 6 frases.
- ${REGRA_CODIGOS}
- Termine com uma linha separada, exatamente no formato "SUFICIENTE: sim" ou "SUFICIENTE: não", indicando se as fontes bastaram para responder.`,
  questionario: "",
  operacao: `Você é o assistente de suporte de mainframe da Orion Software (empresa fictícia usada em uma demonstração).
Você recebe um chamado de cliente e devolve, em português do Brasil e em Markdown, exatamente estas seções:
## Resumo
(2 a 3 frases)
## Severidade sugerida
(1 a 4, com uma frase de justificativa)
## Hipóteses técnicas
(lista curta)
## Próximos passos
(lista numerada)
## Resposta sugerida ao cliente
(curta e cordial; ela será revisada por uma pessoa antes de sair)
Se usar algo das fontes internas fornecidas, cite entre colchetes, como [S1]. Não invente prazos ou compromissos que não estejam nas fontes.
${REGRA_CODIGOS}`,
  documentar: `Você é um engenheiro sênior de mainframe documentando um programa legado para a base de conhecimento da Orion Software (empresa fictícia usada em uma demonstração).
Escreva em português do Brasil, em Markdown, com exatamente estas seções:
## Objetivo
## Entradas e saídas
## Regras de negócio
(lista numerada; cada regra indica o parágrafo de origem no código)
## Cálculos
## Execução e dependências
## Pontos de atenção
## Perguntas para o especialista
(o que o código não explica e só quem conhece o sistema pode confirmar)
Seja fiel ao código. Quando deduzir algo que não está explícito, marque com "(inferência)". Não invente nomes de sistemas ou pessoas.`,
};
SYSTEM.questionario = SYSTEM.pergunta;

const nada = () => {};

function montarFontes(trechos: (Trecho & { score: number })[]) {
  const porDoc = new Map<string, (Trecho & { score: number })[]>();
  for (const t of trechos) porDoc.set(t.docId, [...(porDoc.get(t.docId) ?? []), t]);
  const fontes: Fonte[] = [];
  let contexto = "";
  let n = 0;
  for (const [docId, ts] of porDoc) {
    n++;
    const t0 = ts[0];
    const val = situacaoValidade(t0.revisado_em, t0.validade_meses);
    fontes.push({
      ref: `S${n}`, id: docId, titulo: t0.titulo, rotulo: t0.rotulo, origem: t0.origem, dono: t0.dono,
      revisado_em: t0.revisado_em, vencido: val.vencido, venceEm: val.venceEm,
      score: Math.round(Math.max(...ts.map((x) => x.score)) * 100) / 100, citada: false,
    });
    contexto += `[S${n}] ${t0.titulo} (revisado em ${t0.revisado_em}${val.vencido ? ", PRAZO DE REVISÃO VENCIDO" : ""})\n`;
    contexto += ts.map((x) => x.texto).join("\n...\n") + "\n\n";
  }
  return { fontes, contexto };
}

const descricaoRota = (d: DestinoFinal) =>
  d === "externo" ? env.claudeModel :
  d === "mascarado" ? `${env.claudeModel}, com dados mascarados` :
  d === "local" ? `${env.modeloLocal} no servidor interno` : "—";

export async function atender(usuarioId: string, texto: string, emitir: (e: Evento) => void = nada, opcoes: Opcoes = {}): Promise<Resultado> {
  const inicio = performance.now();
  const tipo = opcoes.tipo ?? "pergunta";
  const fase: Fase = opcoes.fase ?? "1";
  const usuario = usuarioPorId(usuarioId);
  const alertas: string[] = [];
  emitir({ tipo: "etapa", etapa: "Usuário", detalhe: `${usuario.nome} (${usuario.area}), grupos: ${usuario.grupos.join(", ")}` });

  // 1. Guarda na entrada (conteúdo) e classe da origem (de onde o texto veio)
  const entrada = decidirEntrada(texto, usuario, fase);
  if (opcoes.classeOrigem) {
    const porOrigem = decidirPorClasses(fase, [opcoes.classeOrigem]);
    entrada.destino = maisRestritivo(entrada.destino, porOrigem.destino);
    if (porOrigem.motivo) entrada.motivos = [`Origem do texto: ${porOrigem.motivo}`, ...entrada.motivos.filter((m) => m !== "Nenhum dado sensível na entrada")];
  }
  emitir({
    tipo: "etapa", etapa: "Verificação da entrada",
    detalhe: entrada.deteccoes.length ? entrada.deteccoes.map((d) => d.detalhe).join("; ") : "Nenhum código, segredo, dado pessoal ou de cliente",
  });

  const r: Resultado = {
    usuario: usuario.id, tipo, fase, entrada: texto, destino: entrada.destino, motivos: entrada.motivos,
    deteccoes: entrada.deteccoes, resposta: "", fontes: [], retidas: 0, mascarados: {}, alertas, confianca: "—",
    revisar: true, ocultadosPorPermissao: 0, modelo: "—", ms: 0,
  };

  if (entrada.destino === "bloqueado") {
    r.resposta = fase === "1" && entrada.deteccoes.some((d) => d.tipo === "codigo" || d.tipo === "codigo_patenteado")
      ? "Bloqueado: código-fonte não sai da empresa. Este pedido fica registrado como demanda para o servidor interno (Fase 2)."
      : "Bloqueado pela política de dados. Remova o dado sensível e tente de novo. O bloqueio foi registrado.";
    emitir({ tipo: "rota", destino: "bloqueado", motivos: r.motivos, modelo: "—" });
    emitir({ tipo: "saida", destino: "bloqueado", conteudo: null, mascarados: {} });
    return finalizar(r, inicio, emitir, "[conteúdo bloqueado não registrado]");
  }

  // 2. Busca com filtro de permissão (embeddings locais: o documento nunca sai para ser indexado)
  let trechos: (Trecho & { score: number })[] = [];
  let melhorScore = 0;
  if (tipo !== "documentar") {
    const busca = await buscar(texto, usuario, tipo === "operacao" ? 3 : 5);
    r.ocultadosPorPermissao = busca.ocultadosPorPermissao;
    // Na Fase 1, trecho de classe 4 não vai a modelo nenhum: fica retido.
    const retidos = busca.trechos.filter((t) => destinoDaClasse(fase, t.rotulo) === "retido");
    trechos = busca.trechos.filter((t) => destinoDaClasse(fase, t.rotulo) !== "retido");
    r.retidas = retidos.length;
    melhorScore = trechos[0]?.score ?? 0;
    emitir({
      tipo: "etapa", etapa: "Busca na base",
      detalhe: `${busca.trechos.length} trecho(s) relevantes que você pode ver` +
        (busca.ocultadosPorPermissao ? `; ${busca.ocultadosPorPermissao} ocultado(s) pela permissão` : ""),
    });
    if (retidos.length) {
      emitir({ tipo: "etapa", etapa: "Fontes retidas", detalhe: `${retidos.length} trecho(s) de classe 4 não foram enviados: só no servidor interno (Fase 2)` });
      alertas.push(`${retidos.length} trecho(s) de documentação interna de produto (classe 4) ficaram de fora: na Fase 1 eles não saem da empresa.`);
    }
  }

  if ((tipo === "pergunta" || tipo === "questionario") && !trechos.length) {
    r.destino = "sem-base";
    r.motivos = [...entrada.motivos, "Nenhuma fonte que você possa ver, e que possa sair nesta fase, sustenta a resposta"];
    r.confianca = "baixa";
    r.resposta = r.retidas
      ? "A resposta depende de documentação de classe 4, que só será usada com o servidor interno (Fase 2). Encaminhe ao dono da informação."
      : r.ocultadosPorPermissao
        ? "Não encontrei base nos documentos que você pode acessar. Existe conteúdo restrito sobre o tema: encaminhe ao dono da informação."
        : "Não encontrei base nos documentos da empresa para responder. Encaminhe a um especialista.";
    emitir({ tipo: "rota", destino: "sem-base", motivos: r.motivos, modelo: "—" });
    emitir({ tipo: "saida", destino: "sem-base", conteudo: null, mascarados: {} });
    return finalizar(r, inicio, emitir, criarMascarador().mascarar(texto));
  }

  // 3. Rota final: a mais restritiva entre a entrada e as classes das fontes
  const porFontes = decidirPorClasses(fase, trechos.map((t) => t.rotulo));
  r.destino = maisRestritivo(entrada.destino, porFontes.destino);
  if (porFontes.motivo) r.motivos.push(porFontes.motivo);
  emitir({ tipo: "rota", destino: r.destino, motivos: r.motivos, modelo: descricaoRota(r.destino) });

  // 4. Monta o pedido; se for mascarado, troca os dados sensíveis por códigos ANTES de sair
  const { fontes, contexto } = montarFontes(trechos);
  r.fontes = fontes;
  const prompt =
    tipo === "documentar" ? `Documente o programa abaixo.\n\n${texto}` :
    tipo === "operacao" ? `Chamado:\n${texto}\n\n${contexto ? `Fontes internas:\n${contexto}` : ""}` :
    `Pergunta: ${texto}\n\nFontes:\n${contexto}`;
  const mascara = criarMascarador();
  const enviado = r.destino === "mascarado" ? mascara.mascarar(prompt) : prompt;
  r.mascarados = mascara.contagem();
  if (r.destino === "mascarado") {
    const total = mascara.total();
    emitir({ tipo: "etapa", etapa: "Mascaramento", detalhe: total ? `${total} dado(s) trocados por código; a tabela de volta ficou na empresa` : "Nenhum dado identificável a trocar" });
  }
  emitir({ tipo: "saida", destino: r.destino, conteudo: r.destino === "local" ? null : enviado, mascarados: r.mascarados });

  // 5. Geração
  const restaurar = r.destino === "mascarado";
  const aoToken = (t: string) => {
    const pronto = restaurar ? mascara.restaurarParcial(t) : t;
    if (pronto) emitir({ tipo: "token", texto: pronto });
  };
  try {
    let g: Geracao;
    if (r.destino === "local") {
      g = await gerarLocal(SYSTEM[tipo], enviado, aoToken);
    } else {
      try {
        g = await gerarExterno(SYSTEM[tipo], enviado, aoToken);
      } catch (e) {
        const motivo = descreverErroClaude(e);
        // Na Fase 2, pedido permitido ao externo pode cair para o servidor interno. Na Fase 1 não há para onde cair.
        if (fase === "2" && r.destino === "externo") {
          alertas.push(`${motivo}: respondido pelo servidor interno (contingência)`);
          emitir({ tipo: "etapa", etapa: "Contingência", detalhe: `${motivo}. Usando o servidor interno.` });
          g = await gerarLocal(SYSTEM[tipo], enviado, aoToken);
        } else throw new Error(`${motivo}. Na Fase 1 não há servidor interno para contingência.`);
      }
    }
    if (restaurar) {
      const resto = mascara.descarregar();
      if (resto) emitir({ tipo: "token", texto: resto });
    }
    r.modelo = g.modelo;
    const textoFinal = restaurar ? mascara.restaurar(g.texto) : g.texto;
    const suficiente = !/SUFICIENTE:\s*n[ãa]o/i.test(textoFinal);
    r.resposta = textoFinal.replace(/\n?\s*SUFICIENTE:\s*\S+\s*$/i, "").trim();
    const citadas = new Set([...r.resposta.matchAll(/\[S(\d+)\]/g)].map((m) => `S${m[1]}`));
    for (const f of fontes) f.citada = citadas.has(f.ref);

    // Legado: documento vencido gera alerta com o dono para confirmar
    for (const f of fontes.filter((x) => x.citada && x.vencido)) {
      alertas.push(`"${f.titulo}" está com a revisão vencida desde ${f.venceEm}. Confirmar com ${f.dono}.`);
    }
    if (tipo === "pergunta" || tipo === "questionario") {
      if (!suficiente) alertas.push("As fontes não bastaram para uma resposta completa.");
      r.confianca = !suficiente ? "baixa" : melhorScore >= 0.6 && !alertas.length ? "alta" : "média";
      r.revisar = r.confianca !== "alta";
    } else {
      r.confianca = "média";
      alertas.push(tipo === "documentar"
        ? "Documentação gerada por IA: validar com o especialista do sistema antes de publicar."
        : "Rascunho gerado por IA: revisar antes de responder ao cliente.");
    }
    return finalizar(r, inicio, emitir, tipo === "documentar" ? "[código-fonte não registrado]" : mascara.mascarar(texto), g);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    emitir({ tipo: "erro", mensagem: msg });
    r.resposta = `Não foi possível gerar a resposta: ${msg}`;
    r.confianca = "baixa";
    return finalizar(r, inicio, emitir, tipo === "documentar" ? "[código-fonte não registrado]" : mascara.mascarar(texto));
  }
}

function finalizar(r: Resultado, inicio: number, emitir: (e: Evento) => void, resumoEntrada: string, g?: Geracao): Resultado {
  r.ms = Math.round(performance.now() - inicio);
  // O log guarda o resumo já mascarado: dado de cliente não vai parar no registro de auditoria.
  registrar({
    quando: new Date().toISOString(), usuario: r.usuario, tipo: r.tipo, fase: r.fase, destino: r.destino, modelo: r.modelo,
    motivos: r.motivos, deteccoes: r.deteccoes.map((d) => d.detalhe), fontes: r.fontes.filter((f) => f.citada).map((f) => f.id),
    retidas: r.retidas, mascarados: r.mascarados, ocultadosPorPermissao: r.ocultadosPorPermissao, confianca: r.confianca,
    revisar: r.revisar, ms: r.ms, tokensEntrada: g?.tokensEntrada, tokensSaida: g?.tokensSaida, resumoEntrada: resumoEntrada.slice(0, 140),
    represado: r.fase === "1" && (r.retidas > 0 || (r.destino === "bloqueado" && r.deteccoes.some((d) => d.tipo === "codigo" || d.tipo === "codigo_patenteado"))),
  });
  emitir({ tipo: "fim", resultado: r });
  return r;
}
