import mainnet from "../../contracts/deployments/4663.json";
import testnet from "../../contracts/deployments/46630.json";
import { KORUM_CHAIN_ID } from "./korum-network";

const deployments = { 4663: mainnet, 46630: testnet };
export const KORUM_DEPLOYMENT = deployments[KORUM_CHAIN_ID as keyof typeof deployments];
if (!KORUM_DEPLOYMENT) throw new Error(`No Korum deployment configured for chain ${KORUM_CHAIN_ID}.`);

// SQL identifiers come only from committed manifests, never request input.
export const INDEXER_SCHEMA = KORUM_DEPLOYMENT.readModelSchema;
export const WATCHLIST_TABLE = KORUM_DEPLOYMENT.watchlistTable;
if (![INDEXER_SCHEMA, WATCHLIST_TABLE].every(value => /^[a-z_][a-z0-9_]*$/.test(value))) {
  throw new Error("Invalid deployment database identifiers.");
}
export const DEPLOYMENT_CACHE_SCOPE = `${KORUM_CHAIN_ID}:v${KORUM_DEPLOYMENT.version}`;
