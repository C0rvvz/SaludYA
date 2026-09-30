"""
Endpoints del apartado de administración (personal de la EPS / IPS).

Todos exigen el token del PERSONAL (el del paciente no sirve aquí) y el
permiso de su rol (core/permisos.py); cada acción queda en la auditoría.

Cuentas
  POST  /admin/auth/login                 inicio de sesión del personal
  GET   /admin/auth/me
  GET   /admin/usuarios                   (administrador)
  POST  /admin/usuarios                   (administrador)
  PATCH /admin/usuarios/{id}              (administrador)

Gestión de citas
  GET   /admin/citas                      HU-34, HU-43 (lista con filtros)
  GET   /admin/citas/{id}                 HU-35, HU-42 (detalle e historial del paciente)
  POST  /admin/citas/{id}/confirmar       HU-38
  POST  /admin/citas/{id}/reprogramar     HU-39
  POST  /admin/citas/{id}/cancelar        HU-40
  POST  /admin/citas/{id}/recordatorio    HU-36
  POST  /admin/citas/{id}/contacto        HU-37
  POST  /admin/citas/{id}/resultado       HU-25 / HU-43 (atendida o no asistió)
  POST  /admin/pacientes/{id}/observaciones  HU-41

Auditoría
  GET   /admin/auditoria                  HU-80 a HU-85

Dashboard y Reportes
  GET   /admin/reportes?periodo=mes       HU-44, HU-48 a HU-52, HU-68 a HU-70, HU-72 a HU-75

Centro de recordatorios
  GET   /admin/recordatorios              HU-62, HU-63, HU-67 (pacientes y sus envíos)
  GET   /admin/recordatorios/plantillas   HU-66
  GET   /admin/recordatorios/programados  HU-64, HU-65
  POST  /admin/recordatorios/programados  HU-64, HU-65
  PUT   /admin/recordatorios/programados/{id}             editar
  POST  /admin/recordatorios/programados/{id}/cancelar
  POST  /admin/recordatorios/programados/{id}/reintentar  (si falló)
"""

import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_personal, requiere
from app.core.permisos import NOMBRE_ROL, PERMISOS_POR_ROL, Permiso
from app.core.security import TIPO_PERSONAL, crear_access_token
from app.models.auditoria import RegistroAuditoria
from app.models.cita import Cita, EstadoCita
from app.models.observacion import Observacion
from app.models.personal import Personal
from app.repositories import auditoria_repository, cita_repository, personal_repository
from app.schemas.admin import (
    AccionesCitaOut,
    ActualizarPersonalRequest,
    CitaAdminDetalleOut,
    CitaAdminOut,
    CitaHistorialOut,
    ContactoRequest,
    CrearPersonalRequest,
    LoginPersonalRequest,
    LoginPersonalResponse,
    ObservacionOut,
    ObservacionRequest,
    PacienteDetalleOut,
    PacienteResumenOut,
    PersonalOut,
    RegistroAuditoriaOut,
    ResultadoAtencionRequest,
    ResumenAsistenciaOut,
    RiesgoOut,
)
from app.schemas.cita import CancelarCitaRequest, EstadoVisible, ReprogramarCitaRequest
from app.schemas.recordatorios import (
    EditarRecordatorioRequest,
    PacienteRecordatoriosOut,
    PlantillaOut,
    ProgramarRecordatorioRequest,
    RecordatorioProgramadoOut,
)
from app.schemas.reportes import ReporteOut
from app.services import (
    admin_citas_service,
    centro_recordatorios_service,
    citas_service,
    comprobante_service,
    personal_service,
    recordatorios_service,
    reportes_service,
    riesgo_service,
)
from app.services.auditoria_service import Actor
from app.services.exceptions import (
    CitaNoEncontradaError,
    CitaNoModificableError,
    CredencialesInvalidasError,
    CuentaBloqueadaError,
    DisponibilidadNoEncontradaError,
    EnvioFallidoError,
    HorarioYaNoDisponibleError,
    PersonalInvalidoError,
    ProgramacionInvalidaError,
    ReprogramacionInvalidaError,
    ResultadoNoRegistrableError,
)

