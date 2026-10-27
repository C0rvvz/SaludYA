import { useEffect, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import EncabezadoPaciente from "../components/EncabezadoPaciente";
import PasosAgendar from "../components/agendar/PasosAgendar";
import { IconoDescargar } from "../components/Iconos";
import { enviarComprobantePago, obtenerPago } from "../api/pagos";
import { formatearDiaMes, formatearFechaHora, formatearPesos } from "../utils/formato";
import { PASOS_PAGO } from "../utils/pagos";
import "../styles/pagos.css";

const CANALES_COMPROBANTE = [
  { valor: "whatsapp", titulo: "WhatsApp" },
  { valor: "correo", titulo: "Correo" },
  { valor: "sms", titulo: "Mensaje de texto" },
];

/** El comprobante para imprimir o guardar en PDF ("Descargar comprobante"): solo existe mientras se imprime. */
function ComprobanteImpreso({ pago, paciente }) {
  return createPortal(
    <div className="comprobante-pago-impreso">
      <p className="comprobante-pago-impreso__marca">SaludYA · Comprobante de pago (prueba, sin cobro real)</p>
      <h1>{formatearPesos(pago.valor)}</h1>
      {paciente && <p>Paciente: {paciente.nombre}</p>}
      <p>
        Cita de {pago.especialidad} con {pago.especialista}, {formatearDiaMes(pago.fecha_cita)}
      </p>
      <p>Referencia: {pago.referencia}</p>
      <p>Fecha del pago: {formatearFechaHora(pago.fecha)}</p>
      <p>Pagó con {pago.detalle}</p>
      <div className="comprobante-pago-impreso__codigo">
        <img src={pago.qr_llegada} width="120" height="120" alt="" />
        <p>
          Código de llegada <strong>{pago.codigo_llegada}</strong>
          <br />
          Escanee el QR o digite estos 4 números en la máquina dentro de la EPS.
        </p>
      </div>
    </div>,
    document.body
  );
}

function PagoAprobado({ pago }) {
  const { paciente } = useAuth();
  const [canal, setCanal] = useState("whatsapp");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState(null); // { tipo, texto }
  const [imprimiendo, setImprimiendo] = useState(false);
  const sinCorreo = paciente && !paciente.correo;

  async function enviar() {
    setEnviando(true);
    setAviso(null);
    try {
      const { mensaje } = await enviarComprobantePago(pago.referencia, canal);
      setAviso({ tipo: "success", texto: mensaje });
    } catch (err) {
      setAviso({ tipo: "error", texto: err.message });
    } finally {
      setEnviando(false);
    }
  }

  function descargar() {
    flushSync(() => setImprimiendo(true));
    window.print();
    setImprimiendo(false);
  }

  return (
    <div className="pago__resultado">
      <div className="pago__encabezado pago__encabezado--centrado">
        <span className="pago__icono pago__icono--bien" aria-hidden="true">
          ✓
        </span>
        <h1>¡Pago recibido!</h1>
        <p className="pago__lead">Ya no tiene que hacer fila.</p>
      </div>

      <div className="pago__columnas">
        <section className="card pago__tarjeta" aria-label="Comprobante de pago">
          <dl className="pago__resumen">
            <div>
              <dt>Referencia</dt>
              <dd>{pago.referencia}</dd>
            </div>
            <div>
              <dt>Fecha</dt>
              <dd>{formatearFechaHora(pago.fecha)}</dd>
            </div>
            <div>
              <dt>Cita</dt>
              <dd>
                {pago.especialidad} · {formatearDiaMes(pago.fecha_cita)}
              </dd>
            </div>
            <div>
              <dt>Pagó con</dt>
              <dd>{pago.detalle}</dd>
            </div>
          </dl>
          <div className="pago__total">
            <span>Valor pagado</span>
            <strong>{formatearPesos(pago.valor)}</strong>
          </div>

          <fieldset className="pago__opciones">
            <legend>¿Dónde le enviamos el comprobante?</legend>
            <div className="pago__opciones-lista pago__opciones-lista--tres">
              {CANALES_COMPROBANTE.map((c) => {
                const deshabilitado = c.valor === "correo" && sinCorreo;
                return (
                  <label key={c.valor} className={`opcion-pago ${deshabilitado ? "is-deshabilitada" : ""}`}>
                    <input
                      type="radio"
                      name="canal_comprobante"
                      value={c.valor}
                      checked={canal === c.valor}
                      disabled={deshabilitado}
                      onChange={() => setCanal(c.valor)}
                    />
                    <span className="opcion-pago__titulo">{c.titulo}</span>
                  </label>
                );
              })}
            </div>
            <p className="field__hint">
              {sinCorreo
                ? "Se envía al número de su cuenta. Su cuenta no tiene correo."
                : "Se envía al número y correo de su cuenta."}
            </p>
          </fieldset>
        </section>

        <section className="card pago__llegada" aria-labelledby="titulo-codigo-llegada">
          <p id="titulo-codigo-llegada" className="pago__llegada-titulo">
            Código de llegada
          </p>
          <img src={pago.qr_llegada} width="168" height="168" alt={`Código QR de llegada ${pago.codigo_llegada}`} />
          <p className="pago__llegada-codigo" aria-label={`Código ${pago.codigo_llegada.split("").join(" ")}`}>
            {pago.codigo_llegada.split("").map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </p>
          <p className="pago__llegada-ayuda">Escanee el QR o digite estos 4 números en la máquina dentro de la EPS.</p>
        </section>
      </div>

      {aviso && (
        <div className={`alert alert--${aviso.tipo}`} role={aviso.tipo === "error" ? "alert" : "status"}>
          {aviso.texto}
        </div>
      )}

      <div className="pago__acciones pago__acciones--tres">
        <button type="button" className="btn btn--outline" onClick={descargar}>
          <IconoDescargar tamano={18} />
          Descargar comprobante
        </button>
        <button type="button" className="btn btn--outline" onClick={enviar} disabled={enviando}>
          {enviando ? "Enviando…" : "Enviar comprobante"}
        </button>
        <Link to="/mis-citas" className="btn btn--primary">
          Volver a mis citas
        </Link>
      </div>

      {imprimiendo && <ComprobanteImpreso pago={pago} paciente={paciente} />}
    </div>
  );
}

function PagoRechazado({ pago }) {
  return (
    <div className="pago__resultado pago__resultado--angosto">
      <div className="pago__encabezado pago__encabezado--centrado">
        <span className="pago__icono pago__icono--mal" aria-hidden="true">
          !
        </span>
        <h1>No se pudo hacer el pago</h1>
        <p className="pago__lead">
          No se preocupe: <strong>no se le cobró nada</strong>.
        </p>
      </div>

      <section className="card pago__tarjeta">
        {pago.motivo && <p className="pago__motivo">{pago.motivo}</p>}
        <p className="pago__puede">Puede intentar:</p>
        <ul className="pago__sugerencias">
          <li>Revisar que tenga saldo suficiente.</li>
          <li>Pagar con otro banco o con tarjeta.</li>
        </ul>
      </section>

      <div className="pago__acciones">
        <Link to={`/pagar/${pago.cita_id}`} className="btn btn--outline">
          Pagar de otra forma
        </Link>
        <Link to={`/pagar/${pago.cita_id}`} state={{ metodo: pago.metodo }} className="btn btn--primary">
          Intentar de nuevo
        </Link>
      </div>
    </div>
  );
}

function PagoEnEspera({ pago }) {
  return (
    <div className="pago__resultado pago__resultado--angosto">
      <div className="pago__encabezado pago__encabezado--centrado">
        <h1>Su banco todavía no ha respondido</h1>
        <p className="pago__lead">
          El pago de {formatearPesos(pago.valor)} está esperando que lo autorice en la página de su banco.
        </p>
      </div>
      <div className="pago__acciones">
        <Link to={`/pagar/${pago.cita_id}`} className="btn btn--outline">
          Pagar de otra forma
        </Link>
        <Link to={`/pagar/banco/${pago.referencia}`} className="btn btn--primary">
          Ir a la página del banco
        </Link>
      </div>
    </div>
  );
}

/** Paso "Listo" del pago: aprobado (comprobante y código de llegada), rechazado o esperando al banco. */
export default function ResultadoPagoPage() {
  const { referencia } = useParams();
  const [pago, setPago] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    obtenerPago(referencia)
      .then(setPago)
      .catch((err) => setError(err.message));
  }, [referencia]);

  let contenido;
  if (error) {
    contenido = (
      <div className="pago__resultado pago__resultado--angosto">
        <div className="alert alert--error" role="alert">
          {error}
        </div>
        <Link to="/mis-citas" className="btn btn--outline">
          Volver a mis citas
        </Link>
      </div>
    );
  } else if (!pago) {
    contenido = <p>Consultando su pago…</p>;
  } else if (pago.estado === "aprobado") {
    contenido = <PagoAprobado pago={pago} />;
  } else if (pago.estado === "rechazado") {
    contenido = <PagoRechazado pago={pago} />;
  } else {
    contenido = <PagoEnEspera pago={pago} />;
  }

  return (
    <div>
      <EncabezadoPaciente />
      <div className="section pago">
        {pago && <PasosAgendar actual={pago.estado === "aprobado" ? 3 : 2} pasos={PASOS_PAGO} etiqueta="Pasos para pagar" />}
        {contenido}
      </div>
    </div>
  );
}
