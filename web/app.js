// Tela do app de vôlei. Cache local + sincronização compartilhada (Supabase) com proteção contra edições simultâneas.
// Para usar uma sala separada (ex.: testes): abra o site com ?sala=nome
const SALA = (new URLSearchParams(location.search).get("sala") || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 30);
const KEY = "volei_dados_v1" + (SALA ? "_" + SALA : "");
const SHARED_KEY = "volei_sessao_principal" + (SALA ? "_" + SALA : "");
let supabaseClient = null;
let versaoRemota = null;   // versão que sabemos estar gravada no banco (null = ainda não existe)
let salvandoRemoto = false;
let debounceRemoto = null;
let pendentes = [];        // ações locais ainda não confirmadas no banco (refeitas se houver conflito)
let reaplicando = false;
let salvouNaAcao = false;
let renderAdiado = false;
const NIVEIS = { 1: "Criança", 2: "Normal", 3: "Pro" };
const NOMES = ["Regina", "Raphael", "Bruno", "Isabella", "José", "Ester", "Ana lys", "Ana luísa", "Miguel",
  "Cristiano", "Gabriel Sales", "Mirella", "Thiago", "Sara", "Oséias", "Davi"];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const svg = (p) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const IC = {
  jogo: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3.5 3.5 3.5 14.5 0 18M12 3c-3.5 3.5-3.5 14.5 0 18"/>'),
  times: svg('<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.5 0 4 2 4 5"/>'),
  elenco: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>'),
  stats: svg('<path d="M5 20V10M12 20V4M19 20v-8"/>'),
  ok: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  sobe: svg('<path d="M6 15l6-6 6 6"/>'),
  desce: svg('<path d="M6 9l6 6 6-6"/>'),
};

function novoDados() {
  return {
    jogadores: NOMES.map((n, i) => ({ id: i + 1, nome: n, nivel: 2, status: "waiting", foto: null, presente: true, jogos: 0, vitorias: 0, derrotas: 0 })),
    niveis3: true, amigos: [], espera: [], quadra: null, eventos: [], historico: [], rodaram: [], recorde: 0,
    prox_tid: 0, prox_id: NOMES.length + 1, config: { tamanho: 6, alvo: 11, rotacao: "fair" },
  };
}
function carregar() {
  try { const x = JSON.parse(localStorage.getItem(KEY)); if (x && x.jogadores) return normalizarDados(x); } catch (e) {}
  return normalizarDados(novoDados());
}
function normalizarDados(x) {
  x.jogadores = (x.jogadores || []).map((j) => ({ ...j, status: j.presente === false ? (j.status === "caminho" ? "caminho" : "absent") : "waiting" }));
  Logica.migrarNiveis(x);   // dados antigos: criança + nível 1 a 5 viram um nível só (1 criança, 2 normal, 3 pro)
  x.config = { tamanho: 6, alvo: 11, rotacao: "fair", ...x.config };
  x.amigos = x.amigos || []; x.eventos = x.eventos || []; x.historico = x.historico || []; x.rodaram = x.rodaram || [];
  x.espera = x.espera || (x.fila || []).flatMap((t) => t.base || []);
  delete x.fila;
  if (x.quadra) for (const l of ["a", "b"]) {
    const t = x.quadra[l] || (x.quadra[l] = { tid: 0, base: [], membros: [], extra: [], seq: 0 });
    t.base = t.base || []; t.membros = t.membros || []; t.extra = t.extra || []; t.seq = t.seq || 0;
  }
  Logica.sincronizarEspera(x);
  return x;
}
let D = carregar();

// ---------- virada do dia (meia-noite) ----------
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
function virarDia(forcar = false) {
  if (!D.dias) D.dias = [];
  if (!D.dia) D.dia = hoje();
  if (!forcar && (D.dia === hoje() || D.eventos.length)) return false;   // nao fecha no meio de uma partida
  if (D.historico.length) {
    D.dias.unshift({
      data: D.dia, partidas: D.historico.length, recorde: D.recorde, rodaram: D.rodaram.length,
      ranking: D.jogadores.filter((j) => j.jogos).sort((x, y) => y.vitorias - x.vitorias || x.derrotas - y.derrotas)
        .map((j) => ({ nome: j.nome, jogos: j.jogos, vitorias: j.vitorias, derrotas: j.derrotas })),
      historico: D.historico,
    });
  }
  Object.assign(D, { espera: [], quadra: null, eventos: [], historico: [], rodaram: [], recorde: 0, prox_tid: 0, dia: hoje() });
  D.jogadores.forEach((j) => { j.jogos = j.vitorias = j.derrotas = 0; if (!forcar) j.presente = false; });
  return true;
}
virarDia();
function salvar() {
  salvouNaAcao = true;
  if (reaplicando) return;
  try { localStorage.setItem(KEY, JSON.stringify(D)); }
  catch (e) { toast("Sem espaço para salvar! Faça um backup."); }
  if (supabaseClient) {
    clearTimeout(debounceRemoto);
    debounceRemoto = setTimeout(salvarCompartilhado, 250);
  }
}
function registrar(fn) { if (supabaseClient) pendentes.push(fn); }
function avisoSync(t) {
  ui.sync = t;
  const el = document.getElementById("syncAviso");
  if (el) el.textContent = t;
}
function desenhar() {
  const a = document.activeElement;
  if (a && a.tagName === "INPUT" && !["range", "checkbox", "file"].includes(a.type)) { renderAdiado = true; return; }
  render();
}
document.addEventListener("focusout", () => { if (renderAdiado) { renderAdiado = false; setTimeout(render, 300); } });

