// Imágenes empaquetadas por Metro: el import devuelve el id del recurso.
declare module "*.png" {
  const asset: number;
  export default asset;
}
