const socket = io();
const $ = (id) => document.getElementById(id);

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

let schema = null;
let state = null;
let myWord = '';
let choices = [];
let phaseKey = '';
let myVotes = {};
const DIFFICULTY_LABELS = { easy: '🟢 Easy', medium: '🟡 Medium', hard: '🔴 Hard' };
let endAt = 0;

const me = () => state?.players.find((p) => p.id === socket.id);
const playerName = (id) => state?.players.find((p) => p.id === id)?.name ?? 'Someone';
const isHost = () => state?.hostId === socket.id;
const isDrawer = () => state?.drawerId === socket.id;

/* ---------- Join ---------- */

const nameInput = $('name-input');
const codeInput = $('code-input');
const roomParam = new URLSearchParams(location.search).get('room');
if (roomParam) codeInput.value = roomParam.toUpperCase();
try { nameInput.value = localStorage.getItem('scribble-name') ?? ''; } catch {}

function join(code) {
  const name = nameInput.value.trim();
  if (!name) {
    $('join-error').textContent = 'Pick a name first!';
    nameInput.focus();
    return;
  }
  try { localStorage.setItem('scribble-name', name); } catch {}
  socket.emit('join', { name, code }, (res) => {
    if (res.error) $('join-error').textContent = res.error;
    else history.replaceState(null, '', `?room=${res.code}`);
  });
}
$('create-btn').addEventListener('click', () => join(''));
$('join-btn').addEventListener('click', () => join(codeInput.value));
codeInput.addEventListener('keydown', (e) => e.key === 'Enter' && join(codeInput.value));
nameInput.addEventListener('keydown', (e) => e.key === 'Enter' && join(codeInput.value));

$('invite-btn').addEventListener('click', async () => {
  const url = `${location.origin}/?room=${state.code}`;
  try {
    await navigator.clipboard.writeText(url);
    addChat({ kind: 'system', text: `Invite link copied: ${url}` });
  } catch {
    prompt('Copy this invite link:', url);
  }
});

/* ---------- Socket events ---------- */

socket.on('schema', (s) => { schema = s; });
socket.on('choices', (c) => { choices = c; if (state) render(); });
socket.on('yourWord', (w) => { myWord = w; if (state) render(); });
socket.on('chat', (msg) => {
  addChat(msg);
  if (msg.kind === 'correct') ding();
});
socket.on('draw', (op) => { ops.push(op); applyOp(op); });
socket.on('canvas', (list) => { ops = list; redraw(); });
socket.on('requestSnapshot', (turn) => {
  const c = h('canvas', { width: 400, height: 300 });
  c.getContext('2d').drawImage(canvas, 0, 0, 400, 300);
  socket.emit('snapshot', { turn, image: c.toDataURL('image/jpeg', 0.75) });
});
socket.on('disconnect', () => addChat({ kind: 'system', text: 'Disconnected from server. Refresh the page to rejoin.' }));
socket.on('state', (s) => {
  state = s;
  $('join-screen').hidden = true;
  $('game-screen').hidden = false;
  render();
});

/* ---------- Rendering ---------- */

function render() {
  const key = `${state.phase}:${state.round}:${state.drawerId}`;
  if (key !== phaseKey) {
    phaseKey = key;
    myVotes = {};
    if (state.phase === 'choosing' || state.phase === 'lobby') {
      myWord = '';
      ops = [];
      redraw();
    }
    if (state.phase === 'drawing' && !isDrawer()) $('chat-input').focus();
  }
  endAt = Date.now() + state.timeLeft;
  renderTopbar();
  renderPlayers();
  renderStage();
  renderChatInput();
  updateCursor();
}

