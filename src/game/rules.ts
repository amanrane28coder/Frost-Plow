export type UpgradeId = 'bladeWidth' | 'engineTorque' | 'saltMelter' | 'hopperBounty';

export interface UpgradeLevels {
  bladeWidth: number;
  engineTorque: number;
  saltMelter: number;
  hopperBounty: number;
}

export interface UpgradeSpec {
  id: UpgradeId;
  name: string;
  shortRole: string;
  hotkey: string;
  baseCost: number;
  costScale: number;
  maxLevel: number;
}

export const UPGRADE_SPECS: Record<UpgradeId, UpgradeSpec> = {
  bladeWidth: {
    id: 'bladeWidth',
    name: 'V-Blade Span',
    shortRole: 'Wider Swath · +25% Plow Width',
    hotkey: '1',
    baseCost: 25,
    costScale: 1.65,
    maxLevel: 6,
  },
  engineTorque: {
    id: 'engineTorque',
    name: 'Turbo Diesel',
    shortRole: 'Top Speed · Heavy Drift Push',
    hotkey: '2',
    baseCost: 30,
    costScale: 1.65,
    maxLevel: 6,
  },
  saltMelter: {
    id: 'saltMelter',
    name: 'Salt Melter',
    shortRole: 'Combo Hold · Ice Melt Power',
    hotkey: '3',
    baseCost: 35,
    costScale: 1.7,
    maxLevel: 6,
  },
  hopperBounty: {
    id: 'hopperBounty',
    name: 'Brass Hopper',
    shortRole: '+30% Coin Yield · +1 Warmth',
    hotkey: '4',
    baseCost: 40,
    costScale: 1.75,
    maxLevel: 6,
  },
};

export interface TruckStats {
  bladeHalfWidth: number;
  bladeDepth: number;
  maxSpeed: number;
  boostSpeed: number;
  plowPower: number;
  comboMaxDuration: number;
  coinMultiplier: number;
}

export interface ComboState {
  comboCount: number;
  multiplier: number;
  timer: number;
  maxTimer: number;
  maxComboReached: number;
}

export interface EconomyState {
  coins: number;
  score: number;
  warmth: number;
  maxWarmth: number;
  upgrades: UpgradeLevels;
}

export interface SnowCellLogic {
  id: number;
  x: number;
  z: number;
  depth: number; // 0 = cleared, 1 = light powder, 2 = medium drift, 3 = packed ice
  maxDepth: number;
}

export interface CabinTarget {
  id: string;
  name: string;
  drivewayX: number;
  drivewayZ: number;
  drivewayRadius: number;
  liberated: boolean;
  bonusCoins: number;
  bonusScore: number;
}

export function getUpgradeCost(id: UpgradeId, currentLevel: number): number {
  const spec = UPGRADE_SPECS[id];
  if (currentLevel >= spec.maxLevel) return Infinity;
  return Math.round(spec.baseCost * Math.pow(spec.costScale, currentLevel - 1));
}

export function canAffordUpgrade(
  coins: number,
  id: UpgradeId,
  currentLevel: number
): boolean {
  const spec = UPGRADE_SPECS[id];
  if (currentLevel >= spec.maxLevel) return false;
  const cost = getUpgradeCost(id, currentLevel);
  return coins >= cost;
}

export function purchaseUpgrade(
  state: EconomyState,
  id: UpgradeId
): { nextState: EconomyState; purchased: boolean; costPaid: number } {
  const currentLevel = state.upgrades[id];
  if (!canAffordUpgrade(state.coins, id, currentLevel)) {
    return { nextState: state, purchased: false, costPaid: 0 };
  }
  const cost = getUpgradeCost(id, currentLevel);
  const nextUpgrades: UpgradeLevels = {
    ...state.upgrades,
    [id]: currentLevel + 1,
  };
  const nextWarmth =
    id === 'hopperBounty'
      ? Math.min(state.maxWarmth, state.warmth + 1)
      : state.warmth;

  return {
    nextState: {
      ...state,
      coins: state.coins - cost,
      warmth: nextWarmth,
      upgrades: nextUpgrades,
    },
    purchased: true,
    costPaid: cost,
  };
}

export function computeTruckStats(upgrades: UpgradeLevels): TruckStats {
  const wLvl = upgrades.bladeWidth - 1;
  const eLvl = upgrades.engineTorque - 1;
  const sLvl = upgrades.saltMelter - 1;
  const hLvl = upgrades.hopperBounty - 1;

  return {
    bladeHalfWidth: 1.85 + wLvl * 0.42,
    bladeDepth: 1.55 + wLvl * 0.15,
    maxSpeed: 11.5 + eLvl * 1.5,
    boostSpeed: 17.5 + eLvl * 1.9,
    plowPower: 1.45 + sLvl * 0.5 + eLvl * 0.25,
    comboMaxDuration: 3.6 + sLvl * 0.55,
    coinMultiplier: 1.0 + hLvl * 0.3,
  };
}

