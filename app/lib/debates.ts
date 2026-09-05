export type DebateToken = {
  id?: string | number;
  name: string;
  symbol: string;
  slug?: string;
  address?: string;
  chainId?: number;
  chainName?: string;
  decimals?: number;
  image?: string;
  imageRef?: string;
  description?: string;
  creatorAddress?: string;
  launchedAt?: string;
  launchedAtUtc?: string;
  launchTimestamp?: number;
  createdAt?: string;
  createdAtUtc?: string;
  createdAtTimestamp?: number;
  updatedAt?: string;
  updatedAtUtc?: string;
  price?: number;
  priceUsd?: number;
  supply?: number;
  circulatingSupply?: number;
  marketCap?: number;
  liquidity?: number;
  volume24h?: number;
  holders?: number;
  trades24h?: number;
  buys24h?: number;
  sells24h?: number;
  change24h?: number;
};

export type Debate = {
  id: number;
  sideA: string;
  sideB: string;
  category: string;
  sideAPercentage?: number;
  volume24h: number;
  liquidity?: number;
  trades24h?: number;
  participantCount: number;
  holderCount?: number;
  createdMinutesAgo: number;
  marketCapA?: number;
  marketCapB?: number;
  imageA?: string;
  imageB?: string;
  imageRefA?: string;
  imageRefB?: string;
  tokenA?: DebateToken;
  tokenB?: DebateToken;
  tokenASymbol?: string;
  tokenBSymbol?: string;
  changeA24h?: number;
  changeB24h?: number;
  createdAt?: string;
  createdAtUtc?: string;
  createdAtTimestamp?: number;
  launchedAt?: string;
  launchedAtUtc?: string;
  launchTimestamp?: number;
  creatorName?: string;
  creatorAddress?: string;
  creatorRankLabel?: string;
  creatorRankClass?: 'bronze' | 'new' | 'gold';
};

const RAW_DEBATES = [
  { id:1, sideA:'Messi', sideB:'Ronaldo', category:'Sports', sideAPercentage:55, volume24h:89200, participantCount:1050, createdMinutesAgo:1200 },
  { id:2, sideA:'Bitcoin', sideB:'Ethereum', category:'Crypto', sideAPercentage:64, volume24h:113400, participantCount:1284, createdMinutesAgo:720 },
  { id:3, sideA:'Biden', sideB:'Trump', category:'Politics', sideAPercentage:41, volume24h:245000, participantCount:3120, createdMinutesAgo:480 },
  { id:4, sideA:'Netflix', sideB:'Cinema', category:'Movies & TV', sideAPercentage:61, volume24h:18300, participantCount:260, createdMinutesAgo:360 },
  { id:5, sideA:'Pizza', sideB:'Burger', category:'WTF', sideAPercentage:47, volume24h:9600, participantCount:210, createdMinutesAgo:180 },
  { id:6, sideA:'Cats', sideB:'Dogs', category:'WTF', sideAPercentage:33, volume24h:31200, participantCount:470, createdMinutesAgo:4200 },
  { id:7, sideA:'Memecoin', sideB:'Utility', category:'Crypto', sideAPercentage:71, volume24h:54900, participantCount:690, createdMinutesAgo:1980 },
  { id:8, sideA:'Flat Earth', sideB:'Round Earth', category:'WTF', sideAPercentage:14, volume24h:68000, participantCount:940, createdMinutesAgo:120 },
  { id:9, sideA:'PSG', sideB:'Real Madrid', category:'Sports', sideAPercentage:58, volume24h:76500, participantCount:880, createdMinutesAgo:900 },
  { id:10, sideA:'Marvel', sideB:'DC', category:'Movies & TV', sideAPercentage:66, volume24h:22100, participantCount:340, createdMinutesAgo:2400 },
  { id:11, sideA:'Solana', sideB:'Ethereum', category:'Crypto', sideAPercentage:49, volume24h:41300, participantCount:512, createdMinutesAgo:1080 },
  { id:12, sideA:'Macron', sideB:'Le Pen', category:'Politics', sideAPercentage:38, volume24h:198000, participantCount:2450, createdMinutesAgo:300 },
  { id:13, sideA:'Summer', sideB:'Winter', category:'WTF', sideAPercentage:72, volume24h:14200, participantCount:410, createdMinutesAgo:180 },
  { id:14, sideA:'Djokovic', sideB:'Alcaraz', category:'Sports', sideAPercentage:52, volume24h:33200, participantCount:620, createdMinutesAgo:1500 },
  { id:15, sideA:'Coffee', sideB:'Tea', category:'WTF', sideAPercentage:58, volume24h:48200, participantCount:612, createdMinutesAgo:60 },
  { id:16, sideA:'AGI before 2030', sideB:'Not before 2035', category:'Tech', sideAPercentage:44, volume24h:29500, participantCount:355, createdMinutesAgo:540 },
  { id:17, sideA:'Doge', sideB:'Pepe', category:'Memes', sideAPercentage:53, volume24h:37800, participantCount:590, createdMinutesAgo:210 },
  { id:18, sideA:'PS5', sideB:'Xbox', category:'Gaming', sideAPercentage:59, volume24h:26400, participantCount:415, createdMinutesAgo:960 },
];

const MOCK_CREATORS = ['Yasmine', 'Léo', 'Sam', 'Nina', 'Ines', 'Marco'];
const MOCK_NOW_UTC = Date.UTC(2026, 8, 4, 12, 0, 0);

function tokenSymbol(name: string) {
  return `$${name.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase()}`;
}

