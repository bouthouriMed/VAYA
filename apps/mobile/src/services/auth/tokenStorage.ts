import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'vaya.accessToken';
const REFRESH_TOKEN_KEY = 'vaya.refreshToken';

export interface StoredTokens {
  accessToken: string | null;
  refreshToken: string | null;
}

export async function loadTokens(): Promise<StoredTokens> {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  ]);
  return { accessToken, refreshToken };
}

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  await Promise.all([
    tokens.accessToken
      ? SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken)
      : SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    tokens.refreshToken
      ? SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken)
      : SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}
