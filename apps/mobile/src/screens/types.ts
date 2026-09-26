import type { SignedInState } from "@meguiars/domain";

/** Props comunes de pantallas privadas: encabezado y subnavegación los arma el Router. */
export interface PrivateScreenProps {
  state: SignedInState;
  header: React.ReactNode;
  subnav: React.ReactNode;
}