// Grava com checagem de versão: se outro celular gravou antes, baixa o estado novo, refaz as ações
// ainda não confirmadas e tenta de novo (as duas mudanças ficam).
async function salvarCompartilhado() {
  if (!supabaseClient) return;
  if (salvandoRemoto) { clearTimeout(debounceRemoto); debounceRemoto = setTimeout(salvarCompartilhado, 300); return; }
  salvandoRemoto = true;
  try {
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const enviados = pendentes.length;
      const nova = (versaoRemota || 0) + 1;
      const copia = JSON.parse(JSON.stringify(D));
      copia._v = nova;
      let ok = false;
      if (versaoRemota === null) {
        const { error } = await supabaseClient.from("volei_estado").insert({ id: SHARED_KEY, dados: copia });
        if (error && error.code !== "23505") throw error;   // 23505 = outro celular criou antes
        ok = !error;
      } else {
        let q = supabaseClient.from("volei_estado").update({ dados: copia, atualizado_em: new Date().toISOString() }).eq("id", SHARED_KEY);
        q = versaoRemota === 0 ? q.is("dados->>_v", null) : q.eq("dados->>_v", String(versaoRemota));
        const { data, error } = await q.select("id");
        if (error) throw error;
        ok = !!(data && data.length);
      }
      if (ok) {
        D._v = nova; versaoRemota = nova; pendentes.splice(0, enviados);
        try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (_) {}
        avisoSync("Sessão compartilhada: tudo sincronizado.");
        break;
      }
      avisoSync("Outro celular mexeu ao mesmo tempo: juntando as mudanças...");
      await puxarRemoto(true);
    }
  } catch (e) {
    console.error(e);
    avisoSync("Sem conexão com o banco: as mudanças ficam neste celular e seguem quando a internet voltar.");
    clearTimeout(debounceRemoto); debounceRemoto = setTimeout(salvarCompartilhado, 8000);
  } finally { salvandoRemoto = false; }
}
async function puxarRemoto(refazer) {
  const { data, error } = await supabaseClient.from("volei_estado").select("dados").eq("id", SHARED_KEY).maybeSingle();
  if (error) throw error;
  if (!data || !data.dados || !data.dados.jogadores) { versaoRemota = null; return false; }
  versaoRemota = Number(data.dados._v || 0);
  const locais = pendentes.slice();
  D = normalizarDados(data.dados);
  if (refazer) {
    reaplicando = true;
    try { for (const f of locais) { try { f(); } catch (e) { console.error(e); } } } finally { reaplicando = false; }
  }
  try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (_) {}
  desenhar();
  return true;
}
// Pergunta só o número da versão (leve); se mudou, baixa tudo. Funciona mesmo sem o Realtime ligado.
async function conferirRemoto() {
  if (!supabaseClient || salvandoRemoto || pendentes.length) return;
  try {
    const { data, error } = await supabaseClient.from("volei_estado").select("v:dados->>_v").eq("id", SHARED_KEY).maybeSingle();
    if (error || !data) return;
    if (Number(data.v || 0) > (versaoRemota || 0)) await puxarRemoto(false);
  } catch (e) { console.error(e); }
}
async function iniciarCompartilhamento() {
  const cfg = window.VOLEI_SUPABASE || {};
  if (!cfg.url || !cfg.anonKey || cfg.url.includes("COLE_AQUI") || cfg.anonKey.includes("COLE_AQUI") || !window.supabase?.createClient) {
    avisoSync("Modo local: configure o Supabase para compartilhar os dados entre celulares.");
    return;
  }
  supabaseClient = window.supabase.createClient(cfg.url, cfg.anonKey);
  try {
    const achou = await puxarRemoto(false);
    if (!achou) await salvarCompartilhado();   // primeiro celular: cria a sessão com o que já tem
    avisoSync("Sessão compartilhada" + (SALA ? " (sala " + SALA + ")" : "") + ": tudo sincronizado.");
    supabaseClient.channel("volei-" + SHARED_KEY)
      .on("postgres_changes", { event: "*", schema: "public", table: "volei_estado", filter: `id=eq.${SHARED_KEY}` }, () => conferirRemoto())
      .subscribe();
    setInterval(conferirRemoto, 4000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") conferirRemoto(); });
  } catch (e) {
    console.error(e);
    avisoSync("Não foi possível conectar ao banco compartilhado. O app segue em modo local.");
  }
}

const ui = { sync: "", andamento: { a: [], b: [], fila: [], pa: 0, pb: 0 }, abrirAnd: false, editando: false, sel: null, edNivel: 0,
  aba: "jogo", rascunho: [], modo: "eq", nManual: 2, manual: [], grupoSel: [], novaFoto: null,
  novoNome: "", novoNivel: 2, editId: null, confirmar: null, festejo: -1, placar: { a: 0, b: 0 }, animar: true };
const P = (id) => D.jogadores.find((j) => j.id === id);
const nome = (id) => (P(id) ? P(id).nome : "?");
const presentes = () => D.jogadores.filter((j) => j.presente);

// ---------- pecas visuais ----------
function avatar(j, t = 38) {
  if (j.foto) return `<img class="av" style="width:${t}px;height:${t}px" src="${j.foto}" alt="">`;
  const h = [...j.nome].reduce((s, c) => s + c.charCodeAt(0), 0) * 37 % 360;
  return `<div class="av" style="width:${t}px;height:${t}px;background:hsl(${h},55%,45%)">${esc(j.nome.slice(0, 1).toUpperCase())}</div>`;
}
function chip(j) {
  const n = Number(j.nivel);
  return n === 1 ? `<span class="chip k">Criança</span>` : n >= 3 ? `<span class="chip p">Pro</span>` : "";
}
function subNivel(j) {
  const n = Number(j.nivel);
  return n === 1 ? '<small class="sub k">criança</small>' : n >= 3 ? '<small class="sub p">pro</small>' : "";
}
function linha(id, emprestado, editavel) {
  const j = P(id); if (!j) return "";
  const ed = editavel ? ` data-act="selp" data-arg="${id}"` : "";
  return `<div class="linha ${editavel && ui.sel === id ? "sel" : ""}"${ed}>${avatar(j)}<span>${esc(j.nome)} ${emprestado ? '<span class="tag">emprestado</span>' : ""}</span>${chip(j)}<span class="nv">${Logica.categoriaNivel(j.nivel)}</span></div>`;
}
function pill(txt, on, act, arg) {
  return `<button class="pill ${on ? "on" : ""}" data-act="${act}" data-arg="${arg}">${esc(txt)}</button>`;
}
function toast(t) {
  const e = document.createElement("div"); e.className = "toast"; e.textContent = t;
  document.body.appendChild(e); setTimeout(() => e.remove(), 2200);
}
function confete() {
  const c = document.getElementById("confete"), x = c.getContext("2d");
  c.width = innerWidth; c.height = innerHeight;
  const cores = ["#2563EB", "#EA580C", "#16A34A", "#FACC15", "#EC4899"];
  const ps = Array.from({ length: 110 }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.5,
    v: 3 + Math.random() * 5, r: 4 + Math.random() * 6, c: cores[Math.floor(Math.random() * cores.length)], d: Math.random() * 6 }));
  let f = 0;
  (function anim() {
    x.clearRect(0, 0, c.width, c.height);
    for (const p of ps) { p.y += p.v; p.x += Math.sin((f + p.d * 10) / 12) * 2; x.fillStyle = p.c; x.fillRect(p.x, p.y, p.r, p.r * 1.6); }
    if (++f < 140) requestAnimationFrame(anim); else x.clearRect(0, 0, c.width, c.height);
  })();
}