router = APIRouter(prefix="/admin", tags=["Administración"])

_CODIGOS = {
    CitaNoEncontradaError: status.HTTP_404_NOT_FOUND,
    DisponibilidadNoEncontradaError: status.HTTP_404_NOT_FOUND,
    CitaNoModificableError: status.HTTP_409_CONFLICT,
    HorarioYaNoDisponibleError: status.HTTP_409_CONFLICT,
    ResultadoNoRegistrableError: status.HTTP_409_CONFLICT,
    ReprogramacionInvalidaError: status.HTTP_400_BAD_REQUEST,
    PersonalInvalidoError: status.HTTP_400_BAD_REQUEST,
    ProgramacionInvalidaError: status.HTTP_400_BAD_REQUEST,
    EnvioFallidoError: status.HTTP_502_BAD_GATEWAY,
}
_ERRORES = tuple(_CODIGOS)


def _http(e: Exception) -> HTTPException:
    return HTTPException(status_code=_CODIGOS[type(e)], detail=str(e))


# --- Conversión a esquemas de salida ---


def _personal_out(p: Personal) -> PersonalOut:
    return PersonalOut(
        id=p.id,
        nombre=p.nombre,
        correo=p.correo,
        rol=p.rol,
        rol_texto=NOMBRE_ROL[p.rol],
        activo=p.activo,
        permisos=sorted(permiso.value for permiso in PERMISOS_POR_ROL[p.rol]),
        creado_en=p.creado_en,
        ultimo_acceso_en=p.ultimo_acceso_en,
    )


def _registro_out(r: RegistroAuditoria) -> RegistroAuditoriaOut:
    return RegistroAuditoriaOut(
        id=r.id,
        fecha=r.fecha,
        actor_tipo=r.actor_tipo.value,
        actor_nombre=r.actor_nombre,
        accion=r.accion,
        descripcion=r.descripcion,
        detalle=r.detalle,
        cita_id=r.cita_id,
        # El número se asigna al generar el comprobante, justo después
        # de agendar: si el registro no lo alcanzó a guardar, se toma de la cita.
        numero_comprobante=r.numero_comprobante or (r.cita.numero_comprobante if r.cita else None),
        paciente_nombre=r.paciente.nombre if r.paciente else None,
        estado_anterior=r.estado_anterior,
        estado_nuevo=r.estado_nuevo,
    )


def _paciente_resumen(cita: Cita) -> PacienteResumenOut:
    p = cita.paciente
    return PacienteResumenOut(
        id=p.id,
        nombre=p.nombre,
        tipo_documento=p.tipo_documento.value,
        numero_documento=p.numero_documento,
        telefono_whatsapp=p.telefono_whatsapp,
    )


def _campos_cita(cita: Cita, personal: Personal, historial: list[Cita]) -> dict:
    franja = cita.disponibilidad
    visible = citas_service.estado_visible(cita)
    riesgo = riesgo_service.estimar(cita, [c for c in historial if c.id != cita.id])
    return {
        "id": cita.id,
        "numero_comprobante": cita.numero_comprobante,
        "especialidad_id": franja.especialista.especialidad.id,
        "especialidad": franja.especialista.especialidad.nombre,
        "especialista": franja.especialista.nombre,
        "sede": franja.sede.nombre,
        "ciudad": franja.sede.ciudad,
        "modalidad": franja.modalidad.value,
        "fecha": franja.fecha,
        "hora": franja.hora,
        "estado_visible": visible,
        "estado_texto": citas_service.ESTADOS_VISIBLES[visible],
        "canal_recordatorio": cita.canal_recordatorio.value,
        "recordatorio_enviado_en": cita.recordatorio_enviado_en,
        "riesgo": RiesgoOut(**riesgo.__dict__) if riesgo else None,
        "acciones": AccionesCitaOut(**admin_citas_service.acciones_para(cita, personal)),
    }


def _observacion_out(o: Observacion) -> ObservacionOut:
    return ObservacionOut(
        id=o.id,
        texto=o.texto,
        autor=f"{o.autor.nombre} ({NOMBRE_ROL[o.autor.rol]})",
        numero_comprobante=o.cita.numero_comprobante if o.cita else None,
        creado_en=o.creado_en,
    )


