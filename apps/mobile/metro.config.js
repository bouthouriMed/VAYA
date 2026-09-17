const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Monorepo support: watch the workspace so `@vaya/*` packages resolve and hot-reload,
// but exclude apps/api and apps/admin — the mobile bundle never needs server source,
// and Metro/expo-router's file scanners otherwise pick those files up as spurious routes.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.blockList = [/apps[\/\\]api[\/\\].*/, /apps[\/\\]admin[\/\\].*/];

// Expo's default config disables Watchman (resolver.useWatchman = null) and falls back to
// Metro's native/Node file watcher. That watcher has to individually register every file under
// `watchFolders`, and this monorepo's shared pnpm store (`node_modules/.pnpm` at the workspace
// root) puts over a million files under watch — the native watcher can't finish within Metro's
// 240s startup timeout on Windows, crashing with "Failed to start watch mode." Watchman is built
// for exactly this scale, so re-enable it explicitly rather than relying on the default.
config.resolver.useWatchman = true;

module.exports = config;