// ---------- abas ----------
const mapa = () => Object.fromEntries(D.jogadores.map((j) => [j.id, j]));
function avisosDoTime(ids) {
  const av = Logica.avaliarTime(mapa(), ids, D.config.tamanho).avisos.filter((x) => !x.startsWith("faltam"));
  return av.length ? `<div class="aviso">${av.map(esc).join(" · ")}</div>` : "";
}
function vagasDoTime(t) {
  const falta = D.config.tamanho - t.membros.length;
  return falta > 0 ? `<div class="vaga">${falta} vaga(s) aberta(s)</div>` : "";
}
function listaCompacta(ids) {
  return ids.map((i) => linha(i)).join("") || `<div class="mut">ninguém</div>`;
}
function barraEdicao() {
  if (!ui.editando || !ui.sel || !P(ui.sel)) return "";
  const naFila = (D.espera || []).includes(ui.sel);
  return `<div style="height:110px"></div><div class="barra"><div><b>${esc(nome(ui.sel))}</b> <span class="mut">selecionado. Toque em outra pessoa para trocar de lugar com ela.</span></div>
    <div class="barra-b">${naFila ? `<button class="btn sm" data-act="inicioFila">Para o início da fila</button>` : ""}<button class="btn sm" data-act="saiu">Foi embora</button><button class="btn sm" data-act="soltar">Cancelar</button></div></div>`;
}
function linhaFila(i, n, total) {
  const j = P(i), ed = ui.editando, c = Number(j.nivel);
  return `<div class="linha ${ed && ui.sel === i ? "sel" : ""}"${ed ? ` data-act="selp" data-arg="${i}"` : ""}><b class="pos">${n + 1}</b>${avatar(j, 30)}<span>${esc(j.nome)}</span><span class="nv ${c === 1 ? "k" : c >= 3 ? "p" : ""}">${Logica.categoriaNivel(j.nivel)}</span>${ed
    ? `<span class="setas"><button data-act="subir" data-arg="${i}" aria-label="Subir" ${n === 0 ? "disabled" : ""}>${IC.sobe}</button><button data-act="desce" data-arg="${i}" aria-label="Descer" ${n === total - 1 ? "disabled" : ""}>${IC.desce}</button></span>` : ""}</div>`;
}
function abaJogo() {
  const q = D.quadra;
  if (ui.sel && !P(ui.sel)) ui.sel = null;
  if (!q) return `<div class="card vazio"><div class="big">${IC.jogo}</div><p>Nenhum jogo em andamento.</p>
    <button class="btn pri" data-act="aba" data-arg="times">Montar os times</button>
    <button class="btn" data-act="abrirAnd">Já tem gente jogando? Registrar o jogo</button></div>`;
  const c = Logica.calcular(D.eventos, D.config.alvo);
  const quadrados = ["a", "b"].map((l) => `<div class="quad ${l}"><div class="qt">TIME ${l.toUpperCase()}</div>
    <div class="placar ${c[l] !== ui.placar[l] ? "pop" : ""}">${c[l]}</div>
    <div class="pm"><button class="menos" data-act="menos" data-arg="${l}" ${c[l] ? "" : "disabled"}>−</button>
    <button class="mais" data-act="ponto" data-arg="${l}" ${c.venc ? "disabled" : ""}>+</button></div></div>`).join("");
  ui.placar = { a: c.a, b: c.b };
  let h = `<div class="duo">${quadrados}</div>`;
  if (c.tiro && !c.venc) h += `<div class="tiro">TIRO: precisa de ${c.precisa} pontos seguidos</div>`;
  if (c.venc) {
    h += `<div class="banner">Time ${c.venc.toUpperCase()} venceu por ${c.a} x ${c.b}</div>
      <button class="btn ok grande" data-act="encerrar">Encerrar e chamar o próximo</button>`;
    if (ui.festejo !== D.historico.length) { ui.festejo = D.historico.length; setTimeout(confete, 50); }
  }
  h += `<button class="btn grande" data-act="desfazer" ${D.eventos.length ? "" : "disabled"}>Voltar ponto</button>`;
  const ed = ui.editando;
  h += `<div class="duo">` + ["a", "b"].map((l) => {
    const t = q[l];
    if (!t) return "";
    return `<div class="card time"><div class="th ${l}">Time ${l.toUpperCase()}${t.seq ? `<small>${t.seq} seguida(s)</small>` : ""}</div>
      <div class="mut comp">${esc(Logica.composicao(D, t.membros))}</div>
      ${t.membros.map((i) => linha(i, t.extra.includes(i), ed)).join("")}${vagasDoTime(t)}</div>`;
  }).join("") + `</div>`;
  if (q.a && q.b) {
    const avQ = Logica.diagnosticar(D, [q.a.membros, q.b.membros], ["Time A", "Time B"]).filter((x) => !x.includes(": faltam"));
    if (avQ.length) h += `<div class="aviso">${avQ.map(esc).join("<br>")}</div>`;
  }
  h += `<button class="btn ${ed ? "pri" : ""}" data-act="editarFila">${ed ? "Pronto (sair da edição)" : "Editar times e fila"}</button>`;
  if (ed) h += `<div class="aviso">Toque em uma pessoa (de um time ou da fila) e depois em outra para as duas trocarem de lugar. Na fila, use as setas para subir ou descer. Quem sai de um time é substituído pela fila, sempre com 1 criança por time.</div>`;

  const caminho = D.jogadores.filter((j) => j.status === "caminho");
  if (caminho.length) {
    h += `<div class="card"><b>A caminho (${caminho.length})</b><div class="mut">Quando chegar, toque em "Chegou": a pessoa entra no fim da fila ou ocupa uma vaga aberta.</div>
      ${caminho.map((j) => `<div class="linha">${avatar(j)}<span>${esc(j.nome)}</span><button class="btn sm nv" data-act="chegou" data-arg="${j.id}">Chegou</button></div>`).join("")}</div>`;
  }
  h += `<div class="metrics"><div><b>${D.rodaram.length}</b><span class="mut">times rodaram</span></div>
    <div><b>${D.recorde}</b><span class="mut">maior sequência</span></div><div><b>${D.historico.length}</b><span class="mut">partidas</span></div></div>`;

  const espera = (D.espera || []).filter((i) => P(i));
  const prev = Logica.preverProximo(D);
  if (prev.times.length) {
    const aviso = Logica.diagnosticar(D, prev.times).filter((x) => !x.includes(": faltam"));
    h += `<h2>Próximo confronto <small class="mut">(prévia)</small></h2>`;
    h += `<div class="duo">` + prev.times.map((t, n) => `<div class="card time"><div class="th ${n ? "b" : "a"}">${prev.tipo === "winner" ? "Desafiantes" : "Time " + (n + 1)}<small>${esc(Logica.composicao(D, t))}</small></div>${listaCompacta(t)}</div>`).join("") + `</div>`;
    if (aviso.length) h += `<div class="aviso">${aviso.map(esc).join("<br>")}</div>`;
    h += `<div class="mut">${prev.tipo === "winner" ? "O time que ganhar continua; quem perder vai para o fim da fila." : "Os dois times descansam e saem os próximos da fila."} Cada time leva 1 criança. Para mudar quem entra, use "Editar times e fila".</div>`;
  }
  h += `<h2>Fila de espera (${espera.length})</h2>`;
  h += espera.length ? `<div class="card fila">${espera.map((i, n) => linhaFila(i, n, espera.length)).join("")}</div>`
    : `<div class="mut">Ninguém esperando.</div>`;
  h += barraEdicao();
  return h;
}

