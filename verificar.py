#!/usr/bin/env python3
"""
Verificacao de seguranca do Giro.

Usa a chave publica (anon) exatamente como um visitante sem login usaria,
e confere que ela NAO consegue ler nada. E o teste que importa: se a
chave publica devolvesse qualquer linha, todo dado do app estaria aberto
para quem abrisse o codigo-fonte da pagina.

    python verificar.py

Nao grava nada e nao precisa de senha.
"""

import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
CONFIG = RAIZ / "src" / "config.js"

TABELAS = [
    "profiles", "categories", "transactions", "fuel_logs",
    "maintenance", "maintenance_plan", "checklists",
    "checklist_items", "checklist_runs",
]

VERDE, VERMELHO, AMARELO, CINZA, FIM = (
    "\033[32m", "\033[31m", "\033[33m", "\033[90m", "\033[0m"
)

OK = f"{VERDE}ok{FIM}"
FALHA = f"{VERMELHO}FALHA{FIM}"
AVISO = f"{AMARELO}aviso{FIM}"


def ler_config() -> tuple[str, str]:
    """Extrai URL e anon key do config.js sem precisar de parser de JS."""
    if not CONFIG.exists():
        sys.exit(f"Nao encontrei {CONFIG}")

    texto = CONFIG.read_text(encoding="utf-8")

    def pegar(nome: str) -> str:
        achado = re.search(rf"{nome}\s*=\s*['\"]([^'\"]+)['\"]", texto)
        return achado.group(1) if achado else ""

    url = pegar("SUPABASE_URL").rstrip("/")
    chave = pegar("SUPABASE_KEY")

    if not url.startswith("https://") or chave.startswith("COLE_AQUI"):
        sys.exit("src/config.js ainda esta sem a URL ou sem a anon key.")

    return url, chave


def requisitar(url: str, headers: dict) -> tuple[int, str]:
    pedido = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(pedido, timeout=15) as resposta:
            return resposta.status, resposta.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as erro:
        return erro.code, erro.read().decode("utf-8", "replace")
    except urllib.error.URLError as erro:
        return 0, str(erro.reason)


def main() -> int:
    url, chave = ler_config()
    projeto = url.removeprefix("https://").split(".")[0]

    print(f"\nProjeto: {CINZA}{projeto}{FIM}")
    print(f"Testando como visitante {CINZA}sem login{FIM}, so com a chave publica.\n")

    headers = {"apikey": chave, "Authorization": f"Bearer {chave}"}
    problemas = 0
    faltando = []

    largura = max(len(t) for t in TABELAS)

    for tabela in TABELAS:
        status, corpo = requisitar(
            f"{url}/rest/v1/{tabela}?select=*&limit=1", headers
        )
        etiqueta = f"  {tabela.ljust(largura)}  "

        if status == 0:
            print(f"{etiqueta}{FALHA}  sem conexao: {corpo}")
            problemas += 1
            continue

        if status == 200:
            try:
                linhas = json.loads(corpo)
            except json.JSONDecodeError:
                linhas = None

            if linhas == []:
                # Resposta correta: a tabela existe e o RLS filtrou tudo.
                print(f"{etiqueta}{OK}    {CINZA}existe, nada visivel sem login{FIM}")
            elif isinstance(linhas, list):
                print(f"{etiqueta}{FALHA}  {len(linhas)} linha(s) VISIVEL sem login")
                problemas += 1
            else:
                print(f"{etiqueta}{AVISO} resposta inesperada: {corpo[:80]}")
        elif "does not exist" in corpo or status == 404:
            print(f"{etiqueta}{AVISO} tabela nao existe ainda")
            faltando.append(tabela)
        elif status in (401, 403):
            # Tambem seguro: negou o acesso em vez de filtrar.
            print(f"{etiqueta}{OK}    {CINZA}acesso negado sem login{FIM}")
        else:
            print(f"{etiqueta}{AVISO} HTTP {status}: {corpo[:80]}")

    # O bucket precisa ser privado: nenhuma URL direta pode funcionar.
    print()
    status, corpo = requisitar(
        f"{url}/storage/v1/object/public/comprovantes/teste.jpg", headers
    )
    etiqueta = f"  {'bucket privado'.ljust(largura)}  "
    if status == 400 and "not found" in corpo.lower():
        print(f"{etiqueta}{OK}    {CINZA}sem acesso publico{FIM}")
    elif status in (400, 404):
        print(f"{etiqueta}{OK}    {CINZA}sem acesso publico{FIM}")
    elif status == 200:
        print(f"{etiqueta}{FALHA}  bucket esta PUBLICO")
        problemas += 1
    else:
        print(f"{etiqueta}{AVISO} HTTP {status}")

    # Resumo ----------------------------------------------------------
    print()
    if faltando:
        print(f"{AMARELO}Faltam {len(faltando)} tabela(s).{FIM} "
              f"Rode supabase/00_tudo.sql no SQL Editor.")
        return 2

    if problemas:
        print(f"{VERMELHO}{problemas} problema(s) de seguranca.{FIM} "
              f"Nao siga para a Etapa 2.")
        return 1

    print(f"{VERDE}Tudo protegido.{FIM} A chave publica nao le nada sem login.")
    print(f"{CINZA}Falta so o teste dentro do app, com as duas contas.{FIM}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