function creatorMeta(index: number) {
  if (index % 4 === 0) return { creatorRankLabel: 'BRONZE', creatorRankClass: 'bronze' as const };
  if (index % 4 === 1) return { creatorRankLabel: 'NEW CREATOR', creatorRankClass: 'new' as const };
  if (index % 4 === 3) return { creatorRankLabel: 'GOLD', creatorRankClass: 'gold' as const };
  return { creatorRankLabel: 'NEW CREATOR', creatorRankClass: 'new' as const };
}

function tokenImageRef(name: string, size = 300) {
  const seed = encodeURIComponent(
    name
      .split(' ')[0]
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '') || 'token'
  );
  return `https://picsum.photos/seed/${seed}/${size}/${size}`;
}

function utcFromMinutesAgo(minutesAgo: number) {
  return new Date(MOCK_NOW_UTC - minutesAgo * 60 * 1000).toISOString();
}

export function getDebates(): Debate[] {
  return RAW_DEBATES.map((d, index) => {
    const totalMarketCap = d.volume24h * 2.4;
    const marketCapA = Math.round(totalMarketCap * (d.sideAPercentage ?? 50) / 100);
    const marketCapB = Math.round(totalMarketCap * (100 - (d.sideAPercentage ?? 50)) / 100);
    const tokenASymbol = tokenSymbol(d.sideA);
    const tokenBSymbol = tokenSymbol(d.sideB);
    const imageRefA = tokenImageRef(d.sideA);
    const imageRefB = tokenImageRef(d.sideB);
    const changeA24h = Number((2.4 + index * 0.7).toFixed(1));
    const changeB24h = Number((-1.1 - index * 0.4).toFixed(1));
    const createdAtUtc = utcFromMinutesAgo(d.createdMinutesAgo);
    const createdAtTimestamp = Date.parse(createdAtUtc);
    const tokenALaunchedAtUtc = utcFromMinutesAgo(d.createdMinutesAgo + 24 + index * 11);
    const tokenBLaunchedAtUtc = utcFromMinutesAgo(d.createdMinutesAgo + 42 + index * 13);
    const creatorAddress = `0xMOCKCREATOR${String(index + 1).padStart(4, '0')}`;
    return {
      ...d,
      liquidity: Math.round(totalMarketCap * 0.14),
      trades24h: Math.round(d.participantCount * 1.7),
      holderCount: d.participantCount,
      marketCapA,
      marketCapB,
      imageA: imageRefA,
      imageB: imageRefB,
      imageRefA,
      imageRefB,
      tokenASymbol,
      tokenBSymbol,
      changeA24h,
      changeB24h,
      createdAt: createdAtUtc,
      createdAtUtc,
      createdAtTimestamp,
      launchedAt: createdAtUtc,
      launchedAtUtc: createdAtUtc,
      launchTimestamp: createdAtTimestamp,
      creatorName: MOCK_CREATORS[index % MOCK_CREATORS.length],
      creatorAddress,
      ...creatorMeta(index),
      tokenA: {
        id: `${d.id}-a`,
        name: d.sideA,
        symbol: tokenASymbol,
        slug: tokenASymbol.slice(1).toLowerCase(),
        address: `0xMOCK${String(d.id).padStart(4, '0')}A`,
        chainId: 8453,
        chainName: 'Base',
        decimals: 18,
        image: imageRefA,
        imageRef: imageRefA,
        creatorAddress,
        launchedAt: tokenALaunchedAtUtc,
        launchedAtUtc: tokenALaunchedAtUtc,
        launchTimestamp: Date.parse(tokenALaunchedAtUtc),
        createdAt: tokenALaunchedAtUtc,
        createdAtUtc: tokenALaunchedAtUtc,
        createdAtTimestamp: Date.parse(tokenALaunchedAtUtc),
        priceUsd: marketCapA / 1_000_000_000,
        supply: 1_000_000_000,
        circulatingSupply: 1_000_000_000,
        marketCap: marketCapA,
        liquidity: Math.round(marketCapA * 0.14),
        volume24h: Math.round(d.volume24h * (d.sideAPercentage ?? 50) / 100),
        holders: Math.round(d.participantCount * (d.sideAPercentage ?? 50) / 100),
        trades24h: Math.round(d.participantCount * 0.9),
        buys24h: Math.round(d.participantCount * 0.55),
        sells24h: Math.round(d.participantCount * 0.35),
        change24h: changeA24h,
      },
      tokenB: {
        id: `${d.id}-b`,
        name: d.sideB,
        symbol: tokenBSymbol,
        slug: tokenBSymbol.slice(1).toLowerCase(),
        address: `0xMOCK${String(d.id).padStart(4, '0')}B`,
        chainId: 8453,
        chainName: 'Base',
        decimals: 18,
        image: imageRefB,
        imageRef: imageRefB,
        creatorAddress,
        launchedAt: tokenBLaunchedAtUtc,
        launchedAtUtc: tokenBLaunchedAtUtc,
        launchTimestamp: Date.parse(tokenBLaunchedAtUtc),
        createdAt: tokenBLaunchedAtUtc,
        createdAtUtc: tokenBLaunchedAtUtc,
        createdAtTimestamp: Date.parse(tokenBLaunchedAtUtc),
        priceUsd: marketCapB / 1_000_000_000,
        supply: 1_000_000_000,
        circulatingSupply: 1_000_000_000,
        marketCap: marketCapB,
        liquidity: Math.round(marketCapB * 0.14),
        volume24h: Math.round(d.volume24h * (100 - (d.sideAPercentage ?? 50)) / 100),
        holders: Math.round(d.participantCount * (100 - (d.sideAPercentage ?? 50)) / 100),
        trades24h: Math.round(d.participantCount * 0.8),
        buys24h: Math.round(d.participantCount * 0.38),
        sells24h: Math.round(d.participantCount * 0.42),
        change24h: changeB24h,
      },
    };
  });
}