function grade(lista, ativo, act, pref = "", neutro = false) {
  return `<div class="grade ${neutro ? "neutro" : ""}">${lista.map((j) => `<button class="cel ${ativo(j) ? "on" : ""} ${act === "presente" && j.status === "caminho" ? "cam" : ""}" data-act="${act}" data-arg="${pref}${j.id}">
    ${avatar(j, 54)}<span>${esc(j.nome)}</span>${act === "presente" && j.status === "caminho" ? '<small class="sub">a caminho</small>' : subNivel(j)}<i class="chk">${IC.ok}</i></button>`).join("")}</div>`;
}
// Igual à grade, mas mostra a ordem em que as pessoas foram tocadas (1, 2, 3...).
function gradeOrdem(lista, ordem, act) {
  return `<div class="grade neutro">${lista.map((j) => { const k = ordem.indexOf(j.id); return `<button class="cel ${k >= 0 ? "on" : ""}" data-act="${act}" data-arg="${j.id}">
    ${avatar(j, 54)}<span>${esc(j.nome)}</span>${subNivel(j)}<i class="chk num">${k >= 0 ? k + 1 : ""}</i></button>`; }).join("")}</div>`;
}

function stepper(rot, val, act, pref = "") {
  return `<div class="card"><div class="mut">${rot}</div><div class="step"><button data-act="${act}" data-arg="${pref}-1">−</button><b>${val}</b><button data-act="${act}" data-arg="${pref}1">+</button></div></div>`;
}

function seletorNivel(nome, atual) {
  return `<div style="margin:10px 0"><div class="seg">${[1, 2, 3].map((n) => `<label><input type="radio" name="${nome}" value="${n}" ${+atual === n ? "checked" : ""}><span>${NIVEIS[n]}</span></label>`).join("")}</div>
    <p class="mut" style="margin:6px 0 0">Criança: cada time recebe 1. Normal: joga de boa. Pro: joga bem; equilibra os times e deixa um time ter 2 crianças.</p></div>`;
}

// "Cheguei e o jogo já estava rolando": quem joga em cada time, placar de agora e a fila na ordem.
function blocoAndamento(pres) {
  const A = ui.andamento;
  const usados = new Set([...A.a, ...A.b]);
  const ok = A.a.length && A.b.length;
  const av = ok ? Logica.diagnosticar(D, [A.a, A.b], ["Time A", "Time B"]) : [];
  const aberto = ui.abrirAnd || usados.size || A.fila.length || A.pa || A.pb;
  const livres = pres.filter((j) => !usados.has(j.id));
  return `<details ${aberto ? "open" : ""} style="margin-top:10px"><summary>O jogo já começou? (cheguei e já tem gente jogando)</summary>
    <p class="mut">Só aparecem as pessoas marcadas em "Quem veio hoje". <b>1.</b> Marque quem está jogando agora em cada time.</p>
    ${["a", "b"].map((l) => `<div class="card"><b>Time ${l.toUpperCase()}</b> <span class="mut">${A[l].length} em quadra</span>
      ${grade(pres.filter((j) => A[l].includes(j.id) || !usados.has(j.id)), (j) => A[l].includes(j.id), "and", l + ":", true)}</div>`).join("")}
    <div class="mut"><b>2.</b> Placar de agora (deixe 0 x 0 se o jogo acabou de começar).</div>
    <div class="row2">${stepper("Time A", A.pa, "andpl", "a:")}${stepper("Time B", A.pb, "andpl", "b:")}</div>
    <div class="card"><b>3. Fila de espera, na ordem</b>
      <p class="mut">Toque nas pessoas na ordem em que estão esperando: o 1 joga depois deste jogo. Quem você não tocar entra no fim da fila. Cada próximo time leva 1 criança, e o app já puxa uma criança da fila quando precisar.</p>
      ${livres.length ? gradeOrdem(livres, A.fila, "fil") : `<div class="mut">Todo mundo já está em quadra.</div>`}
      <button class="btn" style="margin-top:10px" data-act="limparFila" ${A.fila.length ? "" : "disabled"}>Limpar a ordem</button></div>
    ${av.length ? `<div class="aviso">${av.map(esc).join("<br>")}</div>` : ""}
    <button class="btn ok" data-act="registrarAndamento" ${ok ? "" : "disabled"}>Registrar jogo em andamento</button></details>`;
}

