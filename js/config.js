window.AetherBastion = window.AetherBastion || {};

const CONFIG = {
  PAD_RADIUS: 34,
  AUGMENT_INTERVAL: 3
};

const ROUTE_LABELS = {
  MAIN: '제1 주력 군용 도로',
  BYPASS: '제2 남서부 협곡 우회로',
  SUB_PORTAL: '제3 북부 균열 침투로',
  EAST_BREACH: '제4 폭격 돌파로 (건설불가)',
  CORE_TUNNEL: '제5 지하 갱도 돌파로 (건설불가)'
};

const TARGET_LABELS = {
  FIRST: '선두 우선',
  LAST: '최후미 우선',
  STRONG: '최대 체력',
  WEAK: '최소 체력'
};

const TOWER_DEFS = {
  PULSE: {
    id: 'PULSE',
    name: '중기관포 벙커',
    role: '고속 실탄·철갑 연사 포탑',
    special: '감전 적 적중 시 과부하 폭발 (+1⚡, 웨이브당 최대 +15)',
    cost: 60,
    color: '#38bdf8',
    accent: '#bae6fd',
    damage: [24, 38, 58],
    range: [185, 210, 235],
    fireRate: [2.25, 2.7, 3.25],
    upgradeCost: [75, 165],
    overclockCost: 320,
    specs: {
      A: {
        id: 'VULCAN',
        name: '벌컨 6연장 개틀링',
        shortDesc: '회전 총열 초고속 실탄 연사 (4.9/s) + 연사 가속',
        color: '#38bdf8',
        damage: 42,
        range: 230,
        fireRate: 4.9
      },
      B: {
        id: 'RAILGUN',
        name: '레일건 대구경 저격포',
        shortDesc: '초장거리 320 · 철갑탄 170 + 35% 치명타(2.3x)',
        color: '#60a5fa',
        damage: 170,
        range: 320,
        fireRate: 1.25
      }
    }
  },
  CRYO: {
    id: 'CRYO',
    name: '빙결 냉각탑',
    role: '광역 극저온 방사 및 원소 기점',
    special: '빙결 둔화 부여 (테슬라·박격포 원소 시너지 기점)',
    cost: 90,
    color: '#7dd3fc',
    accent: '#e0f2fe',
    damage: [14, 22, 35],
    range: [165, 185, 205],
    fireRate: [1.15, 1.35, 1.55],
    slowFactor: [0.36, 0.44, 0.50],
    upgradeCost: [105, 200],
    overclockCost: 360,
    specs: {
      A: {
        id: 'ABSOLUTION',
        name: '절대영도 방사기',
        shortDesc: '56% 극한 둔화 + 22% 확률 0.75초 완전 동결',
        color: '#7dd3fc',
        damage: 36,
        range: 215,
        fireRate: 1.6,
        slowFactor: 0.56
      },
      B: {
        id: 'BRITTLE',
        name: '서리 파쇄 조준기',
        shortDesc: '빙결된 적이 받는 모든 피해 +22% 취약 부여',
        color: '#38bdf8',
        damage: 40,
        range: 225,
        fireRate: 1.52,
        slowFactor: 0.50
      }
    }
  },
  TESLA: {
    id: 'TESLA',
    name: '아크 테슬라 코일',
    role: '고전압 연쇄 전격 방전탑 (연쇄당 -18% 감쇠)',
    special: '연쇄 감쇠(82% 계승) · 빙결 적 적중 시 [초전도] 방어파쇄',
    cost: 135,
    color: '#c084fc',
    accent: '#f3e8ff',
    damage: [33, 52, 80],
    range: [175, 195, 215],
    fireRate: [1.0, 1.2, 1.4],
    chainCount: [3, 4, 5],
    chainDecay: 0.82,
    upgradeCost: [150, 265],
    overclockCost: 420,
    specs: {
      A: {
        id: 'STORM',
        name: '스톰 브링어 코일',
        shortDesc: '최대 6체 연쇄(감쇠 완화 88%) + 초전도 반응 피해 +30%',
        color: '#c084fc',
        damage: 74,
        range: 230,
        fireRate: 1.52,
        chainCount: 6,
        chainDecay: 0.88
      },
      B: {
        id: 'DISINTEGRATOR',
        name: '고전압 아크 분해탑',
        shortDesc: '2체 집중 205 고전압 + 중장갑 괴수·보스 추가 피해 +40%',
        color: '#e879f9',
        damage: 205,
        range: 215,
        fireRate: 1.3,
        chainCount: 2,
        chainDecay: 0.90
      }
    }
  },
  MORTAR: {
    id: 'MORTAR',
    name: '에테르 중박격포',
    role: '초장거리 대구경 고폭 곡사포',
    special: '빙결 적 적중 시 [열충격 파쇄] (보스 2.5초 쿨타임/상한)',
    cost: 165,
    color: '#f59e0b',
    accent: '#fef3c7',
    damage: [66, 108, 168],
    range: [285, 315, 345],
    fireRate: [0.62, 0.72, 0.84],
    splashRadius: [90, 104, 118],
    upgradeCost: [180, 310],
    overclockCost: 480,
    specs: {
      A: {
        id: 'CLUSTER',
        name: '집속 네이팜 곡사포',
        shortDesc: '착탄 시 주변에 3발의 고폭 자탄 추가 투하',
        color: '#fb923c',
        damage: 152,
        range: 355,
        fireRate: 0.86,
        splashRadius: 118
      },
      B: {
        id: 'SINGULARITY',
        name: '중력 붕괴 중포',
        shortDesc: '착탄 지점으로 괴수를 끌어당기며 반경 142 초광역 폭발',
        color: '#fbbf24',
        damage: 196,
        range: 365,
        fireRate: 0.82,
        splashRadius: 142
      }
    }
  }
};

