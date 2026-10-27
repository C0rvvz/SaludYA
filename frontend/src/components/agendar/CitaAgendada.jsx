import { Link } from "react-router-dom";
import { CANALES, TIPO_COBRO } from "../../utils/citas";
import { capitalizar, formatearFechaLarga, formatearHora, formatearPesos } from "../../utils/formato";

// HU-17: el comprobante se envía por el canal que eligió la persona.
const ENVIO = {
  whatsapp: "Le enviamos el comprobante a su WhatsApp.",
  sms: "Le enviamos el comprobante por mensaje de texto.",
  correo: "Le enviamos el comprobante a su correo.",
  llamada: "Le comunicaremos los datos del comprobante por llamada.",
};

/** Paso 3 de "Agendar": la cita quedó agendada y este es su comprobante. */
export default function CitaAgendada({ cita, onAgendarOtra }) {
  const presencial = cita.modalidad === "presencial";
  return (
    <div className="cita-agendada">
      <div className="cita-agendada__texto">
        <span className="cita-agendada__check" aria-hidden="true">
          ✓
        </span>
        <h1>Su cita quedó agendada</h1>
        <p className="cita-agendada__lead">
          {ENVIO[cita.canal_recordatorio] ?? "Ya generamos su comprobante."} Le recordaremos un día antes.
        </p>
        <div className="cita-agendada__acciones">
          <Link to="/mis-citas" className="btn btn--primary">
            Ver mis citas
          </Link>
          <button type="button" className="btn btn--outline" onClick={onAgendarOtra}>
            Agendar otra cita
          </button>
        </div>
      </div>

      <section className="comprobante-cita" aria-labelledby="titulo-comprobante">
        <div className="comprobante-cita__cabeza">
          <span id="titulo-comprobante">Comprobante</span>
          <span className="comprobante-cita__numero">{cita.numero_comprobante}</span>
        </div>
        <div>
          <p className="comprobante-cita__especialidad">{cita.especialista.especialidad.nombre}</p>
          <p className="comprobante-cita__fecha">{formatearFechaLarga(cita.fecha)}</p>
          <p className="comprobante-cita__hora">{formatearHora(cita.hora)}</p>
        </div>
        <dl className="comprobante-cita__datos">
          <div>
            <dt>Profesional</dt>
            <dd>{cita.especialista.nombre}</dd>
          </div>
          <div>
            <dt>Sede</dt>
            <dd>
              {cita.sede.nombre} · {cita.sede.ciudad}
            </dd>
          </div>
          <div>
            <dt>Modalidad</dt>
            <dd>{capitalizar(cita.modalidad)}</dd>
          </div>
          <div>
            <dt>Recordatorio por</dt>
            <dd>{CANALES[cita.canal_recordatorio] ?? cita.canal_recordatorio}</dd>
          </div>
          {cita.valor > 0 && (
            <div>
              <dt>Valor de la consulta</dt>
              <dd>
                {formatearPesos(cita.valor)} · {TIPO_COBRO[cita.tipo_cobro] ?? ""}, se paga después de la cita
              </dd>
            </div>
          )}
        </dl>
        <p className="comprobante-cita__nota">
          {presencial
            ? "Llegue 15 minutos antes con su documento."
            : "Conéctese 10 minutos antes y tenga a mano su documento."}{" "}
          Conserve el número de comprobante.
        </p>
      </section>
    </div>
  );
}
