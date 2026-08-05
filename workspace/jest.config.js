module.exports = {
  preset: 'react-native',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|react-native-worklets-core)/)',
  ],
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts?(x)'],
  clearMocks: true,
};
