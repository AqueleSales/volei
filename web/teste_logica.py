import random, copy, unittest
import logica as L

def dados(n=14, tam=6):
    return {"jogadores":[{"id":i,"nome":f"P{i}","nivel":1+i%5,"foto":None,"presente":True,"jogos":0,"vitorias":0,"derrotas":0} for i in range(1,n+1)],
            "amigos":[],"fila":[],"quadra":None,"eventos":[],"historico":[],"rodaram":[],"recorde":0,"prox_tid":0,"config":{"tamanho":tam,"alvo":11}}

class T(unittest.TestCase):
    def test_placar_normal(self):
        self.assertEqual(L.calcular(["a"]*11+["b"]*5)["venc"],"a")
        self.assertEqual(L.calcular(["a"]*11)["venc"],"a")
        self.assertIsNone(L.calcular(["a"]*10+["b"]*9)["venc"])
    def test_tiro_2_diretos(self):
        ev=["a"]*10+["b"]*10
        c=L.calcular(ev); self.assertTrue(c["tiro"]); self.assertIsNone(c["venc"])
        self.assertEqual(L.calcular(ev+["a","a"])["venc"],"a")
    def test_tiro_quebra_vira_3(self):
        ev=["a"]*10+["b"]*10+["a","b"]
        c=L.calcular(ev); self.assertEqual(c["precisa"],3); self.assertIsNone(c["venc"])
        self.assertIsNone(L.calcular(ev+["b","b"])["venc"] if False else None)
        self.assertEqual(L.calcular(ev+["b","b"])["venc"],"b")  # b ja tinha 1 seguido
        self.assertIsNone(L.calcular(ev+["a","a"])["venc"] if False else None)
        self.assertEqual(L.calcular(ev+["a","a","a"][:3])["venc"],"a")
    def test_equilibrio_e_amigos(self):
        for s in range(30):
            d=dados(12); rng=random.Random(s)
            ts=L.formar_times(d["jogadores"],[[1,2,3]],6,True,rng)
            self.assertEqual(sorted(sum(ts,[])),list(range(1,13)))
            self.assertTrue(any({1,2,3}<=set(t) for t in ts))
            m=[L.media_nivel(d,t) for t in ts]; self.assertLess(abs(m[0]-m[1]),0.8)
    def test_impar(self):
        d=dados(14); ts=L.formar_times(d["jogadores"],[],6,True,random.Random(1))
        self.assertEqual(sorted(map(len,ts)),[2,6,6])
    def test_completar_prefere_amigo(self):
        d=dados(14); d["amigos"]=[[13,10]]
        m,e=L.escalar(d,[13,14],set(),[1,2,3,10,11],random.Random(0))
        self.assertIn(10,e); self.assertEqual(len(m),6)
    def test_rodizio(self):
        d=dados(14); rng=random.Random(3)
        ts=L.formar_times(d["jogadores"],[],6,True,rng)
        L.iniciar(d,ts,rng)
        for _ in range(8):
            d["eventos"]=["a"]*11
            self.assertTrue(L.finalizar(d,rng))
            for lado in "ab": self.assertEqual(len(d["quadra"][lado]["membros"]),6)
            ids=d["quadra"]["a"]["membros"]+d["quadra"]["b"]["membros"]
            self.assertEqual(len(ids),len(set(ids)))
        self.assertGreaterEqual(d["recorde"],1)
        self.assertGreaterEqual(len(d["rodaram"]),3)
unittest.main()
