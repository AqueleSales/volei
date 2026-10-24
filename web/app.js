// Tela do app de volei. Tudo fica salvo no proprio celular (localStorage).
const KEY = "volei_dados_v1";
const NIVEIS = { 1: "Iniciante / precisa de ajuda", 2: "Joga pouco", 3: "Medio", 4: "Joga bem", 5: "Craque" };
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
};

function novoDados() {
  return {
    jogadores: NOMES.map((n, i) => ({ id: i + 1, nome: n, nivel: 3, foto: null, presente: true, jogos: 0, vitorias: 0, derrotas: 0 })),
    amigos: [], fila: [], quadra: null, eventos: [], historico: [], rodaram: [], recorde: 0,
    prox_tid: 0, prox_id: NOMES.length + 1, config: { tamanho: 6, alvo: 11 },
  };
}
function carregar() {
  try { const x = JSON.parse(localStorage.getItem(KEY)); if (x && x.jogadores) return x; } catch (e) {}
  return novoDados();
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
  Object.assign(D, { fila: [], quadra: null, eventos: [], historico: [], rodaram: [], recorde: 0, prox_tid: 0, dia: hoje() });
  D.jogadores.forEach((j) => { j.jogos = j.vitorias = j.derrotas = 0; if (!forcar) j.presente = false; });
  return true;
}
virarDia();
function salvar() {
  try { localStorage.setItem(KEY, JSON.stringify(D)); }
  catch (e) { toast("Sem espaço para salvar! Faça um backup."); }
}

const ui = { aba: "jogo", rascunho: [], modo: "eq", nManual: 2, manual: [], grupoSel: [], novaFoto: null,
  novoNome: "", novoNivel: 3, editId: null, confirmar: null, festejo: -1, placar: { a: 0, b: 0 }, animar: true };
const P = (id) => D.jogadores.find((j) => j.id === id);
const nome = (id) => (P(id) ? P(id).nome : "?");
const presentes = () => D.jogadores.filter((j) => j.presente);