def _detalle(db: Session, cita_id: uuid.UUID, personal: Personal) -> CitaAdminDetalleOut:
    cita = admin_citas_service.obtener_cita(db, cita_id)
    historial = admin_citas_service.historial_por_paciente(db, [cita])[cita.paciente_id]
    paciente = cita.paciente
    auditoria = [_registro_out(r) for r in auditoria_repository.listar(db, cita_id=cita.id)]

    anteriores = [c for c in reversed(historial) if c.id != cita.id]

    def contar(estado: EstadoCita) -> int:
        return sum(1 for c in historial if c.estado == estado)

    return CitaAdminDetalleOut(
        **_campos_cita(cita, personal, historial),
        paciente=PacienteDetalleOut(
            **_paciente_resumen(cita).model_dump(),
            correo=paciente.correo,
            eps=paciente.eps.nombre if paciente.eps else None,
            estado_afiliacion=paciente.estado_afiliacion.value,
        ),
        motivo_cancelacion=cita.motivo_cancelacion,
        historial_estado=citas_service.historial_de_estado(cita),
        historial_asistencia=[
            CitaHistorialOut(
                id=c.id,
                numero_comprobante=c.numero_comprobante,
                especialidad=c.disponibilidad.especialista.especialidad.nombre,
                fecha=c.disponibilidad.fecha,
                hora=c.disponibilidad.hora,
                estado_visible=citas_service.estado_visible(c),
                estado_texto=citas_service.texto_estado(c),
            )
            for c in anteriores
        ],
        resumen_asistencia=ResumenAsistenciaOut(
            atendidas=contar(EstadoCita.ATENDIDA),
            no_asistio=contar(EstadoCita.NO_ASISTIO),
            canceladas=contar(EstadoCita.CANCELADA),
            reprogramadas=contar(EstadoCita.REPROGRAMADA),
        ),
        recordatorios=[r for r in auditoria if r.accion in ("recordatorio", "recordatorio_fallido")],
        contactos=[r for r in auditoria if r.accion == "contacto"],
        observaciones=[
            _observacion_out(o) for o in admin_citas_service.observaciones_del_paciente(db, paciente.id)
        ],
        auditoria=auditoria,
    )


# --- Cuentas del personal ---


@router.post("/auth/login", response_model=LoginPersonalResponse)
def iniciar_sesion(datos: LoginPersonalRequest, db: Session = Depends(get_db)):
    try:
        personal = personal_service.autenticar(db, datos.correo, datos.password)
    except CredencialesInvalidasError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))
    except CuentaBloqueadaError as e:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(e))

    token, _ = crear_access_token(personal.id, rol=personal.rol.value, tipo=TIPO_PERSONAL)
    return LoginPersonalResponse(
        access_token=token,
        expira_en_minutos=settings.jwt_expire_minutes,
        personal=_personal_out(personal),
    )


@router.get("/auth/me", response_model=PersonalOut)
def personal_actual(personal: Personal = Depends(get_current_personal)):
    return _personal_out(personal)


@router.get("/usuarios", response_model=list[PersonalOut])
def listar_usuarios(
    _: Personal = Depends(requiere(Permiso.GESTIONAR_USUARIOS)), db: Session = Depends(get_db)
):
    return [_personal_out(p) for p in personal_repository.listar(db)]


@router.post("/usuarios", response_model=PersonalOut, status_code=status.HTTP_201_CREATED)
def crear_usuario(
    datos: CrearPersonalRequest,
    _: Personal = Depends(requiere(Permiso.GESTIONAR_USUARIOS)),
    db: Session = Depends(get_db),
):
    try:
        return _personal_out(personal_service.crear(db, datos.nombre, datos.correo, datos.rol, datos.password))
    except PersonalInvalidoError as e:
        raise _http(e)


