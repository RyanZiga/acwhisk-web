// middleware.ts
import { NextResponse } from 'next/server';

export function middleware(request) {
  if (process.env.MAINTENANCE_MODE === 'true') {
    return NextResponse.redirect(new URL('/maintenance', request.url));
  }

  return NextResponse.next();
}