function abaTimes() {
  const pres = presentes(), tam = D.config.tamanho;
  const aCaminho = D.jogadores.filter((j) => j.status === "caminho");
  let h = `<div class="topo"><h2>Quem veio hoje</h2><span class="cont"><b>${pres.length}</b> de ${D.jogadores.length}</span></div>
    ${grade(D.jogadores, (j) => j.presente, "presente")}
    <div class="row2" style="margin-top:10px"><button class="btn" data-act="todos" data-arg="1">Marcar todos</button><button class="btn" data-act="todos" data-arg="0">Limpar</button></div>
    <div class="mut">${Math.floor(pres.length / tam)} time(s) completo(s)${pres.length % tam ? ` e 1 incompleto com ${pres.length % tam}` : ""}${aCaminho.length ? ` · ${aCaminho.length} a caminho` : ""}.</div>
    <details ${aCaminho.length ? "open" : ""} style="margin-top:10px"><summary>Quem está a caminho (${aCaminho.length})</summary>
      <p class="mut">Toque em quem avisou que está vindo. Quando a pessoa chegar, toque nela em "Quem veio hoje" (ou em "Chegou" na aba Jogo).</p>
      ${grade(D.jogadores.filter((j) => !j.presente), (j) => j.status === "caminho", "caminho", "", true)}</details>
    ${blocoAndamento(pres)}
    <div class="row2" style="margin-top:10px">${stepper("Jogadores por time", tam, "tam")}${stepper("Pontos da partida", D.config.alvo, "alvo")}</div>
    <div class="card"><b>Rotação após a partida</b><div class="seg" style="margin-top:8px">${[["fair", "Os dois times descansam"], ["winner", "Vencedor permanece"]].map(([k, t]) => `<button class="${(D.config.rotacao || "fair") === k ? "on" : ""}" data-act="rotacao" data-arg="${k}">${t}</button>`).join("")}</div><p class="mut">A fila é de pessoas: o próximo time é montado na hora, respeitando a ordem da fila, as crianças, o equilíbrio e quem quer jogar junto.</p></div>`;
  h += `<details ${ui.grupoSel.length ? "open" : ""}><summary>Quem quer jogar junto (${D.amigos.length})</summary>
    <p class="mut">Toque em 2 ou mais pessoas que preferem ficar no mesmo time. É uma preferência: o equilíbrio e as regras das crianças vêm primeiro.</p>
    ${grade(D.jogadores, (j) => ui.grupoSel.includes(j.id), "gsel", "", true)}
    <button class="btn pri" style="margin-top:10px" data-act="juntar" ${ui.grupoSel.length < 2 ? "disabled" : ""}>Juntar grupo (${ui.grupoSel.length})</button>
    ${D.amigos.map((g, i) => `<div class="linha"><span>${g.map((p) => `<b>${esc(nome(p))}</b>`).join(" + ")}</span><button class="btn sm nv" data-act="desjuntar" data-arg="${i}">Desfazer</button></div>`).join("")}</details>`;

  h += `<h2>Como montar</h2><div class="seg">${[["eq", "Equilibrado"], ["puro", "Sorteio"], ["mao", "À mão"]].map(([k, t]) => `<button class="${ui.modo === k ? "on" : ""}" data-act="modo" data-arg="${k}">${t}</button>`).join("")}</div>`;
  let times;
  if (ui.modo === "mao") {
    while (ui.manual.length < ui.nManual) ui.manual.push([]);
    ui.manual.length = ui.nManual;
    const usados = new Set(ui.manual.flat());
    h += `<div style="margin-top:10px">${stepper("Quantos times", ui.nManual, "nman")}</div>`;
    times = ui.manual.map((t) => t.filter((i) => P(i) && P(i).presente));
    h += times.map((t, n) => `<div class="card"><b>Time ${n + 1}</b> <span class="mut">${t.length} escolhido(s)</span>
      ${grade(pres.filter((j) => t.includes(j.id) || !usados.has(j.id)), (j) => t.includes(j.id), "man", n + ":", true)}${avisosDoTime(t)}</div>`).join("");
    times = times.filter((t) => t.length);
  } else {
    h += `<button class="btn" style="margin-top:10px" data-act="gerar">Sortear de novo</button>`;
    times = ui.rascunho.map((t) => t.filter((i) => P(i) && P(i).presente)).filter((t) => t.length);
    h += times.map((t, n) => `<div class="card"><b>${n < 2 ? "Time " + (n + 1) + " (em quadra)" : "Fila"}</b> <span class="mut">${esc(Logica.composicao(D, t))}${t.length < tam ? ` · faltam ${tam - t.length} (completa com a fila)` : ""}</span>
      <div style="margin-top:6px">${t.map((i) => linha(i)).join("")}</div>${avisosDoTime(t)}</div>`).join("");
  }
  if (times.length >= 2) {
    const avisos = Logica.diagnosticar(D, times.slice(0, 2));
    if (avisos.length) h += `<div class="aviso"><b>Atenção:</b><br>${avisos.map(esc).join("<br>")}</div>`;
    if (D.quadra) h += `<div class="mut">Atenção: começar de novo substitui o jogo atual (as estatísticas ficam).</div>`;
    ui.pronto = times;
    h += `<button class="btn ok grande" data-act="comecar">${avisos.length ? "Começar mesmo assim" : "Começar jogos"}</button>`;
  }
  return h;
}