function renderTopbar() {
  const { phase, round, rounds, hint, word } = state;
  $('room-code').textContent = state.code;
  $('timer').hidden = phase === 'lobby' || phase === 'gameEnd';
  $('round-label').textContent =
    phase === 'lobby' ? 'Lobby' : phase === 'gameEnd' ? 'Game over' : phase === 'voting' ? 'Voting' : `Round ${Math.min(round, rounds)} of ${rounds}`;

  const wd = $('word-display');
  wd.replaceChildren();
  if (phase === 'choosing') {
    wd.append(h('span', { class: 'word-label' }, isDrawer() ? 'Pick a word to draw' : `${playerName(state.drawerId)} is choosing a word…`));
  } else if (phase === 'drawing') {
    if (myWord) {
      wd.append(h('span', { class: 'word-label' }, isDrawer() ? 'Draw this:' : 'You got it:'), h('span', { class: 'word-text' }, myWord));
    } else {
      wd.append(
        h('span', { class: 'word-label' }, 'Guess this:'),
        h('span', { class: 'hint' }, [...hint].map((ch) => h('span', { class: ch === ' ' ? 'gap' : 'ch' }, ch === ' ' ? '' : ch))),
        h('sup', {}, hint.replace(/\s/g, '').length),
      );
    }
    wd.append(h('span', { class: 'difficulty' }, DIFFICULTY_LABELS[state.difficulty]));
  } else if (phase === 'turnEnd') {
    wd.append(h('span', { class: 'word-label' }, 'The word was'), h('span', { class: 'word-text' }, word));
  } else if (phase === 'voting') {
    wd.append(h('span', { class: 'word-label' }, 'Vote on the drawings!'));
  }
}

function renderPlayers() {
  const list = $('player-list');
  const ranked = state.phase === 'lobby' ? state.players : [...state.players].sort((a, b) => b.score - a.score);
  list.replaceChildren(
    h('h3', {}, `Players (${state.players.length}/${state.settings.maxPlayers})`),
    ...ranked.map((p, i) => {
      const badges = [];
      if (p.id === state.hostId) badges.push('👑');
      if (p.id === state.drawerId && state.phase !== 'lobby') badges.push('✏️');
      if (state.voted.includes(p.id)) badges.push('✅');
      return h('div', { class: `player ${p.guessed ? 'guessed' : ''} ${p.id === socket.id ? 'me' : ''}` },
        state.phase === 'lobby' ? null : h('span', { class: 'rank' }, `#${i + 1}`),
        h('span', { class: 'avatar', style: `background:${p.color}` }, p.name[0].toUpperCase()),
        h('span', { class: 'pinfo' },
          h('span', { class: 'pname' }, p.name, p.id === socket.id ? ' (you)' : ''),
          h('span', { class: 'pscore' }, `${p.score} pts`),
        ),
        h('span', { class: 'badges' }, badges.join(' ')),
      );
    }),
  );
}

function renderStage() {
  const { phase } = state;
  const panelPhase = phase === 'lobby' || phase === 'voting' || phase === 'gameEnd';
  $('panel').hidden = !panelPhase;
  $('canvas-area').hidden = panelPhase;
  $('toolbar').hidden = !(phase === 'drawing' && isDrawer());
  if (phase === 'lobby') renderLobby();
  else if (phase === 'voting') renderVoting();
  else if (phase === 'gameEnd') renderGameEnd();
  else renderOverlay();
}

function renderChatInput() {
  const input = $('chat-input');
  if (state.phase === 'drawing' && (isDrawer() || me()?.guessed)) {
    input.placeholder = 'Chat with players who guessed...';
  } else if (state.phase === 'drawing') {
    input.placeholder = 'Type your guess here...';
  } else {
    input.placeholder = 'Chat...';
  }
}

/* ---------- Overlay (choosing / turn end) ---------- */

