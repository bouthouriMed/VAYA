import { NextRequest, NextResponse } from 'next/server';

const locales = ['fr', 'en'] as const;
const defaultLocale = 'fr';

function pickLocale(request: NextRequest): string {
  const header = request.headers.get('accept-language');
  if (!header) return defaultLocale;
  const preferred = header.split(',')[0]?.split('-')[0]?.toLowerCase();
  return locales.includes(preferred as (typeof locales)[number]) ? preferred! : defaultLocale;
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const hasLocale = locales.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)
  );
  if (hasLocale) return NextResponse.next();

  const locale = pickLocale(request);
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|fonts|images|.*\\..*).*)'],
};
