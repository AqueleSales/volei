// Regras do volei: placar, sorteio de times e rodizio da fila (sem tela, para testar).
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

  // Devolve listas de ids. Times cheios primeiro; o ultimo pode ficar incompleto.
  function formarTimes(jogs, grupos, tamanho, equilibrar = true, rng = Math.random) {
    const n = jogs.length;
    const caps = Array(Math.floor(n / tamanho)).fill(tamanho);
    if (n % tamanho) caps.push(n % tamanho);
    if (!caps.length) return [];
    const nivel = Object.fromEntries(jogs.map((j) => [j.id, j.nivel]));
    const soma = (t) => t.reduce((s, i) => s + nivel[i], 0);
    const gs = embaralhar(componentes(jogs.map((j) => j.id), grupos), rng);
    if (equilibrar) gs.sort((x, y) => soma(y) - soma(x));
    const times = caps.map(() => []);
    const chave = (i) => (equilibrar ? soma(times[i]) / caps[i] + rng() * 0.01 : rng());
    const menor = (idx) => idx.reduce((m, i) => (chave(i) < chave(m) ? i : m));
    for (let g of gs) {
      g = embaralhar([...g], rng);
      while (g.length) {
        const livres = caps.map((_, i) => i).filter((i) => times[i].length < caps[i]);
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
    return times;
  }

  const porId = (D) => Object.fromEntries(D.jogadores.map((j) => [j.id, j]));
  function mediaNivel(D, ids) {
    const p = porId(D);
    return ids.length ? ids.reduce((s, i) => s + p[i].nivel, 0) / ids.length : 0;
  }

  // Monta quem joga: time base + emprestados se faltar gente. Amigo primeiro, depois quem jogou menos,
  // depois quem deixa o time parecido com o adversario.
  function escalar(D, base, ocupados, pool, rng = Math.random, mediaAlvo = null) {
    const p = porId(D);
    const livre = (i) => p[i] && p[i].presente && !ocupados.has(i);
    const membros = base.filter(livre);
    const extras = [];
    const amigos = pares(D.amigos);
    let falta = D.config.tamanho - membros.length;
    const cand = [...new Set(pool)].filter((i) => livre(i) && !membros.includes(i));
    while (falta > 0 && cand.length) {
      const atual = membros.concat(extras);
      const custo = (c) => {
        let v = p[c].jogos;
        if (mediaAlvo !== null) {
          const ns = atual.map((i) => p[i].nivel).concat(p[c].nivel);
          v += Math.abs(ns.reduce((s, x) => s + x, 0) / ns.length - mediaAlvo);
        }
        if (atual.some((m) => amigos.has(par(c, m)))) v -= 100;
        return v + rng() * 0.01;
      };
      const esc = cand.reduce((m, c) => (custo(c) < custo(m) ? c : m));
      extras.push(esc);
      cand.splice(cand.indexOf(esc), 1);
      falta--;
    }
    return { membros: membros.concat(extras), extras };
  }

  const novoTid = (D) => ++D.prox_tid;

  function iniciar(D, times, rng = Math.random) {
    if (times.length < 2) return false;
    const ts = times.map((t) => ({ tid: novoTid(D), base: [...t] }));
    const ta = ts.shift(), tb = ts.shift();
    const pool = ts.flatMap((t) => t.base);
    const ea = escalar(D, ta.base, new Set(), pool, rng);
    const eb = escalar(D, tb.base, new Set(ea.membros), pool, rng, mediaNivel(D, ea.membros));
    D.quadra = {
      a: { ...ta, membros: ea.membros, extra: ea.extras, seq: 0 },
      b: { ...tb, membros: eb.membros, extra: eb.extras, seq: 0 },
    };
    D.fila = ts;
    D.eventos = [];
    D.rodaram = [ta.tid, tb.tid];
    return true;
  }

  function finalizar(D, rng = Math.random) {
    const q = D.quadra;
    const c = calcular(D.eventos, D.config.alvo);
    if (!c.venc) return false;
    const gan = c.venc, per = gan === "a" ? "b" : "a";
    const G = q[gan], Pp = q[per], p = porId(D);
    for (const i of G.membros) { p[i].jogos++; p[i].vitorias++; }
    for (const i of Pp.membros) { p[i].jogos++; p[i].derrotas++; }
    G.seq++;
    D.recorde = Math.max(D.recorde || 0, G.seq);
    D.historico.push({
      vencedor: G.membros.map((i) => p[i].nome),
      perdedor: Pp.membros.map((i) => p[i].nome),
      placar: gan === "a" ? `${c.a} x ${c.b}` : `${c.b} x ${c.a}`,
      seq: G.seq, tid: G.tid,
    });
    D.fila.push({ tid: Pp.tid, base: Pp.base });
    const prox = D.fila.shift();
    const pool = D.fila.flatMap((t) => t.base);
    const e = escalar(D, prox.base, new Set(G.membros), pool, rng, mediaNivel(D, G.membros));
    q[per] = { tid: prox.tid, base: prox.base, membros: e.membros, extra: e.extras, seq: 0 };
    if (!D.rodaram.includes(prox.tid)) D.rodaram.push(prox.tid);
    D.eventos = [];
    return true;
  }

  function removerJogador(D, pid) {
    D.jogadores = D.jogadores.filter((j) => j.id !== pid);
    D.amigos = D.amigos.map((g) => g.filter((i) => i !== pid)).filter((g) => g.length >= 2);
    D.fila.forEach((t) => { t.base = t.base.filter((i) => i !== pid); });
    D.fila = D.fila.filter((t) => t.base.length);
    if (D.quadra) for (const l of Object.values(D.quadra))
      for (const k of ["base", "membros", "extra"]) l[k] = l[k].filter((i) => i !== pid);
  }

  return { calcular, pares, par, formarTimes, escalar, mediaNivel, iniciar, finalizar, removerJogador, componentes };
})();
if (typeof module !== "undefined") module.exports = Logica;
