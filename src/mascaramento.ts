import { politica } from "./config.ts";
import type { TipoDeteccao } from "./config.ts";

// Pseudonimização na porta de saída: o dado sensível vira um código ([CLIENTE_1], [CPF_1]...)
// antes de ir ao modelo externo. A tabela código→valor fica só na memória deste pedido,
// dentro da empresa, e nunca é gravada. A resposta volta com os códigos e é restaurada aqui.
// Em produção, somar NER (ex.: Microsoft Presidio) para nomes em texto livre.

export interface Entidade {
  tipo: TipoDeteccao;
  rotulo: string;
  valor: string;
  inicio: number;
  fim: number;
}

const soDigitos = (s: string) => s.replace(/\D/g, "");

export function cpfValido(valor: string): boolean {
  const d = soDigitos(valor);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (base: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(d.slice(0, 9), 10) === Number(d[9]) && dv(d.slice(0, 10), 11) === Number(d[10]);
}

export function cnpjValido(valor: string): boolean {
  const d = soDigitos(valor);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split("").reduce((acc, c, i) => acc + Number(c) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return dv(d.slice(0, 12)) === Number(d[12]) && dv(d.slice(0, 13)) === Number(d[13]);
}

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface Padrao {
  tipo: TipoDeteccao;
  rotulo: string;
  re: RegExp;
  grupo?: number;
  valida?: (v: string) => boolean;
}

function padroes(): Padrao[] {
  const clientes = politica.clientes.map(escRe).join("|");
  return [
    { tipo: "dado_pessoal", rotulo: "CNPJ", re: /\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}\b/g, valida: cnpjValido },
    { tipo: "dado_pessoal", rotulo: "CPF", re: /\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/g, valida: cpfValido },
    { tipo: "nome_cliente", rotulo: "CLIENTE", re: new RegExp(`\\b(${clientes})\\b`, "gi") },
    {
      // O rótulo aceita maiúscula ou minúscula; o nome em si precisa começar com maiúscula
      // (sem a flag "i", senão "contato com cliente" viraria um nome).
      tipo: "dado_pessoal", rotulo: "PESSOA", grupo: 1,
      re: /\b(?:[Aa]berto [Pp]or|[Ss]olicitante|[Cc]ontato|[Rr]espons[áa]vel|[Cc]liente [Ff]inal|[Tt]itular)\s*:?\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+(?:d[aeo]s?\s+)?[A-ZÀ-Ú][a-zà-ú]+)+)/g,
    },
    { tipo: "identificador", rotulo: "EMAIL", re: /\b[\w.+-]+@[\w-]+(\.[\w-]+)+\b/g },
    { tipo: "identificador", rotulo: "IP", re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g },
    { tipo: "identificador", rotulo: "CONTA", re: /\b(?:ag(?:[êe]ncia)?\.?\s*\d{3,5}(?:-\d)?\s*(?:,|\/|e)?\s*)?(?:c\/c|conta(?:\s+corrente)?)\s*(?:n[º°o.]?\s*)?\d{4,12}(?:-[\dxX])?\b/gi },
    { tipo: "identificador", rotulo: "DATASET", re: /\b(?:PRD|PROD)(?:\.[A-Z0-9#@$]{1,8}){1,7}\b/g },
  ];
}

export function encontrarEntidades(texto: string): Entidade[] {
  const achadas: Entidade[] = [];
  for (const p of padroes()) {
    for (const m of texto.matchAll(p.re)) {
      const valor = p.grupo ? m[p.grupo] : m[0];
      if (!valor || (p.valida && !p.valida(valor))) continue;
      const inicio = (m.index ?? 0) + (p.grupo ? m[0].indexOf(valor) : 0);
      achadas.push({ tipo: p.tipo, rotulo: p.rotulo, valor, inicio, fim: inicio + valor.length });
    }
  }
  // Sem sobreposição: fica a entidade mais longa.
  achadas.sort((a, b) => a.inicio - b.inicio || b.fim - b.inicio - (a.fim - a.inicio));
  const finais: Entidade[] = [];
  for (const e of achadas) {
    const ultima = finais[finais.length - 1];
    if (ultima && e.inicio < ultima.fim) continue;
    finais.push(e);
  }
  return finais;
}

const RE_CODIGO = /\[(CLIENTE|CPF|CNPJ|PESSOA|EMAIL|IP|CONTA|DATASET)_\d+\]/g;

export function criarMascarador() {
  const porValor = new Map<string, string>();
  const porCodigo = new Map<string, string>();
  const contagem: Record<string, number> = {};

  function mascarar(texto: string): string {
    const ents = encontrarEntidades(texto);
    let saida = "";
    let pos = 0;
    for (const e of ents) {
      // CPF e CNPJ comparados só pelos dígitos: o mesmo número em dois formatos ganha o mesmo código.
      const normal = e.rotulo === "CPF" || e.rotulo === "CNPJ" ? e.valor.replace(/\D/g, "") : e.valor.toLowerCase();
      const chave = `${e.rotulo}:${normal}`;
      let codigo = porValor.get(chave);
      if (!codigo) {
        contagem[e.rotulo] = (contagem[e.rotulo] ?? 0) + 1;
        codigo = `[${e.rotulo}_${contagem[e.rotulo]}]`;
        porValor.set(chave, codigo);
        porCodigo.set(codigo, e.valor);
      }
      saida += texto.slice(pos, e.inicio) + codigo;
      pos = e.fim;
    }
    return saida + texto.slice(pos);
  }

  const restaurar = (texto: string) => texto.replace(RE_CODIGO, (c) => porCodigo.get(c) ?? c);

  // Para streaming: um código pode chegar partido em dois pedaços ("[CLIEN" + "TE_1]").
  let pendente = "";
  function restaurarParcial(pedaco: string): string {
    pendente += pedaco;
    const abre = pendente.lastIndexOf("[");
    if (abre >= 0 && !pendente.slice(abre).includes("]") && pendente.length - abre < 16) {
      const pronto = pendente.slice(0, abre);
      pendente = pendente.slice(abre);
      return restaurar(pronto);
    }
    const pronto = pendente;
    pendente = "";
    return restaurar(pronto);
  }
  const descarregar = () => {
    const r = restaurar(pendente);
    pendente = "";
    return r;
  };

  return { mascarar, restaurar, restaurarParcial, descarregar, contagem: () => ({ ...contagem }), total: () => porCodigo.size };
}
