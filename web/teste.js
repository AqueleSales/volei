const L = require("./logica.js");
const assert = require("assert");
const rep = (x, n) => Array(n).fill(x);
// Níveis: 1 = criança, 2 = normal, 3 = pro. Por padrão ninguém é criança e cada 4º jogador é pro.
const dados = (n = 14, tam = 6, extra = {}) => ({
  jogadores: Array.from({ length: n }, (_, k) => ({ id: k + 1, nome: "P" + (k + 1), nivel: (k + 1) % 4 === 0 ? 3 : 2, presente: true, status: "waiting", jogos: 0, vitorias: 0, derrotas: 0 })),
  amigos: [], espera: [], quadra: null, eventos: [], historico: [], rodaram: [], recorde: 0, prox_tid: 0,
  config: { tamanho: tam, alvo: 11, rotacao: "fair", ...extra },
});
const marcar = (D, ids, props) => D.jogadores.filter((j) => ids.includes(j.id)).forEach((j) => Object.assign(j, props));
const vence = (D, lado = "a") => { D.eventos = rep(lado, D.config.alvo); };
const semDup = (D) => {
  const q = L.idsNaQuadra(D), todos = [...q, ...D.espera];
  assert.strictEqual(new Set(todos).size, todos.length, "gente repetida entre quadra e fila");
  for (const i of D.espera) assert(!q.has(i));
};
const kidsEm = (D, ids) => ids.filter((i) => D.jogadores.find((j) => j.id === i).nivel === 1).length;

// placar
assert.strictEqual(L.calcular([...rep("a", 11), ...rep("b", 5)]).venc, "a");
assert.strictEqual(L.calcular([...rep("a", 10), ...rep("b", 9)]).venc, null);
let ev = [...rep("a", 10), ...rep("b", 10)];
assert(L.calcular(ev).tiro);
assert.strictEqual(L.calcular([...ev, "a", "a"]).venc, "a");
ev = [...ev, "a", "b"];
assert.strictEqual(L.calcular(ev).precisa, 3);
assert.strictEqual(L.calcular([...ev, "a", "a"]).venc, null);
assert.strictEqual(L.calcular([...ev, "b", "b"]).venc, "b");
// placar que já estava rolando
{
  const c = L.calcular(L.eventosParaPlacar(7, 5));
  assert.deepStrictEqual([c.a, c.b, c.venc], [7, 5, null]);
  const t = L.calcular(L.eventosParaPlacar(10, 10));
  assert(t.tiro && !t.venc);
}

// níveis antigos viram 1 criança, 2 normal, 3 pro (e só uma vez)
{
  const x = { jogadores: [{ id: 1, nivel: 4, crianca: false }, { id: 2, nivel: 3, crianca: true }, { id: 3, nivel: 1, crianca: false }, { id: 4, nivel: 5 }] };
  assert(L.migrarNiveis(x));
  assert.deepStrictEqual(x.jogadores.map((j) => j.nivel), [3, 1, 2, 3]);
  assert(x.jogadores.every((j) => !("crianca" in j)));
  assert(!L.migrarNiveis(x), "não pode migrar duas vezes");
  assert.deepStrictEqual(x.jogadores.map((j) => j.nivel), [3, 1, 2, 3]);
}
assert.strictEqual(L.categoriaNivel(1), "Criança");
assert.strictEqual(L.categoriaNivel(2), "Normal");
assert.strictEqual(L.categoriaNivel(3), "Pro");
assert.strictEqual(L.composicao(dados(12), [1, 2, 4]), "2 normais · 1 pro");

// times: equilíbrio e amigos como preferência (um grupo de 5 em 12 pessoas fica junto)
for (let s = 1; s <= 30; s++) {
  const D = dados(12);
  const ts = L.formarTimes(D.jogadores, [[1, 2, 3, 4, 5]], 6, true, L.semente(s));
  assert.deepStrictEqual(ts.flat().sort((a, b) => a - b), D.jogadores.map((j) => j.id));
  const m = ts.map((t) => L.mediaNivel(D, t));
  assert(Math.abs(m[0] - m[1]) < 1.5, JSON.stringify(m));
}