// ---------- pecas visuais ----------
function avatar(j, t = 38) {
  if (j.foto) return `<img class="av" style="width:${t}px;height:${t}px" src="${j.foto}" alt="">`;
  const h = [...j.nome].reduce((s, c) => s + c.charCodeAt(0), 0) * 37 % 360;
  return `<div class="av" style="width:${t}px;height:${t}px;background:hsl(${h},55%,45%)">${esc(j.nome.slice(0, 1).toUpperCase())}</div>`;
}
function linha(id, emprestado) {
  const j = P(id); if (!j) return "";
  return `<div class="linha">${avatar(j)}<span>${esc(j.nome)} ${emprestado ? '<span class="tag">emprestado</span>' : ""}</span><span class="nv">nível ${j.nivel}</span></div>`;
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
function abaJogo() {
  const q = D.quadra;
  if (!q) return `<div class="card vazio"><div class="big">${IC.jogo}</div><p>Nenhum jogo em andamento.</p>
    <button class="btn pri" data-act="aba" data-arg="times">Montar os times</button></div>`;
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
  h += `<div class="duo">` + ["a", "b"].map((l) => {
    const t = q[l];
    return `<div class="card time"><div class="th ${l}">Time ${l.toUpperCase()}${t.seq ? `<small>${t.seq} seguida(s)</small>` : ""}</div>
      ${t.membros.map((i) => linha(i, t.extra.includes(i))).join("")}</div>`;
  }).join("") + `</div>`;
  h += `<div class="metrics"><div><b>${D.rodaram.length}</b><span class="mut">times rodaram</span></div>
    <div><b>${D.recorde}</b><span class="mut">maior sequência</span></div><div><b>${D.historico.length}</b><span class="mut">partidas</span></div></div>`;
  if (D.fila.length) {
    const emQuadra = new Set([...q.a.membros, ...q.b.membros]), am = Logica.pares(D.amigos);
    h += `<h2>Fila</h2>` + D.fila.map((t, n) => {
      const falta = D.config.tamanho - t.base.length;
      const dicas = t.base.flatMap((i) => [...emQuadra].filter((o) => am.has(Logica.par(i, o)))
        .map((o) => `<div class="mut">${esc(nome(i))} quer jogar com ${esc(nome(o))} (em quadra agora)</div>`)).join("");
      return `<details ${n === 0 ? "open" : ""}><summary>Próximo ${n + 1}${falta > 0 ? ` · faltam ${falta}` : ""}</summary>
        ${falta > 0 ? '<div class="mut">Time quebrado: completa na hora com quem jogou menos (amigos primeiro).</div>' : ""}
        ${t.base.map((i) => linha(i)).join("")}${dicas}</details>`;
    }).join("");
  }
  return h;
}

function grade(lista, ativo, act, pref = "", neutro = false) {
  return `<div class="grade ${neutro ? "neutro" : ""}">${lista.map((j) => `<button class="cel ${ativo(j) ? "on" : ""}" data-act="${act}" data-arg="${pref}${j.id}">
    ${avatar(j, 54)}<span>${esc(j.nome)}</span><i class="chk">${IC.ok}</i></button>`).join("")}</div>`;
}

function stepper(rot, val, act) {
  return `<div class="card"><div class="mut">${rot}</div><div class="step"><button data-act="${act}" data-arg="-1">−</button><b>${val}</b><button data-act="${act}" data-arg="1">+</button></div></div>`;
}

function abaTimes() {
  const pres = presentes(), tam = D.config.tamanho;
  let h = `<div class="topo"><h2>Quem veio hoje</h2><span class="cont"><b>${pres.length}</b> de ${D.jogadores.length}</span></div>
    ${grade(D.jogadores, (j) => j.presente, "presente")}
    <div class="row2" style="margin-top:10px"><button class="btn" data-act="todos" data-arg="1">Marcar todos</button><button class="btn" data-act="todos" data-arg="0">Limpar</button></div>
    <div class="mut">${Math.floor(pres.length / tam)} time(s) completo(s)${pres.length % tam ? ` e 1 incompleto com ${pres.length % tam}` : ""}.</div>
    <div class="row2" style="margin-top:10px">${stepper("Jogadores por time", tam, "tam")}${stepper("Pontos da partida", D.config.alvo, "alvo")}</div>`;
  h += `<details ${ui.grupoSel.length ? "open" : ""}><summary>Quem quer jogar junto (${D.amigos.length})</summary>
    <p class="mut">Toque em 2 ou mais pessoas que querem ficar no mesmo time. Pode ser um time fechado inteiro.</p>
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
      ${grade(pres.filter((j) => t.includes(j.id) || !usados.has(j.id)), (j) => t.includes(j.id), "man", n + ":", true)}</div>`).join("");
    times = times.filter((t) => t.length);
  } else {
    h += `<button class="btn" style="margin-top:10px" data-act="gerar">Sortear de novo</button>`;
    times = ui.rascunho.map((t) => t.filter((i) => P(i) && P(i).presente)).filter((t) => t.length);
    h += times.map((t, n) => `<div class="card"><b>Time ${n + 1}</b> <span class="mut">nível médio ${Logica.mediaNivel(D, t).toFixed(1)}${t.length < tam ? ` · faltam ${tam - t.length} (completa na hora)` : ""}</span>
      <div style="margin-top:6px">${t.map((i) => linha(i)).join("")}</div></div>`).join("");
  }
  if (times.length >= 2) {
    if (D.quadra) h += `<div class="mut">Atenção: começar de novo substitui o jogo atual (as estatísticas ficam).</div>`;
    ui.pronto = times;
    h += `<button class="btn ok grande" data-act="comecar">Começar jogos</button>`;
  }
  return h;
}

