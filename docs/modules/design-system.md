# Módulo F0.4 — Design system y navegación compartida

## Alcance

Sistema visual sobrio y consistente para los cuatro dominios, con tokens, contratos de componentes, componentes base web y móvil, navegación principal por rol y accesibilidad básica. No crea tablas: la navegación se deriva de los roles y capacidades de F0.2, y la autorización real sigue en RLS.

## Arquitectura

```
@meguiars/ui-tokens
 ├─ tokens.ts     valores (color, espacio, tipografía, radios, estados, densidad, elevación, breakpoints, layout, z-index, movimiento)
 ├─ recipes.ts    variantes y tonos → tokens (botón, badge, toast); tamaños de control
 ├─ contracts.ts  props compartidas de cada componente + helpers de KPI
 └─ css.ts        toCssVariables() y toComponentCss() → CSS de web generado desde recetas
@meguiars/domain
 ├─ navigation.ts NAV_SECTIONS, visibleNavigation(state), sectionOfPath/Screen
 └─ sections.ts   textos de cada dominio y executiveKpis()
apps/web      componentes DOM (components/ui/*) + AppShell responsivo; Tailwind limitado a tokens
apps/mobile   componentes React Native (src/ui/*) + TabBar nativo; StyleSheet con tokens
```

Web y móvil comparten tokens, recetas, contratos, textos y navegación; cada uno renderiza con su plataforma (ADR 0006).

## Tokens

| Grupo           | Tokens                                                                                                                                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Color semántico | `background`, `surface`, `surfaceRaised`, `foreground`, `muted`, `subtle`, `border`, `borderStrong`, `brand`, `brandForeground`, `accent`, `focus`, y `success`/`warning`/`danger`/`info` con su `*Surface`; `overlay` |
| Tipografía      | `display`, `title`, `heading`, `body`, `bodySmall`, `label`, `caption` y `kpi` (tamaño, peso, interlineado)                                                                                                            |
| Espacio         | `none`, `xxs` 2, `xs` 4, `sm` 8, `md` 12, `lg` 16, `xl` 24, `xxl` 32, `xxxl` 48                                                                                                                                        |
| Radios          | `none`, `sm`, `md`, `lg`, `xl`, `full`                                                                                                                                                                                 |
| Estados         | `disabledOpacity`, `pressedOpacity`, `focusRingWidth`, `focusRingOffset`                                                                                                                                               |
| Densidad        | `comfortable` (control 44, fila 52) y `compact` (control 36, fila 40); `touchTarget` 44                                                                                                                                |
| Otros           | `elevation` (sm/md/lg), `breakpoints` (tablet 768, desktop 1024, wide 1280), `layout` (sidebar, content, narrow), `zIndex`, `motion`                                                                                   |

**Tonos** (`neutral`, `brand`, `success`, `warning`, `danger`, `info`): el color comunica significado y siempre va con texto. En los KPI, la tendencia usa ▲▼■ además del color.

## Componentes base

| Componente                                                       | Web                                             | Móvil                                        | Contrato                                                     |
| ---------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------ |
| Botón (primary/secondary/ghost/danger; md/sm; loading; disabled) | `ui/button.tsx`                                 | `ui/controls.tsx`                            | `ButtonContract`                                             |
| Input                                                            | `ui/field.tsx`                                  | `ui/controls.tsx`                            | `FieldContract`                                              |
| Select                                                           | `<select>` nativo                               | hoja con opciones                            | `SelectContract`                                             |
| Card                                                             | `ui/display.tsx`                                | `ui/display.tsx`                             | `CardContract`                                               |
| Tabla / lista                                                    | tabla en tablet y escritorio, tarjetas en móvil | lista de tarjetas                            | `TableContract`                                              |
| Badge                                                            | `.mg-badge[data-tone]`                          | `Badge`                                      | `BadgeContract`                                              |
| Modal / hoja                                                     | `<dialog>`: modal en escritorio, hoja en móvil  | `Modal` hoja inferior                        | `SheetContract`                                              |
| Toast                                                            | `ToastProvider` (role=status/alert)             | `ToastProvider` + `announceForAccessibility` | `ToastContract`                                              |
| Skeleton                                                         | pulso CSS (respeta `prefers-reduced-motion`)    | `Animated` (respeta "reducir movimiento")    | `SkeletonContract`                                           |
| Empty state                                                      | `EmptyState`                                    | `EmptyState`                                 | `EmptyStateContract`                                         |
| KPI card                                                         | `KpiCard`                                       | `KpiCard`                                    | `KpiContract` (`kpiTrend`, `kpiDeltaTone`, `formatKpiDelta`) |

