import { sectionCopy } from "@meguiars/domain";
import { BUTTON_VARIANTS, space, TONES, type Tone } from "@meguiars/ui-tokens";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Field, Select } from "@/ui/controls";
import { Badge, Card, EmptyState, KpiCard, List, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Sheet, useToast } from "@/ui/overlay";
import type { PrivateScreenProps } from "./types";

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
];

/** Catálogo vivo del sistema de diseño (mismo contenido que /sistema en web). */
export function DesignSystemScreen({ header, subnav }: PrivateScreenProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [center, setCenter] = useState<string | undefined>(undefined);
  const toast = useToast();
  return (
    <Screen
      title={sectionCopy.designSystem.title}
      description={sectionCopy.designSystem.description}
      header={header}
    >
      {subnav}
      <Card title="Botones" subtitle="Variantes y tamaños (md cumple el área táctil de 44 pt).">
        {BUTTON_VARIANTS.map((v) => (
          <Button key={v} label={v} variant={v} onPress={() => undefined} />
        ))}
        <Button label="Compacto" size="sm" variant="secondary" onPress={() => undefined} />
        <Button label="Cargando" loading onPress={() => undefined} />
        <Button label="Deshabilitado" disabled onPress={() => undefined} />
      </Card>
      <Card title="Campos" subtitle="Etiqueta siempre visible; ayuda y error bajo el campo.">
        <Field label="Nombre del cliente" hint="Como aparece en la identificación." />
        <Field label="Correo" error="Correo inválido" defaultValue="cliente@" />
        <Select
          label="Centro"
          value={center}
          placeholder="Elige un centro"
          onChange={setCenter}
          options={[
            { value: "cdmx", label: "CDMX-01" },
            { value: "mty", label: "MTY-01" },
          ]}
        />
      </Card>
      <Card title="Badges y tonos">
        <View style={styles.row}>
          {TONES.map((t) => (
            <Badge key={t} label={TONE_LABELS[t]} tone={t} />
          ))}
        </View>
      </Card>
      <View style={styles.row}>
        <KpiCard label="Órdenes del día" value="18" delta={0.125} caption="vs. mismo día semana pasada" />
        <KpiCard label="Tiempo en espera" value="22 min" delta={0.1} higherIsBetter={false} />
      </View>
      <Card title="Lista">
        <List
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
      <Card title="Skeleton">
        <Skeleton lines={3} />
      </Card>
      <EmptyState title="Sin resultados" message="Ajusta los filtros o crea un registro nuevo." />
      <Card title="Hoja y aviso">
        <Button label="Abrir hoja" variant="secondary" onPress={() => setSheetOpen(true)} />
        <Button
          label="Mostrar aviso"
          variant="secondary"
          onPress={() => toast({ message: "Cambios guardados.", tone: "success" })}
        />
      </Card>
      <Sheet open={sheetOpen} title="Confirmar acción" onClose={() => setSheetOpen(false)}>
        <Button label="Confirmar" onPress={() => setSheetOpen(false)} />
        <Button label="Cancelar" variant="ghost" onPress={() => setSheetOpen(false)} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
