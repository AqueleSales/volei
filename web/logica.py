"""Regras do volei: placar, sorteio de times e rodizio da fila (sem Streamlit, para testar)."""
import random

ALVO_PADRAO = 11


def calcular(eventos, alvo=ALVO_PADRAO):
    """Calcula o placar a partir da lista de pontos ('a'/'b') na ordem em que aconteceram.

    Ate o tiro (alvo-1 x alvo-1) ganha quem chegar em `alvo`. No tiro vale ponto
    direto: quem fizer 2 seguidos ganha; se a sequencia for quebrada (empatou de novo),
    passa a valer 3 seguidos.
    """
    a = b = 0
    tiro = False
    precisa = 2
    seq_time, seq_n = None, 0
    venc = None
    for lado in eventos:
        if venc:
            break
        if lado == "a":
            a += 1
        else:
            b += 1
        if not tiro:
            if a == alvo - 1 and b == alvo - 1:
                tiro = True
            elif max(a, b) >= alvo:
                venc = "a" if a > b else "b"
        else:
            if lado == seq_time:
                seq_n += 1
            else:
                if seq_time is not None:
                    precisa = 3
                seq_time, seq_n = lado, 1
            if seq_n >= precisa:
                venc = lado
    return {"a": a, "b": b, "venc": venc, "tiro": tiro, "precisa": precisa,
            "seq_time": seq_time, "seq_n": seq_n}


def pares(grupos):
    """Transforma grupos ([1,2,3]) em pares que querem jogar juntos."""
    return {frozenset((a, b)) for g in grupos for a in g for b in g if a != b}


def componentes(ids, amigos):
    """Agrupa quem quer jogar junto (amigo de amigo tambem fica no grupo)."""
    pai = {i: i for i in ids}

    def raiz(x):
        while pai[x] != x:
            pai[x] = pai[pai[x]]
            x = pai[x]
        return x

    for g in amigos:
        g = [i for i in g if i in pai]
        for outro in g[1:]:
            pai[raiz(outro)] = raiz(g[0])
    grupos = {}
    for i in ids:
        grupos.setdefault(raiz(i), []).append(i)
    return list(grupos.values())


