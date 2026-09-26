# ADR 0006 — Design system: tokens y contratos compartidos, render por plataforma

- Estado: aceptado
- Fecha: 2026-09-26

## Contexto

Web (DOM, Tailwind) y móvil (React Native) deben verse y comportarse igual sin compartir necesariamente el componente visual.

## Decisión

1. **Tokens como única fuente** (`@meguiars/ui-tokens/tokens.ts`). Web los recibe como variables CSS `--mg-*` inyectadas en el layout; móvil los importa como constantes.
2. **Recetas** (variante o tono → tokens) y **contratos** (props) compartidos. El CSS de los componentes web (`.mg-btn[data-variant]`, `.mg-badge[data-tone]`…) **se genera desde las recetas**, así que una variante nueva se define una sola vez.
3. **Tailwind restringido a tokens:** `globals.css` vacía la paleta y las escalas por defecto (`--color-*: initial`, etc.) y define sólo las del sistema. Una prueba verifica la paridad con `tokens.ts`.
4. **Componentes por plataforma:** `components/ui` en web y `src/ui` en móvil, que implementan los mismos contratos. Ejemplos: `Select` es `<select>` nativo en web y una hoja en móvil; `Table` es una tabla en web y una lista en móvil (la web también cambia a lista por debajo de 768 px).
5. **Navegación compartida** (`NAV_SECTIONS` y `visibleNavigation`) sobre los mismos guards que protegen las rutas: lo que el menú muestra coincide con lo que el servidor permite.
6. **Verificación automática** en CI de estilos escritos a mano y de contraste.

## Alternativas descartadas

- **React Native Web / Tamagui / NativeWind** para un único componente: agregan dependencias pesadas y un paso de compilación extra, y el prompt pide compartir contratos, no el render.
- **Librería de íconos:** se omitió para no sumar dependencias (react-native-svg en móvil). La navegación usa etiquetas de texto claras; se puede agregar cuando el diseño lo requiera.

## Consecuencias

- Cambiar un color o espacio es un cambio en `tokens.ts`, y las pruebas de contraste y paridad lo validan.
- Las clases numéricas de Tailwind (`p-4`, `w-64`) no existen: el equipo debe usar los nombres de token.
