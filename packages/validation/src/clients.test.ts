import { describe, expect, it } from "vitest";
import { fieldErrors } from "./auth";
import {
  clientSearchSchema,
  createClientSchema,
  newClientFormSchema,
  toCreateClientCommand,
  updateVehicleSchema,
} from "./clients";

const CENTER = "11111111-1111-4111-8111-111111111111";
const REQUEST = "10000000-0000-4000-8000-000000000001";

const webForm = {
  fullName: "  José   Pérez ",
  phone: "55 1234 5678",
  email: "Jose@Correo.MX",
  kind: "person",
  notes: "",
  marketingChannels: ["whatsapp", "whatsapp"],
  make: "Mazda",
  model: "3",
  year: "2021",
  plate: "abc-12-34",
  identifier: "",
  vehicleNotes: "",
  duplicateReason: "",
};

describe("alta de cliente", () => {
  it("el mismo formulario desde web y móvil produce el mismo comando (salvo el origen)", () => {
    // Móvil: teléfono con +52, año numérico, placa sin guiones.
    const mobileForm = { ...webForm, phone: "+52 55-1234-5678", year: 2021, plate: "ABC 1234" };
    const web = toCreateClientCommand(newClientFormSchema.parse(webForm), {
      detailCenterId: CENTER,
      requestId: REQUEST,
      source: "web",
    });
    const mobile = toCreateClientCommand(newClientFormSchema.parse(mobileForm), {
      detailCenterId: CENTER,
      requestId: REQUEST,
      source: "mobile",
    });
    expect({ ...web, source: "x" }).toEqual({ ...mobile, source: "x" });
    expect(web).toMatchObject({
      fullName: "José Pérez",
      phone: "+525512345678",
      email: "jose@correo.mx",
      marketingChannels: ["whatsapp"],
      vehicles: [{ make: "Mazda", model: "3", year: 2021, plate: "ABC1234", identifier: undefined }],
      duplicateReason: undefined,
    });
    expect(createClientSchema.safeParse(web).success).toBe(true);
  });

  it("valida campos requeridos, teléfono, email, placa y año", () => {
    const bad = newClientFormSchema.safeParse({
      ...webForm,
      fullName: "J",
      phone: "123",
      email: "no-es-email",
      make: "",
      plate: "-",
      year: "1900",
    });
    expect(bad.success).toBe(false);
    expect(Object.keys(fieldErrors(bad.error!)).sort()).toEqual(
      ["email", "fullName", "make", "phone", "plate", "year"].sort(),
    );
  });

  it("el motivo para registrar un posible duplicado tiene al menos 3 caracteres", () => {
    expect(newClientFormSchema.safeParse({ ...webForm, duplicateReason: "no" }).success).toBe(false);
    expect(newClientFormSchema.parse({ ...webForm, duplicateReason: " Familiares " }).duplicateReason).toBe(
      "Familiares",
    );
  });
});

describe("vehículos y búsqueda", () => {
  it("dar de baja un vehículo exige motivo", () => {
    const base = { id: REQUEST, make: "VW", model: "Jetta", year: 2019, plate: "XYZ999", active: false };
    expect(updateVehicleSchema.safeParse({ ...base, reason: "" }).success).toBe(false);
    expect(
      updateVehicleSchema.parse({ ...base, reason: "Lo vendió", identifier: "vin-123" }).identifier,
    ).toBe("VIN123");
  });

  it("la búsqueda pide al menos 2 caracteres", () => {
    expect(clientSearchSchema.safeParse({ detailCenterId: CENTER, query: " a " }).success).toBe(false);
    expect(clientSearchSchema.parse({ detailCenterId: CENTER, query: " ABC " }).query).toBe("ABC");
  });
});
