#!/usr/bin/env python3
"""
Verificacao de contraste do Giro.

Le as cores de src/styles/tokens.css e confere cada combinacao que o app
realmente usa contra o WCAG AA. Existe porque a referencia de design
(MindMarket) traz pares que reprovam -- branco sobre o coral da 2,72 --
e "priorizar acessibilidade e contraste" e requisito do projeto, nao
gosto pessoal.

    python verificar-contraste.py

Nao altera nada. Sai com codigo 1 se algo reprovar.
"""

import re
import sys
from pathlib import Path

TOKENS = Path(__file__).resolve().parent / "src" / "styles" / "tokens.css"

VERDE, VERMELHO, AMARELO, CINZA, FIM = (
    "\033[32m", "\033[31m", "\033[33m", "\033[90m", "\033[0m"
)

# (frente, fundo, descricao, minimo)
# 4.5 = texto normal | 3.0 = texto grande (>=24px) e elemento de interface
PARES = [
    ("ink",       "papel",       "texto principal na pagina",      4.5),
    ("ink",       "papel-alto",  "texto principal em card",        4.5),
    ("ink-2",     "papel",       "texto de apoio na pagina",       4.5),
    ("ink-2",     "papel-alto",  "texto de apoio em card",         4.5),
    ("ink-3",     "papel-alto",  "placeholder em campo",           3.0),

    ("entrada",   "papel",       "valor de ganho na pagina",       4.5),
    ("entrada",   "papel-alto",  "valor de ganho em card",         4.5),
    ("entrada",   "entrada-bg",  "texto em aviso de sucesso",      4.5),
    ("sobre-fill", "entrada-fill", "texto no botao de ganho",      4.5),

    ("saida",     "papel",       "valor de gasto na pagina",       4.5),
    ("saida",     "papel-alto",  "valor de gasto em card",         4.5),
    ("saida",     "saida-bg",    "texto em aviso de erro",         4.5),
    ("sobre-fill", "saida-fill", "texto no botao de gasto",        4.5),

    ("alerta",    "papel",       "texto de alerta na pagina",      4.5),
    ("alerta",    "alerta-bg",   "texto em aviso de atencao",      4.5),
    ("sobre-fill", "alerta-fill", "texto sobre faixa amarela",     4.5),

    ("linha",     "papel",       "borda estrutural",               3.0),
    ("linha",     "papel-alto",  "borda de card",                  3.0),
]


def luminancia(hexa: str) -> float:
    hexa = hexa.lstrip("#")
    if len(hexa) == 3:
        hexa = "".join(c * 2 for c in hexa)
    canais = [int(hexa[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    linear = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
              for c in canais]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def razao(a: str, b: str) -> float:
    la, lb = luminancia(a), luminancia(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def ler_temas(texto: str) -> dict[str, dict[str, str]]:
    """
    Separa as cores do tema claro (bloco :root inicial) das do escuro
    (bloco [data-tema="escuro"]). O escuro herda tudo que nao redefine.
    """
    def cores_de(trecho: str) -> dict[str, str]:
        return {
            nome: valor
            for nome, valor in re.findall(
                r"--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*;", trecho
            )
        }

    inicio_escuro = texto.index('[data-tema="escuro"]')
    claro = cores_de(texto[:texto.index("@media")])
    escuro = {**claro, **cores_de(texto[inicio_escuro:])}
    return {"claro": claro, "escuro": escuro}


def main() -> int:
    if not TOKENS.exists():
        sys.exit(f"Nao encontrei {TOKENS}")

    temas = ler_temas(TOKENS.read_text(encoding="utf-8"))
    problemas = 0
    largura = max(len(d) for _, _, d, _ in PARES)

    for tema, cores in temas.items():
        print(f"\n{CINZA}tema {tema}{FIM}")

        for frente, fundo, descricao, minimo in PARES:
            if frente not in cores or fundo not in cores:
                print(f"  {AMARELO}?{FIM} {descricao.ljust(largura)}  "
                      f"token ausente ({frente} ou {fundo})")
                problemas += 1
                continue

            r = razao(cores[frente], cores[fundo])
            passou = r >= minimo

            if not passou:
                problemas += 1

            marca = f"{VERDE}ok{FIM}" if passou else f"{VERMELHO}REPROVA{FIM}"
            alvo = f"{CINZA}(min {minimo}){FIM}"
            print(f"  {marca:12} {descricao.ljust(largura)}  "
                  f"{r:5.2f}  {alvo}")

    print()
    if problemas:
        print(f"{VERMELHO}{problemas} combinacao(oes) reprovada(s).{FIM} "
              f"Ajuste tokens.css.")
        return 1

    total = len(PARES) * len(temas)
    print(f"{VERDE}As {total} combinacoes passam no WCAG AA{FIM} "
          f"{CINZA}(nos dois temas){FIM}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