function renderOverlay() {
  const ov = $('overlay');
  const { phase } = state;
  ov.hidden = phase === 'drawing';
  ov.replaceChildren();

  if (phase === 'choosing') {
    if (isDrawer()) {
      ov.append(
        h('h2', {}, 'Choose a word'),
        h('div', { class: 'choices' }, choices.map((c, i) =>
          h('button', { class: `btn choice ${c.difficulty}`, onclick: () => socket.emit('choose', i) },
            h('span', {}, c.word),
            h('small', {}, `${DIFFICULTY_LABELS[c.difficulty]} · ${multiplierLabel(c.difficulty)}`)))),
      );
    } else {
      ov.append(h('h2', {}, `${playerName(state.drawerId)} is choosing a word…`));
    }
  } else if (phase === 'turnEnd') {
    const rows = [...state.players].sort((a, b) => b.turnPoints - a.turnPoints);
    ov.append(
      h('h2', {}, 'The word was ', h('span', { class: 'accent' }, state.word)),
      artistSummary(state.artistAward),
      h('div', { class: 'turn-results' }, rows.map((p) =>
        h('div', { class: 'turn-row' },
          h('span', {}, p.name),
          h('span', { class: p.turnPoints > 0 ? 'plus' : 'zero' }, p.turnPoints > 0 ? `+${p.turnPoints}` : '0')))),
    );
  }
}

function multiplierLabel(difficulty) {
  const pct = { easy: 100, medium: state.settings.mediumWordPercent, hard: state.settings.hardWordPercent }[difficulty];
  return `×${pct / 100} pts`;
}

function artistSummary(a) {
  if (!a) return '';
  const parts = [`speed +${a.speed}`, `${a.guessed}/${a.guessers} guessed +${a.share}`];
  if (a.bonus) parts.push(`everyone got it +${a.bonus}`);
  return h('p', { class: 'artist-summary' },
    `${playerName(state.drawerId)} (artist): `, parts.join(' · '),
    h('strong', {}, ` = +${a.speed + a.share + a.bonus}`));
}

/* ---------- Lobby panel ---------- */

let lobbyBuilt = false;
const settingInputs = {};

function buildLobby() {
  const panel = $('panel');
  panel.replaceChildren();
  const groups = {};
  for (const f of schema.fields) (groups[f.group] ??= []).push(f);

  const groupEls = Object.entries(groups).map(([group, fields]) =>
    h('fieldset', { class: 'setting-group' },
      h('legend', {}, group),
      fields.map((f) => {
        let input;
        let output = null;
        const sendSetting = debounce((value) => socket.emit('settings', { [f.key]: value }), 150);
        if (f.type === 'number') {
          output = h('output', {});
          input = h('input', { type: 'range', min: f.min, max: f.max, step: f.step });
          input.addEventListener('input', () => {
            output.textContent = input.value;
            sendSetting(Number(input.value));
          });
        } else if (f.type === 'boolean') {
          input = h('input', { type: 'checkbox' });
          input.addEventListener('change', () => socket.emit('settings', { [f.key]: input.checked }));
        } else {
          input = h('textarea', { rows: 3, maxlength: f.maxLength, placeholder: 'e.g. grandma, our dog Max, the office' });
          input.addEventListener('input', () => sendSetting(input.value));
        }
        settingInputs[f.key] = { field: f, input, output };
        return h('label', { class: `setting setting-${f.type}` },
          h('span', { class: 'setting-label' }, f.label, output),
          input,
          f.help ? h('small', {}, f.help) : null);
      }),
    ));

  panel.append(
    h('div', { class: 'lobby-head' },
      h('div', {},
        h('h2', {}, 'Room ', h('span', { class: 'accent' }, state.code)),
        h('p', { id: 'lobby-status' })),
      h('button', { id: 'start-btn', class: 'btn primary big', onclick: () => socket.emit('start') }, 'Start game'),
    ),
    h('div', { class: 'presets' },
      h('span', { class: 'presets-label' }, 'Scoring presets:'),
      schema.presets.map((p) =>
        h('button', { class: 'btn small preset', title: p.description, 'data-preset': p.id,
          onclick: () => socket.emit('settings', p.values) }, p.label))),
    h('div', { id: 'emphasis', class: 'emphasis' }),
    h('div', { class: 'settings-grid' }, groupEls),
  );
  lobbyBuilt = true;
}

