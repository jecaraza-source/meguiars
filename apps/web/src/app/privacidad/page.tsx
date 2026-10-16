import type { Metadata } from "next";
import { PlainShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "Aviso de privacidad",
  description:
    "Aviso de privacidad de Meguiar's Detail Center (TCI Consultoría Internacional, S. de R.L. de C.V.).",
};

/** Datos del responsable (los dio el negocio; cambiarlos aquí si cambian). */
const RESPONSABLE = {
  razonSocial: "TCI Consultoría Internacional, S. de R.L. de C.V.",
  nombreComercial: "Meguiar's Detail Center",
  domicilio: "Cracovia 54, Colonia San Ángel, Alcaldía Álvaro Obregón, C.P. 01000, Ciudad de México",
  correo: "jec@tci.services",
  actualizado: "16 de octubre de 2026",
};

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="flex flex-col gap-sm">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Aviso de privacidad público (sin sesión). Lo pide Meta para la app de
 * WhatsApp en modo activo y lo enlaza el asistente. Incluye las instrucciones
 * de eliminación de datos (#eliminacion).
 */
export default function PrivacyPage() {
  const { razonSocial, nombreComercial, domicilio, correo, actualizado } = RESPONSABLE;
  const mail = (
    <a href={`mailto:${correo}`} className="underline">
      {correo}
    </a>
  );
  return (
    <PlainShell title="Aviso de privacidad">
      <div className="flex flex-col gap-lg text-sm leading-relaxed">
        <p>
          <strong>{razonSocial}</strong>, que opera el centro de detallado automotriz{" "}
          <strong>{nombreComercial}</strong>, con domicilio en {domicilio} (el «Responsable»), es responsable
          del tratamiento de sus datos personales conforme a la Ley Federal de Protección de Datos Personales
          en Posesión de los Particulares y demás normativa aplicable.
        </p>

        <Section title="Datos que tratamos">
          <ul className="list-disc pl-lg">
            <li>
              Identificación y contacto: nombre, teléfono, correo electrónico y, en su caso, usuario de redes
              sociales.
            </li>
            <li>
              Datos del vehículo: marca, modelo, año, placas y fotografías del vehículo tomadas durante el
              servicio.
            </li>
            <li>
              Historial de servicios: citas, cotizaciones, órdenes de servicio, pagos, membresías y
              comentarios.
            </li>
            <li>
              Mensajes que nos envía por WhatsApp, Messenger o Instagram, incluidos los archivos que adjunte,
              y su preferencia sobre recibir promociones.
            </li>
            <li>Datos de facturación, cuando solicita una factura.</li>
          </ul>
          <p>No solicitamos datos personales sensibles.</p>
        </Section>

        <Section title="Para qué usamos sus datos">
          <p>Finalidades necesarias para el servicio que nos solicita:</p>
          <ul className="list-disc pl-lg">
            <li>
              Atender sus mensajes y responder sus preguntas sobre servicios, precios, horarios y ubicación.
            </li>
            <li>
              Agendar, confirmar y dar seguimiento a sus citas; elaborar cotizaciones y órdenes de servicio.
            </li>
            <li>Realizar el servicio, documentarlo con fotografías del vehículo y entregarlo.</li>
            <li>Cobrar, facturar y atender aclaraciones, quejas o garantías.</li>
            <li>Cumplir obligaciones legales y fiscales.</li>
          </ul>
          <p>Finalidades adicionales, sólo con su consentimiento:</p>
          <ul className="list-disc pl-lg">
            <li>Enviarle promociones, recordatorios de mantenimiento y encuestas de satisfacción.</li>
          </ul>
          <p>
            Puede negarse o retirar su consentimiento para las finalidades adicionales en cualquier momento,
            por ejemplo respondiendo <strong>BAJA</strong> en WhatsApp o escribiendo a {mail}. Esto no afecta
            el servicio que nos solicitó.
          </p>
        </Section>

        <Section title="Asistente automático en WhatsApp">
          <p>
            Nuestro número de WhatsApp puede ser atendido por un asistente automático que responde con
            información de nuestro catálogo, horarios y disponibilidad. El asistente se identifica como tal,
            no confirma citas ni cobros por sí mismo y, cuando usted lo pide o el caso lo requiere, pasa la
            conversación a una persona de nuestro equipo.
          </p>
        </Section>

        <Section title="Con quién compartimos sus datos">
          <p>
            No vendemos sus datos. Los compartimos sólo con proveedores que nos prestan servicios y los tratan
            por nuestra cuenta y bajo nuestras instrucciones (encargados):
          </p>
          <ul className="list-disc pl-lg">
            <li>Meta Platforms (WhatsApp, Messenger e Instagram), para enviar y recibir mensajes.</li>
            <li>Proveedores de hospedaje y bases de datos en la nube, para operar nuestra plataforma.</li>
            <li>
              Proveedores de inteligencia artificial, para que el asistente automático redacte sus respuestas.
            </li>
            <li>Proveedores de pago y de facturación, cuando aplica.</li>
          </ul>
          <p>
            Algunos de estos proveedores pueden estar fuera de México. También podemos comunicar datos a
            autoridades cuando la ley lo exija.
          </p>
        </Section>

        <Section title="Sus derechos (ARCO) y cómo ejercerlos">
          <p>
            Usted puede acceder a sus datos, rectificarlos, cancelarlos u oponerse a su tratamiento, así como
            revocar su consentimiento o limitar su uso. Envíe su solicitud a {mail} con su nombre, un medio
            para responderle, una identificación, la descripción clara de lo que pide y, en su caso, el número
            de teléfono o placas con los que nos contactó. Le responderemos en un máximo de 20 días hábiles y,
            si procede, la haremos efectiva dentro de los 15 días hábiles siguientes.
          </p>
        </Section>

        <Section id="eliminacion" title="Eliminación de sus datos">
          <p>
            Para pedir que eliminemos sus datos, incluidos los mensajes que nos envió por WhatsApp, Messenger
            o Instagram:
          </p>
          <ol className="list-decimal pl-lg">
            <li>
              Escriba a {mail} con el asunto «Eliminar mis datos», o pídalo en el mismo chat de WhatsApp o
              redes sociales.
            </li>
            <li>
              Indique el teléfono, correo o usuario con el que nos contactó, para identificar sus registros.
            </li>
            <li>
              Confirmaremos su identidad y eliminaremos o anonimizaremos sus datos. Sólo conservaremos lo que
              la ley nos obligue a guardar (por ejemplo, comprobantes fiscales) durante el plazo legal.
            </li>
          </ol>
          <p>Le avisaremos por el mismo medio cuando la eliminación esté hecha.</p>
        </Section>

        <Section title="Seguridad y conservación">
          <p>
            Aplicamos medidas administrativas, técnicas y físicas para proteger sus datos: acceso restringido
            por función y centro, registro de cambios y conexiones cifradas. Conservamos sus datos mientras
            sea necesario para las finalidades descritas y los plazos que exige la ley.
          </p>
        </Section>

        <Section title="Cambios a este aviso">
          <p>
            Cualquier cambio a este aviso se publicará en esta misma página. Última actualización:{" "}
            {actualizado}.
          </p>
        </Section>

        <p className="text-muted">
          Contacto: {razonSocial} · {domicilio} · {mail}
        </p>
      </div>
    </PlainShell>
  );
}
