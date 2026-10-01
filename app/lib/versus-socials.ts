export type VersusSocialLinks = {
  x: string;
  telegram: string;
  discord: string;
  website: string;
};

export const EMPTY_SOCIAL_LINKS: VersusSocialLinks = { x: "", telegram: "", discord: "", website: "" };

function profileUrl(input: string, hosts: string[], prefix: string, pattern: RegExp, canonicalHost: string) {
  const value = input.trim();
  if (!value) return "";
  const handle = value.startsWith("@") ? value.slice(1) : value;
  if (pattern.test(handle)) return `https://${canonicalHost}/${prefix}${handle}`;
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/^\/+|\/+$/g, "");
    if (url.protocol !== "https:" || !hosts.includes(url.hostname.toLowerCase()) || url.search || url.hash || !path.startsWith(prefix)) return null;
    const name = path.slice(prefix.length);
    return pattern.test(name) ? `https://${canonicalHost}/${prefix}${name}` : null;
  } catch { return null; }
}

function discordUrl(input: string) {
  const value = input.trim();
  if (!value) return "";
  const invite = /^[A-Za-z0-9-]{2,64}$/;
  if (invite.test(value)) return `https://discord.gg/${value}`;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.search || url.hash) return null;
    const host = url.hostname.toLowerCase();
    const path = url.pathname.replace(/^\/+|\/+$/g, "");
    const code = host === "discord.gg" || host === "www.discord.gg"
      ? path
      : host === "discord.com" || host === "www.discord.com"
        ? path.startsWith("invite/") ? path.slice("invite/".length) : ""
        : "";
    return invite.test(code) ? `https://discord.gg/${code}` : null;
  } catch { return null; }
}

export function normalizeSocialLinks(input: unknown): VersusSocialLinks | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const fields = input as Record<string, unknown>;
  if (Object.keys(fields).some(key => !["x", "telegram", "discord", "website"].includes(key))) return null;
  if (["x", "telegram", "discord", "website"].some(key => typeof fields[key] !== "string" || (fields[key] as string).length > 256)) return null;

  const x = profileUrl(fields.x as string, ["x.com", "www.x.com", "twitter.com", "www.twitter.com"], "", /^[A-Za-z0-9_]{1,15}$/, "x.com");
  const telegram = profileUrl(fields.telegram as string, ["t.me", "www.t.me"], "", /^[A-Za-z0-9_]{5,32}$/, "t.me");
  const discord = discordUrl(fields.discord as string);
  let website = (fields.website as string).trim();
  if (website) {
    try {
      const url = new URL(website);
      if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".") || website.length > 256) return null;
      website = url.toString();
    } catch { return null; }
  }
  if (x === null || telegram === null || discord === null) return null;
  return { x, telegram, discord, website };
}

export function socialLinksFromJson(value: string): VersusSocialLinks {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ...EMPTY_SOCIAL_LINKS };
    return {
      x: typeof parsed.x === "string" ? parsed.x : "",
      telegram: typeof parsed.telegram === "string" ? parsed.telegram : "",
      discord: typeof parsed.discord === "string" ? parsed.discord : "",
      website: typeof parsed.website === "string" ? parsed.website : "",
    };
  } catch { return { ...EMPTY_SOCIAL_LINKS }; }
}

export function mergeSocialLinks(value: string, links: VersusSocialLinks) {
  let original: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) original = parsed as Record<string, unknown>;
  } catch { /* Preserve edits even if launch metadata was malformed. */ }
  const next = { ...original };
  for (const key of ["x", "telegram", "discord", "website"] as const) {
    if (links[key]) next[key] = links[key];
    else delete next[key];
  }
  return JSON.stringify(next);
}

export function createSocialsEditMessage(input: {
  origin: string;
  chainId: number;
  factory: string;
  versusId: string;
  wallet: string;
  version: number;
  deadline: number;
  links: VersusSocialLinks;
}) {
  return [
    "Korum Versus social links update",
    `Origin: ${input.origin}`,
    `Chain ID: ${input.chainId}`,
    `Factory: ${input.factory}`,
    `Versus ID: ${input.versusId}`,
    `Wallet: ${input.wallet}`,
    `Current version: ${input.version}`,
    `Social links: ${JSON.stringify(input.links)}`,
    `Expires: ${new Date(input.deadline).toISOString()}`,
    "This signature updates off-chain social links only. It does not send a blockchain transaction.",
  ].join("\n");
}
