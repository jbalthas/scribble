import type { Server, Socket } from 'socket.io';
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from './settings';
import { DEFAULT_WORDS } from './words';

export type Phase = 'lobby' | 'choosing' | 'drawing' | 'turnEnd' | 'gameEnd';

interface Player {
  id: string;
  name: string;
  color: string;
  score: number;
  guessed: boolean;
  // Share of draw time left when they guessed (1 = instantly, 0 = not guessed).
  guessSpeed: number;
  turnPoints: number;
}

export interface DrawOp {
  sid: number;
  t: 'stroke' | 'fill';
  c: string;
  s: number;
  p: number[];
}

interface GalleryEntry {
  turn: number;
  drawerId: string;
  drawerName: string;
  word: string;
  image: string | null;
}

interface ArtistAward {
  guessed: number;
  guessers: number;
  speed: number;
  share: number;
  bonus: number;
}

const AVATAR_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#a16207', '#64748b'];
const TURN_END_MS = 6000;
const MAX_OPS = 30000;
const MAX_IMAGE_LENGTH = 400_000;

const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');

function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

function isValidOp(op: unknown): op is DrawOp {
  if (typeof op !== 'object' || op === null) return false;
  const o = op as Record<string, unknown>;
  return (
    (o.t === 'stroke' || o.t === 'fill') &&
    typeof o.sid === 'number' && Number.isFinite(o.sid) &&
    typeof o.c === 'string' && /^#[0-9a-f]{6}$/i.test(o.c) &&
    typeof o.s === 'number' && o.s >= 1 && o.s <= 80 &&
    Array.isArray(o.p) && o.p.length >= 2 && o.p.length <= 2000 && o.p.length % 2 === 0 &&
    o.p.every((n) => typeof n === 'number' && n >= -100 && n <= 900)
  );
}

export class Room {
  players: Player[] = [];
  private hostId = '';
  private settings: Settings = { ...DEFAULT_SETTINGS };
  private phase: Phase = 'lobby';
  private round = 0;
  private drawQueue: string[] = [];
  private drawerId = '';
  private word = '';
  private choices: string[] = [];
  private revealed = new Set<number>();
  private ops: DrawOp[] = [];
  private artistAward: ArtistAward | null = null;
  private gallery: GalleryEntry[] = [];
  private currentEntry: GalleryEntry | null = null;
  private usedWords = new Set<string>();
  private phaseEndsAt = 0;
  private timers: NodeJS.Timeout[] = [];
  private colorIndex = 0;

  constructor(readonly code: string, private io: Server) {}

  join(socket: Socket, rawName: string): boolean {
    if (this.players.length >= this.settings.maxPlayers) return false;
    const name = rawName.replace(/\s+/g, ' ').trim().slice(0, 20) || `Player ${this.colorIndex + 1}`;
    this.players.push({
      id: socket.id,
      name,
      color: AVATAR_COLORS[this.colorIndex++ % AVATAR_COLORS.length],
      score: 0,
      guessed: false,
      guessSpeed: 0,
      turnPoints: 0,
    });
    if (!this.hostId) this.hostId = socket.id;
    socket.join(this.code);
    this.system(`${name} joined the room`);
    this.broadcastState();
    if (this.phase === 'drawing' || this.phase === 'turnEnd') socket.emit('canvas', this.ops);
    return true;
  }

  leave(id: string): void {
    const idx = this.players.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const [p] = this.players.splice(idx, 1);
    if (this.players.length === 0) {
      this.clearTimers();
      return;
    }
    this.system(`${p.name} left the room`);
    if (this.hostId === id) {
      this.hostId = this.players[0].id;
      this.system(`${this.players[0].name} is now the host`);
    }
    const inGame = this.phase !== 'lobby' && this.phase !== 'gameEnd';
    if (inGame && this.players.length < 2) {
      this.system('Not enough players — back to the lobby');
      this.toLobby();
      return;
    }
    if (id === this.drawerId && this.phase === 'choosing') {
      this.nextTurn();
      return;
    }
    if (id === this.drawerId && this.phase === 'drawing') {
      this.system('The artist left');
      this.endDrawing();
      return;
    }
    if (this.phase === 'drawing' && this.checkAllGuessed()) return;
    this.broadcastState();
  }

  updateSettings(id: string, input: unknown): void {
    if (id !== this.hostId || this.phase !== 'lobby' || typeof input !== 'object' || input === null) return;
    this.settings = sanitizeSettings(input as Record<string, unknown>, this.settings);
    this.broadcastState();
  }

  start(id: string): void {
    if (id !== this.hostId || this.phase !== 'lobby' || this.players.length < 2) return;
    for (const p of this.players) p.score = 0;
    this.round = 0;
    this.gallery = [];
    this.usedWords.clear();
    this.system('Game started!');
    this.nextRound();
  }

  backToLobby(id: string): void {
    if (id === this.hostId && this.phase === 'gameEnd') this.toLobby();
  }