function renderLobby() {
  if (!schema) return;
  if (!lobbyBuilt || !$('start-btn')) buildLobby();
  const host = isHost();
  const s = state.settings;

  for (const { field, input, output } of Object.values(settingInputs)) {
    input.disabled = !host;
    if (document.activeElement === input) continue;
    if (field.type === 'boolean') input.checked = s[field.key];
    else input.value = s[field.key];
    if (output) output.textContent = s[field.key];
  }
  for (const btn of document.querySelectorAll('.preset')) {
    btn.disabled = !host;
    const preset = schema.presets.find((p) => p.id === btn.dataset.preset);
    btn.classList.toggle('active', Object.entries(preset.values).every(([k, v]) => s[k] === v));
  }

  const enough = state.players.length >= 2;
  const startBtn = $('start-btn');
  startBtn.hidden = !host;
  startBtn.disabled = !enough;
  $('lobby-status').textContent = host
    ? enough ? 'Tweak the settings, then start when everyone is in.' : 'Invite at least one friend to start (use the Copy invite button).'
    : `Waiting for ${playerName(state.hostId)} to start the game…`;

  renderEmphasis(s);
}

function renderEmphasis(s) {
  const artistMax = s.drawerSpeedPoints + s.drawerSharePoints + s.drawerAllGuessedBonus;
  const guessMax = s.guessMaxPoints;
  const total = artistMax + guessMax;
  const pct = total ? Math.round((artistMax / total) * 100) : 50;
  $('emphasis').replaceChildren(
    h('div', { class: 'emphasis-labels' },
      h('span', {}, `🏃 Fastest guesser: up to ${guessMax} pts`),
      h('span', {}, `🎨 Artist: up to ${artistMax} pts`)),
    h('div', { class: 'emphasis-bar' },
      h('div', { class: 'emphasis-guess', style: `width:${100 - pct}%` }),
      h('div', { class: 'emphasis-draw', style: `width:${pct}%` })),
    h('small', {}, `Best case per turn: the artist gets ${pct}% of the points on offer when everyone guesses instantly.`),
  );
}

/* ---------- Voting panel ---------- */

function renderVoting() {
  lobbyBuilt = false;
  const { bestVote, worstVote, bestVotePoints, worstVotePoints } = state.settings;
  const vote = (kind, index) => {
    myVotes[kind] = index;
    socket.emit('vote', { kind, index });
    renderVoting();
  };
  const prompts = [];
  if (bestVote) prompts.push(`🏆 best drawing${bestVotePoints ? ` (+${bestVotePoints})` : ''}`);
  if (worstVote) prompts.push(`💩 worst drawing${worstVotePoints ? ` (−${worstVotePoints})` : ''}`);
  $('panel').replaceChildren(
    h('div', { class: 'lobby-head' },
      h('div', {},
        h('h2', {}, 'Vote!'),
        h('p', {}, `Pick the ${prompts.join(' and the ')}. ${state.voted.length}/${state.players.length} done.`))),
    h('div', { class: 'gallery' }, state.gallery.map((g, i) => {
      const own = g.drawerId === socket.id;
      return h('figure', { class: `${myVotes.best === i ? 'voted-best' : ''} ${myVotes.worst === i ? 'voted-worst' : ''}` },
        g.image ? h('img', { src: g.image, alt: g.word }) : h('div', { class: 'noimg' }, 'No image'),
        h('figcaption', {},
          h('strong', {}, g.word),
          h('span', {}, ` by ${g.drawerName}`),
          h('div', { class: 'vote-btns' },
            own ? h('small', {}, 'Your drawing') : [
              bestVote ? h('button', { class: `btn small ${myVotes.best === i ? 'active-best' : ''}`, onclick: () => vote('best', i) }, '🏆 Best') : null,
              worstVote ? h('button', { class: `btn small ${myVotes.worst === i ? 'active-worst' : ''}`, onclick: () => vote('worst', i) }, '💩 Worst') : null,
            ])));
    })),
  );
}