function abaElenco() {
  let h = `<h2>Novo jogador</h2><div class="card">
    <input type="text" id="novoNome" placeholder="Nome" value="${esc(ui.novoNome)}">
    ${seletorNivel("novoNivel", ui.novoNivel)}
    <div style="display:flex;align-items:center;gap:12px">${ui.novaFoto ? `<img class="foto-prev" src="${ui.novaFoto}">` : ""}
    <div style="flex:1"><label class="btn">Tirar foto<input type="file" accept="image/*" capture="user" hidden data-foto="novo"></label>
    <label class="btn">Escolher da galeria<input type="file" accept="image/*" hidden data-foto="novo"></label></div></div>
    <button class="btn pri" data-act="add">Adicionar</button></div>
    <h2>Jogadores (${D.jogadores.length})</h2>`;
  h += D.jogadores.map((j) => {
    if (ui.editId !== j.id)
      return `<div class="linha" data-act="editar" data-arg="${j.id}" style="cursor:pointer">${avatar(j, 44)}<b>${esc(j.nome)}</b><span class="nv">${Logica.categoriaNivel(j.nivel)} · editar</span></div>`;
    return `<div class="card"><div style="text-align:center">${avatar(j, 90)}</div>
      <input type="text" id="edNome" value="${esc(j.nome)}" style="margin-top:10px">
      ${seletorNivel("edNivel", ui.edNivel || j.nivel)}
      <div class="row2"><label class="btn">Tirar foto<input type="file" accept="image/*" capture="user" hidden data-foto="${j.id}"></label>
      <label class="btn">Galeria<input type="file" accept="image/*" hidden data-foto="${j.id}"></label></div>
      <div class="row2"><button class="btn" data-act="girar" data-arg="${j.id}" ${j.foto ? "" : "disabled"}>Girar foto</button>
      <button class="btn" data-act="semfoto" data-arg="${j.id}" ${j.foto ? "" : "disabled"}>Remover foto</button></div>
      <div class="row2"><button class="btn pri" data-act="salvarEd" data-arg="${j.id}">Salvar</button>
      <button class="btn bad" data-act="excluir" data-arg="${j.id}">Excluir</button></div>
      <button class="btn" data-act="editar" data-arg="0">Fechar</button></div>`;
  }).join("");
  return h;
}

function abaStats() {
  const rank = [...D.jogadores].sort((a, b) => b.vitorias - a.vitorias || a.derrotas - b.derrotas);
  let h = `<h2>Ranking</h2><div class="card"><table><tr><th>Nome</th><th>J</th><th>V</th><th>D</th><th>%</th></tr>
    ${rank.map((j) => `<tr><td>${esc(j.nome)}</td><td>${j.jogos}</td><td>${j.vitorias}</td><td>${j.derrotas}</td><td>${j.jogos ? Math.round((j.vitorias / j.jogos) * 100) + "%" : "-"}</td></tr>`).join("")}</table></div>
    <h2>Histórico</h2>`;
  h += D.historico.length ? [...D.historico].reverse().map((x) => `<div class="card"><b>${x.placar}</b> · ${x.vencedor.map(esc).join(", ")} venceu (${x.seq}ª seguida)<div class="mut">contra ${x.perdedor.map(esc).join(", ")}</div></div>`).join("")
    : `<div class="mut">Nenhuma partida ainda.</div>`;
  if ((D.dias || []).length) {
    h += `<h2>Dias anteriores</h2>` + D.dias.map((d) => {
      const [y, m, dd] = d.data.split("-");
      const top = d.ranking[0];
      return `<details><summary>${dd}/${m}/${y} · ${d.partidas} partida(s)</summary>
        <div class="mut">${d.rodaram} times rodaram · maior sequência ${d.recorde}${top ? ` · destaque: ${esc(top.nome)} (${top.vitorias}V)` : ""}</div>
        <table><tr><th>Nome</th><th>J</th><th>V</th><th>D</th></tr>${d.ranking.map((j) => `<tr><td>${esc(j.nome)}</td><td>${j.jogos}</td><td>${j.vitorias}</td><td>${j.derrotas}</td></tr>`).join("")}</table></details>`;
    }).join("");
  }
  h += `<h2>Dados</h2><button class="btn" data-act="backup">Salvar backup</button>
    <label class="btn">Restaurar backup<input type="file" accept=".json,application/json" hidden data-restaurar="1"></label>
    <button class="btn bad" data-act="pedirZerar">Zerar o dia</button>`;
  return h;
}

// ---------- desenho ----------
const ABAS = [["jogo", IC.jogo, "Jogo"], ["times", IC.times, "Times"], ["elenco", IC.elenco, "Elenco"], ["stats", IC.stats, "Stats"]];
function render() {
  const f = { jogo: abaJogo, times: abaTimes, elenco: abaElenco, stats: abaStats }[ui.aba];
  const app = document.getElementById("app");
  const y = scrollY;
  app.className = ui.animar ? "animar" : "";
  app.innerHTML = `<div id="syncAviso" class="mut" style="font-size:.75rem;margin-bottom:8px">${esc(ui.sync || "")}</div>` + f() + (ui.confirmar ? `<div class="modal"><div><h2 style="margin-top:0">${esc(ui.confirmar.titulo)}</h2><p>${esc(ui.confirmar.texto)}</p>
    <button class="btn bad" data-act="confirmarSim">${esc(ui.confirmar.botao)}</button><button class="btn" data-act="confirmarNao">Cancelar</button></div></div>` : "");
  document.getElementById("nav").innerHTML = ABAS.map(([k, i, t]) => `<button class="${ui.aba === k ? "on" : ""}" data-act="aba" data-arg="${k}"><span>${i}</span>${t}</button>`).join("");
  ui.animar = false;
  scrollTo(0, y);
}
function mudar(animar) { salvar(); ui.animar = !!animar; render(); }