  chooseWord(id: string, index: unknown): void {
    if (this.phase !== 'choosing' || id !== this.drawerId) return;
    const i = typeof index === 'number' ? index : 0;
    this.word = this.choices[i] ?? this.choices[0];
    this.startDrawing();
  }

  draw(id: string, op: unknown): void {
    if (this.phase !== 'drawing' || id !== this.drawerId || !isValidOp(op) || this.ops.length >= MAX_OPS) return;
    const clean: DrawOp = { sid: op.sid, t: op.t, c: op.c, s: op.s, p: op.p };
    this.ops.push(clean);
    this.io.to(this.code).except(id).emit('draw', clean);
  }

  undo(id: string): void {
    if (this.phase !== 'drawing' || id !== this.drawerId || this.ops.length === 0) return;
    const lastSid = this.ops[this.ops.length - 1].sid;
    this.ops = this.ops.filter((op) => op.sid !== lastSid);
    this.io.to(this.code).emit('canvas', this.ops);
  }

  clear(id: string): void {
    if (this.phase !== 'drawing' || id !== this.drawerId) return;
    this.ops = [];
    this.io.to(this.code).emit('canvas', this.ops);
  }

  chat(id: string, raw: unknown): void {
    const p = this.player(id);
    if (!p || typeof raw !== 'string') return;
    const text = raw.trim().slice(0, 100);
    if (!text) return;

    if (this.phase === 'drawing') {
      if (id === this.drawerId || p.guessed) {
        for (const q of this.players) {
          if (q.id === this.drawerId || q.guessed) {
            this.io.to(q.id).emit('chat', { kind: 'insider', name: p.name, color: p.color, text });
          }
        }
        return;
      }
      const guess = normalize(text);
      const answer = normalize(this.word);
      if (guess === answer) {
        this.correctGuess(p);
        return;
      }
      this.io.to(this.code).emit('chat', { kind: 'normal', name: p.name, color: p.color, text });
      if (levenshtein(guess, answer) === 1) this.io.to(id).emit('chat', { kind: 'close', text: `'${text}' is close!` });
      return;
    }
    this.io.to(this.code).emit('chat', { kind: 'normal', name: p.name, color: p.color, text });
  }

  snapshot(id: string, data: unknown): void {
    if (typeof data !== 'object' || data === null) return;
    const { turn, image } = data as Record<string, unknown>;
    if (typeof image !== 'string' || !image.startsWith('data:image/jpeg;base64,') || image.length > MAX_IMAGE_LENGTH) return;
    const entry = this.gallery.find((e) => e.turn === turn && e.drawerId === id);
    if (entry) entry.image = image;
  }

  private nextRound(): void {
    this.round++;
    if (this.round > this.settings.rounds) {
      this.endGame();
      return;
    }
    this.drawQueue = this.players.map((p) => p.id);
    this.nextTurn();
  }

  private nextTurn(): void {
    while (this.drawQueue.length > 0) {
      const id = this.drawQueue.shift()!;
      if (this.player(id)) {
        this.startChoosing(id);
        return;
      }
    }
    this.nextRound();
  }

  private startChoosing(drawerId: string): void {
    this.clearTimers();
    this.phase = 'choosing';
    this.drawerId = drawerId;
    this.word = '';
    this.ops = [];
    this.revealed.clear();
    this.artistAward = null;
    this.currentEntry = null;
    for (const p of this.players) {
      p.guessed = false;
      p.guessSpeed = 0;
      p.turnPoints = 0;
    }
    this.choices = this.pickWords(this.settings.wordChoices);
    this.setPhaseTimer(this.settings.chooseTime * 1000, () =>
      this.chooseWord(drawerId, Math.floor(Math.random() * this.choices.length)),
    );
    this.io.to(drawerId).emit('choices', this.choices);
    this.broadcastState();
  }

  private startDrawing(): void {
    this.clearTimers();
    this.phase = 'drawing';
    this.usedWords.add(normalize(this.word));
    this.currentEntry = {
      turn: this.gallery.length + 1,
      drawerId: this.drawerId,
      drawerName: this.player(this.drawerId)?.name ?? '?',
      word: this.word,
      image: null,
    };
    this.gallery.push(this.currentEntry);

    const drawMs = this.settings.drawTime * 1000;
    this.setPhaseTimer(drawMs, () => this.endDrawing());

    const letterIndexes = [...this.word].flatMap((ch, i) => (/[\s-]/.test(ch) ? [] : [i]));
    const hintCount = Math.min(this.settings.hints, Math.floor(letterIndexes.length / 2));
    for (let i = 1; i <= hintCount; i++) {
      this.timers.push(
        setTimeout(() => {
          const hidden = letterIndexes.filter((idx) => !this.revealed.has(idx));
          this.revealed.add(hidden[Math.floor(Math.random() * hidden.length)]);
          this.broadcastState();
        }, (drawMs * i) / (hintCount + 1)),
      );
    }

    this.io.to(this.drawerId).emit('yourWord', this.word);
    this.broadcastState();
  }

