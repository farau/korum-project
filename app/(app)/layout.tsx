import { cookies, headers } from "next/headers";
import { SESSION_COOKIE_NAME } from "../lib/auth/session";
import RainbowKitProvider from "../components/RainbowKitProvider";
import AppFrame from "../components/AppFrame";

export default async function InteractiveLayout({ children }: { children: React.ReactNode }) {
  const [store, requestHeaders] = await Promise.all([cookies(), headers()]);
  // cookies().toString() URL-encodes Wagmi's JSON; its decoder expects the raw header.
  return <RainbowKitProvider cookies={requestHeaders.get("cookie")} hasSessionCookie={store.has(SESSION_COOKIE_NAME)}>
    <AppFrame>{children}</AppFrame>
  </RainbowKitProvider>;
}
