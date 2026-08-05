const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://metrobundler.dev/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  resolver: {
    // Make it possible to import .glb 3D models as assets in code.
    assetExts: [...(getDefaultConfig(__dirname).resolver?.assetExts ?? []), 'glb'],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
