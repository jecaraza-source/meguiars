"use client";

import { BUTTON_VARIANTS, TONES, type Tone } from "@meguiars/ui-tokens";
import { useState } from "react";
import { Button } from "./ui/button";
import { Badge, Card, EmptyState, KpiCard, Skeleton, Table } from "./ui/display";
import { Input, Select } from "./ui/field";
import { Sheet, useToast } from "./ui/overlay";

const TONE_LABELS: Record<Tone, string> = {
  neutral: "Neutral",
  brand: "Marca",
  success: "Éxito",
  warning: "Advertencia",
  danger: "Error",
  info: "Información",
};

const EXAMPLE_ROWS = [
  { id: "1", servicio: "Lavado premium", estado: "En proceso", total: "$850" },
  { id: "2", servicio: "Pulido y encerado", estado: "Listo", total: "$2,400" },
  { id: "3", servicio: "Detallado interior", estado: "En espera", total: "$1,200" },
];

/** Catálogo vivo del sistema de diseño (datos de ejemplo). */
export function DesignSystemShowcase() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const toast = useToast();
  return (
    <>
      <Card title="Botones" subtitle="Variantes y tamaños (md cumple el área táctil de 44 px).">
        <div className="flex flex-wrap gap-sm">
          {BUTTON_VARIANTS.map((v) => (
            <Button key={v} label={v} variant={v} />
          ))}
          <Button label="Compacto" size="sm" variant="secondary" />
          <Button label="Cargando" loading />
          <Button label="Deshabilitado" disabled />
        </div>
      </Card>

      <Card title="Campos" subtitle="Etiqueta siempre visible; ayuda y error enlazados al campo.">
        <div className="grid gap-lg md:grid-cols-2">
          <Input name="demo-nombre" label="Nombre del cliente" hint="Como aparece en la identificación." />
          <Input
            name="demo-correo"
            label="Correo"
            type="email"
            error="Correo inválido"
            defaultValue="cliente@"
          />
          <Select
            name="demo-centro"
            label="Centro"
            defaultValue=""
            placeholder="Elige un centro"
            options={[
              { value: "cdmx", label: "CDMX-01" },
              { value: "mty", label: "MTY-01" },
            ]}
          />
        </div>
      </Card>

      <Card title="Badges y tonos" subtitle="El color comunica significado y siempre va acompañado de texto.">
        <div className="flex flex-wrap gap-sm">
          {TONES.map((t) => (
            <Badge key={t} label={TONE_LABELS[t]} tone={t} />
          ))}
        </div>
      </Card>

      <div className="grid gap-lg md:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Órdenes del día" value="18" delta={0.125} caption="vs. mismo día semana pasada" />
        <KpiCard label="Ticket promedio" value="$1,480" delta={-0.04} />
        <KpiCard label="Tiempo en espera" value="22 min" delta={0.1} higherIsBetter={false} />
        <KpiCard label="Membresías activas" value="64" delta={0} />
      </div>

      <Card title="Tabla / lista" subtitle="Tabla en tablet y escritorio; tarjetas en móvil.">
        <Table
          caption="Órdenes de ejemplo"
          rows={EXAMPLE_ROWS}
          rowKey={(r) => r.id}
          emptyMessage="Sin órdenes"
          columns={[
            { key: "servicio", header: "Servicio", value: (r) => r.servicio },
            { key: "estado", header: "Estado", value: (r) => r.estado },
            { key: "total", header: "Total", value: (r) => r.total, align: "end" },
          ]}
        />
      </Card>

      <div className="grid gap-lg md:grid-cols-2">
        <Card title="Skeleton">
          <Skeleton lines={3} />
        </Card>
        <Card title="Estado vacío">
          <EmptyState title="Sin resultados" message="Ajusta los filtros o crea un registro nuevo." />
        </Card>
      </div>

      <Card
        title="Modal / hoja y aviso"
        subtitle="Modal en escritorio y hoja inferior en móvil; el foco queda atrapado."
      >
        <div className="flex flex-wrap gap-sm">
          <Button label="Abrir hoja" variant="secondary" onClick={() => setSheetOpen(true)} />
          <Button
            label="Mostrar aviso"
            variant="secondary"
            onClick={() => toast({ message: "Cambios guardados.", tone: "success" })}
          />
          <Button
            label="Mostrar error"
            variant="secondary"
            onClick={() => toast({ message: "No se pudo guardar.", tone: "danger" })}
          />
        </div>
      </Card>

      <Sheet open={sheetOpen} title="Confirmar acción" onClose={() => setSheetOpen(false)}>
        <p className="text-muted">Esta es una hoja de ejemplo. Pulsa Escape o Cerrar para salir.</p>
        <div className="flex justify-end gap-sm">
          <Button label="Cancelar" variant="ghost" onClick={() => setSheetOpen(false)} />
          <Button label="Confirmar" onClick={() => setSheetOpen(false)} />
        </div>
      </Sheet>
    </>
  );
}
