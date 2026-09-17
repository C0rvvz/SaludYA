import Modal from "./Modal";

/**
 * Contenido genérico de la política de tratamiento de datos personales.
 * Texto de carácter informativo y general, elaborado para fines
 * académicos, alineado a los lineamientos generales de la Ley 1581 de
 * 2012 y el Decreto 1377 de 2013 (Habeas Data, Colombia). No sustituye
 * un documento legal revisado por un profesional del derecho.
 */
export default function ModalTratamientoDatos({ onClose }) {
  return (
    <Modal titulo="Política de tratamiento de datos personales" onClose={onClose}>
      <p>
        SaludYA recolecta y trata los datos personales suministrados por el
        paciente (documento de identidad, nombre, número de WhatsApp, correo
        electrónico y EPS) con el único fin de gestionar el registro de la
        cuenta, verificar la identidad del paciente y permitir la
        programación, confirmación y seguimiento de citas médicas.
      </p>

      <h3>Finalidad del tratamiento</h3>
      <p>
        Los datos suministrados se utilizan exclusivamente para prestar los
        servicios ofrecidos por la plataforma: identificación del paciente,
        envío de códigos de verificación, gestión de citas médicas, envío de
        comprobantes y recordatorios, y validación del estado de afiliación
        a la EPS indicada.
      </p>

      <h3>Derechos del titular</h3>
      <p>
        De acuerdo con la normativa colombiana de protección de datos
        personales (Ley 1581 de 2012 y sus decretos reglamentarios), el
        paciente tiene derecho a conocer, actualizar, rectificar y suprimir
        sus datos personales, así como a revocar la autorización otorgada
        para su tratamiento, en cualquier momento.
      </p>

      <h3>Confidencialidad y seguridad</h3>
      <p>
        La información registrada se almacena de forma segura y no se
        comparte con terceros ajenos a la prestación del servicio, salvo
        requerimiento legal expreso. El acceso a los datos está restringido
        al personal autorizado del proyecto.
      </p>

      <p className="field__hint">
        Nota: este texto es de carácter genérico e ilustrativo, elaborado
        para fines académicos como parte del proyecto SaludYA. No
        constituye un documento legal definitivo.
      </p>
    </Modal>
  );
}