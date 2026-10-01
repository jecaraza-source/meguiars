# ADR 0035 — Iconos compartidos (Lucide como datos) y react-native-svg en móvil

- Estado: aceptado
- Fecha: 2026-10-01

## Contexto

La navegación necesitaba iconos por sección y pantalla, iguales en web y móvil, sin romper la regla del sistema de diseño (nada de estilos escritos a mano) ni sumar peso innecesario.

## Decisión

- **Un solo set en `@meguiars/ui-tokens` (`icons.ts`).** Los trazos de [Lucide](https://lucide.dev) (licencia ISC) se guardan como nodos SVG (`[etiqueta, atributos]`). No se agrega `lucide-react` ni otra librería de iconos en tiempo de ejecución; para sumar un icono se copian sus nodos desde `lucide-static`.
- **La navegación declara el icono** (`NAV_SECTIONS`: `icon` en sección y pantalla). El typecheck de web y móvil falla si el nombre no existe en el set.
- **Web** los dibuja con `<svg>` (`components/ui/icon.tsx`), en `currentColor` y con tamaños de los tokens.
- **Móvil** usa `react-native-svg` 15.15.4, la versión que Expo SDK 57 declara compatible. Es un módulo nativo: requiere un build nuevo de EAS. Con `runtimeVersion: fingerprint`, las actualizaciones OTA no llegan a binarios viejos, así que no hay riesgo de que una app sin el módulo reciba este código.

## Consecuencias

- Iconos idénticos en ambas plataformas, sin dependencia de iconos en web.
- Hay que publicar un build nuevo de la app móvil (EAS) para que la versión instalada muestre los iconos; hasta entonces sigue con la versión anterior.
