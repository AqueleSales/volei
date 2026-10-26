import base64
import html
import io
import json
import random
from pathlib import Path

import streamlit as st
from PIL import Image, ImageOps

import logica as L

ARQ = Path(__file__).resolve().with_name("dados_volei.json")
NIVEIS = {1: "1 - Iniciante / precisa de ajuda", 2: "2 - Joga pouco", 3: "3 - Medio",
          4: "4 - Joga bem", 5: "5 - Craque"}
NOMES_INICIAIS = ["Regina", "Raphael", "Bruno", "Isabella", "José", "Ester", "Ana lys",
                  "Ana luísa", "Miguel", "Cristiano", "Gabriel Sales", "Mirella", "Thiago",
                  "Sara", "Oséias", "Davi"]

st.set_page_config(page_title="Volei", layout="centered")
st.markdown("""
<style>
  .placar {font-size:5rem;font-weight:800;text-align:center;line-height:1;margin:6px 0;}
  .linha {display:flex;align-items:center;gap:10px;padding:6px 8px;margin-bottom:6px;
          border:1px solid rgba(128,128,128,.3);border-radius:8px;}
  .linha img,.linha .ini {width:40px;height:40px;border-radius:50%;object-fit:cover;flex:none;}
  .ini {display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;}
  .tag {font-size:.7rem;background:#F59E0B;color:#000;border-radius:4px;padding:1px 6px;}
  .nv {font-size:.75rem;opacity:.6;margin-left:auto;}
  .stButton>button {min-height:3rem;border-radius:12px;transition:transform .12s;}
  .stButton>button:active {transform:scale(.94);}
  .stApp {background:radial-gradient(circle at top,rgba(59,130,246,.10),transparent 55%);}
  @keyframes subir {from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:none}}
  @keyframes pop {0%{transform:scale(.4);opacity:.2} 60%{transform:scale(1.25)} 100%{transform:scale(1)}}
  @keyframes pulsar {50%{opacity:.6}}
  .linha {animation:subir .35s ease both;}
  .placar {animation:pop .35s ease;}
  .time-a,.time-b {border-radius:12px;padding:8px 12px;font-weight:700;color:#fff;margin-bottom:8px;
          animation:subir .35s ease both;}
  .time-a {background:linear-gradient(135deg,#2563EB,#38BDF8);}
  .time-b {background:linear-gradient(135deg,#EA580C,#FBBF24);}
  .banner {text-align:center;font-size:1.4rem;font-weight:800;padding:12px;border-radius:12px;
           background:linear-gradient(135deg,#16A34A,#4ADE80);color:#fff;animation:pop .5s ease;}
  .tiro {text-align:center;font-weight:800;padding:10px;border-radius:12px;background:#DC2626;color:#fff;
         animation:pulsar 1s infinite;}
</style>
""", unsafe_allow_html=True)


# ---------- dados ----------
def novo_dados():
    return {
        "jogadores": [{"id": i + 1, "nome": n, "nivel": 3, "foto": None, "presente": True,
                       "jogos": 0, "vitorias": 0, "derrotas": 0}
                      for i, n in enumerate(NOMES_INICIAIS)],
        "amigos": [], "fila": [], "quadra": None, "eventos": [], "historico": [],
        "rodaram": [], "recorde": 0, "prox_tid": 0, "prox_id": len(NOMES_INICIAIS) + 1,
        "config": {"tamanho": 6, "alvo": 11},
    }


def carregar():
    try:
        return json.loads(ARQ.read_text(encoding="utf-8"))
    except Exception:
        return novo_dados()


def salvar():
    ARQ.write_text(json.dumps(D, ensure_ascii=False), encoding="utf-8")


if "dados" not in st.session_state:
    st.session_state.dados = carregar()
D = st.session_state.dados
POR_ID = {j["id"]: j for j in D["jogadores"]}
if "n_form" not in st.session_state:
    st.session_state.n_form = 0
if "rascunho" not in st.session_state:
    st.session_state.rascunho = []


# ---------- fotos ----------
def processar_foto(arquivo):
    img = ImageOps.exif_transpose(Image.open(arquivo)).convert("RGB")
    img = ImageOps.fit(img, (200, 200))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=80)
    return base64.b64encode(buf.getvalue()).decode()


def girar_foto(pid):
    j = POR_ID[pid]
    if j["foto"]:
        img = Image.open(io.BytesIO(base64.b64decode(j["foto"]))).rotate(-90, expand=True)
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=80)
        j["foto"] = base64.b64encode(buf.getvalue()).decode()
        salvar()


