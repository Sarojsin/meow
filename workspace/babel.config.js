module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // Required by react-native-worklets-core (used by react-native-filament).
    // 'processNestedWorklets' must be enabled for worklets defined inside hooks.
    ['react-native-worklets-core/plugin', { processNestedWorklets: true }],
  ],
};