/* ---------- Game end panel ---------- */

function renderGameEnd() {
  lobbyBuilt = false;
  const panel = $('panel');
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  const medals = ['🥇', '🥈', '🥉'];
  const gallery = state.gallery ?? [];
  panel.replaceChildren(
    h('div', { class: 'lobby-head' },
      h('h2', {}, 'Game over!'),
      isHost()
        ? h('button', { class: 'btn primary big', onclick: () => socket.emit('lobby') }, 'Back to lobby')
        : h('p', {}, `Waiting for ${playerName(state.hostId)} to start a new game…`)),
    h('div', { class: 'podium' }, ranked.slice(0, 3).map((p, i) =>
      h('div', { class: `podium-spot place-${i + 1}` },
        h('div', { class: 'medal' }, medals[i]),
        h('span', { class: 'avatar big', style: `background:${p.color}` }, p.name[0].toUpperCase()),
        h('strong', {}, p.name),
        h('span', {}, `${p.score} pts`)))),
    ranked.length > 3
      ? h('ol', { class: 'rest', start: 4 }, ranked.slice(3).map((p) => h('li', {}, `${p.name} — ${p.score} pts`)))
      : '',
    gallery.length ? h('h3', {}, 'Gallery') : '',
    h('div', { class: 'gallery' }, gallery.map((g) =>
      h('figure', { class: `${g.best ? 'voted-best' : ''} ${g.worst ? 'voted-worst' : ''}` },
        g.image ? h('img', { src: g.image, alt: g.word }) : h('div', { class: 'noimg' }, 'No image'),
        h('figcaption', {},
          h('strong', {}, g.word),
          h('span', {}, ` by ${g.drawerName}`),
          g.best ? h('div', { class: 'award best' }, `🏆 Best drawing (${g.bestVotes} votes)`) : null,
          g.worst ? h('div', { class: 'award worst' }, `💩 Worst drawing (${g.worstVotes} votes)`) : null)))),
  );
}

/* ---------- Chat ---------- */

function addChat(msg) {
  const log = $('chat-log');
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  log.append(h('div', { class: `msg ${msg.kind}` },
    msg.name ? h('b', { style: `color:${msg.color}` }, `${msg.name}: `) : null,
    msg.text));
  while (log.children.length > 200) log.firstChild.remove();
  if (atBottom) log.scrollTop = log.scrollHeight;
}

$('chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('chat-input');
  if (input.value.trim()) socket.emit('chat', input.value);
  input.value = '';
});

/* ---------- Timer ---------- */

setInterval(() => {
  if (!state) return;
  const t = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
  const el = $('timer');
  el.textContent = t;
  el.classList.toggle('urgent', state.phase === 'drawing' && t <= 10);
}, 200);

/* ---------- Canvas ---------- */

