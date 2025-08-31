// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Only apply in production
  if (process.env.MAINTENANCE_MODE === 'true') {
    const maintenanceUrl = new URL('/maintenance', request.url);

    // Allow access to the maintenance page and static files
    if (
      request.nextUrl.pathname === '/maintenance' ||
      request.nextUrl.pathname.startsWith('/_next') ||
      request.nextUrl.pathname.startsWith('/favicon.ico')
    ) {
      return NextResponse.next();
    }

    return NextResponse.redirect(maintenanceUrl);
  }

  return NextResponse.next();
}