@router.patch("/usuarios/{personal_id}", response_model=PersonalOut)
def actualizar_usuario(
    personal_id: uuid.UUID,
    datos: ActualizarPersonalRequest,
    admin: Personal = Depends(requiere(Permiso.GESTIONAR_USUARIOS)),
    db: Session = Depends(get_db),
):
    try:
        return _personal_out(
            personal_service.actualizar(
                db, personal_id, admin,
                nombre=datos.nombre, rol=datos.rol, activo=datos.activo, password=datos.password,
            )
        )
    except PersonalInvalidoError as e:
        raise _http(e)


# --- Gestión de citas ---


@router.get("/citas", response_model=list[CitaAdminOut])
def listar_citas(
    desde: date | None = Query(default=None, description="Fecha inicial (por defecto, sin límite)"),
    hasta: date | None = Query(default=None),
    especialidad_id: uuid.UUID | None = Query(default=None),
    estado: EstadoVisible | None = Query(default=None),
    buscar: str | None = Query(default=None, max_length=100, description="Paciente, documento o comprobante"),
    personal: Personal = Depends(requiere(Permiso.VER_CITAS)),
    db: Session = Depends(get_db),
):
    """HU-34: citas con paciente, especialista, fecha, hora, estado, riesgo y recordatorios."""
    citas = cita_repository.listar_para_personal(db, desde, hasta, especialidad_id, buscar)
    if estado is not None:
        citas = [c for c in citas if citas_service.estado_visible(c) == estado]
    historiales = admin_citas_service.historial_por_paciente(db, citas)
    return [
        CitaAdminOut(**_campos_cita(c, personal, historiales[c.paciente_id]), paciente=_paciente_resumen(c))
        for c in citas
    ]


@router.get("/citas/{cita_id}", response_model=CitaAdminDetalleOut)
def detalle_cita(
    cita_id: uuid.UUID,
    personal: Personal = Depends(requiere(Permiso.VER_CITAS)),
    db: Session = Depends(get_db),
):
    try:
        return _detalle(db, cita_id, personal)
    except _ERRORES as e:
        raise _http(e)


@router.post("/citas/{cita_id}/confirmar", response_model=CitaAdminDetalleOut)
def confirmar(
    cita_id: uuid.UUID,
    personal: Personal = Depends(requiere(Permiso.GESTIONAR_CITAS)),
    db: Session = Depends(get_db),
):
    """HU-38: el personal confirma la asistencia (p. ej., después de llamar al paciente)."""
    try:
        citas_service.confirmar_asistencia(db, None, cita_id, actor=Actor.de_personal(personal))
        return _detalle(db, cita_id, personal)
    except _ERRORES as e:
        raise _http(e)


@router.post("/citas/{cita_id}/cancelar", response_model=CitaAdminDetalleOut)
def cancelar(
    cita_id: uuid.UUID,
    datos: CancelarCitaRequest,
    personal: Personal = Depends(requiere(Permiso.GESTIONAR_CITAS)),
    db: Session = Depends(get_db),
):
    """HU-40: cancelar con motivo; libera el cupo y queda en el historial del paciente."""
    try:
        citas_service.cancelar_cita(db, None, cita_id, datos.motivo, actor=Actor.de_personal(personal))
        return _detalle(db, cita_id, personal)
    except _ERRORES as e:
        raise _http(e)


@router.post("/citas/{cita_id}/reprogramar", response_model=CitaAdminDetalleOut)
def reprogramar(
    cita_id: uuid.UUID,
    datos: ReprogramarCitaRequest,
    personal: Personal = Depends(requiere(Permiso.GESTIONAR_CITAS)),
    db: Session = Depends(get_db),
):
    """HU-39: devuelve el detalle de la cita NUEVA (con su propio comprobante)."""
    try:
        nueva = citas_service.reprogramar_cita(
            db, None, cita_id, datos.disponibilidad_id, actor=Actor.de_personal(personal)
        )
        nueva = comprobante_service.generar_comprobante(db, nueva)
        return _detalle(db, nueva.id, personal)
    except _ERRORES as e:
        raise _http(e)


