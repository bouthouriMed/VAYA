const { withAppDelegate } = require('@expo/config-plugins');

/**
 * react-native-maps' Google provider on iOS has no first-class Expo config
 * field (unlike Android's `android.config.googleMaps.apiKey`, which Expo
 * handles natively) — the native GoogleMaps SDK requires an explicit
 * `GMSServices.provideAPIKey(...)` call at app launch, which normally means
 * hand-editing AppDelegate. This plugin injects that call via a config-plugin
 * "mod" instead, so `expo prebuild` regenerates it correctly every time
 * rather than a hand-edited native file silently drifting from app.config.js.
 *
 * Verification limitation, stated honestly (same category as this project's
 * existing Android GOOGLE_MAPS_API_KEY note in app.config.js): this plugin
 * has not been run through a real `expo prebuild`/Xcode build in this
 * sandboxed environment (no macOS/Xcode toolchain available here) — it is
 * written against @expo/config-plugins' documented withAppDelegate mod API
 * and the GoogleMaps SDK's documented iOS setup call, but needs a real
 * prebuild + device/simulator run to confirm before shipping.
 */
function withGoogleMapsIOS(config, { apiKey }) {
  if (!apiKey) return config;

  return withAppDelegate(config, (config) => {
    const { modResults } = config;
    const contents = modResults.contents;

    if (contents.includes('GMSServices')) return config;

    const isSwift = modResults.language === 'swift';
    const importLine = isSwift ? 'import GoogleMaps\n' : '#import <GoogleMaps/GoogleMaps.h>\n';
    const provideKeyLine = isSwift
      ? `    GMSServices.provideAPIKey("${apiKey}")\n`
      : `  [GMSServices provideAPIKey:@"${apiKey}"];\n`;

    if (!contents.includes(isSwift ? 'import GoogleMaps' : '#import <GoogleMaps/GoogleMaps.h>')) {
      modResults.contents = importLine + modResults.contents;
    }

    // Insert the provideAPIKey call as the first statement inside
    // application(_:didFinishLaunchingWithOptions:) — matched by the
    // function's opening brace, since the exact surrounding boilerplate
    // differs between Expo SDK versions.
    const launchFnPattern = isSwift
      ? /(public func application\([^)]*\)\s*->\s*Bool\s*\{)/
      : /(- \(BOOL\)application:\(UIApplication \*\)application didFinishLaunchingWithOptions:\(NSDictionary \*\)launchOptions\s*\{)/;

    modResults.contents = modResults.contents.replace(
      launchFnPattern,
      (match) => `${match}\n${provideKeyLine}`,
    );

    return config;
  });
}

module.exports = withGoogleMapsIOS;