def formar_times(jogs, amigos, tamanho, equilibrar=True, rng=random):
    """Devolve listas de ids. Times cheios primeiro; se sobrar gente, o ultimo time fica incompleto.

    Quem pediu para jogar junto cai no mesmo time (se couber). Com `equilibrar`, os
    grupos mais fortes sao distribuidos primeiro, sempre no time mais fraco.
    """
    n = len(jogs)
    caps = [tamanho] * (n // tamanho) + ([n % tamanho] if n % tamanho else [])
    if not caps:
        return []
    nivel = {j["id"]: j["nivel"] for j in jogs}
    grupos = componentes([j["id"] for j in jogs], amigos)
    rng.shuffle(grupos)
    if equilibrar:
        grupos.sort(key=lambda g: -sum(nivel[i] for i in g))
    times = [[] for _ in caps]

    def chave(i):
        if not equilibrar:
            return rng.random()
        return sum(nivel[x] for x in times[i]) / caps[i] + rng.random() * 0.01

    for g in grupos:
        g = list(g)
        rng.shuffle(g)
        while g:
            livres = [i for i in range(len(caps)) if len(times[i]) < caps[i]]
            cabem = [i for i in livres if caps[i] - len(times[i]) >= len(g)]
            if cabem:
                alvo = min(cabem, key=chave)
                times[alvo] += g
                g = []
            else:
                alvo = min(livres, key=chave)
                sobra = caps[alvo] - len(times[alvo])
                times[alvo] += g[:sobra]
                g = g[sobra:]
    return times


def _por_id(dados):
    return {j["id"]: j for j in dados["jogadores"]}


def media_nivel(dados, ids):
    p = _por_id(dados)
    return sum(p[i]["nivel"] for i in ids) / len(ids) if ids else 0


def escalar(dados, base, ocupados, pool, rng=random, media_alvo=None):
    """Monta quem joga de verdade: o time base + emprestados de `pool` se faltar gente.

    Escolha de quem empresta: 1) amigo de alguem do time (pedido de jogar junto),
    2) quem jogou menos hoje, 3) quem deixa o time mais parecido com o adversario.
    Devolve (membros, emprestados).
    """
    p = _por_id(dados)

    def livre(i):
        return i in p and p[i]["presente"] and i not in ocupados

    membros = [i for i in base if livre(i)]
    extras = []
    amigos = pares(dados["amigos"])
    falta = dados["config"]["tamanho"] - len(membros)
    cand = [i for i in dict.fromkeys(pool) if livre(i) and i not in membros]
    while falta > 0 and cand:
        atual = membros + extras

        def custo(c):
            c_ = p[c]["jogos"]
            if media_alvo is not None:
                niveis = [p[i]["nivel"] for i in atual] + [p[c]["nivel"]]
                c_ += abs(sum(niveis) / len(niveis) - media_alvo)
            if any(frozenset((c, m)) in amigos for m in atual):
                c_ -= 100
            return c_ + rng.random() * 0.01

        esc = min(cand, key=custo)
        extras.append(esc)
        cand.remove(esc)
        falta -= 1
    return membros + extras, extras


def _novo_tid(dados):
    dados["prox_tid"] += 1
    return dados["prox_tid"]


def iniciar(dados, times, rng=random):
    """Comeca a rotacao: os 2 primeiros times vao para a quadra, o resto forma a fila."""
    if len(times) < 2:
        return False
    ts = [{"tid": _novo_tid(dados), "base": list(t)} for t in times]
    ta, tb = ts.pop(0), ts.pop(0)
    pool = [i for t in ts for i in t["base"]]
    ma, ea = escalar(dados, ta["base"], set(), pool, rng)
    mb, eb = escalar(dados, tb["base"], set(ma), pool, rng, media_alvo=media_nivel(dados, ma))
    dados["quadra"] = {
        "a": {**ta, "membros": ma, "extra": ea, "seq": 0},
        "b": {**tb, "membros": mb, "extra": eb, "seq": 0},
    }
    dados["fila"] = ts
    dados["eventos"] = []
    dados["rodaram"] = [ta["tid"], tb["tid"]]
    return True


def finalizar(dados, rng=random):
    """Fecha a partida: soma estatisticas, perdedor vai para o fim da fila, proximo entra."""
    q = dados["quadra"]
    c = calcular(dados["eventos"], dados["config"]["alvo"])
    if not c["venc"]:
        return False
    gan = c["venc"]
    per = "b" if gan == "a" else "a"
    G, P = q[gan], q[per]
    p = _por_id(dados)
    for i in G["membros"]:
        p[i]["jogos"] += 1
        p[i]["vitorias"] += 1
    for i in P["membros"]:
        p[i]["jogos"] += 1
        p[i]["derrotas"] += 1
    G["seq"] += 1
    dados["recorde"] = max(dados.get("recorde", 0), G["seq"])
    dados["historico"].append({
        "vencedor": [p[i]["nome"] for i in G["membros"]],
        "perdedor": [p[i]["nome"] for i in P["membros"]],
        "placar": f"{c['a']} x {c['b']}" if gan == "a" else f"{c['b']} x {c['a']}",
        "seq": G["seq"],
        "tid": G["tid"],
    })
    dados["fila"].append({"tid": P["tid"], "base": P["base"]})
    prox = dados["fila"].pop(0)
    pool = [i for t in dados["fila"] for i in t["base"]]
    membros, extras = escalar(dados, prox["base"], set(G["membros"]), pool, rng,
                              media_alvo=media_nivel(dados, G["membros"]))
    q[per] = {"tid": prox["tid"], "base": prox["base"], "membros": membros,
              "extra": extras, "seq": 0}
    if prox["tid"] not in dados["rodaram"]:
        dados["rodaram"].append(prox["tid"])
    dados["eventos"] = []
    return True


def remover_jogador(dados, pid):
    dados["jogadores"] = [j for j in dados["jogadores"] if j["id"] != pid]
    dados["amigos"] = [g for g in ([i for i in g if i != pid] for g in dados["amigos"])
                       if len(g) >= 2]
    for t in dados["fila"]:
        t["base"] = [i for i in t["base"] if i != pid]
    dados["fila"] = [t for t in dados["fila"] if t["base"]]
    if dados.get("quadra"):
        for lado in dados["quadra"].values():
            for k in ("base", "membros", "extra"):
                lado[k] = [i for i in lado[k] if i != pid]