// crianças: 2 crianças e 2 times = uma em cada
for (let s = 1; s <= 40; s++) {
  const D = dados(12); marcar(D, [1, 2], { nivel: 1 });
  const ts = L.formarTimes(D.jogadores, [], 6, true, L.semente(s));
  const k = ts.map((t) => t.filter((i) => i <= 2).length);
  assert.deepStrictEqual(k.sort(), [1, 1], `crianças juntas na semente ${s}`);
}
// 1 criança por time mesmo com amigos querendo ficar juntos
for (let s = 1; s <= 30; s++) {
  const D = dados(12); marcar(D, [1, 2], { nivel: 1 });
  const ts = L.formarTimes(D.jogadores, [[1, 2, 3]], 6, true, L.semente(s));
  assert.deepStrictEqual(ts.map((t) => kidsEm(D, t)).sort(), [1, 1], `semente ${s}`);
}
// 3 crianças: se duas ficam juntas, o time tem um pro
{
  const D = dados(12); marcar(D, [1, 2, 3], { nivel: 1 });
  const ts = L.formarTimes(D.jogadores, [], 6, true, L.semente(3));
  const byId = Object.fromEntries(D.jogadores.map((j) => [j.id, j]));
  const dupla = ts.find((t) => kidsEm(D, t) >= 2);
  assert(dupla.some((i) => byId[i].nivel === 3), "duas crianças sem pro");
}
// impossível: avisa
{
  const D = dados(12); marcar(D, [1, 2, 3, 4, 5], { nivel: 1 }); marcar(D, [6, 7, 8, 9, 10, 11, 12], { nivel: 2 });
  const av = L.diagnosticar(D, L.formarTimes(D.jogadores, [], 6, true, L.semente(1)));
  assert(av.length > 0, "devia avisar que a composição é impossível");
}
// time sem criança (havendo crianças para os dois) é avisado
{
  const D = dados(12); marcar(D, [1, 2], { nivel: 1 });
  const av = L.diagnosticar(D, [[1, 3, 5, 6, 7, 9], [2, 4, 8, 10, 11, 12]], ["Time A", "Time B"]);
  assert.strictEqual(av.filter((a) => a.includes("sem criança")).length, 0);
  const av2 = L.diagnosticar(D, [[1, 2, 5, 6, 7, 9], [3, 4, 8, 10, 11, 12]], ["Time A", "Time B"]);
  assert(av2.some((a) => a.startsWith("Time B: sem criança")), JSON.stringify(av2));
  const D1 = dados(12); marcar(D1, [1], { nivel: 1 });
  const av3 = L.diagnosticar(D1, [[1, 3, 5, 6, 7, 9], [2, 4, 8, 10, 11, 12]]);
  assert(av3.some((a) => a.includes("Só há 1 criança")), JSON.stringify(av3));
}

// jogo que já começou + fila
{
  const D = dados(16);
  assert(L.iniciarEmAndamento(D, [1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12]));
  assert.deepStrictEqual(D.espera, [13, 14, 15, 16]);
  semDup(D);
  const E = dados(16);
  assert(L.iniciarEmAndamento(E, [1, 2, 3, 4], [7, 8, 9, 10, 11, 12]));
  assert.strictEqual(E.quadra.a.membros.length, 6);
  assert.strictEqual(E.quadra.a.extra.length, 2);
  semDup(E);
}
// já começou: fila na ordem informada e placar de agora
{
  const D = dados(16);
  assert(L.iniciarEmAndamento(D, [1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12], [16, 14, 13, 6, 99], { a: 8, b: 5 }));
  assert.deepStrictEqual(D.espera, [16, 14, 13, 15], "a fila segue a ordem dita; quem faltou entra no fim");
  const c = L.calcular(D.eventos, 11);
  assert.deepStrictEqual([c.a, c.b], [8, 5]);
  semDup(D);
}

