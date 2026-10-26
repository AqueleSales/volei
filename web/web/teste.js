const L=require('./logica.js'); const assert=require('assert');
function seedrng(s){return()=>{s=(s*1664525+1013904223)%4294967296;return s/4294967296}}
const dados=(n=14,tam=6)=>({jogadores:Array.from({length:n},(_,k)=>({id:k+1,nome:'P'+(k+1),nivel:1+(k+1)%5,foto:null,presente:true,jogos:0,vitorias:0,derrotas:0})),amigos:[],fila:[],quadra:null,eventos:[],historico:[],rodaram:[],recorde:0,prox_tid:0,config:{tamanho:tam,alvo:11}});
const rep=(x,n)=>Array(n).fill(x);
assert.equal(L.calcular([...rep('a',11),...rep('b',5)]).venc,'a');
assert.equal(L.calcular([...rep('a',10),...rep('b',9)]).venc,null);
let ev=[...rep('a',10),...rep('b',10)]; assert(L.calcular(ev).tiro);
assert.equal(L.calcular([...ev,'a','a']).venc,'a');
ev=[...ev,'a','b']; assert.equal(L.calcular(ev).precisa,3);
assert.equal(L.calcular([...ev,'a','a']).venc,null);
assert.equal(L.calcular([...ev,'b','b']).venc,'b');
for(let s=1;s<=30;s++){const d=dados(12),r=seedrng(s);
 const ts=L.formarTimes(d.jogadores,[[1,2,3,4,5]],6,true,r);
 assert.deepEqual(ts.flat().sort((a,b)=>a-b),d.jogadores.map(j=>j.id));
 assert(ts.some(t=>[1,2,3,4,5].every(i=>t.includes(i))));
 const m=ts.map(t=>L.mediaNivel(d,t)); assert(Math.abs(m[0]-m[1])<1.2,m);}
const d=dados(14); d.amigos=[[13,10]];
const e=L.escalar(d,[13,14],new Set(),[1,2,3,10,11],seedrng(1)); assert(e.extras.includes(10)); assert.equal(e.membros.length,6);
const d2=dados(14),r=seedrng(5); L.iniciar(d2,L.formarTimes(d2.jogadores,[],6,true,r),r);
for(let i=0;i<10;i++){d2.eventos=rep('a',11); assert(L.finalizar(d2,r));
 for(const l of 'ab')assert.equal(d2.quadra[l].membros.length,6);
 const ids=[...d2.quadra.a.membros,...d2.quadra.b.membros]; assert.equal(new Set(ids).size,12);}
assert(d2.recorde>=1&&d2.rodaram.length>=3);
console.log('OK');