const ENEMY_DEFS = {
  DRONE: {
    id: 'DRONE',
    name: '스카웃 크롤러',
    trait: '6족 보행 정찰 괴수 · 다수 무리 돌격',
    hp: 80,
    speed: 118,
    reward: 7,
    score: 25,
    radius: 15,
    color: '#2dd4bf',
    coreColor: '#ccfbf1',
    coreDamage: 1
  },
  RUNNER: {
    id: 'RUNNER',
    name: '위상 섀도우 하운드',
    trait: '4족 맹수형 돌격체 · 우회 협곡 고속 침투',
    hp: 132,
    speed: 172,
    reward: 10,
    score: 40,
    radius: 16,
    color: '#c084fc',
    coreColor: '#f3e8ff',
    coreDamage: 1
  },
  BEHEMOTH: {
    id: 'BEHEMOTH',
    name: '중장갑 저거너트',
    trait: '거대 중갑 오우거 · 높은 체력 · 방어 파쇄 취약',
    hp: 360,
    speed: 58,
    reward: 15,
    score: 60,
    radius: 22,
    color: '#f97316',
    coreColor: '#ffedd5',
    coreDamage: 2
  },
  SPLITTER: {
    id: 'SPLITTER',
    name: '에테르 브루드 마더',
    trait: '포자낭 변이체 · 격파 시 크롤러 2기로 분열',
    hp: 260,
    speed: 84,
    reward: 12,
    score: 55,
    radius: 20,
    color: '#34d399',
    coreColor: '#d1fae5',
    coreDamage: 2
  },
  AEGIS: {
    id: 'AEGIS',
    name: '위상 방벽 사제',
    trait: '부유형 결계 개체 · 주변 괴수에게 보호막 부여',
    hp: 315,
    speed: 74,
    reward: 16,
    score: 75,
    radius: 19,
    color: '#60a5fa',
    coreColor: '#dbeafe',
    coreDamage: 2
  },
  TITAN: {
    id: 'TITAN',
    name: '심연의 공성 타이탄',
    trait: '거신 보스 · CC 70% 저항 · 파쇄 2.5초 쿨타임 · 코어 6 피해',
    hp: 2250,
    speed: 46,
    reward: 70,
    score: 420,
    radius: 32,
    color: '#f43f5e',
    coreColor: '#ffe4e6',
    coreDamage: 6,
    isBoss: true
  }
};

