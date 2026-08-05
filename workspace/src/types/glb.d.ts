/**
 * `.glb` 3D model asset declaration.
 * Metro resolves `.glb` files as numeric asset references (see metro.config.js).
 */
declare module '*.glb' {
  const source: number;
  export default source;
}
