import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getUpgradeCost,
  canAffordUpgrade,
  purchaseUpgrade,
  computeTruckStats,
  updateComboOnPlow,
  tickComboTimer,
  calculatePlowReward,
  isPointInPlowBlade,
  computeClearedPercentage,
  checkDistrictVictory,
  checkCabinLiberated,
  type EconomyState,
  type ComboState,
} from './rules.ts';

test('upgrade cost scales and purchase deducts coins accurately', () => {
  const lvl1Cost = getUpgradeCost('bladeWidth', 1);
  assert.equal(lvl1Cost, 25);

  const initialEconomy: EconomyState = {
    coins: 40,
    score: 0,
    warmth: 3,
    maxWarmth: 5,
    upgrades: {
      bladeWidth: 1,
      engineTorque: 1,
      saltMelter: 1,
      hopperBounty: 1,
    },
  };

  assert.equal(canAffordUpgrade(40, 'bladeWidth', 1), true);
  assert.equal(canAffordUpgrade(10, 'bladeWidth', 1), false);

  const res = purchaseUpgrade(initialEconomy, 'bladeWidth');
  assert.equal(res.purchased, true);
  assert.equal(res.costPaid, 25);
  assert.equal(res.nextState.coins, 15);
  assert.equal(res.nextState.upgrades.bladeWidth, 2);
});

test('computeTruckStats increases blade width and speed with upgrades', () => {
  const baseStats = computeTruckStats({
    bladeWidth: 1,
    engineTorque: 1,
    saltMelter: 1,
    hopperBounty: 1,
  });
  const upgradedStats = computeTruckStats({
    bladeWidth: 4,
    engineTorque: 3,
    saltMelter: 2,
    hopperBounty: 2,
  });

  assert.ok(upgradedStats.bladeHalfWidth > baseStats.bladeHalfWidth);
  assert.ok(upgradedStats.maxSpeed > baseStats.maxSpeed);
  assert.ok(upgradedStats.comboMaxDuration > baseStats.comboMaxDuration);
  assert.ok(upgradedStats.coinMultiplier > baseStats.coinMultiplier);
});

test('combo multiplier increments on snow plow and decays when timer expires', () => {
  let combo: ComboState = {
    comboCount: 0,
    multiplier: 1,
    timer: 0,
    maxTimer: 3.5,
    maxComboReached: 1,
  };

  combo = updateComboOnPlow(combo, 8, 3.5);
  assert.equal(combo.comboCount, 8);
  assert.ok(combo.multiplier >= 2);
  assert.equal(combo.timer, 3.5);

  // Tick partway
  combo = tickComboTimer(combo, 1.5);
  assert.equal(combo.timer, 2.0);
  assert.ok(combo.multiplier >= 2);

  // Tick past expiration
  combo = tickComboTimer(combo, 2.5);
  assert.equal(combo.comboCount, 0);
  assert.equal(combo.multiplier, 1);
  assert.equal(combo.timer, 0);
  // maxComboReached is preserved
  assert.ok(combo.maxComboReached >= 2);
});

test('calculatePlowReward scales score and coins by multiplier', () => {
  const low = calculatePlowReward(2, 2, 1, 1.0);
  const high = calculatePlowReward(2, 2, 4, 1.5);

  assert.ok(high.scoreDelta > low.scoreDelta);
  assert.ok(high.coinsDelta > low.coinsDelta);
  assert.ok(high.synthStep > low.synthStep);
});

test('isPointInPlowBlade detects snow cells inside oriented blade footprint', () => {
  // Truck facing +Z (angle = 0), blade center at (0, 2)
  assert.equal(isPointInPlowBlade(0.5, 2.1, 0, 2, 0, 1.8, 1.4), true);
  // Far to the right outside blade width
  assert.equal(isPointInPlowBlade(3.5, 2.1, 0, 2, 0, 1.8, 1.4), false);
});

test('district victory and cabin liberation thresholds work accurately', () => {
  assert.equal(computeClearedPercentage(85, 100), 85);
  assert.equal(checkDistrictVictory(84, 100, 85), false);
  assert.equal(checkDistrictVictory(85, 100, 85), true);

  const cabin = {
    id: 'cabin-1',
    name: ' Cocoa Bakery',
    drivewayX: 10,
    drivewayZ: 10,
    drivewayRadius: 4,
    liberated: false,
    bonusCoins: 25,
    bonusScore: 250,
  };

  const unclearedCells = [
    { id: 1, x: 10, z: 10, depth: 1, maxDepth: 1 },
    { id: 2, x: 11, z: 10, depth: 1, maxDepth: 1 },
  ];
  assert.equal(checkCabinLiberated(cabin, unclearedCells), false);

  const clearedCells = [
    { id: 1, x: 10, z: 10, depth: 0, maxDepth: 1 },
    { id: 2, x: 11, z: 10, depth: 0, maxDepth: 1 },
  ];
  assert.equal(checkCabinLiberated(cabin, clearedCells), true);
});
