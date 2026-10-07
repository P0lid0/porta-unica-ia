import Anthropic from "@anthropic-ai/sdk";
import { env } from "./config.ts";

export interface Geracao {
  texto: string;
  modelo: string;
  tokensEntrada?: number;
  tokensSaida?: number;
}

type AoToken = (t: string) => void;

// ---------- Rota externa: Claude (API da Anthropic) ----------

let cliente: Anthropic | null = null;

export async function gerarExterno(system: string, prompt: string, aoToken?: AoToken): Promise<Geracao> {
  if (!env.temChaveClaude) throw new Error("SEM_CHAVE_CLAUDE");
  // Chave não vinculada a um workspace exige o cabeçalho com o ID do workspace.
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  cliente ??= new Anthropic(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {});
  // Haiku 4.5 não aceita "effort" nem o fallback no servidor; os modelos 5.x aceitam os dois.
  const ehHaiku = env.claudeModel.startsWith("claude-haiku");
  const stream = ehHaiku
    ? cliente.messages.stream({
        model: env.claudeModel,
        max_tokens: 4000,
        system,
        messages: [{ role: "user", content: prompt }],
      })
    : cliente.beta.messages.stream({
        model: env.claudeModel,
        max_tokens: 16000,
        // Pergunta e resposta curtas com base em fontes: esforço baixo basta e responde mais rápido.
        output_config: { effort: "low" },
        // Se o modelo recusar por política de segurança, a API reexecuta no modelo de fallback.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system,
        messages: [{ role: "user", content: prompt }],
      });
  if (aoToken) stream.on("text", (t) => aoToken(t));
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") {
    throw new Error(`Claude recusou a solicitação (${msg.stop_details?.category ?? "sem categoria"})`);
  }
  const texto = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return { texto, modelo: msg.model, tokensEntrada: msg.usage.input_tokens, tokensSaida: msg.usage.output_tokens };
}

export function descreverErroClaude(e: unknown): string {
  if (e instanceof Error && e.message === "SEM_CHAVE_CLAUDE") return "Chave da API do Claude não configurada";
  if (e instanceof Anthropic.AuthenticationError) return "Chave da API do Claude inválida";
  if (e instanceof Anthropic.RateLimitError) return "Limite de uso da API do Claude atingido";
  if (e instanceof Anthropic.APIConnectionError) return "Sem conexão com a API do Claude";
  if (e instanceof Anthropic.APIError) return `Erro da API do Claude (${e.status})`;
  return e instanceof Error ? e.message : String(e);
}

// ---------- Rota local: Ollama (nada sai da máquina) ----------

export async function gerarLocal(system: string, prompt: string, aoToken?: AoToken): Promise<Geracao> {
  const resp = await fetch(`${env.ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: env.modeloLocal,
      stream: true,
      think: "low",
      options: { temperature: 0.2, num_ctx: 8192, num_thread: env.threadsLocal },
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!resp.ok || !resp.body) throw new Error(`Ollama respondeu ${resp.status}: ${await resp.text()}`);
  let texto = "";
  let tokensEntrada: number | undefined;
  let tokensSaida: number | undefined;
  let resto = "";
  const decoder = new TextDecoder();
  for await (const parte of resp.body) {
    resto += decoder.decode(parte, { stream: true });
    const linhas = resto.split("\n");
    resto = linhas.pop() ?? "";
    for (const linha of linhas) {
      if (!linha.trim()) continue;
      const ev = JSON.parse(linha);
      if (ev.error) throw new Error(`Ollama: ${ev.error}`);
      const t = ev.message?.content ?? "";
      if (t) {
        texto += t;
        aoToken?.(t);
      }
      if (ev.done) {
        tokensEntrada = ev.prompt_eval_count;
        tokensSaida = ev.eval_count;
      }
    }
  }
  return { texto, modelo: `${env.modeloLocal} (local)`, tokensEntrada, tokensSaida };
}

export async function embed(textos: string[]): Promise<number[][]> {
  const resp = await fetch(`${env.ollamaUrl}/api/embed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: env.modeloEmbed, input: textos }),
  });
  if (!resp.ok) throw new Error(`Ollama (embed) respondeu ${resp.status}: ${await resp.text()}`);
  const dados = (await resp.json()) as { embeddings: number[][] };
  return dados.embeddings;
}

export async function statusOllama(): Promise<{ ativo: boolean; modelos: string[] }> {
  try {
    const resp = await fetch(`${env.ollamaUrl}/api/tags`);
    const dados = (await resp.json()) as { models: { name: string }[] };
    return { ativo: true, modelos: dados.models.map((m) => m.name) };
  } catch {
    return { ativo: false, modelos: [] };
  }
}
