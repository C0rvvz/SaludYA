"""
Prueba de carga — RNF-21: el sistema debe soportar 500 usuarios concurrentes.

Simula N pacientes conectados al mismo tiempo durante unos segundos. Cada
uno repite el recorrido de "Agendar" (ver especialidades, buscar los
horarios de una especialidad y ver sus especialistas), con una pausa
entre página y página como una persona de verdad. Al final muestra
cuántas peticiones se atendieron, cuántas fallaron y cuánto tardaron
(mediana, p95 y p99).

Cumple si ninguna petición falla y el 95 % responde en menos de 2
segundos (el mismo límite de las búsquedas, RNF-20).

Los pacientes se reparten entre varios procesos: uno solo no alcanza a
mover cientos de conexiones y mediría su propia demora, no la de la API.

No inicia sesión ni agenda: no deja datos en la base ni choca con los
límites de intentos del ingreso.

Uso, dentro del contenedor y con la API corriendo:

    docker compose exec api python -m app.scripts.prueba_carga --usuarios 500 --segundos 60

Contra otra dirección (p. ej. el servidor de producción): --url https://...
"""

import argparse
import asyncio
import random
import statistics
import sys
import time
from multiprocessing import Pool

import httpx

LIMITE_P95 = 2.0  # segundos


async def _paciente(cliente: httpx.AsyncClient, fin: float, especialidades: list[str], tiempos: list[float],
                    errores: list[str]) -> None:
    while time.monotonic() < fin:
        especialidad = random.choice(especialidades)
        for ruta in (
            "/especialidades",
            f"/disponibilidad/buscar?especialidad_id={especialidad}",
            f"/especialistas?especialidad_id={especialidad}",
        ):
            empezo = time.monotonic()
            try:
                respuesta = await cliente.get(ruta)
                if respuesta.status_code == 200:
                    tiempos.append(time.monotonic() - empezo)
                else:
                    errores.append(f"HTTP {respuesta.status_code}")
            except httpx.HTTPError as e:
                errores.append(type(e).__name__)
            await asyncio.sleep(random.uniform(0.5, 2.0))  # lee la página antes de seguir


async def _grupo_async(url: str, usuarios: int, segundos: int) -> tuple[list[float], list[str]]:
    limites = httpx.Limits(max_connections=usuarios, max_keepalive_connections=usuarios)
    async with httpx.AsyncClient(base_url=url, timeout=30, limits=limites) as cliente:
        especialidades = [e["id"] for e in (await cliente.get("/especialidades")).json()]
        tiempos: list[float] = []
        errores: list[str] = []
        fin = time.monotonic() + segundos

        # Llegan escalonados en el primer 10 % del tiempo, no todos en el mismo milisegundo.
        async def llega(i: int) -> None:
            await asyncio.sleep(i * segundos * 0.1 / usuarios)
            await _paciente(cliente, fin, especialidades, tiempos, errores)

        await asyncio.gather(*(llega(i) for i in range(usuarios)))
    return tiempos, errores


def _grupo(url: str, usuarios: int, segundos: int) -> tuple[list[float], list[str]]:
    return asyncio.run(_grupo_async(url, usuarios, segundos))


def _percentil(valores: list[float], p: int) -> float:
    return statistics.quantiles(valores, n=100)[p - 1] if len(valores) > 1 else (valores or [0])[0]


def correr(url: str, usuarios: int, segundos: int, procesos: int) -> bool:
    procesos = max(1, min(procesos, usuarios))
    por_proceso = [usuarios // procesos + (1 if i < usuarios % procesos else 0) for i in range(procesos)]
    print(f"{usuarios} pacientes navegando a la vez durante {segundos} s contra {url} ({procesos} procesos)…")
    empezo = time.monotonic()
    with Pool(procesos) as pool:
        resultados = pool.starmap(_grupo, [(url, n, segundos) for n in por_proceso])
    duracion = time.monotonic() - empezo
    tiempos = [t for grupo, _ in resultados for t in grupo]
    errores = [e for _, grupo in resultados for e in grupo]

    total = len(tiempos) + len(errores)
    p95 = _percentil(tiempos, 95)
    print(f"Peticiones: {total} ({total / duracion:.0f} por segundo)")
    print(f"Fallidas: {len(errores)} ({100 * len(errores) / max(total, 1):.2f} %)"
          + (f" — {', '.join(sorted(set(errores)))}" if errores else ""))
    if tiempos:
        print(f"Tiempo de respuesta: mediana {statistics.median(tiempos):.3f} s · p95 {p95:.3f} s · "
              f"p99 {_percentil(tiempos, 99):.3f} s · máximo {max(tiempos):.3f} s")
    cumple = not errores and bool(tiempos) and p95 < LIMITE_P95
    print("Cumple RNF-21" if cumple else "NO cumple RNF-21: hay fallas o el p95 pasa de 2 s")
    return cumple


def main() -> int:
    parser = argparse.ArgumentParser(description="Prueba de carga con pacientes simultáneos (RNF-21).")
    parser.add_argument("--url", default="http://localhost:8000")
    parser.add_argument("--usuarios", type=int, default=500)
    parser.add_argument("--segundos", type=int, default=60)
    parser.add_argument("--procesos", type=int, default=4, help="Procesos que generan la carga (por defecto 4).")
    args = parser.parse_args()
    if min(args.usuarios, args.segundos, args.procesos) < 1:
        print("--usuarios, --segundos y --procesos deben ser al menos 1.", file=sys.stderr)
        return 1
    return 0 if correr(args.url, args.usuarios, args.segundos, args.procesos) else 1


if __name__ == "__main__":
    sys.exit(main())