Catálogo vivo: **`/sistema`** en web y **"Sistema de diseño"** en el encabezado de la app móvil. Usa datos de ejemplo.

## Navegación por rol

| Sección                   | Pantallas (capacidad)                                        | admin_socio |  encargado  | operador_recepcion | contador | comercial_b2b |
| ------------------------- | ------------------------------------------------------------ | :---------: | :---------: | :----------------: | :------: | :-----------: |
| Inicio                    | Mi centro                                                    |      ✓      |      ✓      |         ✓          |    ✓     |       ✓       |
| Operación                 | Operación del día (`operations.read`)                        |      ✓      |      ✓      |         ✓          |          |               |
| Comercial                 | Clientes, membresías y B2B (`commercial.read`)               |      ✓      |      ✓      |                    |          |       ✓       |
| Administración y Finanzas | Resumen financiero (`finance.read`), Equipo (`members.read`) |      ✓      | sólo Equipo |                    |    ✓     |               |
| Dirección                 | Vista consolidada (`executive.read`)                         |      ✓      |             |                    |          |               |

- Las secciones visibles dependen del **centro activo**: al cambiar de centro, cambia la navegación.
- Si un usuario entra a una ruta sin permiso, el guard lo redirige a `/sin-permiso`, igual que en F0.3.
- **Web:** barra lateral desde 768 px y barra inferior en móvil; las secciones con varias pantallas muestran subnavegación.
- **Móvil:** barra de pestañas nativa con las mismas secciones y la misma subnavegación.
- Operación, Comercial y Finanzas muestran un estado vacío y una vista previa de carga, porque su contenido llega con sus módulos. Dirección muestra KPIs reales de acceso (centros activos y deshabilitados, organizaciones, alcance corporativo).

## Responsive

| Ancho               | Layout                                                               |
| ------------------- | -------------------------------------------------------------------- |
| < 768 (móvil)       | encabezado compacto, barra inferior, 1 columna, tablas como tarjetas |
| 768–1023 (tablet)   | barra lateral, rejillas de 2 columnas, tablas                        |
| ≥ 1024 (escritorio) | barra lateral, rejillas de 3 o 4 columnas                            |

## Accesibilidad

- Etiquetas visibles en todos los campos, con ayuda y error enlazados por `aria-describedby` y `role=alert`.
- Foco visible global (`:focus-visible` con el token `focus`) y enlace "Saltar al contenido".
- Contraste AA verificado por prueba para cada par texto/fondo de tonos, botones y textos, y 3:1 para el foco.
- Áreas táctiles de al menos 44 px en controles, pestañas y enlaces. El botón compacto usa `hitSlop` en móvil.
- `aria-current` en la navegación; `role=tab` y `tablist` en móvil.
- Se respeta la preferencia de reducir movimiento.

## Reglas para pantallas nuevas

1. Usa los componentes de `components/ui` (web) o `src/ui` (móvil). No estilices controles a mano.
2. **Web:** clases de Tailwind con nombre de token (`p-lg`, `gap-md`, `text-muted`, `rounded-md`) o `var(--mg-*)`. La paleta y las escalas por defecto de Tailwind están deshabilitadas.
3. **Móvil:** valores de `@meguiars/ui-tokens` y `textStyle()`; nada de números para tamaños, espacios o colores.
4. Declara la pantalla en `SCREEN_GUARDS` y, si va en el menú, en `NAV_SECTIONS`.

`ui-tokens/src/no-hardcoded-styles.test.ts` falla ante colores hex o `rgb`, la paleta o escalas numéricas de Tailwind, valores arbitrarios, o tamaños numéricos en StyleSheet.

## Base de datos

**Sin migración.** La navegación se deriva de roles y capacidades existentes, y cada dominio tendrá sus tablas y políticas RLS en su módulo. Guardar la densidad o el tema por usuario queda como pendiente opcional.

## Pruebas

- `ui-tokens`:
  - contraste WCAG AA de tonos, botones y textos;
  - área táctil y tipografía mínimas;
  - CSS generado con todas las variantes;
  - helpers de KPI;
  - paridad del tema de Tailwind con los tokens;
  - verificación de estilos escritos a mano en las apps.
- `domain`: navegación por rol para los 5 roles, roles combinados, sección activa por ruta y pantalla, KPIs de Dirección, y fecha y hora por centro.
- **E2E del design system**: 15 comprobaciones en escritorio, tablet y móvil que cubren layout, rejillas, barra inferior, tablas como tarjetas, áreas táctiles, foco, etiquetas, modal y aviso, y navegación por rol y por centro activo. El e2e de sesión de F0.3 (17 comprobaciones) sigue pasando.
