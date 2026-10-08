export interface Settings {
  maxPlayers: number;
  rounds: number;
  drawTime: number;
  chooseTime: number;
  wordChoices: number;
  hints: number;
  guessMaxPoints: number;
  guessMinPoints: number;
  drawerSpeedPoints: number;
  drawerSharePoints: number;
  drawerAllGuessedBonus: number;
  customWords: string;
  customWordsOnly: boolean;
  mediumWordPercent: number;
  hardWordPercent: number;
  bestVote: boolean;
  bestVotePoints: number;
  worstVote: boolean;
  worstVotePoints: number;
}

type KeysOfType<T> = { [K in keyof Settings]: Settings[K] extends T ? K : never }[keyof Settings];

interface FieldBase {
  label: string;
  group: string;
  help?: string;
}

export type SettingField =
  | (FieldBase & { type: 'number'; key: KeysOfType<number>; min: number; max: number; step: number })
  | (FieldBase & { type: 'boolean'; key: KeysOfType<boolean> })
  | (FieldBase & { type: 'text'; key: KeysOfType<string>; maxLength: number });

export const SETTING_FIELDS: SettingField[] = [
  { type: 'number', key: 'rounds', label: 'Rounds', group: 'Game', min: 1, max: 10, step: 1 },
  { type: 'number', key: 'drawTime', label: 'Draw time (seconds)', group: 'Game', min: 30, max: 240, step: 10 },
  { type: 'number', key: 'chooseTime', label: 'Word pick time (seconds)', group: 'Game', min: 5, max: 30, step: 1 },
  { type: 'number', key: 'wordChoices', label: 'Word choices', group: 'Game', min: 1, max: 5, step: 1 },
  { type: 'number', key: 'hints', label: 'Letter hints', group: 'Game', min: 0, max: 5, step: 1 },
  { type: 'number', key: 'maxPlayers', label: 'Max players', group: 'Game', min: 2, max: 16, step: 1 },

  {
    type: 'number', key: 'drawerSpeedPoints', label: 'Speed points', group: 'Artist scoring', min: 0, max: 500, step: 10,
    help: 'Full amount if every player guesses instantly. Scales with how fast each player guesses.',
  },
  {
    type: 'number', key: 'drawerSharePoints', label: 'Players-guessed points', group: 'Artist scoring', min: 0, max: 500, step: 10,
    help: 'Multiplied by the share of players who guess (3 of 4 guessed = 75%).',
  },
  {
    type: 'number', key: 'drawerAllGuessedBonus', label: 'Everyone-guessed bonus', group: 'Artist scoring', min: 0, max: 500, step: 10,
    help: 'Extra points when every player gets it.',
  },

  {
    type: 'number', key: 'guessMaxPoints', label: 'Instant guess points', group: 'Guesser scoring', min: 0, max: 500, step: 10,
    help: 'Points for guessing the moment drawing starts. Decays over time.',
  },
  { type: 'number', key: 'guessMinPoints', label: 'Last-second guess points', group: 'Guesser scoring', min: 0, max: 500, step: 5 },

  {
    type: 'text', key: 'customWords', label: 'Custom words', group: 'Words', maxLength: 5000,
    help: 'Comma or newline separated.',
  },
  { type: 'boolean', key: 'customWordsOnly', label: 'Use custom words only', group: 'Words', help: 'Custom words count as medium.' },
  {
    type: 'number', key: 'mediumWordPercent', label: 'Medium word points %', group: 'Words', min: 100, max: 300, step: 5,
    help: 'Multiplies guesser and artist points. Easy words are 100%.',
  },
  { type: 'number', key: 'hardWordPercent', label: 'Hard word points %', group: 'Words', min: 100, max: 300, step: 5 },

  { type: 'boolean', key: 'bestVote', label: 'Vote for best drawing', group: 'End-of-game voting' },
  {
    type: 'number', key: 'bestVotePoints', label: 'Best drawing points', group: 'End-of-game voting', min: 0, max: 500, step: 10,
    help: 'Added to the winning artist. 0 = bragging rights only.',
  },
  { type: 'boolean', key: 'worstVote', label: 'Vote for worst drawing', group: 'End-of-game voting' },
  {
    type: 'number', key: 'worstVotePoints', label: 'Worst drawing penalty', group: 'End-of-game voting', min: 0, max: 500, step: 10,
    help: 'Subtracted from the losing artist. 0 = just for laughs.',
  },
];

export const PRESETS: { id: string; label: string; description: string; values: Partial<Settings> }[] = [
  {
    id: 'classic',
    label: 'Guesser Focus',
    description: 'Fast guessers win; artists earn a little.',
    values: { guessMaxPoints: 150, guessMinPoints: 30, drawerSpeedPoints: 60, drawerSharePoints: 40, drawerAllGuessedBonus: 0 },
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Artists and guessers can earn about the same per turn.',
    values: { guessMaxPoints: 100, guessMinPoints: 20, drawerSpeedPoints: 120, drawerSharePoints: 80, drawerAllGuessedBonus: 50 },
  },
  {
    id: 'artist',
    label: 'Artist Spotlight',
    description: 'Clear, fast-to-guess drawings win games.',
    values: { guessMaxPoints: 60, guessMinPoints: 10, drawerSpeedPoints: 250, drawerSharePoints: 150, drawerAllGuessedBonus: 100 },
  },
];

export const DEFAULT_SETTINGS: Settings = {
  maxPlayers: 10,
  rounds: 3,
  drawTime: 80,
  chooseTime: 15,
  wordChoices: 3,
  hints: 2,
  guessMaxPoints: 60,
  guessMinPoints: 10,
  drawerSpeedPoints: 250,
  drawerSharePoints: 150,
  drawerAllGuessedBonus: 100,
  customWords: '',
  customWordsOnly: false,
  mediumWordPercent: 125,
  hardWordPercent: 150,
  bestVote: true,
  bestVotePoints: 100,
  worstVote: false,
  worstVotePoints: 50,
};

export function sanitizeSettings(input: Record<string, unknown>, base: Settings): Settings {
  const out: Settings = { ...base };
  for (const f of SETTING_FIELDS) {
    const v = input[f.key];
    if (f.type === 'number') {
      const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
      if (Number.isFinite(n)) out[f.key] = Math.min(f.max, Math.max(f.min, Math.round(n)));
    } else if (f.type === 'boolean') {
      if (typeof v === 'boolean') out[f.key] = v;
    } else if (typeof v === 'string') {
      out[f.key] = v.slice(0, f.maxLength);
    }
  }
  if (out.guessMinPoints > out.guessMaxPoints) out.guessMinPoints = out.guessMaxPoints;
  return out;
}