// vaga sem ninguém na fila + alguém "a caminho" chega
{
  const D = dados(12); marcar(D, [11, 12], { presente: false, status: "caminho" });
  assert(L.iniciarEmAndamento(D, [1, 2, 3, 4, 5, 6], [7, 8, 9, 10]));
  assert.strictEqual(D.quadra.b.membros.length, 4);
  L.definirPresenca(D, 11, "presente");
  assert.strictEqual(D.quadra.b.membros.length, 5);
  L.definirPresenca(D, 12, "presente");
  assert.strictEqual(D.quadra.b.membros.length, 6);
  semDup(D);
  L.definirPresenca(D, 9, "ausente");
  assert.strictEqual(D.quadra.b.membros.length, 5, "saiu da quadra e ninguém para completar");
}

// rotação: os dois descansam
{
  const D = dados(16), r = L.semente(7);
  assert(L.iniciar(D, L.gerarConfrontos(D.jogadores, [], 6, true, r)));
  for (let i = 0; i < 8; i++) {
    vence(D, i % 2 ? "a" : "b");
    const esperavam = D.espera.slice();
    assert(L.finalizar(D));
    semDup(D);
    for (const l of "ab") assert.strictEqual(D.quadra[l].membros.length, 6);
    const depois = L.idsNaQuadra(D);
    assert(esperavam.every((i) => depois.has(i)), "quem esperava na fila devia entrar");
  }
  assert.strictEqual(D.historico.length, 8);
}

// rotação: vencedor permanece
{
  const D = dados(16, 6, { rotacao: "winner" }), r = L.semente(9);
  assert(L.iniciar(D, L.gerarConfrontos(D.jogadores, [], 6, true, r)));
  for (let i = 0; i < 6; i++) {
    const venc = i % 3 === 2 ? "b" : "a";
    const antes = D.quadra[venc].membros.slice();
    vence(D, venc);
    assert(L.finalizar(D));
    semDup(D);
    for (const l of "ab") assert.strictEqual(D.quadra[l].membros.length, 6);
    const depois = L.idsNaQuadra(D);
    assert(antes.every((i) => depois.has(i)), "o vencedor devia ficar");
  }
}

// poucas pessoas: 8 presentes divide ao meio
{
  const D = dados(8);
  const ts = L.gerarConfrontos(D.jogadores, [], 6, true, L.semente(2));
  assert.deepStrictEqual(ts.map((t) => t.length), [4, 4]);
  assert(L.iniciar(D, ts));
  vence(D, "a"); assert(L.finalizar(D));
  assert.strictEqual(D.quadra.a.membros.length + D.quadra.b.membros.length, 8);
  semDup(D);
}

// vencedor permanece: o time que entra sempre leva 1 criança, mesmo ela estando no fim da fila
{
  const D = dados(24, 6, { rotacao: "winner" });
  marcar(D, [1, 7, 22, 23], { nivel: 1 });   // 1 e 7 começam jogando, 22 e 23 estão no fim da fila
  assert(L.iniciar(D, [[1, 2, 3, 5, 6, 9], [7, 8, 10, 11, 12, 13]]));
  assert.strictEqual(D.espera.length, 12);
  vence(D, "a"); assert(L.finalizar(D));
  assert.strictEqual(kidsEm(D, D.quadra.a.membros), 1);
  assert.strictEqual(kidsEm(D, D.quadra.b.membros), 1, "o time desafiante precisa de 1 criança");
  semDup(D);
}
// os dois descansam: os dois próximos times levam 1 criança cada
for (let s = 1; s <= 20; s++) {
  const D = dados(24);
  marcar(D, [1, 2, 21, 22], { nivel: 1 });
  assert(L.iniciar(D, [[1, 3, 5, 6, 7, 9], [2, 4, 8, 10, 11, 12]]));
  vence(D, "a"); assert(L.finalizar(D, L.semente(s)));
  for (const l of "ab") assert.strictEqual(kidsEm(D, D.quadra[l].membros), 1, `semente ${s} time ${l}`);
  semDup(D);
}
// duas crianças da fila não entram juntas sem pro
{
  const D = dados(20, 6, { rotacao: "winner" });
  marcar(D, [13, 14], { nivel: 1 }); marcar(D, [4, 8, 12, 16, 20], { nivel: 2 });
  assert(L.iniciar(D, [[1, 2, 3, 5, 6, 7], [9, 10, 11, 15, 17, 18]]));
  vence(D, "a"); assert(L.finalizar(D));
  const des = D.quadra.b.membros;
  assert(kidsEm(D, des) < 2 || des.some((i) => D.jogadores.find((j) => j.id === i).nivel === 3), "duas crianças juntas sem pro");
}
// saiu uma criança da quadra: a vaga é preenchida por outra criança da fila
{
  const D = dados(16);
  marcar(D, [1, 2, 15], { nivel: 1 });
  assert(L.iniciar(D, [[1, 3, 5, 6, 7, 9], [2, 4, 8, 10, 11, 12]]));
  L.definirPresenca(D, 1, "ausente");
  assert.strictEqual(D.quadra.a.membros.length, 6);
  assert(D.quadra.a.membros.includes(15), "a criança da fila devia entrar no lugar");
  semDup(D);
}

