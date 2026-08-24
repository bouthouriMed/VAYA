import * as SecureStore from 'expo-secure-store';
import type { SearchLocation } from '../../state/searchSlice';

const RECENT_PLACES_KEY = 'vaya.recentPlaces';
const MAX_RECENT_PLACES = 5;

function isSearchLocation(value: unknown): value is SearchLocation {
  const v = value as SearchLocation | null;
  return !!v && typeof v === 'object' && typeof v.label === 'string' && typeof v.lat === 'number' && typeof v.lng === 'number';
}

/** Reads the user's real recent picks. Anything missing, corrupted, or from
 *  a since-changed shape falls back to an empty list rather than throwing —
 *  a storage hiccup must never wedge the search screen. */
export async function loadRecentPlaces(): Promise<SearchLocation[]> {
  try {
    const stored = await SecureStore.getItemAsync(RECENT_PLACES_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isSearchLocation) : [];
  } catch {
    return [];
  }
}

function coordKey(place: SearchLocation): string {
  return `${place.lat.toFixed(4)},${place.lng.toFixed(4)}`;
}

/** Records a genuinely chosen place, most-recent-first, deduped by
 *  coordinates (~11m) so re-picking the same place bumps it up instead of
 *  duplicating it. "Ma position actuelle" is never persisted — it's already
 *  offered as its own row every time. Best-effort: a write failure must
 *  never block the selection it's recording, so it's swallowed rather than
 *  surfaced. */
export async function addRecentPlace(place: SearchLocation): Promise<SearchLocation[]> {
  if (place.isCurrentPosition) return loadRecentPlaces();
  const existing = await loadRecentPlaces();
  const deduped = existing.filter((p) => coordKey(p) !== coordKey(place));
  const next = [place, ...deduped].slice(0, MAX_RECENT_PLACES);
  try {
    await SecureStore.setItemAsync(RECENT_PLACES_KEY, JSON.stringify(next));
  } catch {
    // Best-effort persistence — the returned list still reflects the pick
    // for the rest of this session even if the write itself failed.
  }
  return next;
}
