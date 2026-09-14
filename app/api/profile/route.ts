import { NextResponse, type NextRequest } from "next/server";
import { getWalletSession, isSameOriginRequest } from "../../lib/auth/session";
import { getUserForSession, updateUserBio, updateUserDisplayName } from "../../lib/db/users";

export async function GET() {
  const session = await getWalletSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const user = await getUserForSession(session.userId, session.address);
    if (!user) {
      return NextResponse.json({ error: "Wallet profile not found." }, { status: 404 });
    }

    const response = NextResponse.json({ user });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    console.error("Unable to read the wallet profile.", error);
    return NextResponse.json({ error: "The profile service is temporarily unavailable." }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const session = await getWalletSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const body = await request.json() as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid profile update." }, { status: 400 });
    }

    const fields = Object.keys(body);
    if (fields.length !== 1 || (fields[0] !== "bio" && fields[0] !== "displayName")) {
      return NextResponse.json({ error: "Only one supported profile field can be updated at a time." }, { status: 400 });
    }

    let user;
    if (fields[0] === "displayName") {
      const suppliedDisplayName = (body as { displayName?: unknown }).displayName;
      if (suppliedDisplayName !== null && typeof suppliedDisplayName !== "string") {
        return NextResponse.json({ error: "The username must be a string or null." }, { status: 400 });
      }

      const normalizedDisplayName = typeof suppliedDisplayName === "string"
        ? suppliedDisplayName.trim().replace(/\s+/g, " ") || null
        : null;
      if (normalizedDisplayName && (normalizedDisplayName.length < 2 || normalizedDisplayName.length > 32)) {
        return NextResponse.json({ error: "The username must contain between 2 and 32 characters." }, { status: 400 });
      }

      user = await updateUserDisplayName(session.userId, session.address, normalizedDisplayName);
    } else {
      const suppliedBio = (body as { bio?: unknown }).bio;
      if (suppliedBio !== null && typeof suppliedBio !== "string") {
        return NextResponse.json({ error: "The profile bio must be a string or null." }, { status: 400 });
      }

      const normalizedBio = typeof suppliedBio === "string" ? suppliedBio.trim() || null : null;
      if (normalizedBio && normalizedBio.length > 160) {
        return NextResponse.json({ error: "The profile bio cannot exceed 160 characters." }, { status: 400 });
      }

      user = await updateUserBio(session.userId, session.address, normalizedBio);
    }

    if (!user) {
      return NextResponse.json({ error: "Wallet profile not found." }, { status: 404 });
    }

    const response = NextResponse.json({ user });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    console.error("Unable to update the wallet profile.", error);
    return NextResponse.json({ error: "The profile service is temporarily unavailable." }, { status: 503 });
  }
}
