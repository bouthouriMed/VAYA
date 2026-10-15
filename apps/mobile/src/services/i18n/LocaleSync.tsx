import { useEffect } from 'react';
import { useGetMeQuery, useUpdateMeMutation } from '../../state/api';
import { useAppSelector } from '../../state/store';

/**
 * Keeps the server's copy of the user's language (users.locale) equal to
 * the one the app shows. The server writes push notifications in that
 * language; before this, changing the language only changed the app, so
 * every account stayed on the server default and got French pushes.
 * Covers sign-in, a language change, and existing accounts on next launch.
 * Best-effort: a failed update retries the next time the values differ.
 * Renders nothing.
 */
export function LocaleSync(): null {
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const locale = useAppSelector((s) => s.language.locale);
  const { data: me } = useGetMeQuery(undefined, { skip: !accessToken });
  const [updateMe, { isLoading }] = useUpdateMeMutation();

  useEffect(() => {
    if (!me || isLoading || me.locale === locale) return;
    updateMe({ locale }).catch(() => undefined);
  }, [me, locale, isLoading, updateMe]);

  return null;
}
