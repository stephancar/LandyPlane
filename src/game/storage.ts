const KEY = 'landyplane.v2';

export interface SaveData {
  /** keyed by `${levelId}@${aircraftId}` */
  bestScores: Record<string, number>;
  muted: boolean;
  invertPitch: boolean;
  aircraft: string;
}

const DEFAULTS: SaveData = { bestScores: {}, muted: false, invertPitch: false, aircraft: 'c172' };

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
      aircraft: parsed.aircraft ?? 'c172',
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

export function scoreKey(levelId: string, aircraftId: string): string {
  return `${levelId}@${aircraftId}`;
}

export function recordScore(levelId: string, aircraftId: string, score: number): SaveData {
  const data = load();
  const key = scoreKey(levelId, aircraftId);
  if ((data.bestScores[key] ?? -1) < score) {
    data.bestScores[key] = score;
    save(data);
  }
  return data;
}

/** Progression is per aircraft: beat a level with the plane you fly next. */
export function isUnlocked(levelIndex: number, levelIds: string[], aircraftId: string, data: SaveData): boolean {
  if (levelIndex === 0) return true;
  const prev = levelIds[levelIndex - 1];
  return (data.bestScores[scoreKey(prev, aircraftId)] ?? 0) >= 50;
}
