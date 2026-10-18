import React, { useEffect, useRef, useState } from 'react';
import {
  FrostplowSceneManager,
  type HudSnapshot,
} from './game/SceneManager';
import {
  UPGRADE_SPECS,
  type UpgradeId,
  getUpgradeCost,
  canAffordUpgrade,
} from './game/rules';
import { synthAudio } from './game/audio';
import {
  FrostplowTitleEmblem,
  WarmthCocoaPip,
  CoinIcon,
  CabinIcon,
  UpgradeIcon,
} from './components/GameIcons';

const INITIAL_HUD: HudSnapshot = {
  mode: 'title',
  outcome: null,
  districtIndex: 0,
  districtName: 'Pinecone Hollow',
  targetPercent: 45,
  clearedPercent: 0,
  cabinsLiberated: 0,
  totalCabins: 6,
  coins: 35,
  score: 0,
  bestScore: 0,
  warmth: 5,
  maxWarmth: 5,
  comboCount: 0,
  multiplier: 1,
  comboTimerRatio: 0,
  maxComboReached: 1,
  boostCharge: 1,
  isBoosting: false,
  upgrades: {
    bladeWidth: 1,
    engineTorque: 1,
    saltMelter: 1,
    hopperBounty: 1,
  },
  elapsedSeconds: 0,
  recentBanner: null,
  cameraZoomPreset: 'isometric',
};

const UPGRADE_ORDER: UpgradeId[] = [
  'bladeWidth',
  'engineTorque',
  'saltMelter',
  'hopperBounty',
];

function formatTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const managerRef = useRef<FrostplowSceneManager | null>(null);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [muted, setMuted] = useState<boolean>(false);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const manager = new FrostplowSceneManager(container, (snap) => {
      setHud(snap);
      setMuted(synthAudio.isMuted());
    });
    managerRef.current = manager;

    // Support ?autostart=1 for instant gameplay verification
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      manager.startGame();
    }

    const onKeyToggleDock = (e: KeyboardEvent) => {
      if (e.code === 'KeyH') {
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyToggleDock);

    return () => {
      window.removeEventListener('keydown', onKeyToggleDock);
      manager.dispose();
      managerRef.current = null;
    };
  }, []);

  const handleStartClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    managerRef.current?.startGame();
  };

  const handleToggleMute = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    const nextMuted = synthAudio.toggleMuted();
    setMuted(nextMuted);
  };

  const handleToggleCamera = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    managerRef.current?.toggleCameraPreset();
  };

  const handlePauseToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    if (!managerRef.current) return;
    if (hud.mode === 'playing') {
      managerRef.current.setMode('paused');
    } else if (hud.mode === 'paused') {
      managerRef.current.setMode('playing');
    }
  };

  const handleRestart = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    managerRef.current?.restartCurrentDistrict();
  };

  const handleReturnTitle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    managerRef.current?.returnToTitle();
  };

  const handleUpgradeClick = (
    e: React.MouseEvent<HTMLButtonElement>,
    id: UpgradeId
  ) => {
    e.currentTarget.blur();
    managerRef.current?.tryUpgrade(id);
  };

  const handleBoostClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    managerRef.current?.triggerBoost();
  };

  const progressRatio = Math.min(
    100,
    Math.round((hud.clearedPercent / Math.max(1, hud.targetPercent)) * 100)
  );

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#0d1829] select-none">
      {/* Isolated WebGL Canvas Mount Container */}
      <div
        ref={canvasMountRef}
        className="absolute inset-0 w-full h-full"
        aria-label="3D Isometric Snow Plowing Viewport"
      />

      {/* Low-Warmth Peripheral Frost Vignette */}
      {hud.mode === 'playing' && hud.warmth <= 2 && (
        <div
          className="pointer-events-none fixed inset-0 z-10"
          style={{
            boxShadow: 'inset 0 0 90px rgba(56, 189, 248, 0.42)',
          }}
        />
      )}

      {/* ==================== TITLE SCREEN OVERLAY ==================== */}
      {hud.mode === 'title' && (
        <section
          aria-label="Title Screen"
          className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-6 sm:p-10 md:p-14"
          style={{
            background:
              'linear-gradient(90deg, rgba(8, 15, 28, 0.94) 0%, rgba(8, 15, 28, 0.78) 38%, rgba(8, 15, 28, 0.12) 72%, rgba(8, 15, 28, 0.0) 100%)',
          }}
        >
          {/* Top-Right Audio Toggle */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleToggleMute}
              className="pointer-events-auto inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#132238] border border-amber-400/40 text-amber-100 text-xs font-semibold hover:bg-[#1c3150] transition-colors whitespace-nowrap shrink-0"
              aria-label={muted ? 'Unmute Synth Audio' : 'Mute Synth Audio'}
            >
              <span>{muted ? 'Audio Muted [M]' : 'Synth Audio On [M]'}</span>
            </button>
          </div>

          {/* Left-Third Focal Lockup over Negative Space */}
          <div className="pointer-events-auto max-w-md flex flex-col items-start gap-5 my-auto">
            <FrostplowTitleEmblem />

            <p className="text-slate-100 text-sm sm:text-base leading-relaxed font-medium max-w-[38ch] drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
              Carve crisp lanes through snowed-in alpine villages, chain musical
              plow combos, free cozy cabins, and upgrade your heavy V-blade rig.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                data-start="true"
                onClick={handleStartClick}
                className="px-7 py-3.5 rounded-xl bg-[#f59e0b] hover:bg-[#fbbf24] active:translate-y-0.5 text-slate-950 font-display font-bold text-base sm:text-lg tracking-wide shadow-[0_6px_0_#b45309] transition-all cursor-pointer whitespace-nowrap shrink-0"
              >
                Start Plowing
              </button>
            </div>
          </div>

          {/* Flat Single-Line Control Hint in Bottom Safe Margin */}
          <div className="w-full flex items-center justify-between text-xs sm:text-sm text-slate-300/90 font-medium tracking-wide">
            <span>
              WASD / Arrows or Drag to Drive · Space Turbo Salt Boost · 1–4
              Upgrades · Esc Pause
            </span>
          </div>
        </section>
      )}

      {/* ==================== PLAYING HUD OVERLAY ==================== */}
      {hud.mode === 'playing' && (
        <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-2.5 sm:p-5">
          {/* TOP GROUP: Perimeter Status Bar + Mobile Progress Sub-bar */}
          <div className="flex flex-col gap-2 w-full">
            <div className="flex items-start justify-between gap-2 w-full">
              {/* 1. Top-Left Cluster: Warmth Pips, Coins, Score & Combo Multiplier */}
              <div className="flex flex-col gap-1.5 min-w-0">
                <div className="flex items-center gap-2 sm:gap-3 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-[#111f34]/92 border-2 border-[#f59e0b]/45 shadow-[0_6px_16px_rgba(4,9,18,0.65)]">
                  {/* Warmth Cocoa Sockets */}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] sm:text-[10px] font-bold tracking-wider uppercase text-amber-300/90">
                      WARMTH
                    </span>
                    <div
                      className="flex items-center gap-0.5 sm:gap-1"
                      aria-label={`Warmth ${hud.warmth} of ${hud.maxWarmth}`}
                    >
                      {Array.from({ length: hud.maxWarmth }).map((_, idx) => (
                        <WarmthCocoaPip
                          key={idx}
                          state={
                            idx < hud.warmth
                              ? 'full'
                              : idx === hud.warmth
                                ? 'cracked'
                                : 'empty'
                          }
                        />
                      ))}
                    </div>
                  </div>

                  <div className="h-7 sm:h-8 w-[1px] bg-slate-700/80" />

                  {/* Coins Readout */}
                  <div className="flex flex-col">
                    <span className="text-[9px] sm:text-[10px] font-bold tracking-wider uppercase text-amber-300/90">
                      COINS
                    </span>
                    <div className="flex items-center gap-1">
                      <CoinIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span
                        data-testid="hud-coins"
                        className="font-display font-extrabold text-lg sm:text-2xl text-amber-300 tabular-nums hud-stroke leading-none"
                      >
                        {hud.coins}
                      </span>
                    </div>
                  </div>

                  <div className="h-7 sm:h-8 w-[1px] bg-slate-700/80" />

                  {/* Score Readout */}
                  <div className="flex flex-col">
                    <span className="text-[9px] sm:text-[10px] font-bold tracking-wider uppercase text-sky-300/90">
                      SCORE
                    </span>
                    <span
                      data-testid="hud-score"
                      className="font-display font-extrabold text-lg sm:text-2xl text-white tabular-nums hud-stroke leading-none"
                    >
                      {hud.score}
                    </span>
                  </div>
                </div>

                {/* Active Combo Multiplier Meter */}
                <div className="flex items-center gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-[#111f34]/90 border border-sky-400/35 w-fit">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[10px] font-bold tracking-wider uppercase text-sky-300">
                      COMBO
                    </span>
                    <span
                      data-testid="hud-multiplier"
                      className="font-display font-extrabold text-base sm:text-xl text-amber-400 tabular-nums hud-stroke leading-none"
                    >
                      {hud.multiplier}x
                    </span>
                  </div>
                  <div className="w-16 sm:w-24 h-2 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
                    <div
                      className="h-full bg-amber-400 transition-transform duration-75 origin-left"
                      style={{
                        transform: `scaleX(${hud.comboTimerRatio.toFixed(3)})`,
                      }}
                    />
                  </div>
                  <span className="text-[11px] sm:text-xs font-mono-tabular text-slate-300">
                    {hud.comboCount} drifts
                  </span>
                </div>
              </div>

              {/* 2. Top-Center Cluster: District Snow Clear Progress & Cabins */}
              <div className="hidden md:flex flex-col items-center px-4 py-2 rounded-xl bg-[#111f34]/92 border-2 border-sky-400/40 shadow-[0_6px_16px_rgba(4,9,18,0.65)] min-w-[290px]">
                <div className="flex items-center justify-between w-full text-xs font-semibold text-slate-200 mb-1">
                  <span>
                    {hud.districtName} · District {hud.districtIndex + 1}
                  </span>
                  <span className="font-mono-tabular text-amber-300 font-bold">
                    {hud.clearedPercent}% / {hud.targetPercent}% Goal
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-900 overflow-hidden border border-slate-700">
                  <div
                    className="h-full bg-emerald-400 transition-all duration-150"
                    style={{ width: `${progressRatio}%` }}
                  />
                </div>
                <div className="flex items-center justify-between w-full mt-1.5 text-[11px] text-slate-300">
                  <span className="inline-flex items-center gap-1">
                    <CabinIcon className="w-4 h-4" />
                    <span>
                      Cabins Freed:{' '}
                      <strong className="text-white tabular-nums">
                        {hud.cabinsLiberated}/{hud.totalCabins}
                      </strong>
                    </span>
                  </span>
                  <span className="font-mono-tabular">
                    Time {formatTime(hud.elapsedSeconds)}
                  </span>
                </div>
              </div>

              {/* 3. Top-Right Utility Controls (Mute [M], Camera [C], Restart [R], Pause [P]) */}
              <div className="pointer-events-auto flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={handleToggleMute}
                  aria-label={muted ? 'Unmute Audio [M]' : 'Mute Audio [M]'}
                  title="Mute / Unmute Synth [M]"
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#111f34]/92 border border-slate-600/80 hover:border-amber-400 flex items-center justify-center text-slate-100 hover:text-amber-300 transition-colors cursor-pointer"
                >
                  {muted ? (
                    <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 5L6 9H2v6h4l5 4V5z" />
                      <line x1="23" y1="9" x2="17" y2="15" />
                      <line x1="17" y1="9" x2="23" y2="15" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 5L6 9H2v6h4l5 4V5z" />
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    </svg>
                  )}
                </button>

                <button
                  type="button"
                  tabIndex={-1}
                  onClick={handleToggleCamera}
                  aria-label="Toggle Isometric Camera Zoom [C]"
                  title="Toggle Camera View [C]"
                  className="hidden sm:flex w-10 h-10 rounded-xl bg-[#111f34]/92 border border-slate-600/80 hover:border-amber-400 items-center justify-center text-slate-100 hover:text-amber-300 transition-colors cursor-pointer"
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </button>

                <button
                  type="button"
                  tabIndex={-1}
                  onClick={handleRestart}
                  aria-label="Restart District [R]"
                  title="Restart District [R]"
                  className="hidden sm:flex w-10 h-10 rounded-xl bg-[#111f34]/92 border border-slate-600/80 hover:border-amber-400 items-center justify-center text-slate-100 hover:text-amber-300 transition-colors cursor-pointer"
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="1 4 1 10 7 10" />
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                  </svg>
                </button>

                <button
                  type="button"
                  tabIndex={-1}
                  onClick={handlePauseToggle}
                  aria-label="Pause Game [P]"
                  title="Pause Game [P / Esc]"
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#111f34]/92 border border-slate-600/80 hover:border-amber-400 flex items-center justify-center text-slate-100 hover:text-amber-300 transition-colors cursor-pointer"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Mobile Compact District Progress Strip (anchored inside Top Group) */}
            <div className="flex md:hidden items-center justify-between px-3 py-1 rounded-lg bg-[#111f34]/90 border border-sky-400/35 text-xs">
              <span className="font-semibold text-slate-200">
                {hud.districtName}:{' '}
                <strong className="text-amber-300 tabular-nums">
                  {hud.clearedPercent}%/{hud.targetPercent}%
                </strong>
              </span>
              <span className="text-slate-300 tabular-nums">
                Cabins {hud.cabinsLiberated}/{hud.totalCabins}
              </span>
            </div>
          </div>

          {/* Center Event Banner Toast (Cabin Liberated / Upgrade / Cocoa) */}
          {hud.recentBanner && (
            <div className="self-center px-4 py-2 rounded-xl bg-[#132238]/95 border-2 border-amber-400 text-amber-200 font-display font-bold text-sm sm:text-base shadow-lg">
              {hud.recentBanner}
            </div>
          )}

          {/* BOTTOM UNIFIED COLLAPSIBLE WORKSHOP & BOOST DOCK */}
          <div className="pointer-events-auto self-center w-full max-w-[920px] flex flex-col items-center">
            {/* Collapse / Expand Toggle Tab */}
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                setDockCollapsed((prev) => !prev);
              }}
              className="px-3.5 py-1 rounded-t-lg bg-[#111f34]/95 border-t border-x border-amber-400/40 text-[11px] font-semibold text-amber-200 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              {dockCollapsed
                ? '▴ Show Workshop & Upgrades [H]'
                : '▾ Hide Workshop [H]'}
            </button>

            {!dockCollapsed && (
              <div className="w-full rounded-2xl bg-[#111f34]/95 border-2 border-[#f59e0b]/45 p-2.5 sm:p-3 shadow-[0_10px_28px_rgba(3,8,18,0.85)] flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                {/* Active Ability Slot: Turbo Salt Boost [Space] */}
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={handleBoostClick}
                  disabled={hud.boostCharge < 0.35 && !hud.isBoosting}
                  className={`flex flex-col justify-between p-2.5 rounded-xl border text-left transition-all shrink-0 sm:w-44 cursor-pointer ${
                    hud.isBoosting
                      ? 'bg-amber-500 text-slate-950 border-amber-200'
                      : hud.boostCharge >= 0.35
                        ? 'bg-[#1a2e4c] hover:bg-[#223b60] text-white border-amber-400/60'
                        : 'bg-[#0f1b2d] text-slate-400 border-slate-700/70 opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between w-full gap-2">
                    <span className="text-xs font-display font-bold tracking-wide whitespace-nowrap">
                      Turbo Salt Ram
                    </span>
                    <span className="text-[10px] font-mono-tabular px-1.5 py-0.5 rounded bg-slate-950/60 text-amber-300">
                      [Space]
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-900 overflow-hidden my-1.5">
                    <div
                      className="h-full bg-amber-400 transition-all duration-100"
                      style={{
                        width: `${Math.round(hud.boostCharge * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-300 whitespace-nowrap truncate">
                    Smashes Ice & Boulders
                  </span>
                </button>

                {/* 4 Truck Upgrade Slots */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 flex-1">
                  {UPGRADE_ORDER.map((id) => {
                    const spec = UPGRADE_SPECS[id];
                    const currentLvl = hud.upgrades[id];
                    const isMax = currentLvl >= spec.maxLevel;
                    const cost = getUpgradeCost(id, currentLvl);
                    const affordable = canAffordUpgrade(
                      hud.coins,
                      id,
                      currentLvl
                    );

                    return (
                      <button
                        key={id}
                        type="button"
                        tabIndex={-1}
                        data-testid={`upgrade-${id}`}
                        onClick={(e) => handleUpgradeClick(e, id)}
                        disabled={!affordable || isMax}
                        className={`flex flex-col justify-between p-2 rounded-xl border text-left transition-all cursor-pointer ${
                          isMax
                            ? 'bg-[#15263d] border-emerald-500/40 text-emerald-200'
                            : affordable
                              ? 'bg-[#1a2e4c] hover:bg-[#233d63] border-amber-400/70 text-white'
                              : 'bg-[#0f1b2d] border-slate-700/70 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 w-full">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <UpgradeIcon id={id} />
                            <span className="text-xs font-semibold truncate">
                              {spec.name}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono-tabular text-slate-300 shrink-0">
                            [{spec.hotkey}]
                          </span>
                        </div>

                        <div className="text-[10px] text-slate-300 truncate my-0.5">
                          {spec.shortRole}
                        </div>

                        <div className="flex items-center justify-between w-full pt-1 border-t border-slate-700/60">
                          <span className="text-[10px] font-mono-tabular text-sky-300">
                            Lv.{currentLvl}/{spec.maxLevel}
                          </span>
                          {isMax ? (
                            <span className="text-[10px] font-bold text-emerald-400">
                              MAX
                            </span>
                          ) : (
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-mono-tabular font-bold ${
                                affordable ? 'text-amber-300' : 'text-slate-400'
                              }`}
                            >
                              <CoinIcon className="w-3.5 h-3.5" />
                              {cost}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== PAUSE MODAL ==================== */}
      {hud.mode === 'paused' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Game Paused"
          className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#070e1a]/80"
        >
          <div className="w-full max-w-md rounded-2xl bg-[#132238] border-2 border-amber-400/70 p-6 sm:p-8 shadow-2xl flex flex-col gap-5 text-center">
            <div>
              <span className="text-xs font-bold tracking-widest uppercase text-amber-300">
                {hud.districtName}
              </span>
              <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-white mt-1">
                Depot Break · Paused
              </h2>
            </div>

            <div className="grid grid-cols-3 gap-2.5 p-3 rounded-xl bg-[#0d1829] border border-slate-700/80">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-slate-400">
                  Cleared
                </span>
                <span className="font-display font-bold text-lg text-emerald-300 tabular-nums">
                  {hud.clearedPercent}%
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-slate-400">
                  Score
                </span>
                <span className="font-display font-bold text-lg text-white tabular-nums">
                  {hud.score}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-slate-400">
                  Coins
                </span>
                <span className="font-display font-bold text-lg text-amber-300 tabular-nums">
                  {hud.coins}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handlePauseToggle}
                className="w-full py-3 px-5 rounded-xl bg-[#f59e0b] hover:bg-[#fbbf24] text-slate-950 font-display font-bold text-base cursor-pointer transition-colors"
              >
                Resume Plowing
              </button>
              <button
                type="button"
                onClick={handleRestart}
                className="w-full py-2.5 px-5 rounded-xl bg-[#1c3150] hover:bg-[#254168] text-white font-semibold text-sm cursor-pointer transition-colors"
              >
                Restart District
              </button>
              <button
                type="button"
                onClick={handleReturnTitle}
                className="w-full py-2.5 px-5 rounded-xl bg-transparent hover:bg-slate-800/80 text-slate-300 font-medium text-sm cursor-pointer transition-colors"
              >
                Return to Title
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== VICTORY / GAME OVER MODAL ==================== */}
      {hud.mode === 'gameover' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={
            hud.outcome === 'victory' ? 'District Cleared' : 'Chilled Out'
          }
          className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#070e1a]/82"
        >
          <div className="w-full max-w-md rounded-2xl bg-[#132238] border-2 border-amber-400 p-6 sm:p-8 shadow-2xl flex flex-col gap-5 text-center">
            <div>
              <span className="text-xs font-bold tracking-widest uppercase text-amber-300">
                {hud.outcome === 'victory'
                  ? `${hud.districtName} Liberated!`
                  : 'Snowplow Needs Warm Cocoa'}
              </span>
              <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-white mt-1">
                {hud.outcome === 'victory'
                  ? 'District Snow Cleared!'
                  : 'Cab Frosted Over'}
              </h2>
            </div>

            <div className="grid grid-cols-3 gap-2.5 p-3.5 rounded-xl bg-[#0d1829] border border-slate-700/80">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-slate-400">
                  Score / Best
                </span>
                <span className="font-display font-bold text-base sm:text-lg text-white tabular-nums">
                  {hud.score} / {hud.bestScore}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-slate-400">
                  Max Combo
                </span>
                <span className="font-display font-bold text-base sm:text-lg text-amber-300 tabular-nums">
                  {hud.maxComboReached}x
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-slate-400">
                  {hud.outcome === 'victory' ? 'Clear Time' : 'Snow Cleared'}
                </span>
                <span className="font-display font-bold text-base sm:text-lg text-emerald-300 tabular-nums">
                  {hud.outcome === 'victory'
                    ? formatTime(hud.elapsedSeconds)
                    : `${hud.clearedPercent}%`}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                data-start="true"
                onClick={handleStartClick}
                className="w-full py-3.5 px-6 rounded-xl bg-[#f59e0b] hover:bg-[#fbbf24] text-slate-950 font-display font-bold text-base cursor-pointer transition-colors"
              >
                {hud.outcome === 'victory'
                  ? 'Next Alpine District'
                  : 'Try District Again'}
              </button>
              <button
                type="button"
                onClick={handleReturnTitle}
                className="w-full py-2.5 px-5 rounded-xl bg-[#1c3150] hover:bg-[#254168] text-slate-200 font-semibold text-sm cursor-pointer transition-colors"
              >
                Return to Title
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
