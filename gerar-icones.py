#!/usr/bin/env python3
"""
Gera os icones do PWA.

Sem Pillow e sem nenhuma dependencia: o PNG e montado na mao com zlib e
struct, que sao da biblioteca padrao. Um icone que e uma forma
geometrica plana nao justifica instalar uma biblioteca de imagem na
maquina, e assim o script funciona em qualquer lugar que tenha Python.

    python gerar-icones.py

Escreve em public/.
"""

import math
import struct
import zlib
from pathlib import Path

SAIDA = Path(__file__).resolve().parent / "public"

FUNDO = (44, 46, 42)      # --ink
SIMBOLO = (142, 212, 98)  # --entrada-fill

# 3x em cada eixo: media de 9 amostras por pixel, o suficiente para a
# curva do arco nao sair serrilhada.
AMOSTRAS = 3


def velocimetro(dx: float, dy: float) -> bool:
    """
    O simbolo do app: arco aberto embaixo com um ponteiro.

    Le como painel de carro e como a palavra "giro" ao mesmo tempo.
    Definido por distancia e angulo, entao nao depende de fonte nem de
    arquivo externo -- o desenho e a formula.

    Coordenadas ja centradas e normalizadas, de -1 a 1.
    """
    r_ext, espessura = 0.66, 0.17
    r_int = r_ext - espessura

    d = math.hypot(dx, dy)
    ang = math.degrees(math.atan2(dy, dx))

    # Arco de 220 graus, com a abertura voltada para baixo.
    no_arco = r_int <= d <= r_ext and not (50 <= ang <= 130)

    # Ponteiro saindo do centro para cima-direita, afinando na ponta.
    a = math.radians(-35)
    px, py = math.cos(a), math.sin(a)
    proj = dx * px + dy * py
    perp = abs(-dx * py + dy * px)
    no_ponteiro = 0 <= proj <= 0.52 and perp <= 0.075 * (1 - proj / 0.8)

    # Eixo central.
    return no_arco or no_ponteiro or d <= 0.13


def desenhar(lado: int, escala: float = 1.0) -> bytes:
    """
    Devolve os bytes RGB da imagem.

    `escala` menor que 1 encolhe o simbolo: 0.72 deixa a folga que o
    formato maskable exige para o sistema poder recortar em circulo,
    losango ou o que o aparelho usar.
    """
    linhas = []
    passo = 1.0 / AMOSTRAS
    centro = lado / 2
    raio = lado / 2

    for py in range(lado):
        linha = bytearray([0])  # filtro "none" no inicio de cada linha PNG

        for px in range(lado):
            acertos = 0
            for sy in range(AMOSTRAS):
                for sx in range(AMOSTRAS):
                    x = px + (sx + 0.5) * passo
                    y = py + (sy + 0.5) * passo
                    nx = (x - centro) / (raio * escala)
                    ny = (y - centro) / (raio * escala)
                    if velocimetro(nx, ny):
                        acertos += 1

            cobertura = acertos / (AMOSTRAS * AMOSTRAS)
            for canal in range(3):
                valor = FUNDO[canal] * (1 - cobertura) + SIMBOLO[canal] * cobertura
                linha.append(int(round(valor)))

        linhas.append(bytes(linha))

    return b"".join(linhas)


def escrever_png(caminho: Path, lado: int, dados: bytes) -> None:
    def bloco(tipo: bytes, conteudo: bytes) -> bytes:
        cabecalho = struct.pack(">I", len(conteudo)) + tipo + conteudo
        return cabecalho + struct.pack(">I", zlib.crc32(tipo + conteudo))

    ihdr = struct.pack(">IIBBBBB", lado, lado, 8, 2, 0, 0, 0)  # 8 bits, RGB

    png = (
        b"\x89PNG\r\n\x1a\n"
        + bloco(b"IHDR", ihdr)
        + bloco(b"IDAT", zlib.compress(dados, 9))
        + bloco(b"IEND", b"")
    )
    caminho.write_bytes(png)


def main() -> int:
    SAIDA.mkdir(exist_ok=True)

    # (arquivo, lado, escala do simbolo)
    icones = [
        ("icone-192.png", 192, 1.0),
        ("icone-512.png", 512, 1.0),
        ("icone-maskable-512.png", 512, 0.72),
        ("apple-touch-icon.png", 180, 1.0),
    ]

    for nome, lado, escala in icones:
        destino = SAIDA / nome
        escrever_png(destino, lado, desenhar(lado, escala))
        print(f"  {nome:26} {lado}x{lado}  {destino.stat().st_size / 1024:.1f} KB")

    print(f"\nGerados em {SAIDA}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
