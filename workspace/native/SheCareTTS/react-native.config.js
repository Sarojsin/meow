/**
 * Autolinking config so RN CLI can discover this local library from the host
 * app without manual registration. The host app must depend on this package
 * (e.g. `"she-care-tts": "file:native/SheCareTTS"` in package.json).
 */
module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: 'android',
        packageImportPath: 'import com.shecaretts.SheCareTTSPackage;',
        packageInstance: 'new SheCareTTSPackage()',
      },
      ios: {
        podspecPath: 'SheCareTTS.podspec',
      },
    },
  },
};