@router.post("/citas/{cita_id}/recordatorio", response_model=CitaAdminDetalleOut)
def enviar_recordatorio(
    cita_id: uuid.UUID,
    personal: Personal = Depends(requiere(Permiso.GESTIONAR_CITAS)),
    db: Session = Depends(get_db),
):
    """HU-36: envía el recordatorio por el canal del paciente y lo registra."""
    try:
        recordatorios_service.enviar_recordatorio_manual(db, cita_id, Actor.de_personal(personal))
        return _detalle(db, cita_id, personal)
    except _ERRORES as e:
        raise _http(e)


@router.post("/citas/{cita_id}/contacto", response_model=CitaAdminDetalleOut)
def registrar_contacto(
    cita_id: uuid.UUID,
    datos: ContactoRequest,
    personal: Personal = Depends(requiere(Permiso.GESTIONAR_CITAS)),
    db: Session = Depends(get_db),
):
    """HU-37: registra el resultado de la llamada al paciente."""
    try:
        admin_citas_service.registrar_contacto(
            db, cita_id, datos.resultado, datos.nota, Actor.de_personal(personal)
        )
        return _detalle(db, cita_id, personal)
    except _ERRORES as e:
        raise _http(e)


@router.post("/citas/{cita_id}/resultado", response_model=CitaAdminDetalleOut)
def registrar_resultado(
    cita_id: uuid.UUID,
    datos: ResultadoAtencionRequest,
    personal: Personal = Depends(requiere(Permiso.REGISTRAR_ATENCION)),
    db: Session = Depends(get_db),
):
    """HU-25 / HU-43: registrar o corregir si el paciente fue atendido."""
    resultado = EstadoCita.ATENDIDA if datos.resultado == "atendida" else EstadoCita.NO_ASISTIO
    try:
        citas_service.registrar_resultado(db, cita_id, resultado, actor=Actor.de_personal(personal))
        return _detalle(db, cita_id, personal)
    except _ERRORES as e:
        raise _http(e)


@router.post(
    "/pacientes/{paciente_id}/observaciones",
    response_model=ObservacionOut,
    status_code=status.HTTP_201_CREATED,
)
def agregar_observacion(
    paciente_id: uuid.UUID,
    datos: ObservacionRequest,
    personal: Personal = Depends(requiere(Permiso.OBSERVACIONES)),
    db: Session = Depends(get_db),
):
    """HU-41: nota del personal sobre el paciente o una de sus citas."""
    try:
        return _observacion_out(
            admin_citas_service.agregar_observacion(db, paciente_id, datos.texto, datos.cita_id, personal)
        )
    except _ERRORES as e:
        raise _http(e)


# --- Auditoría ---


@router.get("/auditoria", response_model=list[RegistroAuditoriaOut])
def auditoria(
    cita_id: uuid.UUID | None = Query(default=None),
    paciente_id: uuid.UUID | None = Query(default=None),
    accion: str | None = Query(default=None, max_length=40),
    _: Personal = Depends(requiere(Permiso.VER_AUDITORIA)),
    db: Session = Depends(get_db),
):
    """HU-80 a HU-85: quién hizo qué, sobre qué cita, cuándo, y el estado antes y después."""
    registros = auditoria_repository.listar(
        db, cita_id=cita_id, paciente_id=paciente_id, acciones=[accion] if accion else None
    )
    return [_registro_out(r) for r in registros]


# --- Dashboard y Reportes ---


@router.get("/reportes", response_model=ReporteOut)
def reportes(
    periodo: Literal["mes", "trimestre", "anio"] = Query(default="mes", description="HU-68"),
    _: Personal = Depends(requiere(Permiso.VER_REPORTES)),
    db: Session = Depends(get_db),
):
    """Dashboard (HU-44, HU-48 a HU-52) y Reportes (HU-68 a HU-70, HU-72 a HU-75) del periodo."""
    return reportes_service.reporte(db, periodo)


# --- Centro de recordatorios (HU-62 a HU-67) ---


def _programado_out(r) -> RecordatorioProgramadoOut:
    return RecordatorioProgramadoOut(
        id=r.id,
        paciente_id=r.paciente_id,
        paciente_nombre=r.paciente.nombre,
        cita_id=r.cita_id,
        canal=r.canal,
        plantilla=r.plantilla,
        texto=r.texto,
        programado_para=r.programado_para,
        estado=r.estado,
        intentos=r.intentos,
        enviado_en=r.enviado_en,
        programado_por=r.personal.nombre,
    )


