import type { Abi, Address } from "viem";
import { getAddress, isAddress, zeroAddress } from "viem";

import { KORUM_CHAIN } from "../../config/korum-network";
import { KORUM_DEPLOYMENT as deployment } from "../../config/deployment";
import korumCoreAbiJson from "../../../contracts/abis/KorumCore.json";
import korumFactoryAbiJson from "../../../contracts/abis/KorumFactory.json";
import korumRouterAbiJson from "../../../contracts/abis/KorumRouter.json";
import referralRegistryAbiJson from "../../../contracts/abis/ReferralRegistry.json";
import versusTokenAbiJson from "../../../contracts/abis/VersusToken.json";
import lensAbiJson from "../../../contracts/abis/KorumLens.json";
import pairRegistryAbiJson from "../../../contracts/abis/KorumPairRegistry.json";

export { KORUM_CHAIN };

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
export const KORUM_LENS_ADDRESS = deployedAddress("KorumLens");
export const KORUM_PAIR_REGISTRY_ADDRESS = deployedAddress("KorumPairRegistry");
export const KORUM_SEEDER_ADDRESS = deployedAddress("KorumSeeder");
export const KORUM_LAUNCH_CONFIG_ID = deployment.launch.configId;
export const KORUM_QUOTE_ASSET = deployment.launch.quoteAsset as Address;
if (!KORUM_LAUNCH_CONFIG_ID || KORUM_QUOTE_ASSET !== zeroAddress) {
  throw new Error(`Configure a native-ETH launch preset for chain ${KORUM_CHAIN.id}.`);
}

// The JSON files are the canonical deployed ABIs. Keeping these imports here
// prevents components from duplicating addresses or hand-written fragments.
export const KORUM_CORE_ABI = korumCoreAbiJson as Abi;
export const KORUM_FACTORY_ABI = korumFactoryAbiJson as Abi;
export const KORUM_ROUTER_ABI = korumRouterAbiJson as Abi;
export const REFERRAL_REGISTRY_ABI = referralRegistryAbiJson as Abi;
export const VERSUS_TOKEN_ABI = versusTokenAbiJson as Abi;
export const KORUM_LENS_ABI = lensAbiJson as Abi;
export const KORUM_PAIR_REGISTRY_ABI = pairRegistryAbiJson as Abi;
