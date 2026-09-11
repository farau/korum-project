import { NextResponse, type NextRequest } from "next/server";
import { normalizeReferralCode } from "./app/lib/referrals/constants";

export function proxy(request: NextRequest) {
  if (request.method !== "GET") return NextResponse.next();

  const suppliedCode = request.nextUrl.searchParams.get("ref");
  if (suppliedCode === null) return NextResponse.next();

  const destination = request.nextUrl.clone();
  destination.searchParams.delete("ref");

  const referralCode = normalizeReferralCode(suppliedCode);
  if (!referralCode) return NextResponse.redirect(destination);

  const captureUrl = request.nextUrl.clone();
  captureUrl.pathname = "/api/referrals/capture";
  captureUrl.search = "";
  captureUrl.searchParams.set("code", referralCode);
  captureUrl.searchParams.set("returnTo", `${destination.pathname}${destination.search}`);

  return NextResponse.redirect(captureUrl);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.png|.*\\..*$).*)"],
};
