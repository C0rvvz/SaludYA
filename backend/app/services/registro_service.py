"""
Servicio de registro de paciente.

Orquesta, en este orden, lo que piden las 4 historias del bloque de
Registro:
  HU-05/HU-06: valida y crea el paciente con sus datos personales.
  HU-07: registra la aceptación del tratamiento de datos (la validación
         de que sea obligatoria ya ocurrió en el esquema Pydantic).
  HU-08: consulta (simulada) el estado de afiliación a la EPS elegida
         y lo deja guardado en el paciente.
"""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.integrations.eps_mock import consultar_afiliacion_eps
from app.models.paciente import EstadoAfiliacion, Paciente
from app.repositories import eps_repository, paciente_repository
from app.schemas.paciente import PacienteRegistroRequest, PacienteRegistroResponse
from app.services.exceptions import DocumentoYaRegistradoError, EpsNoEncontradaError


def registrar_paciente(db: Session, datos: PacienteRegistroRequest) -> PacienteRegistroResponse:
    # --- HU-08, criterio 1: la EPS elegida debe existir en el catálogo ---
    eps = eps_repository.obtener_eps_por_id(db, datos.eps_id)
    if eps is None:
        raise EpsNoEncontradaError(f"No existe ninguna EPS con id {datos.eps_id}.")

    # --- HU-06, criterio 3: no permitir un registro duplicado ---
    existente = paciente_repository.obtener_por_numero_documento(db, datos.numero_documento)
    if existente is not None:
        raise DocumentoYaRegistradoError(
            f"Ya existe un paciente registrado con el documento {datos.numero_documento}."
        )

    # --- HU-08, criterios 2, 3 y 4: consultar y guardar el estado de afiliación ---
    afiliacion_activa = consultar_afiliacion_eps(datos.numero_documento)
    estado_afiliacion = (
        EstadoAfiliacion.ACTIVA if afiliacion_activa else EstadoAfiliacion.NO_ENCONTRADA
    )

    ahora = datetime.now(timezone.utc)

    paciente = Paciente(
        tipo_documento=datos.tipo_documento,
        numero_documento=datos.numero_documento,
        nombre=datos.nombre,
        telefono_whatsapp=datos.telefono_whatsapp,
        correo=datos.correo,
        eps_id=eps.id,
        estado_afiliacion=estado_afiliacion,
        # --- HU-07, criterio 3: la aceptación queda registrada con fecha ---
        acepto_tratamiento_datos=datos.acepto_tratamiento_datos,
        fecha_aceptacion_tratamiento=ahora,
        creado_en=ahora,
    )
    paciente = paciente_repository.crear_paciente(db, paciente)

    # --- HU-05, criterio 4 / HU-08, criterio 4: confirmación con resultado ---
    if estado_afiliacion == EstadoAfiliacion.ACTIVA:
        mensaje = "Registro exitoso. Tu afiliación a la EPS fue validada correctamente."
    else:
        mensaje = (
            "Registro exitoso, pero no encontramos una afiliación activa a "
            "la EPS indicada. Puedes continuar, pero te recomendamos "
            "verificar tu afiliación con tu EPS."
        )

    return PacienteRegistroResponse(
        id=paciente.id,
        tipo_documento=paciente.tipo_documento,
        numero_documento=paciente.numero_documento,
        nombre=paciente.nombre,
        telefono_whatsapp=paciente.telefono_whatsapp,
        correo=paciente.correo,
        eps=eps,
        estado_afiliacion=paciente.estado_afiliacion,
        acepto_tratamiento_datos=paciente.acepto_tratamiento_datos,
        fecha_aceptacion_tratamiento=paciente.fecha_aceptacion_tratamiento,
        creado_en=paciente.creado_en,
        mensaje=mensaje,
    )
