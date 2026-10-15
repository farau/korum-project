import type { Address, PublicClient } from "viem";
import { KORUM_CORE_ABI, KORUM_CORE_ADDRESS } from "../contracts/korum";

export async function readGraduationStatus(client: Pick<PublicClient, "readContract">, token: Address) {
  const curve = await client.readContract({
    address: KORUM_CORE_ADDRESS, abi: KORUM_CORE_ABI, functionName: "getCurve", args: [token],
  }) as { status: number };
  return curve.status;
}

export async function prepareGraduation(
  client: Pick<PublicClient, "readContract" | "estimateContractGas" | "simulateContract">,
  token: Address,
  account: Address,
) {
  const status = await readGraduationStatus(client, token);
  if (status === 3) return null;
  if (status !== 2) throw new Error("This token is not awaiting migration.");

  const minimumGas = await client.readContract({
    address: KORUM_CORE_ADDRESS, abi: KORUM_CORE_ABI, functionName: "MIN_GRADUATION_GAS",
  }) as bigint;
  if (typeof minimumGas !== "bigint" || minimumGas <= BigInt(0)) throw new Error("Unable to confirm the migration gas requirement.");
  const request = { account, address: KORUM_CORE_ADDRESS, abi: KORUM_CORE_ABI, functionName: "graduate" as const, args: [token] as const };
  const estimatedGas = await client.estimateContractGas(request);
  // The contract checks available gas during graduation, not just gas consumed.
  // Preserve both the RPC estimate (including rollup overhead) and a reserve above its minimum.
  const bufferedEstimate = (estimatedGas * BigInt(120) + BigInt(99)) / BigInt(100);
  const gasFloor = minimumGas * BigInt(2);
  const gas = bufferedEstimate > gasFloor ? bufferedEstimate : gasFloor;
  await client.simulateContract({ ...request, gas });
  return { ...request, gas };
}
