import { resolveAppEnvironment } from "@meguiars/domain";

/** Ambiente del build: lo fija el perfil de EAS (`eas.json`); en Expo Go es `local`. */
// Las variables EXPO_PUBLIC_* se incrustan en el bundle: deben leerse de forma literal.
export const APP_ENV = resolveAppEnvironment(process.env.EXPO_PUBLIC_APP_ENV);