def avatar(j, tam=40):
    if j["foto"]:
        return f'<img src="data:image/jpeg;base64,{j["foto"]}" style="width:{tam}px;height:{tam}px">'
    cor = f"hsl({sum(map(ord, j['nome'])) * 37 % 360},55%,45%)"
    ini = html.escape(j["nome"][:1].upper())
    return f'<div class="ini" style="background:{cor};width:{tam}px;height:{tam}px">{ini}</div>'


def linha(pid, emprestado=False):
    j = POR_ID.get(pid)
    if not j:
        return ""
    tag = ' <span class="tag">emprestado</span>' if emprestado else ""
    return (f'<div class="linha">{avatar(j)}<span>{html.escape(j["nome"])}{tag}</span>'
            f'<span class="nv">nivel {j["nivel"]}</span></div>')


# ---------- acoes (callbacks) ----------
def ponto(lado):
    D["eventos"].append(lado)
    salvar()


def desfazer():
    if D["eventos"]:
        D["eventos"].pop()
        salvar()


def encerrar():
    L.finalizar(D)
    salvar()


def adicionar_jogador():
    nome = st.session_state.get("novo_nome", "").strip()
    if not nome:
        return
    if any(j["nome"].lower() == nome.lower() for j in D["jogadores"]):
        st.session_state.aviso = "Ja existe alguem com esse nome."
        return
    n = st.session_state.n_form
    arq = st.session_state.get(f"novo_cam_{n}") or st.session_state.get(f"novo_arq_{n}")
    D["jogadores"].append({
        "id": D["prox_id"], "nome": nome, "nivel": st.session_state.get("novo_nivel", 3),
        "foto": processar_foto(arq) if arq else None, "presente": True,
        "jogos": 0, "vitorias": 0, "derrotas": 0})
    D["prox_id"] += 1
    if "presentes" in st.session_state:
        st.session_state.presentes = st.session_state.presentes + [D["prox_id"] - 1]
    st.session_state.novo_nome = ""
    st.session_state.n_form += 1
    salvar()


def salvar_jogador(pid):
    j = POR_ID[pid]
    nome = st.session_state[f"nome_{pid}"].strip()
    if nome:
        j["nome"] = nome
    j["nivel"] = st.session_state[f"nivel_{pid}"]
    arq = st.session_state.get(f"cam_{pid}") or st.session_state.get(f"arq_{pid}")
    if arq:
        j["foto"] = processar_foto(arq)
    salvar()


def tirar_foto_do_jogador(pid):
    POR_ID[pid]["foto"] = None
    salvar()


def excluir_jogador(pid):
    L.remover_jogador(D, pid)
    if "presentes" in st.session_state:
        st.session_state.presentes = [i for i in st.session_state.presentes if i != pid]
    salvar()


def definir_presentes():
    marcados = set(st.session_state.presentes)
    for j in D["jogadores"]:
        j["presente"] = j["id"] in marcados
    salvar()


def marcar_todos(valor):
    st.session_state.presentes = [j["id"] for j in D["jogadores"]] if valor else []
    definir_presentes()


def definir_config():
    D["config"]["tamanho"] = st.session_state.cfg_tamanho
    D["config"]["alvo"] = st.session_state.cfg_alvo
    salvar()


def add_grupo():
    g = list(st.session_state.grupo_novo)
    if len(g) >= 2:
        D["amigos"].append(g)
        st.session_state.grupo_novo = []
        salvar()


def rem_amigos(i):
    D["amigos"].pop(i)
    salvar()


def gerar(equilibrar):
    pres = [j for j in D["jogadores"] if j["presente"]]
    st.session_state.rascunho = L.formar_times(
        pres, D["amigos"], D["config"]["tamanho"], equilibrar, random)


def comecar(times):
    if L.iniciar(D, times):
        st.session_state.rascunho = []
        salvar()


def zerar_dia():
    novo = novo_dados()
    for k in ("fila", "quadra", "eventos", "historico", "rodaram", "recorde", "prox_tid"):
        D[k] = novo[k]
    for j in D["jogadores"]:
        j["jogos"] = j["vitorias"] = j["derrotas"] = 0
    salvar()


nome_fmt = lambda pid: POR_ID[pid]["nome"] if pid in POR_ID else "?"
tab_jogo, tab_times, tab_elenco, tab_stats = st.tabs(["🏐 Jogo", "👥 Times", "🧑 Elenco", "📊 Estatisticas"])

