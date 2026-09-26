import { describe, expect, it } from "vitest";
import { clientsCopy } from "./copy";
import {
  clientErrorMessage,
  describeMatch,
  isPossibleDuplicate,
  maxVehicleYear,
  newRequestId,
  vehicleLabel,
} from "./rules";

describe("reglas de clientes", () => {
  it("describe una coincidencia de duplicado sin exponer datos completos", () => {
    expect(
      describeMatch({
        clientId: "c",
        displayName: "José P.",
        phoneHint: "•••• 5678",
        homeCenterName: "Centro A",
        matchedOn: ["phone", "plate"],
        visible: false,
      }),
    ).toBe("Coincide por teléfono y placa · •••• 5678 · Centro A");
  });

  it("traduce los errores del backend a mensajes de la UI", () => {
    const dup = { kind: "conflict" as const, message: "x", code: "MG001" };
    expect(isPossibleDuplicate(dup)).toBe(true);
    expect(clientErrorMessage(dup)).toBe(clientsCopy.duplicateMessage);
    expect(clientErrorMessage({ kind: "conflict", message: "x", code: "23505" })).toBe(
      clientsCopy.plateTaken,
    );
    expect(clientErrorMessage({ kind: "permission_denied", message: "x", code: "42501" })).toBe(
      clientsCopy.notFound,
    );
  });

  it("etiqueta de vehículo y año máximo", () => {
    expect(vehicleLabel({ make: "Mazda", model: "3", year: 2021, plate: "ABC1234" })).toBe(
      "Mazda 3 2021 · ABC1234",
    );
    expect(maxVehicleYear(new Date("2026-09-25T00:00:00Z"))).toBe(2027);
  });
});

describe("newRequestId", () => {
  it("genera UUID v4 válidos y distintos, también sin crypto.randomUUID", () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(newRequestId()).toMatch(uuid);
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    try {
      const ids = new Set(Array.from({ length: 50 }, () => newRequestId()));
      expect(ids.size).toBe(50);
      for (const id of ids) expect(id).toMatch(uuid);
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: original, configurable: true });
    }
  });
});
