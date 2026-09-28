import { useEffect, useMemo, useState } from "react";
import { buscarDisponibilidad } from "../../api/catalogo";
import { capitalizar, formatearDiaChip, formatearFechaLarga, formatearHora } from "../../utils/formato";
import { Fila } from "./ElementosCita";

/**
 * Elegir el nuevo horario al reprogramar: la reprograma el paciente
 * (HU-20) o el personal (HU-39). Muestra horarios libres de la misma
 * especialidad, por día, y pide confirmar el cambio antes de hacerlo.
 */
export default function SelectorNuevoHorario({
  especialidadId,
  especialidadNombre,
  fechaActual,
  horaActual,
  ocupado,
  onConfirmar,
  onVolver,
}) {
  const [franjas, setFranjas] = useState(null);
  const [error, setError] = useState("");
  const [dia, setDia] = useState(null);
  const [elegida, setElegida] = useState(null);
  const [revisando, setRevisando] = useState(false);

  useEffect(() => {
    buscarDisponibilidad({ especialidad_id: especialidadId })
      .then((lista) => {
        // La búsqueda ya trae solo horarios libres que todavía no empiezan.
        setFranjas(lista);
        setDia(lista[0]?.fecha ?? null);
      })
      .catch((err) => setError(err.message));
  }, [especialidadId]);

  const porDia = useMemo(() => {
    const mapa = new Map();
    for (const f of franjas ?? []) {
      if (!mapa.has(f.fecha)) mapa.set(f.fecha, []);
      mapa.get(f.fecha).push(f);
    }
    return mapa;
  }, [franjas]);

  if (error) return <div className="alert alert--error">{error}</div>;
  if (franjas === null) return <p>Buscando horarios disponibles...</p>;

  if (revisando && elegida) {
    return (
      <div className="card panel-accion">
        <h2>¿Confirma el cambio?</h2>
        <Fila etiqueta="Cita actual">
          {formatearFechaLarga(fechaActual)}, {formatearHora(horaActual)}
        </Fila>
        <Fila etiqueta="Nueva fecha y hora">
          {formatearFechaLarga(elegida.fecha)}, {formatearHora(elegida.hora)}
        </Fila>
        <Fila etiqueta="Especialista">{elegida.especialista.nombre}</Fila>
        <Fila etiqueta="Sede">
          {elegida.sede.nombre} · {capitalizar(elegida.modalidad)}
        </Fila>
        <div className="acciones-cita">
          <button className="btn btn--success" disabled={ocupado} onClick={() => onConfirmar(elegida)}>
            {ocupado ? "Cambiando..." : "Sí, cambiar la cita"}
          </button>
          <button className="btn btn--outline" disabled={ocupado} onClick={() => setRevisando(false)}>
            Elegir otro horario
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card panel-accion">
      <h2>Elija el nuevo horario</h2>
      {franjas.length === 0 ? (
        <p>No hay otros horarios disponibles de {especialidadNombre} en este momento.</p>
      ) : (
        <>
          <div className="day-picker">
            {Array.from(porDia.keys()).map((fecha) => {
              const { dia: nombreDia, numero } = formatearDiaChip(fecha);
              return (
                <button
                  key={fecha}
                  type="button"
                  className={`day-chip ${dia === fecha ? "is-selected" : ""}`}
                  onClick={() => {
                    setDia(fecha);
                    setElegida(null);
                  }}
                >
                  <span>{nombreDia}</span>
                  <span>{numero}</span>
                </button>
              );
            })}
          </div>
          <div className="time-grid">
            {(porDia.get(dia) ?? []).map((f) => (
              <button
                key={f.id}
                type="button"
                className={`time-slot ${elegida?.id === f.id ? "is-selected" : ""}`}
                onClick={() => setElegida(f)}
              >
                <span className="time-slot__hora">{formatearHora(f.hora)}</span>
                <span className="time-slot__meta">
                  {f.especialista.nombre} · {f.sede.nombre} · {capitalizar(f.modalidad)}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="acciones-cita">
        <button className="btn btn--primary" disabled={!elegida} onClick={() => setRevisando(true)}>
          Continuar
        </button>
        <button className="btn btn--outline" onClick={onVolver}>
          Volver
        </button>
      </div>
    </div>
  );
}
