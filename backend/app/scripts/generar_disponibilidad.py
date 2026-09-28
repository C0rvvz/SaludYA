"""
Genera franjas de disponibilidad futuras para los especialistas que ya
existen en la base de datos (ver services/disponibilidad_service.py).

La API ya genera una tanda nueva sola cuando se acaban las franjas
futuras (tarea de fondo en tareas_periodicas.py); este script sirve para
generarlas a mano, por ejemplo más días de una vez.

Uso, dentro del contenedor:

    docker compose exec api python -m app.scripts.generar_disponibilidad --dias 10

Se puede correr las veces que sea: las franjas que ya existen se omiten.
"""

import argparse
import sys

from app.core.database import SessionLocal
from app.services import disponibilidad_service


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generar franjas de disponibilidad futuras para los especialistas."
    )
    parser.add_argument(
        "--dias",
        type=int,
        default=disponibilidad_service.DIAS_POR_TANDA,
        help="Días hábiles a generar desde mañana "
        f"(por defecto {disponibilidad_service.DIAS_POR_TANDA}).",
    )
    args = parser.parse_args()
    if args.dias < 1:
        print("--dias debe ser al menos 1.", file=sys.stderr)
        return 1

    db = SessionLocal()
    try:
        tanda = disponibilidad_service.generar_franjas(db, args.dias)
    finally:
        db.close()

    print(
        f"Franjas creadas: {tanda.creadas} (omitidas por existir: {tanda.omitidas}), "
        f"del {tanda.desde} al {tanda.hasta}."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
