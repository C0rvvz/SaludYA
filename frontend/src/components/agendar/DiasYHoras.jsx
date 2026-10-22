import { useState } from "react";
import { capitalizar, formatearFechaLarga, formatearHora } from "../../utils/formato";
import { diasDelProfesional, esDeManana, horaCorta, nombreCorto, partesDelDia } from "../../utils/agendar";
import "../../styles/agendar.css";

const sinSede = (nombre) => nombre.replace(/^Sede\s+/i, "");

/**
 * La tira de días (con cuántos horarios tiene cada uno, o "Sin cupos") y
 * las horas de ese día en "Mañana" y "Tarde". La usan "Agendar" (paso 2)
 * y "Reprogramar su cita".
 *
 * `elegidaId` / `onElegir(franja | null)`: la hora elegida la guarda quien
 * lo usa; al cambiar de día se borra. Si a la misma hora hay dos opciones
 * (otra sede, otra modalidad u otro médico), cada botón aclara cuál es.
 */
export default function DiasYHoras({ franjas, elegidaId, onElegir, titulo, tituloId }) {
  const [fecha, setFecha] = useState(null);

  const dias = diasDelProfesional(franjas);
  const elegida = franjas.find((f) => f.id === elegidaId);
  const fechaElegida =
    elegida?.fecha ?? dias.find((d) => d.fecha === fecha && d.cantidad > 0)?.fecha ?? dias.find((d) => d.cantidad)?.fecha;
  const delDia = franjas.filter((f) => f.fecha === fechaElegida);

  const variosMedicos = new Set(franjas.map((f) => f.especialista.id)).size > 1;
  const horaRepetida = delDia.length !== new Set(delDia.map((f) => f.hora)).size;
  const variasEnElDia = (campo) => new Set(delDia.map(campo)).size > 1;
  const detalle = (f) =>
    [
      variasEnElDia((x) => x.especialista.id) && nombreCorto(f.especialista.nombre),
      variasEnElDia((x) => x.sede.id) && sinSede(f.sede.nombre),
      variasEnElDia((x) => x.modalidad) && capitalizar(f.modalidad),
    ]
      .filter(Boolean)
      .join(" · ");

  const horas = (lista) =>
    lista.map((f) => (
      <button
        key={f.id}
        type="button"
        className={`hora-pildora ${f.id === elegidaId ? "is-elegida" : ""}`}
        aria-pressed={f.id === elegidaId}
        aria-label={[
          formatearHora(f.hora),
          variosMedicos && f.especialista.nombre,
          f.sede.nombre,
          capitalizar(f.modalidad),
        ]
          .filter(Boolean)
          .join(", ")}
        onClick={() => onElegir(f)}
      >
        <span className="hora-pildora__hora">{horaCorta(f.hora)}</span>
        {horaRepetida && <span className="hora-pildora__meta">{detalle(f)}</span>}
      </button>
    ));

  return (
    <>
      <div className="agendar-horas__titulo">
        <h2 id={tituloId}>{titulo}</h2>
        <span>{fechaElegida ? partesDelDia(fechaElegida).mes : ""}</span>
      </div>
      <div className="tira-dias" role="group" aria-label="Día">
        {dias.map((d) => {
          const { dia, numero } = partesDelDia(d.fecha);
          const cuantos = d.cantidad === 0 ? "Sin cupos" : d.cantidad === 1 ? "1 horario" : `${d.cantidad} horarios`;
          const actual = d.fecha === fechaElegida;
          return (
            <button
              key={d.fecha}
              type="button"
              className={`dia-cupos ${actual ? "is-elegido" : ""}`}
              aria-pressed={actual}
              aria-label={`${formatearFechaLarga(d.fecha)}: ${cuantos.toLowerCase()}`}
              disabled={d.cantidad === 0}
              onClick={() => {
                setFecha(d.fecha);
                onElegir(null);
              }}
            >
              <span className="dia-cupos__dia">{dia}</span>
              <span className="dia-cupos__numero">{numero}</span>
              <span className="dia-cupos__cuantos">{cuantos}</span>
            </button>
          );
        })}
      </div>
      {[
        ["Mañana", delDia.filter((f) => esDeManana(f.hora))],
        ["Tarde", delDia.filter((f) => !esDeManana(f.hora))],
      ].map(
        ([jornada, lista]) =>
          lista.length > 0 && (
            <div key={jornada} className="jornada" role="group" aria-label={jornada}>
              <p className="rotulo">{jornada}</p>
              <div className="jornada__horas">{horas(lista)}</div>
            </div>
          )
      )}
    </>
  );
}