// ---------- acoes ----------
const acoes = {
  aba: (a) => { ui.aba = a; ui.animar = true; ui.editId = null; ui.editando = false; ui.sel = null; ui.abrirAnd = false; render(); scrollTo(0, 0); if (a === "jogo") manterTelaLigada(); },
  ponto: (l) => { if (Logica.calcular(D.eventos, D.config.alvo).venc) return; D.eventos.push(l); navigator.vibrate && navigator.vibrate(30); mudar(); },
  menos: (l) => { const i = D.eventos.lastIndexOf(l); if (i >= 0) { D.eventos.splice(i, 1); mudar(); } },
  desfazer: () => { D.eventos.pop(); mudar(); },
  encerrar: () => { Logica.finalizar(D); mudar(true); },
  presente: (id) => { const j = P(+id); if (!j) return; Logica.definirPresenca(D, j.id, j.presente ? "ausente" : "presente"); mudar(); },
  caminho: (id) => { const j = P(+id); if (!j || j.presente) return; Logica.definirPresenca(D, j.id, j.status === "caminho" ? "ausente" : "caminho"); mudar(); },
  chegou: (id) => { const j = P(+id); if (!j) return; Logica.definirPresenca(D, j.id, "presente"); mudar(true); toast(`${j.nome} chegou!`); },
  todos: (v) => { D.jogadores.forEach((j) => Logica.definirPresenca(D, j.id, v === "1" ? "presente" : "ausente")); mudar(); },
  tam: (d) => { D.config.tamanho = Math.min(6, Math.max(2, D.config.tamanho + +d)); Logica.preencherVagas(D); mudar(); },
  alvo: (d) => { D.config.alvo = Math.min(25, Math.max(5, D.config.alvo + +d)); mudar(); },
  rotacao: (m) => { D.config.rotacao = m; mudar(); },
  gsel: (id) => { id = +id; const i = ui.grupoSel.indexOf(id); i < 0 ? ui.grupoSel.push(id) : ui.grupoSel.splice(i, 1); render(); },
  juntar: () => {
    const g = [...ui.grupoSel]; if (g.length < 2) return;
    const fn = () => { D.amigos.push(g.filter((i) => P(i))); };
    fn(); ui.grupoSel = []; mudar(); return fn;
  },
  desjuntar: (i) => { D.amigos.splice(+i, 1); mudar(); },
  modo: (m) => { ui.modo = m; render(); },
  nman: (d) => { ui.nManual = Math.min(8, Math.max(2, ui.nManual + +d)); render(); },
  man: (arg) => {
    const [n, id] = arg.split(":").map(Number), t = ui.manual[n], i = t.indexOf(id);
    i < 0 ? t.push(id) : t.splice(i, 1); render();
  },
  and: (arg) => {
    const [l, id] = arg.split(":"), t = ui.andamento[l], n = +id, i = t.indexOf(n);
    i < 0 ? t.push(n) : t.splice(i, 1); render();
  },
  abrirAnd: () => { ui.aba = "times"; ui.abrirAnd = true; ui.animar = true; render(); scrollTo(0, 0); },
  andpl: (arg) => {
    const [l, d] = arg.split(":"), k = l === "a" ? "pa" : "pb";
    ui.andamento[k] = Math.min(Math.max(1, D.config.alvo - 1), Math.max(0, ui.andamento[k] + +d)); render();
  },
  fil: (id) => { const f = ui.andamento.fila, n = +id, i = f.indexOf(n); i < 0 ? f.push(n) : f.splice(i, 1); render(); },
  limparFila: () => { ui.andamento.fila = []; render(); },
  // Edição da quadra e da fila (tocar numa pessoa e depois em outra troca as duas de lugar).
  editarFila: () => { ui.editando = !ui.editando; ui.sel = null; render(); },
  selp: (id) => {
    id = +id;
    if (!ui.sel) { ui.sel = id; render(); return; }
    if (ui.sel === id) { ui.sel = null; render(); return; }
    const x = ui.sel, y = id;
    ui.sel = null;
    if (!Logica.trocarPessoas(D, x, y)) { render(); return; }
    mudar(); toast(`${nome(x)} e ${nome(y)} trocaram de lugar`);
    return () => { Logica.trocarPessoas(D, x, y); };
  },
  subir: (id) => { const fn = () => { Logica.moverNaFila(D, +id, -1); }; fn(); mudar(); return fn; },
  desce: (id) => { const fn = () => { Logica.moverNaFila(D, +id, 1); }; fn(); mudar(); return fn; },
  inicioFila: () => {
    const x = ui.sel; if (!x) return;
    const fn = () => { Logica.moverNaFila(D, x, "inicio"); };
    fn(); ui.sel = null; mudar(); toast(`${nome(x)} é o próximo da fila`); return fn;
  },
  saiu: () => {
    const x = ui.sel; if (!x) return;
    const fn = () => { Logica.definirPresenca(D, x, "ausente"); };
    const n = nome(x);
    fn(); ui.sel = null; mudar(); toast(`${n} saiu`); return fn;
  },
  soltar: () => { ui.sel = null; render(); },
  registrarAndamento: () => {
    const { a: ta, b: tb, fila, pa, pb } = ui.andamento;
    const fn = () => { Logica.iniciarEmAndamento(D, ta, tb, fila, { a: pa, b: pb }); };
    fn(); ui.andamento = { a: [], b: [], fila: [], pa: 0, pb: 0 }; ui.abrirAnd = false; ui.aba = "jogo"; ui.placar = { a: 0, b: 0 };
    mudar(true); scrollTo(0, 0); manterTelaLigada(); toast("Jogo registrado!"); return fn;
  },
  gerar: () => { ui.rascunho = Logica.gerarConfrontos(presentes(), D.amigos, D.config.tamanho, ui.modo === "eq"); ui.animar = true; render(); },
  comecar: () => {
    const times = ui.pronto.map((t) => [...t]);
    const avisos = Logica.diagnosticar(D, times.slice(0, 2));
    const fn = () => { Logica.iniciar(D, times); };
    const depois = () => { ui.rascunho = []; ui.manual = []; ui.aba = "jogo"; ui.placar = { a: 0, b: 0 }; };
    if (avisos.length) {
      ui.confirmar = { titulo: "Começar mesmo assim?", texto: avisos.join(" • "), botao: "Começar mesmo assim", fn: () => { fn(); depois(); } };
      render(); return;
    }
    fn(); depois(); mudar(true); scrollTo(0, 0); manterTelaLigada(); return fn;
  },
  add: () => {
    const n = (document.getElementById("novoNome").value || "").trim();
    if (!n) return toast("Digite o nome.");
    if (D.jogadores.some((j) => j.nome.toLowerCase() === n.toLowerCase())) return toast("Já existe alguém com esse nome.");
    const nivel = ui.novoNivel, foto = ui.novaFoto;
    const fn = () => {
      if (D.jogadores.some((j) => j.nome.toLowerCase() === n.toLowerCase())) return;
      D.jogadores.push({ id: D.prox_id++, nome: n, nivel, status: "waiting", foto, presente: true, jogos: 0, vitorias: 0, derrotas: 0 });
      Logica.sincronizarEspera(D); Logica.preencherVagas(D);
    };
    fn(); ui.novoNome = ""; ui.novaFoto = null; ui.novoNivel = 2; mudar(true); toast("Jogador adicionado!"); return fn;
  },
  editar: (id) => { ui.editId = +id || null; ui.edNivel = (P(+id) || {}).nivel || 0; ui.animar = true; render(); },
  salvarEd: (id) => {
    const nomeNovo = document.getElementById("edNome").value.trim();
    const nivel = +(document.querySelector('input[name="edNivel"]:checked')?.value || ui.edNivel || 2);
    const fn = () => { const j = P(+id); if (!j) return; if (nomeNovo) j.nome = nomeNovo; j.nivel = nivel; };
    fn(); ui.editId = null; mudar(); toast("Salvo!"); return fn;
  },
  girar: (id) => { rotacionar(P(+id)); },
  semfoto: (id) => { const j = P(+id); if (j) j.foto = null; mudar(); },
  excluir: (id) => {
    ui.confirmar = { titulo: "Excluir jogador?", texto: `Tirar ${nome(+id)} do elenco?`, botao: "Excluir", fn: () => { Logica.removerJogador(D, +id); ui.editId = null; } };
    render();
  },
  pedirZerar: () => {
    ui.confirmar = { titulo: "Zerar o dia?", texto: "Apaga os jogos e as estatísticas de hoje. Jogadores e fotos ficam.", botao: "Sim, zerar tudo",
      fn: () => { D.eventos = []; virarDia(true); } };
    render();
  },
  confirmarSim: () => { const f = ui.confirmar.fn; ui.confirmar = null; f(); mudar(true); return f; },
  confirmarNao: () => { ui.confirmar = null; render(); },
  backup: () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(D)], { type: "application/json" }));
    a.download = "volei-backup.json"; a.click();
  },
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el || !acoes[el.dataset.act]) return;
  const nomeAcao = el.dataset.act, arg = el.dataset.arg;
  salvouNaAcao = false;
  const refazer = acoes[nomeAcao](arg);
  // Ações que gravaram dados ficam "pendentes" até o banco confirmar; em caso de conflito são refeitas.
  if (salvouNaAcao && supabaseClient) pendentes.push(typeof refazer === "function" ? refazer : () => acoes[nomeAcao](arg));
});
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.id === "novoNome") ui.novoNome = t.value;
});
document.addEventListener("change", async (e) => {
  const t = e.target;
  if (t.name === "novoNivel") ui.novoNivel = +t.value;
  if (t.name === "edNivel") ui.edNivel = +t.value;
  if (t.dataset.foto && t.files[0]) {
    const url = await processarFoto(t.files[0]);
    if (t.dataset.foto === "novo") ui.novaFoto = url;
    else {
      const j = P(+t.dataset.foto), n = document.getElementById("edNome");
      if (n && n.value.trim()) j.nome = n.value.trim();
      if (ui.edNivel) j.nivel = ui.edNivel;
      j.foto = url; salvar(); const idj = j.id; registrar(() => { const jj = P(idj); if (jj) jj.foto = url; });
    }
    render();
  }
  if (t.dataset.restaurar && t.files[0]) {
    try {
      const x = JSON.parse(await t.files[0].text());
      if (!x.jogadores) throw 0;
      const novo = normalizarDados(x); const refazer = () => { D = normalizarDados(JSON.parse(JSON.stringify(novo))); }; refazer(); ui.rascunho = []; mudar(true); registrar(refazer); toast("Backup restaurado!");
    } catch (err) { toast("Arquivo inválido."); }
  }
});

