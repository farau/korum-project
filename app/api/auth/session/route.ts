import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  isSameOriginRequest,
  readWalletSession,
  sessionCookieOptions,
} from "../../../lib/auth/session";

export function GET(request: NextRequest) {
  const session = readWalletSession(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const response = NextResponse.json(session
    ? { authenticated: true, address: session.address, chainId: session.chainId }
    : { authenticated: false });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export function DELETE(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(SESSION_COOKIE_NAME, "", { ...sessionCookieOptions, maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
