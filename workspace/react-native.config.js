/**
 * react-native.config.js
 *
 * Registers the assistant's asset folders so that React Native's CLI links
 * them into the native asset pipeline on both platforms.
 *
 * Note: `.glb` files are resolved by Metro (see metro.config.js), not by this
 * config, but registering the folder keeps other assets (e.g. textures used
 * at runtime) available.
 */
module.exports = {
  assets: ['./src/assets/'],
};
