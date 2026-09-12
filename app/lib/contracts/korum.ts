import type { Abi, Address } from "viem";
import { getAddress } from "viem";
import { robinhoodTestnet } from "wagmi/chains";

import korumCoreAbiJson from "../../../contracts/abis/KorumCore.json";
import korumFactoryAbiJson from "../../../contracts/abis/KorumFactory.json";
import referralRegistryAbiJson from "../../../contracts/abis/ReferralRegistry.json";
import robinhoodTestnetDeployment from "../../../contracts/deployments/46630.json";

export const KORUM_CHAIN = robinhoodTestnet;

export const KORUM_CORE_ADDRESS = getAddress(
  robinhoodTestnetDeployment.contracts.KorumCore.address,
) as Address;

export const KORUM_FACTORY_ADDRESS = getAddress(
  robinhoodTestnetDeployment.contracts.KorumFactory.address,
) as Address;

export const REFERRAL_REGISTRY_ADDRESS = getAddress(
  robinhoodTestnetDeployment.contracts.ReferralRegistry.address,
) as Address;

// The JSON files are the canonical deployed ABIs. Keeping these imports here
// prevents components from duplicating addresses or hand-written fragments.
export const KORUM_CORE_ABI = korumCoreAbiJson as Abi;
export const KORUM_FACTORY_ABI = korumFactoryAbiJson as Abi;
export const REFERRAL_REGISTRY_ABI = referralRegistryAbiJson as Abi;