@router.get("/recordatorios", response_model=list[PacienteRecordatoriosOut])
def centro_recordatorios(
    _: Personal = Depends(requiere(Permiso.GESTIONAR_CITAS)),
    db: Session = Depends(get_db),
):
    """HU-63 / HU-67: pacientes con su canal preferido, último envío y estado (HU-62 filtra en pantalla)."""
    return centro_recordatorios_service.pacientes_con_recordatorios(db)


@router.get("/recordatorios/plantillas", response_model=list[PlantillaOut])
def plantillas_recordatorio(
    paciente_id: uuid.UUID,
    cita_id: uuid.UUID | None = None,
    _: Personal = Depends(requiere(Permiso.GESTIONAR_CITAS)),
    db: Session = Depends(get_db),
):
    """HU-66: las plantillas con el texto listo para ese paciente y esa cita."""
    try:
        return centro_recordatorios_service.plantillas(db, paciente_id, cita_id)
    except _ERRORES as e:
        raise _http(e)


@router.get("/recordatorios/programados", response_model=list[RecordatorioProgramadoOut])
def recordatorios_programados(
    _: Personal = Depends(requiere(Permiso.GESTIONAR_CITAS)),
    db: Session = Depends(get_db),
):
    return [_programado_out(r) for r in centro_recordatorios_service.listar_programados(db)]


@router.post(
    "/recordatorios/programados",
    response_model=RecordatorioProgramadoOut,
    status_code=status.HTTP_201_CREATED,
)
def programar_recordatorio(
    datos: ProgramarRecordatorioRequest,
    personal: Personal = Depends(requiere(Permiso.GESTIONAR_CITAS)),
    db: Session = Depends(get_db),
):
    """HU-64 (mensaje escrito) y HU-65 (llamada: canal "llamada")."""
    try:
        programado = centro_recordatorios_service.programar(
            db, personal, datos.paciente_id, datos.cita_id, datos.canal,
            datos.plantilla, datos.texto, datos.programado_para,
        )
    except _ERRORES as e:
        raise _http(e)
    return _programado_out(programado)


@router.put("/recordatorios/programados/{programado_id}", response_model=RecordatorioProgramadoOut)
def editar_recordatorio(
    programado_id: uuid.UUID,
    datos: EditarRecordatorioRequest,
    personal: Personal = Depends(requiere(Permiso.GESTIONAR_CITAS)),
    db: Session = Depends(get_db),
):
    """Cambiar un recordatorio que todavía no sale (o que falló); vuelve a quedar pendiente."""
    try:
        programado = centro_recordatorios_service.editar(
            db, personal, programado_id, datos.cita_id, datos.canal,
            datos.plantilla, datos.texto, datos.programado_para,
        )
    except _ERRORES as e:
        raise _http(e)
    return _programado_out(programado)


@router.post("/recordatorios/programados/{programado_id}/cancelar", response_model=RecordatorioProgramadoOut)
def cancelar_recordatorio(
    programado_id: uuid.UUID,
    personal: Personal = Depends(requiere(Permiso.GESTIONAR_CITAS)),
    db: Session = Depends(get_db),
):
    try:
        return _programado_out(centro_recordatorios_service.cancelar(db, personal, programado_id))
    except _ERRORES as e:
        raise _http(e)


@router.post("/recordatorios/programados/{programado_id}/reintentar", response_model=RecordatorioProgramadoOut)
def reintentar_recordatorio(
    programado_id: uuid.UUID,
    personal: Personal = Depends(requiere(Permiso.GESTIONAR_CITAS)),
    db: Session = Depends(get_db),
):
    """Envía ya uno que falló; si vuelve a fallar, queda pendiente y se reintenta solo."""
    try:
        return _programado_out(centro_recordatorios_service.reintentar(db, personal, programado_id))
    except _ERRORES as e:
        raise _http(e)
