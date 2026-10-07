"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const estado = { usuarios: [], politica: null, modelos: null, catalogo: [], fase: "1" };

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const nomeClasse = (r) => estado.politica?.rotulos?.[r]?.nome ?? r;
const usuarioAtual = () => $("#usuario").value;
const segundos = (ms) => (ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " s";
const NOME_ROTA = { externo: "Externo", mascarado: "Externo mascarado", local: "Servidor interno", bloqueado: "Bloqueado", "sem-base": "Sem base" };
const pilula = (destino, texto) => `<span class="pilula ${esc(destino)}">${esc(texto ?? NOME_ROTA[destino] ?? destino)}</span>`;
const NOME_DADO = { CLIENTE: "cliente", PESSOA: "pessoa", CPF: "CPF", CNPJ: "CNPJ", EMAIL: "e-mail", IP: "IP", CONTA: "conta", DATASET: "dataset" };
const listaMascarados = (m) => Object.entries(m ?? {}).map(([k, n]) => `${n} ${NOME_DADO[k] ?? k}`).join(", ");

// ---------- Markdown mínimo e seguro (escapa tudo antes) ----------
function inline(t) {
  return t
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[S(\d+)\]/g, '<a class="cit" href="#fonte-S$1">S$1</a>');
}
function md(texto) {
  const linhas = esc(texto).split(/\r?\n/);
  let html = "";
  let lista = null;
  let tabela = null;
  let codigo = null;
  const fecharLista = () => { if (lista) { html += `</${lista}>`; lista = null; } };
  const fecharTabela = () => { if (tabela) { html += "</tbody></table>"; tabela = null; } };
  for (const bruta of linhas) {
    const l = bruta.trimEnd();
    if (l.trim().startsWith("```")) {
      if (codigo === null) { fecharLista(); fecharTabela(); codigo = ""; }
      else { html += `<pre>${codigo}</pre>`; codigo = null; }
      continue;
    }
    if (codigo !== null) { codigo += bruta + "\n"; continue; }
    if (/^\s*\|.*\|\s*$/.test(l)) {
      fecharLista();
      const celulas = l.trim().slice(1, -1).split("|").map((c) => c.trim());
      if (celulas.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      if (!tabela) { html += "<table><tbody>"; tabela = true; html += `<tr>${celulas.map((c) => `<th>${inline(c)}</th>`).join("")}</tr>`; }
      else html += `<tr>${celulas.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`;
      continue;
    }
    fecharTabela();
    let m;
    if ((m = l.match(/^\s*#{1,4}\s+(.*)$/))) { fecharLista(); html += `<h3>${inline(m[1])}</h3>`; continue; }
    if ((m = l.match(/^\s*[-*•]\s+(.*)$/))) {
      if (lista !== "ul") { fecharLista(); html += "<ul>"; lista = "ul"; }
      html += `<li>${inline(m[1])}</li>`;
      continue;
    }
    if ((m = l.match(/^\s*\d+[.)]\s+(.*)$/))) {
      if (lista !== "ol") { fecharLista(); html += "<ol>"; lista = "ol"; }
      html += `<li>${inline(m[1])}</li>`;
      continue;
    }
    if (!l.trim()) { fecharLista(); continue; }
    fecharLista();
    if ((m = l.match(/^\s*&gt;\s?(.*)$/))) { if (m[1].trim()) html += `<p class="citacao">${inline(m[1])}</p>`; continue; }
    html += `<p>${inline(l)}</p>`;
  }
  fecharLista();
  fecharTabela();
  if (codigo !== null) html += `<pre>${codigo}</pre>`;
  return html;
}
const semLinhaSuficiente = (t) => t.replace(/\n?\s*SUFICIENTE:\s*\S*\s*$/i, "");

// ---------- Diagrama de caminhos ----------
function svgRota() {
  const f2 = estado.fase === "2";
  const destino = (r, y, nome, sub, extra = "") => `
    <g class="destino ${extra}" data-r="${r}">
      <rect x="296" y="${y}" width="176" height="50" rx="4"/>
      <text class="nome" x="310" y="${y + 21}">${nome}</text>
      <text class="sub" x="310" y="${y + 39}">${sub}</text>
    </g>`;
  return `
  <svg viewBox="0 0 480 262" role="img" aria-label="Caminhos possíveis: externo, externo mascarado, servidor interno ou bloqueado">
    <path class="trilho base" d="M 40 131 L 150 131"/>
    <path class="trilho" data-r="externo" d="M 186 131 C 240 131, 236 33, 296 33"/>
    <path class="trilho" data-r="mascarado" d="M 186 131 C 236 131, 240 98, 296 98"/>
    <path class="trilho ${f2 ? "" : "futuro"}" data-r="local" d="M 186 131 C 236 131, 240 164, 296 164"/>
    <path class="trilho" data-r="bloqueado" d="M 186 131 C 240 131, 236 229, 296 229"/>
    <rect class="mascara" x="255" y="92" width="22" height="12" rx="6"/>
    <circle class="no" cx="30" cy="131" r="11"/>
    <text class="rot" x="30" y="165" text-anchor="middle">Pedido</text>
    <rect class="no barreira" x="150" y="113" width="36" height="36" rx="3" transform="rotate(45 168 131)"/>
    <text class="rot" x="168" y="183" text-anchor="middle">Porta única</text>
    ${destino("externo", 8, "Externo", "Claude, retenção zero")}
    ${destino("mascarado", 73, "Externo mascarado", "Dado sensível vira código")}
    ${destino("local", 139, "Servidor interno", f2 ? "Nada sai da empresa" : "Chega na Fase 2", f2 ? "" : "futuro")}
    ${destino("bloqueado", 204, "Bloqueado", "Não é processado")}
  </svg>`;
}
function iniciarRota(el) {
  el.innerHTML = `
    <div class="rota-titulo"><h2>Para onde o pedido vai</h2></div>
    <div class="rota-veredito aguardando">Aguardando pedido</div>
    <div class="rota-motivos"></div>
    ${svgRota()}`;
}
function marcarRota(el, destino, motivos = [], modelo = "") {
  const v = $(".rota-veredito", el);
  v.className = `rota-veredito ${destino}`;
  v.textContent =
    destino === "externo" ? `Externo: ${modelo}` :
    destino === "mascarado" ? "Externo, com dados mascarados" :
    destino === "local" ? "Servidor interno: nada saiu" :
    destino === "bloqueado" ? "Bloqueado: não foi processado" :
    "Sem fonte que possa ser usada";
  $(".rota-motivos", el).innerHTML = motivos.map((m) => `<span>${esc(m)}</span>`).join("");
  $$("[data-r]", el).forEach((n) => {
    n.classList.remove("ativo", "externo", "mascarado", "local", "bloqueado");
    if (n.dataset.r === destino) n.classList.add("ativo", destino);
  });
}
function addPasso(trilha, etapa, detalhe) {
  const li = document.createElement("li");
  li.innerHTML = `<span class="etapa">${esc(etapa)}</span><span class="det">${esc(detalhe)}</span>`;
  trilha.appendChild(li);
}
function desenharSaida(el, ev) {
  if (!ev) { el.innerHTML = ""; return; }
  if (!ev.conteudo) {
    const bloq = ev.destino === "bloqueado" || ev.destino === "sem-base";
    el.innerHTML = `<h2>O que saiu da empresa</h2><p class="nada ${bloq ? "bloq" : ""}">Nada. ${
      ev.destino === "local" ? "Processado no servidor interno." : ev.destino === "bloqueado" ? "O pedido foi bloqueado." : "Não havia fonte que pudesse ser usada."}</p>`;
    return;
  }
  const destacado = esc(ev.conteudo).replace(/\[(CLIENTE|CPF|CNPJ|PESSOA|EMAIL|IP|CONTA|DATASET)_\d+\]/g, (c) => `<mark>${c}</mark>`);
  const qtd = listaMascarados(ev.mascarados);
  el.innerHTML = `<h2>O que saiu da empresa</h2>
    <p class="contagem">${ev.destino === "mascarado" ? (qtd ? `Dados trocados por código: ${esc(qtd)}. A tabela de volta ficou na empresa.` : "Nenhum dado identificável a trocar.") : "Texto sem dado sensível, enviado como está."}</p>
    <pre>${destacado}</pre>`;
}

// ---------- Transmissão (NDJSON) ----------
async function transmitir(url, corpo, aoEvento) {
  const resp = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
  if (!resp.ok || !resp.body) throw new Error(`O servidor respondeu ${resp.status}: ${await resp.text()}`);
  const leitor = resp.body.getReader();
  const dec = new TextDecoder();
  let resto = "";
  for (;;) {
    const { value, done } = await leitor.read();
    if (done) break;
    resto += dec.decode(value, { stream: true });
    const linhas = resto.split("\n");
    resto = linhas.pop();
    for (const l of linhas) if (l.trim()) aoEvento(JSON.parse(l));
  }
}

function renderFinal(alvo, r) {
  const fontes = r.fontes ?? [];
  const meta = [];
  if (r.confianca && r.confianca !== "—") meta.push(`<span>Confiança <strong>${esc(r.confianca)}</strong></span>`);
  if ((r.tipo === "pergunta" || r.tipo === "questionario") && r.destino !== "bloqueado")
    meta.push(r.revisar ? `<span class="revisar">Revisar antes de enviar</span>` : `<span>Pronta para revisão rápida</span>`);
  meta.push(`<span>Tempo <strong>${segundos(r.ms)}</strong></span>`);
  if (r.modelo && r.modelo !== "—") meta.push(`<span>Modelo <strong>${esc(r.modelo)}</strong></span>`);
  alvo.className = "resposta";
  alvo.innerHTML = `
    <div class="texto-resposta">${md(semLinhaSuficiente(r.resposta))}</div>
    ${r.alertas?.length ? `<div class="alertas">${r.alertas.map((a) => `<div class="alerta">${esc(a)}</div>`).join("")}</div>` : ""}
    <div class="meta-resposta">${meta.join("")}</div>
    ${fontes.length ? `<div class="fontes"><h3>Fontes consultadas</h3>${fontes.map((f) => `
      <div class="fonte ${f.citada ? "" : "nao-citada"}" id="fonte-${esc(f.ref)}">
        <span class="ref">${esc(f.ref)}</span>
        <span class="titulo">${esc(f.titulo)} <span class="id-doc">${esc(f.id)}</span></span>
        <span class="detalhe">${esc(nomeClasse(f.rotulo))}. ${esc(f.origem)}. Dono: ${esc(f.dono)}. Revisado em ${esc(f.revisado_em)}${f.vencido ? `. <span class="vencido">Revisão vencida desde ${esc(f.venceEm)}</span>` : ""}${f.citada ? "" : ". Não citada na resposta"}</span>
      </div>`).join("")}</div>` : ""}`;
}

async function executar(rotaApi, texto, chave) {
  const rota = $(`#rota-${chave}`), saida = $(`#saida-${chave}`), trilha = $(`#trilha-${chave}`), alvo = $(`#resposta-${chave}`);
  const botao = $(`#form-${chave} .primario`);
  botao.disabled = true;
  iniciarRota(rota);
  $(".rota-veredito", rota).textContent = "Analisando o pedido…";
  desenharSaida(saida, null);
  trilha.innerHTML = "";
  alvo.className = "resposta";
  alvo.innerHTML = `<div class="texto-resposta cursor"></div>`;
  let acumulado = "";
  let agendado = false;
  const desenhar = () => {
    agendado = false;
    const el = $(".texto-resposta", alvo);
    if (el) el.innerHTML = md(semLinhaSuficiente(acumulado));
  };
  try {
    await transmitir(`/api/${rotaApi}`, { usuario: usuarioAtual(), texto, fase: estado.fase }, (ev) => {
      if (ev.tipo === "etapa") {
        addPasso(trilha, ev.etapa, ev.detalhe);
        if (ev.etapa === "Contingência") marcarRota(rota, "local", [ev.detalhe]);
      } else if (ev.tipo === "rota") {
        marcarRota(rota, ev.destino, ev.motivos, ev.modelo);
        addPasso(trilha, "Caminho decidido", `${NOME_ROTA[ev.destino] ?? ev.destino}${ev.modelo && ev.modelo !== "—" ? ` (${ev.modelo})` : ""}`);
      } else if (ev.tipo === "saida") {
        desenharSaida(saida, ev);
      } else if (ev.tipo === "token") {
        acumulado += ev.texto;
        if (!agendado) { agendado = true; requestAnimationFrame(desenhar); }
      } else if (ev.tipo === "fim") {
        const r = ev.resultado;
        addPasso(trilha, "Registro de auditoria", `Gravado em ${segundos(r.ms)}, com o pedido mascarado`);
        renderFinal(alvo, r);
      } else if (ev.tipo === "erro") {
        alvo.insertAdjacentHTML("beforeend", `<div class="alertas"><div class="alerta erro">${esc(ev.mensagem)}</div></div>`);
      }
    });
  } catch (e) {
    alvo.className = "resposta";
    alvo.innerHTML = `<div class="alerta erro">Não foi possível falar com o servidor da demo. ${esc(e.message)}</div>`;
  } finally {
    botao.disabled = false;
  }
}

// ---------- Perguntar ----------
const EXEMPLOS = [
  "Qual é a nossa política de backup?",
  "Quando foi o último teste do plano de continuidade?",
  "O Banco Aurora (contato joao.silva@bancoaurora.com.br) perguntou em quanto tempo avisamos de um incidente. O que respondo?",
  "Como o DataMask protege as chaves de criptografia do cliente?",
  "Qual o desconto máximo que posso dar numa renovação?",
  "Qual é o plano de sucessão da diretoria?",
  "Conecte no Db2 com usuario=batch01 senha=Orion@2026 e me diga o status do job",
  "A empresa tem seguro de riscos cibernéticos?",
];
function montarFormulario(chave, rotaApi, campo) {
  $(`#form-${chave}`).addEventListener("submit", (e) => {
    e.preventDefault();
    const texto = $(campo).value;
    if (!texto.trim()) return $(campo).focus();
    executar(rotaApi, texto, chave);
  });
}
function montarAbasDeTrabalho() {
  for (const chave of ["perguntar", "chamado", "legado"]) iniciarRota($(`#rota-${chave}`));
  $("#exemplos-perguntar").innerHTML = EXEMPLOS.map((e) => `<button type="button" class="chip">${esc(e)}</button>`).join("");
  $$("#exemplos-perguntar .chip").forEach((b) =>
    b.addEventListener("click", () => {
      $("#pergunta").value = b.textContent;
      $("#form-perguntar").requestSubmit();
    }),
  );
  montarFormulario("perguntar", "perguntar", "#pergunta");
  montarFormulario("chamado", "operar", "#chamado");
  montarFormulario("legado", "documentar", "#codigo");
  $$("[data-exemplo]").forEach((b) =>
    b.addEventListener("click", async () => {
      const r = await fetch(`/api/exemplo?nome=${encodeURIComponent(b.dataset.exemplo)}`).then((x) => x.json());
      $(b.dataset.alvo).value = r.texto;
    }),
  );
}

// ---------- Questionário ----------
let linhasQuestionario = [];
function linhaPendente(l, processando) {
  return `<tr class="${processando ? "processando" : ""}">
    <td class="num">${esc(l.numero)}</td>
    <td>${esc(l.pergunta)}</td>
    <td class="resposta-celula">${processando ? "Respondendo…" : ""}</td>
    <td>${pilula("pendente", "Na fila")}</td><td></td><td></td></tr>`;
}
function linhaPronta(l, r) {
  const citadas = (r.fontes ?? []).filter((f) => f.citada);
  const qtd = listaMascarados(r.mascarados);
  return `<tr>
    <td class="num">${esc(l.numero)}</td>
    <td>${esc(l.pergunta)}</td>
    <td class="resposta-celula">
      <div class="texto-resposta">${md(semLinhaSuficiente(r.resposta))}</div>
      ${citadas.length ? `<div class="fontes-celula">Fontes: ${citadas.map((f) => `${esc(f.ref)} ${esc(f.titulo)}`).join("; ")}</div>` : ""}
      ${r.alertas?.length ? `<div class="alertas">${r.alertas.map((a) => `<div class="alerta">${esc(a)}</div>`).join("")}</div>` : ""}
    </td>
    <td>${pilula(r.destino)}${qtd ? `<div class="motivo">Mascarado: ${esc(qtd)}</div>` : ""}<div class="motivo">${esc(r.motivos.slice(-1)[0] ?? "")}</div></td>
    <td>${esc(r.confianca)}${r.revisar ? `<div class="revisar">Revisar</div>` : ""}</td>
    <td class="num">${segundos(r.ms)}</td></tr>`;
}
function desenharQuestionario(job) {
  const linhas = job?.linhas ?? linhasQuestionario;
  const res = job?.resultados ?? [];
  $("#tabela-questionario tbody").innerHTML = linhas
    .map((l, i) => (res[i] ? linhaPronta(l, res[i]) : linhaPendente(l, job?.status === "rodando" && i === res.length)))
    .join("");
  if (!job) return;
  const lb = estado.politica.linha_de_base;
  const total = linhas.length;
  const feitas = res.length;
  const msIA = res.reduce((s, r) => s + r.ms, 0);
  const revisar = res.filter((r) => r.revisar).length;
  const porRota = res.reduce((acc, r) => ({ ...acc, [r.destino]: (acc[r.destino] ?? 0) + 1 }), {});
  const minManual = feitas * lb.minutos_manual_por_pergunta_questionario;
  const minComIA = Math.round(msIA / 60000 + feitas * lb.minutos_revisao_por_pergunta);
  const resumo = $("#resumo-questionario");
  resumo.hidden = false;
  resumo.innerHTML = `
    <div class="item"><span class="valor">${feitas} de ${total}</span><span class="rotulo">perguntas respondidas</span><div class="barra"><span style="width:${(feitas / total) * 100}%"></span></div></div>
    <div class="item"><span class="valor">${revisar}</span><span class="rotulo">marcadas para revisar</span></div>
    <div class="item"><span class="valor">${Object.entries(porRota).map(([k, v]) => `${v} ${(NOME_ROTA[k] ?? k).toLowerCase()}`).join(", ") || "—"}</span><span class="rotulo">caminhos usados</span></div>
    <div class="item"><span class="valor">${minComIA} min contra ${minManual} min</span><span class="rotulo">com IA e revisão, contra feito à mão (premissa de ${lb.minutos_manual_por_pergunta_questionario} min por pergunta)</span></div>
    ${job.status === "concluido" ? `<a class="primario" href="/api/baixar?arquivo=${encodeURIComponent(job.arquivo)}">Baixar planilha preenchida</a>` : ""}
    ${job.status === "erro" ? `<div class="alerta erro">${esc(job.erro)}</div>` : ""}`;
}
async function iniciarQuestionario(corpo) {
  const origem = $("input[name=origem]:checked").value;
  const botao = $("#btn-questionario");
  botao.disabled = true;
  try {
    const resp = await fetch(`/api/questionario?usuario=${encodeURIComponent(usuarioAtual())}&origem=${origem}&fase=${estado.fase}`, { method: "POST", body: corpo ?? "" });
    const { id, erro } = await resp.json();
    if (erro) throw new Error(erro);
    for (;;) {
      const job = await fetch(`/api/questionario/${id}`).then((x) => x.json());
      desenharQuestionario(job);
      if (job.status !== "rodando") break;
      await new Promise((r) => setTimeout(r, 1200));
    }
  } catch (e) {
    $("#resumo-questionario").hidden = false;
    $("#resumo-questionario").innerHTML = `<div class="alerta erro">Não foi possível preencher o questionário. ${esc(e.message)}</div>`;
  } finally {
    botao.disabled = false;
  }
}
async function montarQuestionario() {
  linhasQuestionario = await fetch("/api/exemplo-questionario").then((x) => x.json());
  desenharQuestionario(null);
  $("#btn-questionario").addEventListener("click", () => iniciarQuestionario());
  $("#arquivo-questionario").addEventListener("change", async (e) => {
    const arq = e.target.files[0];
    if (arq) await iniciarQuestionario(await arq.arrayBuffer());
    e.target.value = "";
  });
}

// ---------- Base de conhecimento ----------
function desenharBase() {
  const itens = [...estado.catalogo].sort((a, b) => (a.situacao === b.situacao ? a.id.localeCompare(b.id) : a.situacao === "indexado" ? -1 : 1));
  const indexados = itens.filter((i) => i.situacao === "indexado");
  const vencidos = indexados.filter((i) => i.vencido).length;
  const classe4 = indexados.filter((i) => i.rotulo === "4-ip-critico").length;
  $("#resumo-base").textContent =
    `Das ${itens.length} fontes varridas, ${indexados.length} entraram na base e ${itens.length - indexados.length} ficaram de fora pela política. ` +
    `${vencidos} estão com a revisão vencida e geram alerta quando citadas. ` +
    (estado.fase === "1" ? `${classe4} de classe 4 ficam na base, mas na Fase 1 não são enviadas a modelo nenhum.` : `Na Fase 2, as de classe 4 são usadas pelo servidor interno.`);
  $("#tabela-base tbody").innerHTML = itens
    .map((i) => {
      const sit =
        i.situacao === "excluido" ? pilula("excluido", "Fora da base") :
        i.rotulo === "4-ip-critico" && estado.fase === "1" ? pilula("vencido", "Na base, só para a Fase 2") :
        i.vencido ? pilula("vencido", "Na base, revisão vencida") : pilula("indexado", "Na base");
      return `<tr>
        <td><strong>${esc(i.titulo)}</strong><div class="id-doc">${esc(i.id)}</div></td>
        <td>${esc(nomeClasse(i.rotulo))}</td>
        <td>${esc(i.origem)}</td>
        <td>${esc(i.acesso.join(", "))}</td>
        <td>${esc(i.dono)}</td>
        <td class="num">${esc(i.revisado_em || "—")}</td>
        <td>${sit}<div class="motivo">${esc(i.motivo)}</div></td></tr>`;
    })
    .join("");
}

// ---------- Uso e ROI ----------
async function desenharUso() {
  const { eventos, metricas: m } = await fetch("/api/auditoria").then((x) => x.json());
  const total = m.total || 1;
  const faixa = (k) => `<div class="linha ${k}"><span>${NOME_ROTA[k]}</span><div class="faixa"><span style="width:${((m.porDestino[k] ?? 0) / total) * 100}%"></span></div><span class="num">${m.porDestino[k] ?? 0}</span></div>`;
  const est = m.estimativa;
  $("#painel-uso").innerHTML = `
    <div class="cartao"><h3>Pedidos registrados</h3><div class="grande">${m.total}</div>
      <p class="pequeno">${m.porTipo.pergunta} perguntas, ${m.porTipo.operacao} chamados, ${m.porTipo.questionario} itens de questionário, ${m.porTipo.documentar} documentações</p></div>
    <div class="cartao"><h3>Para onde foram</h3><div class="distribuicao">${["externo", "mascarado", "local", "bloqueado", "sem-base"].map(faixa).join("")}</div></div>
    <div class="cartao"><h3>Dados que não saíram</h3><div class="grande">${m.dadosMascarados}</div>
      <p class="pequeno">Dados de cliente trocados por código antes de sair, mais ${m.porDestino.bloqueado ?? 0} pedido(s) bloqueado(s), registrados para a Segurança.</p></div>
    <div class="cartao"><h3>Demanda para o servidor interno</h3><div class="grande">${m.represados}</div>
      <p class="pequeno">Pedidos que a Fase 1 não atende (código, documentação classe 4). É o argumento medido para a Fase 2.</p></div>
    <div class="cartao"><h3>Tempo estimado economizado</h3><div class="grande">${(est.minutosEconomizados / 60).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h</div>
      <p class="pequeno">Cerca de R$ ${est.reaisEquivalentes.toLocaleString("pt-BR")} a R$ ${est.premissas.custo_hora_profissional_reais}/h. Premissas: ${est.premissas.minutos_manual_por_pergunta_questionario} min por pergunta de questionário à mão contra ${est.premissas.minutos_revisao_por_pergunta} min de revisão; ${est.premissas.minutos_manual_documentar_programa} min para documentar um programa contra ${est.premissas.minutos_revisao_documentacao} min de revisão.</p></div>`;
  $("#tabela-uso tbody").innerHTML = eventos
    .map((e) => `<tr>
      <td class="num">${new Date(e.quando).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" })}</td>
      <td>${esc(estado.usuarios.find((u) => u.id === e.usuario)?.nome ?? e.usuario)}</td>
      <td class="num">${esc(e.fase)}</td>
      <td>${esc(e.tipo)}</td>
      <td>${pilula(e.destino)}</td>
      <td>${esc(listaMascarados(e.mascarados) || "—")}</td>
      <td>${esc(e.fontes.join(", ") || "—")}</td>
      <td class="num">${segundos(e.ms)}</td>
      <td class="motivo">${esc(e.motivos.join("; "))}</td></tr>`)
    .join("") || `<tr><td colspan="9">Nenhum pedido ainda. Faça uma pergunta na primeira aba.</td></tr>`;
}

// ---------- Abas, fase e início ----------
function trocarAba(nome) {
  $$(".abas button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.aba === nome)));
  $$(".aba").forEach((s) => (s.hidden = s.id !== `aba-${nome}`));
  if (nome === "uso") desenharUso();
}
function trocarFase(f) {
  estado.fase = f;
  for (const chave of ["perguntar", "chamado", "legado"]) {
    iniciarRota($(`#rota-${chave}`));
    desenharSaida($(`#saida-${chave}`), null);
    $(`#trilha-${chave}`).innerHTML = "";
  }
  desenharBase();
}

async function iniciar() {
  const e = await fetch("/api/estado").then((x) => x.json());
  Object.assign(estado, e);
  $("#usuario").innerHTML = e.usuarios.map((u) => `<option value="${esc(u.id)}">${esc(u.nome)}, ${esc(u.area)}</option>`).join("");
  const mo = e.modelos;
  $("#modelos").innerHTML = `
    <span class="modelo ${mo.externoDisponivel ? "ok-externo" : "fora"}" title="Modelo externo contratado">
      <strong>Externo</strong> ${mo.externoDisponivel ? esc(mo.externo) : "sem chave configurada"}</span>
    <span class="modelo ${mo.localDisponivel ? "ok-local" : "fora"}" title="Servidor interno (Fase 2)">
      <strong>Interno</strong> ${esc(mo.local)}${mo.localDisponivel ? "" : " indisponível"}</span>
    <span class="modelo ${mo.ollamaAtivo ? "ok-local" : "fora"}" title="Busca semântica, sempre dentro da empresa">
      <strong>Busca</strong> ${esc(mo.embed)} na empresa</span>`;
  $$("input[name=fase]").forEach((r) => r.addEventListener("change", () => trocarFase(r.value)));
  desenharBase();
  montarAbasDeTrabalho();
  await montarQuestionario();
  $$(".abas button").forEach((b) => b.addEventListener("click", () => trocarAba(b.dataset.aba)));
  $("#btn-atualizar-uso").addEventListener("click", desenharUso);
}

iniciar().catch((e) => {
  document.querySelector("main").innerHTML = `<div class="alerta erro">A demo não carregou: ${esc(e.message)}. Confira se o servidor está rodando (npm start).</div>`;
});
