import {
  centersCopy,
  formatInCenterTimeZone,
  presentCenterAccess,
  type AccessBadge,
  type CenterAccess,
} from "@meguiars/domain";
import type { Tone } from "@meguiars/ui-tokens";
import { Badge, Table } from "./ui/display";

const BADGE_TONE: Record<AccessBadge, Tone> = { corporate: "brand", inactive: "danger", readOnly: "neutral" };

/** Centros a los que el usuario tiene acceso (tabla en escritorio, tarjetas en móvil). */
export function CentersTable({ access, now }: { access: CenterAccess[]; now: Date }) {
  const items = access.map(presentCenterAccess);
  return (
    <div className="flex flex-col gap-md">
      <div className="flex flex-wrap gap-xs">
        {items.flatMap((item) =>
          item.badges.map((b) => (
            <Badge
              key={`${item.id}-${b.kind}`}
              label={`${item.title}: ${b.label}`}
              tone={BADGE_TONE[b.kind]}
            />
          )),
        )}
      </div>
      <Table
        caption={centersCopy.title}
        rows={items}
        rowKey={(i) => i.id}
        emptyMessage={centersCopy.empty}
        columns={[
          { key: "name", header: "Centro", value: (i) => i.title },
          { key: "org", header: "Código · organización", value: (i) => i.subtitle },
          { key: "roles", header: centersCopy.rolesLabel, value: (i) => i.rolesText },
          {
            key: "time",
            header: centersCopy.localTimeLabel,
            value: (i) => formatInCenterTimeZone(now, i.timezone),
          },
        ]}
      />
    </div>
  );
}