// editar a quadra e a fila na mão
{
  const D = dados(16);
  assert(L.iniciar(D, [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12]]));
  assert.deepStrictEqual(D.espera, [13, 14, 15, 16]);
  // fila <-> fila
  assert(L.trocarPessoas(D, 13, 16)); assert.deepStrictEqual(D.espera, [16, 14, 15, 13]);
  // quadra <-> fila
  assert(L.trocarPessoas(D, 1, 15));
  assert.strictEqual(D.quadra.a.membros[0], 15); assert.strictEqual(D.espera[2], 1);
  // time <-> time
  assert(L.trocarPessoas(D, 2, 7));
  assert(D.quadra.a.membros.includes(7) && D.quadra.b.membros.includes(2));
  assert(!L.trocarPessoas(D, 2, 2)); assert(!L.trocarPessoas(D, 2, 999));
  semDup(D);
  assert.strictEqual(D.quadra.a.membros.length + D.quadra.b.membros.length, 12);
  // subir, descer, início e fim
  D.espera = [16, 14, 1, 13];
  assert(L.moverNaFila(D, 1, -1)); assert.deepStrictEqual(D.espera, [16, 1, 14, 13]);
  assert(L.moverNaFila(D, 1, 1)); assert.deepStrictEqual(D.espera, [16, 14, 1, 13]);
  assert(L.moverNaFila(D, 13, "inicio")); assert.deepStrictEqual(D.espera, [13, 16, 14, 1]);
  assert(L.moverNaFila(D, 13, "fim")); assert.deepStrictEqual(D.espera, [16, 14, 1, 13]);
  assert(L.moverNaFila(D, 16, -1)); assert.deepStrictEqual(D.espera, [16, 14, 1, 13], "no topo não sobe mais");
  assert(!L.moverNaFila(D, 5, 1), "quem está em quadra não está na fila");
}

// prévia repetível
{
  const D = dados(16), r = L.semente(4);
  L.iniciar(D, L.gerarConfrontos(D.jogadores, [], 6, true, r));
  assert.strictEqual(JSON.stringify(L.preverProximo(D)), JSON.stringify(L.preverProximo(D)));
}
// a prévia mostra o mesmo que a troca de verdade (com crianças no fim da fila)
{
  const D = dados(24);
  marcar(D, [1, 2, 23, 24], { nivel: 1 });
  assert(L.iniciar(D, [[1, 3, 5, 6, 7, 9], [2, 4, 8, 10, 11, 12]]));
  const prev = L.preverProximo(D);
  assert.deepStrictEqual(prev.times.map((t) => kidsEm(D, t)), [1, 1]);
}

// remover jogador mantém tudo consistente
{
  const D = dados(16), r = L.semente(5);
  L.iniciar(D, L.gerarConfrontos(D.jogadores, [], 6, true, r));
  L.removerJogador(D, D.quadra.a.membros[0]);
  semDup(D);
  assert.strictEqual(D.quadra.a.membros.length, 6, "devia completar com a fila");
}
console.log("OK");
