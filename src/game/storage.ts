const KEY = 'landyplane.v2';

export interface SaveData {
  bestScores: Record<string, number>;
  muted: boolean;
  invertPitch: boolean;
}

const DEFAULTS: SaveData = { bestScores: {}, muted: false, invertPitch: false };

function hasStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export function load(): SaveData {
  if (!hasStorage()) return { ...DEFAULTS, bestScores: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS, bestScores: {} };
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      bestScores: parsed.bestScores ?? {},
      muted: parsed.muted ?? false,
      invertPitch: parsed.invertPitch ?? false,
    };
  } catch {
    return { ...DEFAULTS, bestScores: {} };
  }
}

export function save(data: SaveData): void {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage full/blocked — non-fatal
  }
}

export function recordScore(levelId: string, score: number): SaveData {
  const data = load();
  if ((data.bestScores[levelId] ?? -1) < score) {
    data.bestScores[levelId] = score;
    save(data);
  }
  return data;
}

export function isUnlocked(levelIndex: number, levelIds: string[], data: SaveData): boolean {
  if (levelIndex === 0) return true;
  const prev = levelIds[levelIndex - 1];
  return (data.bestScores[prev] ?? 0) >= 50;
}
