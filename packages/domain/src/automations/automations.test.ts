import { describe, expect, it } from "vitest";
import {
  AUTOMATION_PRESETS,
  AUTOMATION_TRIGGERS,
  renderAutomationMessage,
  skippedTotal,
  triggerAccepts,
  triggerPurpose,
  unknownPlaceholders,
} from "./automations";

describe("automatizaciones", () => {
  it("mantenimiento y reactivación son promocionales; las demás operativas", () => {
    expect(AUTOMATION_TRIGGERS.filter((t) => triggerPurpose(t) === "promocional")).toEqual([
      "mantenimiento",
      "cliente_inactivo",
    ]);
    expect(triggerAccepts("prospecto_nuevo")).toEqual({ services: true, leadSources: true });
    expect(triggerAccepts("reserva_proxima").services).toBe(false);
  });

  it("el mensaje sólo usa datos reales", () => {
    expect(unknownPlaceholders("Hola {nombre}, {precio} y {descuento} {nombre}")).toEqual([
      "precio",
      "descuento",
    ]);
    expect(
      renderAutomationMessage("Hola {nombre}, tu {servicio} el {fecha} en {centro} ({folio})", {
        name: "Mario Díaz",
        service: "Encerado",
        center: "Centro A",
        date: "2026-10-05",
        folio: "A-01-000001",
      }),
    ).toBe("Hola Mario, tu Encerado el 05/10/2026 en Centro A (A-01-000001)");
    expect(renderAutomationMessage("Tu {servicio}", {})).toBe("Tu tu servicio");
  });

  it("las plantillas sugeridas no inventan precios ni promociones", () => {
    for (const t of AUTOMATION_TRIGGERS) {
      expect(unknownPlaceholders(AUTOMATION_PRESETS[t].template)).toEqual([]);
      expect(AUTOMATION_PRESETS[t].template).not.toMatch(/\$|%|gratis|descuento/i);
    }
    expect(skippedTotal({ skipped: { sin_consentimiento: 2, limite_frecuencia: 1 } })).toBe(3);
  });
});