# ---------- JOGO ----------
with tab_jogo:
    q = D["quadra"]
    if not q:
        st.info("Va na aba Times, escolha quem veio e clique em Comecar jogos.")
    else:
        c = L.calcular(D["eventos"], D["config"]["alvo"])
        m1, m2, m3 = st.columns(3)
        m1.metric("Times que rodaram", len(D["rodaram"]))
        m2.metric("Maior sequencia", D["recorde"])
        m3.metric("Partidas", len(D["historico"]))
        cols = st.columns(2)
        for lado, col in zip(("a", "b"), cols):
            t = q[lado]
            with col:
                st.markdown(f'<div class="time-{lado}">Time {lado.upper()} · nº {t["tid"]}</div>',
                            unsafe_allow_html=True)
                if t["seq"]:
                    st.caption(f"{t['seq']} vitoria(s) seguida(s) em quadra")
                st.markdown("".join(linha(i, i in t["extra"]) for i in t["membros"]),
                            unsafe_allow_html=True)
                with st.container(key=f"pl_{lado}_{c[lado]}_{len(D['historico'])}"):
                    st.markdown(f'<div class="placar">{c[lado]}</div>', unsafe_allow_html=True)
                st.button(f"+1 Time {lado.upper()}", key=f"p_{lado}", type="primary",
                          width="stretch", on_click=ponto, args=(lado,),
                          disabled=bool(c["venc"]))
        if c["tiro"] and not c["venc"]:
            st.markdown(f'<div class="tiro">TIRO! Precisa de {c["precisa"]} pontos seguidos</div>',
                        unsafe_allow_html=True)
        if c["venc"]:
            st.markdown(f'<div class="banner">🏆 Time {c["venc"].upper()} venceu! {c["a"]} x {c["b"]}</div>',
                        unsafe_allow_html=True)
            if st.session_state.get("festejo") != len(D["historico"]):
                st.session_state.festejo = len(D["historico"])
                st.balloons()
            st.button("Encerrar e chamar o proximo", type="primary", width="stretch",
                      on_click=encerrar)
        st.button("Desfazer ultimo ponto", width="stretch", on_click=desfazer,
                  disabled=not D["eventos"])

        if D["fila"]:
            st.markdown("---")
            st.subheader("Fila")
            em_quadra = set(q["a"]["membros"]) | set(q["b"]["membros"])
            amigos = L.pares(D["amigos"])
            for n, t in enumerate(D["fila"], 1):
                falta = D["config"]["tamanho"] - len(t["base"])
                with st.expander(f"Proximo {n}: " + ", ".join(nome_fmt(i) for i in t["base"])
                                 + (f"  (faltam {falta})" if falta > 0 else ""),
                                 expanded=(n == 1)):
                    if falta > 0:
                        st.caption("Time quebrado: ao entrar, completa com quem jogou menos "
                                   "(amigos dos que estao no time vem primeiro).")
                    for i in t["base"]:
                        for o in em_quadra:
                            if frozenset((i, o)) in amigos:
                                st.caption(f"{nome_fmt(i)} quer jogar com {nome_fmt(o)} "
                                           "(em quadra agora).")