  private correctGuess(p: Player): void {
    const { guessMaxPoints, guessMinPoints, drawTime } = this.settings;
    const remaining = Math.max(0, this.phaseEndsAt - Date.now()) / (drawTime * 1000);
    const points = Math.round(guessMinPoints + (guessMaxPoints - guessMinPoints) * remaining);
    p.score += points;
    p.turnPoints += points;
    p.guessed = true;
    p.guessSpeed = remaining;
    this.io.to(this.code).emit('chat', { kind: 'correct', text: `${p.name} guessed the word! (+${points})` });
    this.io.to(p.id).emit('yourWord', this.word);
    if (!this.checkAllGuessed()) this.broadcastState();
  }

  private checkAllGuessed(): boolean {
    const guessers = this.players.filter((p) => p.id !== this.drawerId);
    if (guessers.length === 0 || !guessers.every((p) => p.guessed)) return false;
    this.endDrawing();
    return true;
  }

  private endDrawing(): void {
    this.clearTimers();
    const drawer = this.player(this.drawerId);
    if (drawer && this.currentEntry) {
      this.io.to(this.drawerId).emit('requestSnapshot', this.currentEntry.turn);
      this.awardArtist(drawer);
    }
    this.phase = 'turnEnd';
    this.setPhaseTimer(TURN_END_MS, () => this.nextTurn());
    this.broadcastState();
  }

  // Artist max per turn = speed + share + bonus, independent of player count.
  private awardArtist(drawer: Player): void {
    const guessers = this.players.filter((p) => p.id !== this.drawerId);
    if (guessers.length === 0) return;
    const guessed = guessers.filter((p) => p.guessed).length;
    const { drawerSpeedPoints, drawerSharePoints, drawerAllGuessedBonus } = this.settings;
    const avgSpeed = guessers.reduce((sum, p) => sum + p.guessSpeed, 0) / guessers.length;
    const award: ArtistAward = {
      guessed,
      guessers: guessers.length,
      speed: Math.round(drawerSpeedPoints * avgSpeed),
      share: Math.round((drawerSharePoints * guessed) / guessers.length),
      bonus: guessed === guessers.length ? drawerAllGuessedBonus : 0,
    };
    const total = award.speed + award.share + award.bonus;
    drawer.score += total;
    drawer.turnPoints += total;
    this.artistAward = award;
  }

  private endGame(): void {
    this.clearTimers();
    this.phase = 'gameEnd';
    this.drawerId = '';
    this.broadcastState();
  }

  private toLobby(): void {
    this.clearTimers();
    this.phase = 'lobby';
    this.drawerId = '';
    this.word = '';
    this.ops = [];
    this.currentEntry = null;
    for (const p of this.players) {
      p.guessed = false;
      p.guessSpeed = 0;
      p.turnPoints = 0;
    }
    this.broadcastState();
  }

  private pickWords(n: number): string[] {
    const custom = [...new Set(this.settings.customWords.split(/[,\n]/).map((w) => w.trim().slice(0, 40)).filter(Boolean))];
    let pool = this.settings.customWordsOnly && custom.length >= n ? custom : [...DEFAULT_WORDS, ...custom];
    const fresh = pool.filter((w) => !this.usedWords.has(normalize(w)));
    if (fresh.length >= n) pool = fresh;
    else this.usedWords.clear();
    const picked: string[] = [];
    const remaining = [...pool];
    while (picked.length < n && remaining.length > 0) {
      picked.push(remaining.splice(Math.floor(Math.random() * remaining.length), 1)[0]);
    }
    return picked;
  }

  private mask(): string {
    return [...this.word].map((ch, i) => (/[\s-]/.test(ch) || this.revealed.has(i) ? ch : '_')).join('');
  }

  private player(id: string): Player | undefined {
    return this.players.find((p) => p.id === id);
  }

  private setPhaseTimer(ms: number, fn: () => void): void {
    this.phaseEndsAt = Date.now() + ms;
    this.timers.push(setTimeout(fn, ms));
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.phaseEndsAt = 0;
  }

  private system(text: string): void {
    this.io.to(this.code).emit('chat', { kind: 'system', text });
  }

  private broadcastState(): void {
    const wordRevealed = this.phase === 'turnEnd';
    this.io.to(this.code).emit('state', {
      code: this.code,
      hostId: this.hostId,
      phase: this.phase,
      round: this.round,
      rounds: this.settings.rounds,
      drawerId: this.drawerId,
      hint: this.phase === 'drawing' ? this.mask() : '',
      word: wordRevealed ? this.word : '',
      timeLeft: this.phaseEndsAt ? Math.max(0, this.phaseEndsAt - Date.now()) : 0,
      settings: this.settings,
      players: this.players,
      artistAward: this.phase === 'turnEnd' ? this.artistAward : null,
      gallery:
        this.phase === 'gameEnd'
          ? this.gallery.map((e) => ({ drawerName: e.drawerName, word: e.word, image: e.image }))
          : null,
    });
  }
}
