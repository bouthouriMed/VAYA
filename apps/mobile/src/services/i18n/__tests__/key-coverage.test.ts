import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Every translation key a screen asks for must exist in all three locales.
 * A missing key doesn't throw at runtime — i18next renders the raw key
 * ("status_confirmed_title", "otp.sentTo") straight onto the screen, which
 * is how four user-facing screens shipped showing raw keys before this test
 * existed. Also checks that fr/en/ar carry the same key set, so a key added
 * to one locale can't silently fall back in the other two.
 */

const MOBILE_ROOT = path.resolve(__dirname, '../../../..');
const LOCALES_DIR = path.resolve(__dirname, '../locales');
const LOCALES = ['fr', 'en', 'ar'] as const;

type Tree = { [key: string]: string | Tree };

function loadLocale(locale: string): Record<string, Tree> {
  const dir = path.join(LOCALES_DIR, locale);
  const out: Record<string, Tree> = {};
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    out[file.replace(/\.json$/, '')] = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as Tree;
  }
  return out;
}

/** i18next plural/context suffixes (`key_one`, `key_other`, `key_male`). */
function hasKey(tree: Tree | undefined, key: string): boolean {
  if (!tree) return false;
  if (key in tree) return true;
  let node: string | Tree = tree;
  for (const part of key.split('.')) {
    if (typeof node !== 'object') return false;
    if (part in node) {
      node = node[part]!;
      continue;
    }
    return Object.keys(node).some((k) => k.startsWith(`${part}_`));
  }
  return true;
}

function flatten(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' || entry.name === 'node_modules' ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const locales = Object.fromEntries(LOCALES.map((l) => [l, loadLocale(l)])) as Record<
  (typeof LOCALES)[number],
  Record<string, Tree>
>;

describe('i18n key coverage', () => {
  it('every literal t() key used in app/ and src/ exists in fr, en and ar', () => {
    const missing: string[] = [];
    const files = [...sourceFiles(path.join(MOBILE_ROOT, 'app')), ...sourceFiles(path.join(MOBILE_ROOT, 'src'))];
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      const defaultNs = /useTranslation\(\s*\[?\s*['"]([a-zA-Z]+)['"]/.exec(source)?.[1];
      for (const match of source.matchAll(/(?<![\w.])t\(\s*['"](?:([a-zA-Z]+):)?([a-z][A-Za-z0-9_.]*)['"]/g)) {
        const ns = match[1] ?? defaultNs;
        const key = match[2]!;
        if (!ns) continue;
        for (const locale of LOCALES) {
          if (!hasKey(locales[locale][ns], key)) {
            missing.push(`${locale} ${ns}:${key} (${path.relative(MOBILE_ROOT, file)})`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('fr, en and ar define the same keys in every namespace', () => {
    // Plural categories legitimately differ per language (Arabic has
    // zero/two/few/many), so compare the base key, not each plural form.
    const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
    const baseKeys = (tree: Tree): Set<string> => new Set(flatten(tree).map((k) => k.replace(PLURAL_SUFFIX, '')));
    const mismatches: string[] = [];
    const namespaces = new Set(LOCALES.flatMap((l) => Object.keys(locales[l])));
    for (const ns of namespaces) {
      const reference = baseKeys(locales.fr[ns] ?? {});
      for (const locale of ['en', 'ar'] as const) {
        const keys = baseKeys(locales[locale][ns] ?? {});
        for (const k of reference) if (!keys.has(k)) mismatches.push(`${locale} missing ${ns}:${k}`);
        for (const k of keys) if (!reference.has(k)) mismatches.push(`fr missing ${ns}:${k}`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
