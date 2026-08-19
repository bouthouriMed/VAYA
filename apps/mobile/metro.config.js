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

module.exports = config;