function abaElenco() {
  let h = `<h2>Novo jogador</h2><div class="card">
    <input type="text" id="novoNome" placeholder="Nome" value="${esc(ui.novoNome)}">
    <div style="margin:10px 0"><span class="mut">Nível: </span><b id="novoNivelTxt">${ui.novoNivel} - ${NIVEIS[ui.novoNivel]}</b>
    <input type="range" min="1" max="5" value="${ui.novoNivel}" data-live="novoNivel"></div>
    <div style="display:flex;align-items:center;gap:12px">${ui.novaFoto ? `<img class="foto-prev" src="${ui.novaFoto}">` : ""}
    <div style="flex:1"><label class="btn">Tirar foto<input type="file" accept="image/*" capture="user" hidden data-foto="novo"></label>
    <label class="btn">Escolher da galeria<input type="file" accept="image/*" hidden data-foto="novo"></label></div></div>
    <button class="btn pri" data-act="add">Adicionar</button></div>
    <h2>Jogadores (${D.jogadores.length})</h2>`;
  h += D.jogadores.map((j) => {
    if (ui.editId !== j.id)
      return `<div class="linha" data-act="editar" data-arg="${j.id}" style="cursor:pointer">${avatar(j, 44)}<b>${esc(j.nome)}</b><span class="nv">nível ${j.nivel} · editar</span></div>`;
    return `<div class="card"><div style="text-align:center">${avatar(j, 90)}</div>
      <input type="text" id="edNome" value="${esc(j.nome)}" style="margin-top:10px">
      <div style="margin:10px 0"><span class="mut">Nível: </span><b id="edNivelTxt">${j.nivel} - ${NIVEIS[j.nivel]}</b>
      <input type="range" id="edNivel" min="1" max="5" value="${j.nivel}" data-live="edNivel"></div>
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
  app.innerHTML = f() + (ui.confirmar ? `<div class="modal"><div><h2 style="margin-top:0">${esc(ui.confirmar.titulo)}</h2><p>${esc(ui.confirmar.texto)}</p>
    <button class="btn bad" data-act="confirmarSim">${esc(ui.confirmar.botao)}</button><button class="btn" data-act="confirmarNao">Cancelar</button></div></div>` : "");
  document.getElementById("nav").innerHTML = ABAS.map(([k, i, t]) => `<button class="${ui.aba === k ? "on" : ""}" data-act="aba" data-arg="${k}"><span>${i}</span>${t}</button>`).join("");
  ui.animar = false;
  scrollTo(0, y);
}
function mudar(animar) { salvar(); ui.animar = !!animar; render(); }

// ---------- acoes ----------
const acoes = {
  aba: (a) => { ui.aba = a; ui.animar = true; ui.editId = null; render(); scrollTo(0, 0); if (a === "jogo") manterTelaLigada(); },
  ponto: (l) => { if (Logica.calcular(D.eventos, D.config.alvo).venc) return; D.eventos.push(l); navigator.vibrate && navigator.vibrate(30); mudar(); },
  menos: (l) => { const i = D.eventos.lastIndexOf(l); if (i >= 0) { D.eventos.splice(i, 1); mudar(); } },
  desfazer: () => { D.eventos.pop(); mudar(); },
  encerrar: () => { Logica.finalizar(D); mudar(true); },
  presente: (id) => { const j = P(+id); j.presente = !j.presente; mudar(); },
  todos: (v) => { D.jogadores.forEach((j) => (j.presente = v === "1")); mudar(); },
  tam: (d) => { D.config.tamanho = Math.min(6, Math.max(2, D.config.tamanho + +d)); mudar(); },
  alvo: (d) => { D.config.alvo = Math.min(25, Math.max(5, D.config.alvo + +d)); mudar(); },
  gsel: (id) => { id = +id; const i = ui.grupoSel.indexOf(id); i < 0 ? ui.grupoSel.push(id) : ui.grupoSel.splice(i, 1); render(); },
  juntar: () => { D.amigos.push([...ui.grupoSel]); ui.grupoSel = []; mudar(); },
  desjuntar: (i) => { D.amigos.splice(+i, 1); mudar(); },
  modo: (m) => { ui.modo = m; render(); },
  nman: (d) => { ui.nManual = Math.min(8, Math.max(2, ui.nManual + +d)); render(); },
  man: (arg) => {
    const [n, id] = arg.split(":").map(Number), t = ui.manual[n], i = t.indexOf(id);
    i < 0 ? t.push(id) : t.splice(i, 1); render();
  },
  gerar: () => { ui.rascunho = Logica.formarTimes(presentes(), D.amigos, D.config.tamanho, ui.modo === "eq"); ui.animar = true; render(); },
  comecar: () => {
    if (!Logica.iniciar(D, ui.pronto)) return;
    ui.rascunho = []; ui.manual = []; ui.aba = "jogo"; ui.placar = { a: 0, b: 0 }; mudar(true); scrollTo(0, 0); manterTelaLigada();
  },
  add: () => {
    const n = (document.getElementById("novoNome").value || "").trim();
    if (!n) return toast("Digite o nome.");
    if (D.jogadores.some((j) => j.nome.toLowerCase() === n.toLowerCase())) return toast("Já existe alguém com esse nome.");
    D.jogadores.push({ id: D.prox_id++, nome: n, nivel: ui.novoNivel, foto: ui.novaFoto, presente: true, jogos: 0, vitorias: 0, derrotas: 0 });
    ui.novoNome = ""; ui.novaFoto = null; ui.novoNivel = 3; mudar(true); toast("Jogador adicionado!");
  },
  editar: (id) => { ui.editId = +id || null; ui.animar = true; render(); },
  salvarEd: (id) => {
    const j = P(+id), n = document.getElementById("edNome").value.trim();
    if (n) j.nome = n;
    j.nivel = +document.getElementById("edNivel").value;
    ui.editId = null; mudar(); toast("Salvo!");
  },
  girar: (id) => { rotacionar(P(+id)); },
  semfoto: (id) => { P(+id).foto = null; mudar(); },
  excluir: (id) => {
    ui.confirmar = { titulo: "Excluir jogador?", texto: `Tirar ${nome(+id)} do elenco?`, botao: "Excluir", fn: () => { Logica.removerJogador(D, +id); ui.editId = null; } };
    render();
  },
  pedirZerar: () => {
    ui.confirmar = { titulo: "Zerar o dia?", texto: "Apaga os jogos e as estatísticas de hoje. Jogadores e fotos ficam.", botao: "Sim, zerar tudo",
      fn: () => { D.eventos = []; virarDia(true); } };
    render();
  },
  confirmarSim: () => { const f = ui.confirmar.fn; ui.confirmar = null; f(); mudar(true); },
  confirmarNao: () => { ui.confirmar = null; render(); },
  backup: () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(D)], { type: "application/json" }));
    a.download = "volei-backup.json"; a.click();
  },
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (el && acoes[el.dataset.act]) acoes[el.dataset.act](el.dataset.arg);
});
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.id === "novoNome") ui.novoNome = t.value;
  if (t.dataset.live) {
    const v = +t.value;
    if (t.dataset.live === "novoNivel") { ui.novoNivel = v; document.getElementById("novoNivelTxt").textContent = `${v} - ${NIVEIS[v]}`; }
    else document.getElementById("edNivelTxt").textContent = `${v} - ${NIVEIS[v]}`;
  }
});
document.addEventListener("change", async (e) => {
  const t = e.target;
  if (t.dataset.foto && t.files[0]) {
    const url = await processarFoto(t.files[0]);
    if (t.dataset.foto === "novo") ui.novaFoto = url;
    else {
      const j = P(+t.dataset.foto), n = document.getElementById("edNome");
      if (n && n.value.trim()) j.nome = n.value.trim();
      const nv = document.getElementById("edNivel"); if (nv) j.nivel = +nv.value;
      j.foto = url; salvar();
    }
    render();
  }
  if (t.dataset.restaurar && t.files[0]) {
    try {
      const x = JSON.parse(await t.files[0].text());
      if (!x.jogadores) throw 0;
      D = x; ui.rascunho = []; mudar(true); toast("Backup restaurado!");
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
    j.foto = c.toDataURL("image/jpeg", 0.8); mudar();
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