export function computeMultiplierFromCount(comboCount: number): number {
  if (comboCount <= 0) return 1;
  // Escalates smoothly: 1x -> 2x at 4 blocks -> 3x at 10 -> 4x at 18 -> up to 8x
  const tier = 1 + Math.floor(Math.sqrt(comboCount / 1.2));
  return Math.min(8, Math.max(1, tier));
}

export function updateComboOnPlow(
  state: ComboState,
  blocksCleared: number,
  maxDuration: number
): ComboState {
  if (blocksCleared <= 0) return state;
  const nextCount = state.comboCount + blocksCleared;
  const nextMult = computeMultiplierFromCount(nextCount);
  return {
    comboCount: nextCount,
    multiplier: nextMult,
    timer: maxDuration,
    maxTimer: maxDuration,
    maxComboReached: Math.max(state.maxComboReached, nextMult),
  };
}

export function tickComboTimer(state: ComboState, dt: number): ComboState {
  if (state.comboCount <= 0 || state.timer <= 0) {
    return {
      ...state,
      comboCount: 0,
      multiplier: 1,
      timer: 0,
    };
  }
  const nextTimer = state.timer - dt;
  if (nextTimer <= 0) {
    return {
      ...state,
      comboCount: 0,
      multiplier: 1,
      timer: 0,
    };
  }
  return {
    ...state,
    timer: nextTimer,
  };
}

export function calculatePlowReward(
  blocksCleared: number,
  depthRemovedSum: number,
  comboMultiplier: number,
  coinUpgradeMultiplier: number
): { scoreDelta: number; coinsDelta: number; synthStep: number } {
  if (blocksCleared <= 0 && depthRemovedSum <= 0) {
    return { scoreDelta: 0, coinsDelta: 0, synthStep: 0 };
  }
  const basePoints = blocksCleared * 20 + Math.round(depthRemovedSum * 12);
  const scoreDelta = Math.round(basePoints * comboMultiplier);
  const rawCoins =
    (blocksCleared * 1.5 + depthRemovedSum * 0.8) *
    (1 + (comboMultiplier - 1) * 0.25) *
    coinUpgradeMultiplier;
  const coinsDelta = Math.max(1, Math.round(rawCoins));
  const synthStep = Math.min(14, comboMultiplier * 2 - 1);
  return { scoreDelta, coinsDelta, synthStep };
}

export function isPointInPlowBlade(
  px: number,
  pz: number,
  bladeCenterX: number,
  bladeCenterZ: number,
  truckAngle: number,
  bladeHalfWidth: number,
  bladeDepth: number
): boolean {
  const dx = px - bladeCenterX;
  const dz = pz - bladeCenterZ;
  // Forward vector is (sin(truckAngle), cos(truckAngle))
  const sinA = Math.sin(truckAngle);
  const cosA = Math.cos(truckAngle);

  // Local forward projection along truck heading
  const localForward = dx * sinA + dz * cosA;
  // Local lateral projection perpendicular to truck heading
  const localRight = dx * cosA - dz * sinA;

  return (
    Math.abs(localForward) <= bladeDepth * 0.7 &&
    Math.abs(localRight) <= bladeHalfWidth
  );
}

export function computeClearedPercentage(
  clearedCount: number,
  totalCount: number
): number {
  if (totalCount <= 0) return 100;
  if (clearedCount <= 0) return 0;
  const clamped = Math.max(0, Math.min(totalCount, clearedCount));
  return Math.min(100, Math.max(1, Math.round((clamped / totalCount) * 100)));
}

export function checkDistrictVictory(
  clearedCount: number,
  totalCount: number,
  targetPercentage: number
): boolean {
  return computeClearedPercentage(clearedCount, totalCount) >= targetPercentage;
}

export function checkCabinLiberated(
  cabin: CabinTarget,
  cells: SnowCellLogic[]
): boolean {
  if (cabin.liberated) return true;
  const rSq = cabin.drivewayRadius * cabin.drivewayRadius;
  let totalInDriveway = 0;
  let clearedInDriveway = 0;

  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const dx = c.x - cabin.drivewayX;
    const dz = c.z - cabin.drivewayZ;
    if (dx * dx + dz * dz <= rSq) {
      totalInDriveway++;
      if (c.depth <= 0.05) {
        clearedInDriveway++;
      }
    }
  }
  if (totalInDriveway === 0) return true;
  return clearedInDriveway / totalInDriveway >= 0.85;
}
