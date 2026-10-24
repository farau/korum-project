"use client";
import { useEffect, useRef } from "react";
import RainbowKitProvider from "./RainbowKitProvider";
import { useWallet, type WalletContextValue } from "./WalletContext";

function Bridge({ onChange, connectRequested }: { onChange: (wallet: WalletContextValue) => void; connectRequested: boolean }) {
  const wallet = useWallet();
  const opened = useRef(false);
  useEffect(() => { onChange(wallet); }, [onChange, wallet]);
  useEffect(() => {
    if (connectRequested && wallet.hydrated && !opened.current) {
      // RainbowKit closes its dialogs while the initial authentication status
      // settles. Open after those effects so the first click is not swallowed.
      const timer = setTimeout(() => { opened.current = true; wallet.openWallet(); }, 0);
      return () => clearTimeout(timer);
    }
  }, [connectRequested, wallet]);
  return null;
}

export default function PublicWalletRuntime({ cookies, hasSessionCookie, onChange, connectRequested }: {
  cookies: string; hasSessionCookie: boolean; onChange: (wallet: WalletContextValue) => void; connectRequested: boolean;
}) {
  return <RainbowKitProvider cookies={cookies} hasSessionCookie={hasSessionCookie}>
    <Bridge onChange={onChange} connectRequested={connectRequested} />
  </RainbowKitProvider>;
}