// ---------- fotos ----------
async function processarFoto(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const c = document.createElement("canvas"); c.width = c.height = 200;
  const s = Math.min(bmp.width, bmp.height);
  c.getContext("2d").drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, 200, 200);
  return c.toDataURL("image/jpeg", 0.8);
}
function rotacionar(j) {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas"); c.width = c.height = 200;
    const x = c.getContext("2d"); x.translate(100, 100); x.rotate(Math.PI / 2); x.drawImage(img, -100, -100);
    const nova = c.toDataURL("image/jpeg", 0.8); j.foto = nova; mudar(); const idj = j.id; registrar(() => { const jj = P(idj); if (jj) jj.foto = nova; });
  };
  img.src = j.foto;
}

// ---------- tela ligada durante o jogo ----------
let trava = null;
async function manterTelaLigada() {
  try { if ("wakeLock" in navigator && !trava) { trava = await navigator.wakeLock.request("screen"); trava.addEventListener("release", () => (trava = null)); } } catch (e) {}
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && D.quadra) manterTelaLigada(); });

function checarDia() {
  if (virarDia()) { ui.rascunho = []; ui.manual = []; mudar(true); toast("Novo dia: os resultados de ontem foram salvos."); }
}
setInterval(checarDia, 60000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checarDia(); });

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
render();

// Inicializa sincronização compartilhada depois da primeira renderização local.
iniciarCompartilhamento();