const canvas = $('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const W = canvas.width;
const H = canvas.height;
let ops = [];

function redraw() {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  for (const op of ops) applyOp(op);
}

function applyOp(op) {
  if (op.t === 'fill') floodFill(op.p[0], op.p[1], op.c);
  else drawStroke(op);
}

function drawStroke({ c, s, p }) {
  ctx.strokeStyle = c;
  ctx.fillStyle = c;
  ctx.lineWidth = s;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (p.length === 2) {
    ctx.arc(p[0], p[1], s / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
  ctx.stroke();
}

function floodFill(x0, y0, hex) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  if (x0 < 0 || y0 < 0 || x0 >= W || y0 >= H) return;
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const fr = parseInt(hex.slice(1, 3), 16);
  const fg = parseInt(hex.slice(3, 5), 16);
  const fb = parseInt(hex.slice(5, 7), 16);
  const start = (y0 * W + x0) * 4;
  const tr = d[start], tg = d[start + 1], tb = d[start + 2];
  if (tr === fr && tg === fg && tb === fb) return;
  // Tolerance swallows the antialiased edge pixels around strokes.
  const TOL = 60;
  const matches = (p) => {
    const i = p * 4;
    return Math.abs(d[i] - tr) <= TOL && Math.abs(d[i + 1] - tg) <= TOL && Math.abs(d[i + 2] - tb) <= TOL;
  };
  const seen = new Uint8Array(W * H);
  const stack = [[x0, y0]];
  while (stack.length) {
    let [x, y] = stack.pop();
    let p = y * W + x;
    while (x >= 0 && !seen[p] && matches(p)) { x--; p--; }
    x++; p++;
    let up = false;
    let down = false;
    while (x < W && !seen[p] && matches(p)) {
      seen[p] = 1;
      d[p * 4] = fr; d[p * 4 + 1] = fg; d[p * 4 + 2] = fb; d[p * 4 + 3] = 255;
      if (y > 0) {
        const q = p - W;
        if (!seen[q] && matches(q)) { if (!up) { stack.push([x, y - 1]); up = true; } } else up = false;
      }
      if (y < H - 1) {
        const q = p + W;
        if (!seen[q] && matches(q)) { if (!down) { stack.push([x, y + 1]); down = true; } } else down = false;
      }
      x++; p++;
    }
  }
  ctx.putImageData(img, 0, 0);
}

redraw();

/* ---------- Drawing input (artist only) ---------- */

const COLORS = ['#000000', '#4b5563', '#9ca3af', '#ffffff', '#7f1d1d', '#dc2626', '#f97316', '#facc15', '#fde68a',
  '#166534', '#22c55e', '#86efac', '#1e3a8a', '#3b82f6', '#7dd3fc', '#581c87', '#a855f7', '#f9a8d4', '#ec4899', '#78350f', '#d97706'];
const SIZES = [3, 8, 16, 32];
let tool = 'pen';
let color = '#000000';
let size = 8;
let stroke = null;
let sidSeq = Date.now();

$('colors').append(...COLORS.map((c) => h('button', {
  class: `swatch ${c === color ? 'active' : ''}`, style: `background:${c}`, title: c,
  onclick: (e) => {
    color = c;
    if (tool === 'eraser') selectTool('pen');
    updateCursor();
    document.querySelectorAll('.swatch').forEach((s) => s.classList.remove('active'));
    e.currentTarget.classList.add('active');
  },
})));
$('sizes').append(...SIZES.map((s) => h('button', {
  class: `size ${s === size ? 'active' : ''}`, title: `${s}px`,
  onclick: (e) => {
    size = s;
    updateCursor();
    document.querySelectorAll('.size').forEach((b) => b.classList.remove('active'));
    e.currentTarget.classList.add('active');
  },
}, h('span', { style: `width:${Math.max(4, s * 0.75)}px;height:${Math.max(4, s * 0.75)}px` }))));

function selectTool(t) {
  tool = t;
  updateCursor();
  document.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
}
document.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => selectTool(b.dataset.tool)));
$('undo-btn').addEventListener('click', () => socket.emit('undo'));
$('clear-btn').addEventListener('click', () => socket.emit('clear'));

const canDraw = () => state?.phase === 'drawing' && isDrawer();

function toCanvas(e) {
  const r = canvas.getBoundingClientRect();
  return [Math.round(((e.clientX - r.left) * W) / r.width), Math.round(((e.clientY - r.top) * H) / r.height)];
}

function sendOp(op) {
  ops.push(op);
  socket.emit('draw', op);
}

canvas.addEventListener('pointerdown', (e) => {
  if (!canDraw() || e.button !== 0) return;
  e.preventDefault();
  const [x, y] = toCanvas(e);
  if (tool === 'fill') {
    const op = { sid: ++sidSeq, t: 'fill', c: color, s: 1, p: [x, y] };
    applyOp(op);
    sendOp(op);
    return;
  }
  canvas.setPointerCapture(e.pointerId);
  stroke = { sid: ++sidSeq, c: tool === 'eraser' ? '#ffffff' : color, s: size, pts: [x, y], sent: 0 };
  drawStroke({ c: stroke.c, s: stroke.s, p: [x, y] });
});