# ---------- TIMES ----------
with tab_times:
    st.subheader("Quem veio hoje")
    st.session_state.setdefault("presentes", [j["id"] for j in D["jogadores"] if j["presente"]])
    st.session_state.setdefault("cfg_tamanho", D["config"]["tamanho"])
    st.session_state.setdefault("cfg_alvo", D["config"]["alvo"])
    st.pills("Presentes", [j["id"] for j in D["jogadores"]], selection_mode="multi",
             format_func=nome_fmt, key="presentes", on_change=definir_presentes,
             label_visibility="collapsed")
    t1, t2 = st.columns(2)
    t1.button("Todo mundo veio", on_click=marcar_todos, args=(True,), width="stretch")
    t2.button("Limpar", on_click=marcar_todos, args=(False,), width="stretch")
    pres = [j for j in D["jogadores"] if j["presente"]]
    cA, cB = st.columns(2)
    cA.number_input("Jogadores por time", 2, 6, key="cfg_tamanho",
                    on_change=definir_config)
    cB.number_input("Pontos da partida", 5, 25, key="cfg_alvo",
                    on_change=definir_config)
    tam = D["config"]["tamanho"]
    st.caption(f"{len(pres)} presentes = {len(pres) // tam} time(s) completo(s)"
               + (f" + 1 incompleto com {len(pres) % tam}" if len(pres) % tam else "") + ".")

    with st.expander(f"🤝 Quem quer jogar junto ({len(D['amigos'])} grupos)"):
        st.caption("Escolha 2 ou mais pessoas que querem ficar no mesmo time. Pode ser um time "
                   "fechado inteiro.")
        st.multiselect("Grupo", [j["id"] for j in D["jogadores"]], format_func=nome_fmt,
                       key="grupo_novo")
        st.button("Juntar esse grupo", on_click=add_grupo, type="primary")
        for i, g in enumerate(D["amigos"]):
            u, v = st.columns([5, 1])
            u.markdown(" + ".join(f"**{nome_fmt(p)}**" for p in g))
            v.button("Desfazer", key=f"ra_{i}", on_click=rem_amigos, args=(i,))

    modo = st.radio("Como montar", ["Equilibrado (recomendado)", "Sorteio puro", "Montar a mao"],
                    horizontal=True)
    times = []
    if modo == "Montar a mao":
        n_times = st.number_input("Quantos times", 2, 8, max(2, len(pres) // tam))
        usados = set()
        for i in range(int(n_times)):
            livres = [j["id"] for j in pres]
            sel = st.multiselect(f"Time {i + 1}", livres, format_func=nome_fmt, key=f"man_{i}")
            times.append(sel)
        todos = [i for t in times for i in t]
        if len(todos) != len(set(todos)):
            st.error("Tem gente em dois times.")
            times = []
        times = [t for t in times if t]
    else:
        st.button("Gerar / sortear de novo", on_click=gerar, args=(modo.startswith("Equil"),),
                  width="stretch")
        times = st.session_state.rascunho
    for i, t in enumerate(times, 1):
        falta = tam - len(t)
        st.markdown(f"**Time {i}** · nivel medio {L.media_nivel(D, t):.1f}"
                    + (f" · faltam {falta} (completa na hora)" if falta > 0 else ""))
        st.markdown("".join(linha(p) for p in t), unsafe_allow_html=True)
    if len(times) >= 2:
        if D["quadra"]:
            st.caption("Aviso: comecar de novo substitui o jogo atual (estatisticas ficam).")
        st.button("Comecar jogos", type="primary", width="stretch",
                  on_click=comecar, args=(times,))

# ---------- ELENCO ----------
with tab_elenco:
    st.subheader("Novo jogador")
    if st.session_state.get("aviso"):
        st.warning(st.session_state.pop("aviso"))
    n = st.session_state.n_form
    st.text_input("Nome", key="novo_nome")
    st.select_slider("Nivel", list(NIVEIS), 3, format_func=NIVEIS.get, key="novo_nivel")
    st.file_uploader("Foto (no celular abre a camera ou a galeria)", ["jpg", "jpeg", "png"],
                     key=f"novo_arq_{n}")
    if st.checkbox("Usar camera do navegador", key=f"usar_cam_{n}"):
        st.camera_input("Tirar foto", key=f"novo_cam_{n}")
    st.button("Adicionar", type="primary", on_click=adicionar_jogador)

    st.markdown("---")
    st.subheader(f"Jogadores ({len(D['jogadores'])})")
    for j in D["jogadores"]:
        pid = j["id"]
        with st.expander(f"{j['nome']}  ·  nivel {j['nivel']}"):
            st.markdown(avatar(j, 80), unsafe_allow_html=True)
            st.text_input("Nome", j["nome"], key=f"nome_{pid}")
            st.select_slider("Nivel", list(NIVEIS), j["nivel"], format_func=NIVEIS.get,
                             key=f"nivel_{pid}")
            st.file_uploader("Trocar foto", ["jpg", "jpeg", "png"], key=f"arq_{pid}")
            if st.checkbox("Tirar foto agora", key=f"usar_cam_{pid}"):
                st.camera_input("Camera", key=f"cam_{pid}")
            b1, b2, b3, b4 = st.columns(4)
            b1.button("Salvar", key=f"sv_{pid}", type="primary", on_click=salvar_jogador,
                      args=(pid,))
            b2.button("Girar foto", key=f"gr_{pid}", on_click=girar_foto, args=(pid,),
                      disabled=not j["foto"])
            b3.button("Tirar foto", key=f"rf_{pid}", on_click=tirar_foto_do_jogador, args=(pid,),
                      disabled=not j["foto"], help="Remove a foto")
            b4.button("Excluir", key=f"ex_{pid}", on_click=excluir_jogador, args=(pid,))

# ---------- ESTATISTICAS ----------
with tab_stats:
    ranking = sorted(D["jogadores"], key=lambda j: (-j["vitorias"], j["derrotas"]))
    st.dataframe([{"Nome": j["nome"], "Jogos": j["jogos"], "Vitorias": j["vitorias"],
                   "Derrotas": j["derrotas"],
                   "Aproveitamento": f"{j['vitorias'] / j['jogos'] * 100:.0f}%" if j["jogos"] else "-"}
                  for j in ranking], width="stretch", hide_index=True)
    st.subheader("Historico")
    for h in reversed(D["historico"]):
        st.markdown(f"**{h['placar']}** · {', '.join(h['vencedor'])} venceu "
                    f"({h['seq']}ª seguida) contra {', '.join(h['perdedor'])}")
    if not D["historico"]:
        st.caption("Nenhuma partida ainda.")
    st.markdown("---")
    with st.popover("🗑️ Zerar o dia", width="stretch"):
        st.write("Apaga os jogos e as estatisticas de hoje. Jogadores e fotos ficam.")
        st.button("Sim, zerar tudo", type="primary", on_click=zerar_dia, width="stretch")
