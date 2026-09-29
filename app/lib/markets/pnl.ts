import "server-only";

import { KORUM_CORE_ABI, KORUM_CORE_ADDRESS } from "../contracts/korum";
import { getKorumServerPublicClient } from "../contracts/server-client";

import type { LaunchConfig } from "../contracts/economics";
export type { LaunchConfig } from "../contracts/economics";

const launchConfigPromises = new Map<string, Promise<LaunchConfig | null>>();

export function getLaunchConfig(configId: string) {
  const cached = launchConfigPromises.get(configId);
  if (cached) return cached;

  const promise = getKorumServerPublicClient().readContract({
    address: KORUM_CORE_ADDRESS,
    abi: KORUM_CORE_ABI,
    functionName: "getConfig",
    args: [Number(configId)],
  })
    .then((result) => result as LaunchConfig)
    .catch(() => {
      launchConfigPromises.delete(configId);
      return null;
    });
  launchConfigPromises.set(configId, promise);
  return promise;
}
