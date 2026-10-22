import { IconoMensaje } from "./Iconos";

/**
 * Celular de muestra del ingreso (solo en computador): explica que el
 * código llega al WhatsApp. En el modo demostración (WhatsApp simulado),
 * el código aparece en una nube como si hubiera llegado el mensaje.
 */
export default function CelularCodigo({ codigoDemo, telefono }) {
  const terminado = telefono?.slice(-4);

  return (
    <div className="celular-muestra">
      <div className="celular-muestra__estado" aria-hidden="true">
        <span>9:41</span>
        <span>●●●</span>
      </div>
      <div className="celular-muestra__chat">
        <span className="celular-muestra__remitente-logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="55%" height="55%" fill="none">
            <path d="M2 12h4l2-7 4 14 2-7h8" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div>
          <p className="celular-muestra__remitente">SaludYA</p>
          <p className="celular-muestra__detalle">Mensajes de verificación</p>
        </div>
      </div>

      <div className="celular-muestra__pantalla">
        {codigoDemo ? (
          <div className="flota">
            <output className="burbuja celular-muestra__codigo">
              <span className="celular-muestra__codigo-arriba">
                <span>Código de acceso</span>
                <span>ahora</span>
              </span>
              <strong className="celular-muestra__digitos">{codigoDemo}</strong>
              <span className="celular-muestra__nota">Vence en 5 minutos. No lo comparta.</span>
              <span className="celular-muestra__demo">Modo demostración: WhatsApp no está conectado.</span>
            </output>
          </div>
        ) : (
          <div className="celular-muestra__espera">
            <span className="celular-muestra__icono">
              <IconoMensaje />
            </span>
            <p>
              {terminado
                ? `Le enviamos el código a su WhatsApp terminado en ${terminado}.`
                : "Aquí le llega el código para entrar, por WhatsApp."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
