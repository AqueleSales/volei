// Regras do vôlei: placar, times, fila de pessoas e rodízio (sem tela, para testar).
// Níveis dos jogadores: 1 = criança, 2 = normal, 3 = pro.
const Logica = (() => {
  const par = (a, b) => (a < b ? a + "-" + b : b + "-" + a);

  function calcular(eventos, alvo = 11) {
    let a = 0, b = 0, tiro = false, precisa = 2, seqTime = null, seqN = 0, venc = null;
    for (const lado of eventos) {
      if (venc) break;
      if (lado === "a") a++; else b++;
      if (!tiro) {
        if (a === alvo - 1 && b === alvo - 1) tiro = true;
        else if (Math.max(a, b) >= alvo) venc = a > b ? "a" : "b";
      } else {
        if (lado === seqTime) seqN++;
        else {
          if (seqTime !== null) precisa = 3;
          seqTime = lado; seqN = 1;
        }
        if (seqN >= precisa) venc = lado;
      }
    }
    return { a, b, venc, tiro, precisa };
  }

  // Monta a lista de pontos de um placar que já estava rolando (a, b, a, b...) para continuar a contagem.
  function eventosParaPlacar(a, b) {
    const ev = [];
    let x = 0, y = 0;
    while (x < a || y < b) {
      if (x < a) { ev.push("a"); x++; }
      if (y < b) { ev.push("b"); y++; }
    }
    return ev;
  }

  function pares(grupos) {
    const s = new Set();
    for (const g of grupos) for (const x of g) for (const y of g) if (x !== y) s.add(par(x, y));
    return s;
  }

  function embaralhar(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Sorteio repetível: a prévia e a troca de verdade usam a mesma semente.
  function semente(n) {
    let a = n >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function componentes(ids, grupos) {
    const pai = new Map(ids.map((i) => [i, i]));
    const raiz = (x) => { while (pai.get(x) !== x) { pai.set(x, pai.get(pai.get(x))); x = pai.get(x); } return x; };
    for (const g0 of grupos) {
      const g = g0.filter((i) => pai.has(i));
      for (const o of g.slice(1)) pai.set(raiz(o), raiz(g[0]));
    }
    const out = new Map();
    for (const i of ids) { const r = raiz(i); if (!out.has(r)) out.set(r, []); out.get(r).push(i); }
    return [...out.values()];
  }

  // ---------- níveis: 1 criança, 2 normal, 3 pro ----------
  const porId = (D) => Object.fromEntries(D.jogadores.map((j) => [j.id, j]));
  // Força usada só para equilibrar os times (criança 1, normal 3, pro 5).
  const nv = (j) => { const n = Number(j && j.nivel); if (!n) return 3; return n <= 1 ? 1 : n === 2 ? 3 : 5; };
  const ehCrianca = (j) => !!j && Number(j.nivel) === 1;
  const ehCraque = (j) => !!j && Number(j.nivel) >= 3;
  const minAdultos = (tam) => Math.max(0, tam - 2);
  function categoriaNivel(nivel) {
    const n = Number(nivel) || 2;
    return n <= 1 ? "Criança" : n === 2 ? "Normal" : "Pro";
  }
  function mediaNivel(D, ids) {
    const p = porId(D);
    return ids.length ? ids.reduce((s, i) => s + nv(p[i]), 0) / ids.length : 0;
  }
  // Ex.: "1 criança · 4 normais · 1 pro".
  function composicao(D, ids) {
    const p = porId(D);
    let c = 0, n = 0, pr = 0;
    for (const i of ids) {
      const j = p[i]; if (!j) continue;
      if (ehCrianca(j)) c++; else if (ehCraque(j)) pr++; else n++;
    }
    const partes = [];
    if (c) partes.push(`${c} criança${c > 1 ? "s" : ""}`);
    if (n) partes.push(`${n} ${n > 1 ? "normais" : "normal"}`);
    if (pr) partes.push(`${pr} pro${pr > 1 ? "s" : ""}`);
    return partes.join(" · ");
  }
  // Dados antigos tinham "crianca" (sim/não) e nível de 1 a 5; agora é um nível só, de 1 a 3.
  function migrarNiveis(x) {
    if (!x || x.niveis3) return false;
    for (const j of x.jogadores || []) {
      const n = Number(j.nivel) || 3;
      j.nivel = j.crianca ? 1 : n >= 4 ? 3 : 2;
      delete j.crianca;
    }
    x.niveis3 = true;
    return true;
  }
  const kidsDe = (byId, ids) => ids.filter((i) => ehCrianca(byId[i])).length;

  // ---------- regras de crianças e adultos ----------
  function avaliarTime(byId, ids, tam) {
    const js = ids.map((i) => byId[i]).filter(Boolean);
    const kids = js.filter(ehCrianca).length;
    const adults = js.length - kids;
    const craque = js.some(ehCraque);
    const avisos = [];
    if (js.length < tam) avisos.push(`faltam ${tam - js.length} jogador(es)`);
    if (kids >= 2 && !craque) avisos.push(`${kids} crianças sem um Pro no time`);
    if (js.length >= tam && adults < minAdultos(tam)) avisos.push(`só ${adults} adulto(s); o ideal é ${minAdultos(tam)} ou mais`);
    return { kids, adults, craque, avisos };
  }
  function custoRegras(byId, ids, tam) {
    const a = avaliarTime(byId, ids, tam);
    let c = 0;
    if (a.kids >= 2 && !a.craque) c += 500;
    if (ids.length >= tam && a.adults < minAdultos(tam)) c += minAdultos(tam) - a.adults === 1 ? 35 : 150;
    return c;
  }
  // Custo de um confronto (quanto menor, melhor): regras > 1 criança por time > crianças espalhadas > força parecida > amizades (leve).
  // `totalKids`: quantas crianças existem para repartir (quadra + fila); sem ele, conta só as que estão nos times.
  function custoConfronto(byId, times, tam, amig, comForca = true, totalKids) {
    const ts = times.filter((t) => t.length);
    let c = 0;
    for (const t of ts) c += custoRegras(byId, t, tam);
    if (ts.length >= 2) {
      const kids = ts.map((t) => kidsDe(byId, t));
      const soma = kids.reduce((s, x) => s + x, 0);
      // Regra da quadra: cada um dos dois times que jogam leva 1 criança (se houver crianças para isso).
      const total = totalKids === undefined ? soma : totalKids;
      const comCrianca = kids.slice(0, 2).filter((k) => k > 0).length;
      c += 400 * Math.max(0, Math.min(2, total) - comCrianca);
      if (soma >= 2) c += 60 * (Math.max(...kids) - Math.min(...kids));
      if (comForca) {
        const avg = ts.map((t) => t.reduce((s, i) => s + nv(byId[i]), 0) / t.length);
        c += (Math.max(...avg) - Math.min(...avg)) * tam;
      }
    }
    const onde = new Map();
    ts.forEach((t, k) => t.forEach((i) => onde.set(i, k)));
    for (const k of amig) {
      const [x, y] = k.split("-").map(Number);
      if (onde.has(x) && onde.has(y)) c += onde.get(x) === onde.get(y) ? -8 : 6;
    }
    return c;
  }
  function otimizar(times, custo) {
    let melhor = custo(times), mudou = true, rodadas = 0;
    while (mudou && rodadas++ < 20) {
      mudou = false;
      outer: for (let a = 0; a < times.length; a++) for (let b = a + 1; b < times.length; b++)
        for (let i = 0; i < times[a].length; i++) for (let j = 0; j < times[b].length; j++) {
          [times[a][i], times[b][j]] = [times[b][j], times[a][i]];
          const prox = custo(times);
          if (prox < melhor - 1e-9) { melhor = prox; mudou = true; break outer; }
          [times[a][i], times[b][j]] = [times[b][j], times[a][i]];
        }
    }
  }

  // Devolve listas de ids. Sem `caps`: times cheios e, se sobrar gente, o último fica incompleto.
  function formarTimes(jogs, grupos, tamanho, equilibrar = true, rng = Math.random, opcoes = {}) {
    const n = jogs.length;
    let caps = opcoes.caps;
    if (!caps) {
      caps = Array(Math.floor(n / tamanho)).fill(tamanho);
      if (n % tamanho) caps.push(n % tamanho);
    }
    if (!caps.length || !n) return [];
    const nivel = Object.fromEntries(jogs.map((j) => [j.id, nv(j)]));
    const soma = (t) => t.reduce((s, i) => s + nivel[i], 0);
    const gs = embaralhar(componentes(jogs.map((j) => j.id), grupos), rng);
    if (equilibrar) gs.sort((x, y) => soma(y) - soma(x));
    const times = caps.map(() => []);
    const chave = (i) => (equilibrar ? soma(times[i]) / Math.max(1, caps[i]) + rng() * 0.01 : rng());
    const menor = (idx) => idx.reduce((m, i) => (chave(i) < chave(m) ? i : m));
    for (let g of gs) {
      g = embaralhar([...g], rng);
      while (g.length) {
        const livres = caps.map((_, i) => i).filter((i) => times[i].length < caps[i]);
        if (!livres.length) break;
        const cabem = livres.filter((i) => caps[i] - times[i].length >= g.length);
        if (cabem.length) { times[menor(cabem)].push(...g); g = []; }
        else {
          const t = menor(livres);
          const sobra = caps[t] - times[t].length;
          times[t].push(...g.slice(0, sobra));
          g = g.slice(sobra);
        }
      }
    }
    if (times.length >= 2) {
      const byId = Object.fromEntries(jogs.map((j) => [j.id, j]));
      const amig = pares(grupos);
      otimizar(times, (ts) => custoConfronto(byId, ts, tamanho, amig, equilibrar));
    }
    return times;
  }

  // Para a tela "Times": 2 times cheios ou mais (o resto fica na fila); com poucas pessoas, divide ao meio.
  function gerarConfrontos(jogs, grupos, tamanho, equilibrar = true, rng = Math.random) {
    const n = jogs.length;
    if (n < 2) return [];
    if (n < tamanho * 2) return formarTimes(jogs, grupos, tamanho, equilibrar, rng, { caps: [Math.ceil(n / 2), Math.floor(n / 2)] });
    return formarTimes(jogs, grupos, tamanho, equilibrar, rng);
  }

  // ---------- fila de pessoas ----------
  function idsNaQuadra(D) {
    const s = new Set();
    if (D.quadra) for (const t of Object.values(D.quadra)) if (t) t.membros.forEach((i) => s.add(i));
    return s;
  }
  // A fila só tem gente presente e fora da quadra; quem chegou depois entra no fim.
  function sincronizarEspera(D) {
    const p = porId(D), quad = idsNaQuadra(D), vistos = new Set(), out = [];
    for (const id of D.espera || []) {
      if (p[id] && p[id].presente && !quad.has(id) && !vistos.has(id)) { out.push(id); vistos.add(id); }
    }
    for (const j of D.jogadores) {
      if (j.presente && !quad.has(j.id) && !vistos.has(j.id)) { out.push(j.id); vistos.add(j.id); }
    }
    D.espera = out;
    return out;
  }
  const novoTid = (D) => ++D.prox_tid;
  function novoTime(D, membros) {
    return { tid: novoTid(D), base: [...membros], membros: [...membros], extra: [], seq: 0 };
  }

  // Os primeiros `qtd` da fila; se não houver criança entre eles, inclui a primeira criança que está mais atrás.
  function janelaDaFila(byId, fila, qtd, comCrianca) {
    const j = fila.slice(0, qtd);
    if (comCrianca && !j.some((i) => ehCrianca(byId[i]))) {
      const k = fila.slice(qtd).find((i) => ehCrianca(byId[i]));
      if (k !== undefined) j.push(k);
    }
    return j;
  }
  // Os `n` primeiros da fila para formar dois times, garantindo uma criança para cada time
  // (puxa de mais atrás na fila quando faltar, no lugar de quem estava no fim do grupo).
  function primeirosComCriancas(byId, fila, n) {
    const ids = fila.slice(0, n);
    const precisa = Math.min(2, kidsDe(byId, fila));
    const tem = kidsDe(byId, ids);
    if (tem >= precisa) return ids;
    const entrar = fila.slice(n).filter((i) => ehCrianca(byId[i])).slice(0, precisa - tem);
    let k = ids.length - 1;
    for (const c of entrar) {
      while (k >= 0 && ehCrianca(byId[ids[k]])) k--;
      if (k < 0) break;
      ids[k--] = c;
    }
    return ids;
  }

  // Escolhe quem desafia o time que ficou: segue a ordem da fila, mas troca com quem está logo atrás
  // quando isso resolve uma regra (1 criança por time, adultos, pro) ou equilibra a força.
  function escolherDesafiantes(D, vencedores, n) {
    const byId = porId(D), amig = pares(D.amigos), tam = D.config.tamanho;
    const janela = janelaDaFila(byId, D.espera, Math.min(D.espera.length, n + 4), true);
    let sel = janela.slice(0, Math.min(n, janela.length));
    if (sel.length < 1) return [];
    const total = kidsDe(byId, vencedores) + kidsDe(byId, D.espera);
    const custo = (s) => s.reduce((acc, id) => acc + janela.indexOf(id) * 2, 0) + custoConfronto(byId, [vencedores, s], tam, amig, true, total);
    let melhor = custo(sel), mudou = true, r = 0;
    while (mudou && r++ < 10) {
      mudou = false;
      outer: for (let i = 0; i < sel.length; i++) for (const cand of janela) {
        if (sel.includes(cand)) continue;
        const ant = sel[i]; sel[i] = cand;
        const c = custo(sel);
        if (c < melhor - 1e-9) { melhor = c; mudou = true; break outer; }
        sel[i] = ant;
      }
    }
    return sel;
  }

  // Preenche vagas abertas (time com menos gente que o tamanho) com a fila, respeitando as regras.
  function preencherVagas(D) {
    const q = D.quadra; if (!q) return 0;
    sincronizarEspera(D);
    const byId = porId(D), amig = pares(D.amigos), tam = D.config.tamanho;
    let entrou = 0;
    for (const lado of ["a", "b"]) {
      const t = q[lado], outro = q[lado === "a" ? "b" : "a"];
      if (!t) continue;
      while (t.membros.length < tam && D.espera.length) {
        const janela = janelaDaFila(byId, D.espera, 6, true);
        const total = kidsDe(byId, t.membros) + (outro ? kidsDe(byId, outro.membros) : 0) + kidsDe(byId, D.espera);
        let esc = janela[0], melhor = Infinity;
        janela.forEach((c, idx) => {
          const custo = idx * 2 + custoConfronto(byId, [t.membros.concat(c), (outro && outro.membros) || []], tam, amig, true, total);
          if (custo < melhor) { melhor = custo; esc = c; }
        });
        t.membros.push(esc); t.extra.push(esc);
        D.espera = D.espera.filter((x) => x !== esc);
        entrou++;
      }
    }
    return entrou;
  }

  // Estados: "presente", "ausente", "caminho" (a caminho da quadra).
  function definirPresenca(D, id, estado) {
    const j = D.jogadores.find((x) => x.id === id); if (!j) return;
    j.presente = estado === "presente";
    j.status = estado === "presente" ? "waiting" : estado === "caminho" ? "caminho" : "absent";
    if (!j.presente && D.quadra) {
      for (const t of Object.values(D.quadra)) if (t) for (const k of ["membros", "extra"]) t[k] = t[k].filter((i) => i !== id);
    }
    sincronizarEspera(D);
    preencherVagas(D);
  }

  // ---------- edição manual da quadra e da fila ----------
  // Onde a pessoa está: time "a", time "b" ou "fila" (com a posição).
  function onde(D, id) {
    for (const l of ["a", "b"]) {
      const t = D.quadra && D.quadra[l];
      if (t) { const k = t.membros.indexOf(id); if (k >= 0) return { l, k }; }
    }
    const k = (D.espera || []).indexOf(id);
    return k >= 0 ? { l: "fila", k } : null;
  }
  // Duas pessoas trocam de lugar (quadra <-> fila, fila <-> fila ou um time <-> outro).
  function trocarPessoas(D, x, y) {
    if (x === y) return false;
    const px = onde(D, x), py = onde(D, y);
    if (!px || !py) return false;
    const lista = (p) => (p.l === "fila" ? D.espera : D.quadra[p.l].membros);
    lista(px)[px.k] = y;
    lista(py)[py.k] = x;
    for (const l of ["a", "b"]) {
      const t = D.quadra && D.quadra[l];
      if (t) t.extra = t.extra.filter((i) => i !== x && i !== y);
    }
    return true;
  }
  // `para`: "inicio", "fim" ou um número (-1 sobe uma posição, +1 desce uma).
  function moverNaFila(D, id, para) {
    const f = D.espera || [], k = f.indexOf(id);
    if (k < 0) return false;
    f.splice(k, 1);
    const n = para === "inicio" ? 0 : para === "fim" ? f.length : Math.max(0, Math.min(f.length, k + Number(para)));
    f.splice(n, 0, id);
    D.espera = f;
    return true;
  }

  function iniciar(D, times, rng = Math.random) {
    const limpos = times.map((t) => t.filter((id) => D.jogadores.some((j) => j.id === id && j.presente)));
    if (limpos.length < 2 || !limpos[0].length || !limpos[1].length) return false;
    D.quadra = { a: novoTime(D, limpos[0]), b: novoTime(D, limpos[1]) };
    D.espera = limpos.slice(2).flat();
    D.eventos = [];
    D.rodaram = [D.quadra.a.tid, D.quadra.b.tid];
    sincronizarEspera(D);
    preencherVagas(D);
    return true;
  }
  // Jogo que já começou sem o app: informa quem está em cada lado, a fila na ordem em que estão esperando
  // (quem não for citado entra depois, na ordem da lista) e, se quiser, o placar de agora.
  function iniciarEmAndamento(D, a, b, fila = [], placar = null) {
    const usados = new Set([...a, ...b]);
    const resto = fila.filter((id, k) => !usados.has(id) && fila.indexOf(id) === k);
    if (!iniciar(D, [a, b, resto])) return false;
    if (placar && (placar.a || placar.b)) D.eventos = eventosParaPlacar(placar.a || 0, placar.b || 0);
    return true;
  }

  function finalizar(D, rng) {
    const q = D.quadra;
    if (!q || !q.a || !q.b) return false;
    const c = calcular(D.eventos, D.config.alvo);
    if (!c.venc) return false;
    rng = rng || semente(D.historico.length * 7919 + D.prox_tid + 1);
    const gan = c.venc, per = gan === "a" ? "b" : "a";
    const G = q[gan], Pp = q[per], p = porId(D), tam = D.config.tamanho;
    for (const i of G.membros) { if (p[i]) { p[i].jogos++; p[i].vitorias++; } }
    for (const i of Pp.membros) { if (p[i]) { p[i].jogos++; p[i].derrotas++; } }
    G.seq++;
    D.recorde = Math.max(D.recorde || 0, G.seq);
    D.historico.push({
      vencedor: G.membros.map((i) => p[i]?.nome || "Removido"),
      perdedor: Pp.membros.map((i) => p[i]?.nome || "Removido"),
      placar: gan === "a" ? `${c.a} x ${c.b}` : `${c.b} x ${c.a}`,
      seq: G.seq, tid: G.tid,
    });
    D.espera = D.espera || [];
    if ((D.config.rotacao || "fair") === "fair") {
      // Os dois times descansam: vão para o fim da fila (vencedores na frente) e saem os 2 próximos times.
      D.espera.push(...G.membros, ...Pp.membros);
      D.quadra = { a: null, b: null };
      sincronizarEspera(D);
      const ids = primeirosComCriancas(p, D.espera, tam * 2);
      const caps = ids.length >= tam * 2 ? [tam, tam] : [Math.ceil(ids.length / 2), Math.floor(ids.length / 2)];
      const times = ids.length ? formarTimes(ids.map((i) => p[i]), D.amigos, tam, true, rng, { caps }) : [[], []];
      D.espera = D.espera.filter((i) => !ids.includes(i));
      D.quadra = { a: novoTime(D, times[0] || []), b: novoTime(D, times[1] || []) };
      D.rodaram.push(D.quadra.a.tid, D.quadra.b.tid);
    } else {
      // Vencedor permanece; quem perdeu vai para o fim da fila e entram os próximos da fila.
      D.espera.push(...Pp.membros);
      q[per] = null;
      sincronizarEspera(D);
      const des = escolherDesafiantes(D, G.membros, tam);
      D.espera = D.espera.filter((i) => !des.includes(i));
      q[per] = novoTime(D, des);
      D.rodaram.push(q[per].tid);
    }
    D.eventos = [];
    preencherVagas(D);
    return true;
  }

  // Prévia do próximo confronto (sem mexer nos dados).
  function preverProximo(D) {
    const tam = D.config.tamanho, p = porId(D);
    const copia = JSON.parse(JSON.stringify(D));
    sincronizarEspera(copia);
    if ((D.config.rotacao || "fair") === "fair") {
      const fila = copia.espera.concat(...(D.quadra ? [D.quadra.a, D.quadra.b].filter(Boolean).map((t) => t.membros) : []));
      const ids = primeirosComCriancas(p, fila, tam * 2);
      if (ids.length < 2) return { times: [], tipo: "fair" };
      const caps = ids.length >= tam * 2 ? [tam, tam] : [Math.ceil(ids.length / 2), Math.floor(ids.length / 2)];
      return { tipo: "fair", times: formarTimes(ids.map((i) => p[i]), D.amigos, tam, true, semente(D.historico.length * 7919 + D.prox_tid + 1), { caps }) };
    }
    if (!D.quadra || !copia.espera.length) return { times: [], tipo: "winner" };
    const lado = Object.values(D.quadra).filter(Boolean)[0];
    return { tipo: "winner", times: [escolherDesafiantes(copia, lado ? lado.membros : [], tam)] };
  }

  // Avisos em português para o organizador: problemas dentro de cada time e impossibilidades gerais.
  // `nomes` (opcional) troca "Time 1", "Time 2" por outros rótulos, ex.: ["Time A", "Time B"].
  function diagnosticar(D, times, nomes) {
    const byId = porId(D), tam = D.config.tamanho, avisos = [];
    const rot = (n) => (nomes && nomes[n]) || `Time ${n + 1}`;
    const ts = times.filter((t) => t.length);
    times.forEach((t, n) => { if (t.length) for (const a of avaliarTime(byId, t, tam).avisos) avisos.push(`${rot(n)}: ${a}`); });
    const todos = ts.flat().map((i) => byId[i]).filter(Boolean);
    const kids = todos.filter(ehCrianca).length, adults = todos.length - kids;
    const craques = todos.filter(ehCraque).length;
    const pool = D.jogadores.filter((j) => j.presente !== false && ehCrianca(j)).length;   // crianças presentes
    if (ts.length >= 2) {
      // Cada um dos 2 times que jogam precisa de 1 criança.
      const sem = [];
      times.slice(0, 2).forEach((t, n) => { if (t.length && !kidsDe(byId, t)) sem.push(n); });
      if (pool >= 2) sem.forEach((n) => avisos.push(`${rot(n)}: sem criança (cada time precisa de 1)`));
      else if (pool === 1 && sem.length) avisos.push(`Só há 1 criança presente para 2 times: ${sem.map(rot).join(" e ")} fica sem criança.`);
      if (adults < ts.length * minAdultos(tam)) avisos.push(`Há só ${adults} adultos para ${ts.length} times; o ideal seria ${ts.length * minAdultos(tam)} ou mais.`);
      const extras = Math.max(0, kids - ts.length);
      if (extras > craques) avisos.push(`Há ${kids} crianças e ${ts.length} times: ${extras} time(s) terão 2 crianças e só há ${craques} pro(s) para ajudar.`);
    }
    return avisos;
  }

  function removerJogador(D, pid) {
    D.jogadores = D.jogadores.filter((j) => j.id !== pid);
    D.amigos = D.amigos.map((g) => g.filter((i) => i !== pid)).filter((g) => g.length >= 2);
    D.espera = (D.espera || []).filter((i) => i !== pid);
    if (D.quadra) for (const l of Object.values(D.quadra)) if (l)
      for (const k of ["base", "membros", "extra"]) l[k] = l[k].filter((i) => i !== pid);
    sincronizarEspera(D);
    preencherVagas(D);
  }

  return {
    calcular, pares, par, formarTimes, gerarConfrontos, mediaNivel, iniciar, iniciarEmAndamento, finalizar,
    removerJogador, componentes, categoriaNivel, semente, avaliarTime, diagnosticar, sincronizarEspera,
    preencherVagas, definirPresenca, preverProximo, escolherDesafiantes, idsNaQuadra,
    trocarPessoas, moverNaFila, onde, composicao, migrarNiveis, eventosParaPlacar, ehCrianca, ehCraque,
  };
})();
if (typeof module !== "undefined") module.exports = Logica;