const AUGMENT_POOL = [
  {
    id: 'RAPID_COOLING',
    name: '고속 냉각 총열',
    rarity: 'COMMON',
    rarityLabel: '실버 증강',
    icon: '⚡',
    maxStacks: 3,
    desc: '모든 포탑의 공격 속도가 +14% 증가합니다. (최대 3중첩)',
    apply: (mods) => { mods.fireRateMult += 0.14; }
  },
  {
    id: 'OPTIC_LENS',
    name: '고출력 광학 조준경',
    rarity: 'COMMON',
    rarityLabel: '실버 증강',
    icon: '🎯',
    maxStacks: 3,
    desc: '모든 포탑의 사거리가 +15% 증가합니다. (최대 3중첩)',
    apply: (mods) => { mods.rangeMult += 0.15; }
  },
  {
    id: 'AETHER_REFINERY',
    name: '에테르 정제 추출기',
    rarity: 'COMMON',
    rarityLabel: '실버 증강',
    icon: '💎',
    maxStacks: 2,
    desc: '괴수 격파 시 획득하는 에테르 보상이 +15% 증가합니다. (최대 2중첩)',
    apply: (mods) => { mods.rewardMult += 0.15; }
  },
  {
    id: 'CORE_REPAIR',
    name: '성채 코어 긴급 수복',
    rarity: 'COMMON',
    rarityLabel: '실버 증강',
    icon: '🛡️',
    maxStacks: 99,
    desc: '즉시 코어 내구도를 +5 회복합니다. (최대치 초과 시 최대 내구도 +2)',
    instant: (game) => {
      if (game.coreHp + 5 > game.maxCoreHp) {
        game.maxCoreHp += 2;
      }
      game.coreHp = Math.min(game.maxCoreHp, game.coreHp + 5);
    }
  },
  {
    id: 'COMBAT_ENGINEERS',
    name: '왕립 공병 지원단',
    rarity: 'COMMON',
    rarityLabel: '실버 증강',
    icon: '🔧',
    maxStacks: 2,
    desc: '모든 포탑의 건설 및 업그레이드 비용이 10% 할인됩니다. (최대 2중첩)',
    apply: (mods) => { mods.costMult = Math.max(0.78, mods.costMult - 0.10); }
  },
  {
    id: 'SUPERCONDUCT_AMP',
    name: '초전도 과충전 증폭기',
    rarity: 'RARE',
    rarityLabel: '골드 증강',
    icon: '🌩️',
    maxStacks: 2,
    desc: '초전도(빙결+테슬라) 반응 피해가 +45% 증가합니다. (최대 2중첩)',
    apply: (mods) => { mods.superconductMult += 0.45; }
  },
  {
    id: 'CRYO_SHATTER_CORE',
    name: '절대영도 열충격 탄두',
    rarity: 'RARE',
    rarityLabel: '골드 증강',
    icon: '❄️',
    maxStacks: 2,
    desc: '열충격 파쇄(빙결+박격포) 피해가 +45% 증가합니다. (최대 2중첩)',
    apply: (mods) => { mods.shatterMult += 0.45; }
  },
  {
    id: 'TESLA_CAPACITOR',
    name: '테슬라 다중 축전기',
    rarity: 'RARE',
    rarityLabel: '골드 증강',
    icon: '🔌',
    maxStacks: 2,
    desc: '모든 아크 테슬라 코일의 연쇄 번개 대상 수가 +1 증가합니다. (최대 2중첩)',
    apply: (mods) => { mods.bonusChains += 1; }
  },
  {
    id: 'WEAKPOINT_ALGO',
    name: '약점 포착 철갑탄',
    rarity: 'RARE',
    rarityLabel: '골드 증강',
    icon: '💥',
    maxStacks: 2,
    desc: '상태이상 적에게 중기관포 치명타 확률 +28% (2.0배 피해). (최대 2중첩)',
    apply: (mods) => { mods.pulseCritChance = Math.min(0.70, mods.pulseCritChance + 0.28); }
  },
  {
    id: 'CLUSTER_WARHEAD',
    name: '고폭 집속 포탄',
    rarity: 'RARE',
    rarityLabel: '골드 증강',
    icon: '☄️',
    maxStacks: 2,
    desc: '에테르 중박격포의 폭발 반경이 +20%, 피해량이 +16% 증가합니다. (최대 2중첩)',
    apply: (mods) => { mods.mortarSplashMult += 0.20; mods.mortarDamageMult += 0.16; }
  },
  {
    id: 'COMMANDER_OVERCLOCK',
    name: '사령관 전술 오버클럭',
    rarity: 'RARE',
    rarityLabel: '골드 증강',
    icon: '🛰️',
    maxStacks: 2,
    desc: '궤도 폭격·시간 정지·전술 과부하 쿨타임이 18% 단축됩니다. (최대 2중첩)',
    apply: (mods) => { mods.skillCooldownMult = Math.max(0.64, mods.skillCooldownMult - 0.18); }
  },
  {
    id: 'COMPOUND_INTEREST',
    name: '에테르 복리 보급고',
    rarity: 'LEGENDARY',
    rarityLabel: '프리즘 증강',
    icon: '👑',
    maxStacks: 1,
    desc: '매 웨이브 클리어 시 보유 에테르의 8%를 추가 이자로 획득합니다. (최대 +60, 1중첩)',
    apply: (mods) => { mods.interestRate = 0.08; }
  },
  {
    id: 'PERMAFROST_DOMAIN',
    name: '영구동토 절대결계',
    rarity: 'LEGENDARY',
    rarityLabel: '프리즘 증강',
    icon: '💠',
    maxStacks: 1,
    desc: '빙결 지속시간 +1.4초, 둔화율 +8%, 초당 동상 피해를 입힙니다. (1중첩)',
    apply: (mods) => { mods.cryoDurationBonus += 1.4; mods.cryoSlowBonus += 0.08; mods.frostbiteDps += 14; }
  },
  {
    id: 'ELEMENTAL_RESONANCE',
    name: '원소 공명 융합로',
    rarity: 'LEGENDARY',
    rarityLabel: '프리즘 증강',
    icon: '🌌',
    maxStacks: 1,
    desc: '원소 시너지 반응 발동 시 지휘관 스킬 쿨타임이 0.7초 감소합니다. (1중첩)',
    apply: (mods) => { mods.reactionCooldownRefund = 0.7; }
  }
];

window.AetherBastion.CONFIG = CONFIG;
window.AetherBastion.ROUTE_LABELS = ROUTE_LABELS;
window.AetherBastion.TARGET_LABELS = TARGET_LABELS;
window.AetherBastion.TOWER_DEFS = TOWER_DEFS;
window.AetherBastion.ENEMY_DEFS = ENEMY_DEFS;
window.AetherBastion.AUGMENT_POOL = AUGMENT_POOL;
