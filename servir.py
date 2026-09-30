#!/usr/bin/env python3
"""
Servidor local do Giro.

Modulos ES e o login do Supabase nao funcionam em file:// -- por isso o
projeto precisa ser aberto por http://, mesmo sem etapa de build.

    python servir.py           so neste computador
    python servir.py --rede    tambem no celular, pela rede de casa
    python servir.py 8080      outra porta

O padrao escuta apenas em 127.0.0.1. Com --rede ele passa a aceitar
conexoes de qualquer aparelho da mesma rede, o que e necessario para
testar no celular -- e o motivo de nao ser o padrao.
"""

import http.server
import socket
import socketserver
import sys
import webbrowser
from pathlib import Path

PORTA = 8000
RAIZ = Path(__file__).resolve().parent


def ip_da_rede() -> str:
    """Descobre o IP desta maquina na rede local, sem enviar nada."""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(("10.255.255.255", 1))  # nao trafega, so resolve a rota
            return s.getsockname()[0]
        except OSError:
            return "127.0.0.1"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(RAIZ), **kwargs)

    def end_headers(self):
        # Sem cache: durante o desenvolvimento, um arquivo velho em cache
        # faz perder tempo procurando bug que ja foi corrigido.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, formato, *args):
        # Silencia o log de cada arquivo; so erros importam aqui.
        if not args or not str(args[0]).startswith(("GET", "HEAD")):
            super().log_message(formato, *args)


def main() -> int:
    argumentos = sys.argv[1:]
    rede = "--rede" in argumentos
    porta = PORTA

    for arg in argumentos:
        if arg == "--rede":
            continue
        try:
            porta = int(arg)
        except ValueError:
            print(f"Argumento invalido: {arg}")
            return 1

    endereco = "0.0.0.0" if rede else "127.0.0.1"

    try:
        with socketserver.TCPServer((endereco, porta), Handler) as servidor:
            url = f"http://localhost:{porta}"
            print(f"Giro rodando em {url}")
            if rede:
                print(f"No celular:   http://{ip_da_rede()}:{porta}")
                print("(o celular precisa estar no mesmo wi-fi)")
            print("Ctrl+C para parar.")
            webbrowser.open(url)
            servidor.serve_forever()
    except OSError as erro:
        print(f"Nao consegui abrir a porta {porta}: {erro}")
        print(f"Tente outra porta:  python servir.py {porta + 1}")
        return 1
    except KeyboardInterrupt:
        print("\nParado.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