canvas.addEventListener('pointermove', (e) => {
  if (!stroke) return;
  if (!canDraw()) { stroke = null; return; }
  const [x, y] = toCanvas(e);
  const n = stroke.pts.length;
  const lx = stroke.pts[n - 2];
  const ly = stroke.pts[n - 1];
  if (x === lx && y === ly) return;
  stroke.pts.push(x, y);
  drawStroke({ c: stroke.c, s: stroke.s, p: [lx, ly, x, y] });
});

// Strokes stream in batches; each batch repeats the previous batch's last point so segments connect.
function flushStroke() {
  if (!stroke) return;
  const unsent = stroke.pts.length - stroke.sent;
  if (unsent < (stroke.sent === 0 ? 2 : 4)) return;
  sendOp({ sid: stroke.sid, t: 'stroke', c: stroke.c, s: stroke.s, p: stroke.pts.slice(stroke.sent) });
  stroke.sent = stroke.pts.length - 2;
}
setInterval(flushStroke, 40);

function endStroke() {
  if (!stroke) return;
  flushStroke();
  stroke = null;
}
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);

/* ---------- Correct-guess cue ---------- */

let audio = null;
function ding() {
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, t + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.35);
      osc.connect(gain).connect(audio.destination);
      osc.start(t + i * 0.1);
      osc.stop(t + i * 0.1 + 0.35);
    });
  } catch {}
}

/* ---------- Cursor picker ---------- */

const svgCursor = (svg, x, y) => `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${x} ${y}, crosshair`;
const emojiCursor = (emoji, x, y) =>
  svgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><text y="26" font-size="26">${emoji}</text></svg>`, x, y);

const CURSORS = {
  crosshair: { label: '➕ Crosshair', css: () => 'crosshair' },
  preview: {
    label: '⚪ Brush outline',
    css: () => {
      if (tool === 'fill') return emojiCursor('🪣', 4, 24);
      const d = Math.min(120, Math.max(4, Math.round((size * canvas.clientWidth) / W)));
      const r = d / 2 + 2;
      const fill = tool === 'eraser' ? '#ffffff' : color;
      return svgCursor(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${r * 2}" height="${r * 2}"><circle cx="${r}" cy="${r}" r="${d / 2}" fill="${fill}" fill-opacity="0.5" stroke="#000" stroke-width="1"/><circle cx="${r}" cy="${r}" r="${d / 2 + 1}" fill="none" stroke="#fff" stroke-width="1"/></svg>`,
        r, r);
    },
  },
  pencil: { label: '✏️ Pencil', css: () => emojiCursor('✏️', 2, 28) },
  brush: { label: '🖌️ Paintbrush', css: () => emojiCursor('🖌️', 2, 28) },
  finger: { label: '👆 Finger', css: () => emojiCursor('👆', 10, 2) },
  wand: { label: '🪄 Magic wand', css: () => emojiCursor('🪄', 2, 28) },
};
let cursorChoice = 'crosshair';
try { if (CURSORS[localStorage.getItem('scribble-cursor')]) cursorChoice = localStorage.getItem('scribble-cursor'); } catch {}

const cursorSelect = $('cursor-select');
cursorSelect.append(...Object.entries(CURSORS).map(([k, c]) => h('option', { value: k }, c.label)));
cursorSelect.value = cursorChoice;
cursorSelect.addEventListener('change', () => {
  cursorChoice = cursorSelect.value;
  try { localStorage.setItem('scribble-cursor', cursorChoice); } catch {}
  updateCursor();
});

function updateCursor() {
  canvas.style.cursor = canDraw() ? CURSORS[cursorChoice].css() : '';
}
addEventListener('resize', updateCursor);

/* ---------- Util ---------- */

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
