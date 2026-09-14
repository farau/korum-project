import type { Abi, Address } from "viem";
import { getAddress, isAddress, zeroAddress } from "viem";

import { KORUM_CHAIN, KORUM_NETWORK } from "../../config/korum-network";
import korumCoreAbiJson from "../../../contracts/abis/KorumCore.json";
import korumFactoryAbiJson from "../../../contracts/abis/KorumFactory.json";
import korumRouterAbiJson from "../../../contracts/abis/KorumRouter.json";
import referralRegistryAbiJson from "../../../contracts/abis/ReferralRegistry.json";
import versusTokenAbiJson from "../../../contracts/abis/VersusToken.json";
import robinhoodMainnetDeployment from "../../../contracts/deployments/4663.json";
import robinhoodTestnetDeployment from "../../../contracts/deployments/46630.json";

export { KORUM_CHAIN };

const deployment = KORUM_NETWORK === "mainnet"
  ? robinhoodMainnetDeployment
  : robinhoodTestnetDeployment;

function deployedAddress(contractName: keyof typeof deployment.contracts) {
  const address = deployment.contracts[contractName].address;
  if (!address || !isAddress(address) || address.toLowerCase() === zeroAddress) {
    throw new Error(
      `${contractName} is not deployed for ${KORUM_CHAIN.name}. Complete contracts/deployments/${KORUM_CHAIN.id}.json before selecting this network.`,
    );
  }
  return getAddress(address) as Address;
}

export const KORUM_CORE_ADDRESS = deployedAddress("KorumCore");

export const KORUM_FACTORY_ADDRESS = deployedAddress("KorumFactory");

export const KORUM_HOOK_ADDRESS = deployedAddress("KorumHook");

export const KORUM_ROUTER_ADDRESS = deployedAddress("KorumRouter");

export const REFERRAL_REGISTRY_ADDRESS = deployedAddress("ReferralRegistry");

// The JSON files are the canonical deployed ABIs. Keeping these imports here
// prevents components from duplicating addresses or hand-written fragments.
export const KORUM_CORE_ABI = korumCoreAbiJson as Abi;
export const KORUM_FACTORY_ABI = korumFactoryAbiJson as Abi;
export const KORUM_ROUTER_ABI = korumRouterAbiJson as Abi;
export const REFERRAL_REGISTRY_ABI = referralRegistryAbiJson as Abi;
export const VERSUS_TOKEN_ABI = versusTokenAbiJson as Abi;
