"""
Crea una cuenta del personal, por ejemplo el primer administrador (las
demás las puede crear un administrador desde la pantalla "Usuarios").

Uso, dentro del contenedor (pide la contraseña sin mostrarla):

    docker compose exec api python -m app.scripts.crear_personal \
        --nombre "Ana Pérez" --correo ana@eps.co --rol administrador

Roles: administrador, agendamiento, call_center, coordinador_medico.
Sin terminal interactiva (p. ej. en un script), la contraseña se puede
pasar en la variable de entorno SALUDYA_PASSWORD_NUEVA.
"""

import argparse
import getpass
import os
import sys

from app.core.database import SessionLocal
from app.models.personal import RolPersonal
from app.services import personal_service
from app.services.exceptions import PersonalInvalidoError


def main() -> int:
    parser = argparse.ArgumentParser(description="Crear una cuenta del personal de SaludYA.")
    parser.add_argument("--nombre", required=True)
    parser.add_argument("--correo", required=True)
    parser.add_argument(
        "--rol",
        choices=[r.value for r in RolPersonal],
        default=RolPersonal.ADMINISTRADOR.value,
    )
    args = parser.parse_args()

    password = os.environ.get("SALUDYA_PASSWORD_NUEVA")
    if not password:
        password = getpass.getpass(
            f"Contraseña (mínimo {personal_service.MIN_LONGITUD_PASSWORD} caracteres): "
        )
        if getpass.getpass("Repita la contraseña: ") != password:
            print("Las contraseñas no coinciden.", file=sys.stderr)
            return 1

    db = SessionLocal()
    try:
        personal = personal_service.crear(
            db, args.nombre, args.correo, RolPersonal(args.rol), password
        )
    except PersonalInvalidoError as e:
        print(f"No se pudo crear la cuenta: {e}", file=sys.stderr)
        return 1
    finally:
        db.close()

    print(f"Cuenta creada: {personal.nombre} <{personal.correo}>, rol {personal.rol.value}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
