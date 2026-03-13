'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────
const HUMAN = 'human';
const AI    = 'ai';
const BEAR_OFF_INDEX = 99;
const MODEL = 'gpt-4o-mini';
const DIE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

// ── State ─────────────────────────────────────────────────────────────────────
let apiKey = '';

/*
  board[i] > 0  → human checkers (count)
  board[i] < 0  → AI checkers (negative count)
  board[i] = 0  → empty

  Human moves from index 23 → 0 → bear off (99)  (counterclockwise, top-right → bottom-right)
  AI    moves from index  0 → 23 → bear off (99)  (clockwise)

  Standard starting layout (indices 0–23 = points 1–24):
    Human: b[23]=2, b[12]=5, b[7]=3, b[5]=5
    AI:    b[0]=-2, b[11]=-5, b[16]=-3, b[18]=-5
*/
const buildInitialBoard = () => {
  const b = Array(24).fill(0);
  b[23] =  2;   // human 24-point
  b[12] =  5;   // human 13-point
  b[7]  =  3;   // human 8-point
  b[5]  =  5;   // human 6-point
  b[0]  = -2;   // AI 24-point  (= human's 1-point)
  b[11] = -5;   // AI 13-point  (= human's 12-point)
  b[16] = -3;   // AI 8-point   (= human's 17-point)
  b[18] = -5;   // AI 6-point   (= human's 19-point)
  return b;
};

const createInitialState = () => ({
  board:       buildInitialBoard(),
  bar:         { human: 0, ai: 0 },
  off:         { human: 0, ai: 0 },
  dice:        [],
  usedDice:    [],
  currentTurn: HUMAN,
  isGameOver:  false,
  winner:      null,
});

let state    = createInitialState();
let dragState = null; // { fromIdx }

// ── DOM Helpers ───────────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };

// ── API Key Setup ─────────────────────────────────────────────────────────────
const initApiModal = () => {
  $('api-key-submit').addEventListener('click', () => {
    const val = $('api-key-input').value.trim();
    if (!val) return;
    apiKey = val;
    $('api-modal').classList.add('hidden');
    $('app').classList.remove('hidden');
    initBoard();
    renderAll();
  });
  $('api-key-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('api-key-submit').click(); });
};

// ── Board DOM Construction ────────────────────────────────────────────────────
/*
  Visual layout (looking at standard board):
  Top row L→R:  points 13–18 | bar | 19–24   (indices 12–17 | bar | 18–23)
  Bottom row L→R: points 12–7 | bar | 6–1    (indices 11–6  | bar |  5–0)
  Human home = bottom-right (points 1–6, indices 0–5)
  AI home    = top-right    (points 19–24, indices 18–23)
*/
const TOP_LEFT_POINTS     = [13,14,15,16,17,18];
const TOP_RIGHT_POINTS    = [19,20,21,22,23,24];
const BOTTOM_LEFT_POINTS  = [12,11,10,9,8,7];
const BOTTOM_RIGHT_POINTS = [6,5,4,3,2,1];

const buildPointEl = (pointNum, isTop) => {
  const idx = pointNum - 1;
  const div = el('div', `point ${isTop ? 'point-top' : 'point-bottom'} ${pointNum % 2 === 0 ? 'point-even' : 'point-odd'}`);
  div.dataset.index = idx;
  const numLabel = el('span', 'point-num');
  numLabel.textContent = pointNum;
  div.appendChild(numLabel);
  return div;
};

const initBoard = () => {
  $('top-left').innerHTML    = '';
  $('top-right').innerHTML   = '';
  $('bottom-left').innerHTML = '';
  $('bottom-right').innerHTML= '';

  TOP_LEFT_POINTS.forEach(n    => $('top-left').appendChild(buildPointEl(n, true)));
  TOP_RIGHT_POINTS.forEach(n   => $('top-right').appendChild(buildPointEl(n, true)));
  BOTTOM_LEFT_POINTS.forEach(n => $('bottom-left').appendChild(buildPointEl(n, false)));
  BOTTOM_RIGHT_POINTS.forEach(n=> $('bottom-right').appendChild(buildPointEl(n, false)));

  setupDropTargets();
};

// ── Rendering ─────────────────────────────────────────────────────────────────
const renderAll = () => {
  renderBoard();
  renderBar();
  renderOffTrays();
  renderDice();
  renderTurnIndicator();
};

const renderBoard = () => {
  // Clear checker elements from all points
  document.querySelectorAll('.point').forEach(p => {
    Array.from(p.querySelectorAll('.checker')).forEach(c => c.remove());
  });

  state.board.forEach((val, idx) => {
    if (val === 0) return;
    const count  = Math.abs(val);
    const owner  = val > 0 ? HUMAN : AI;
    const pointEl = document.querySelector(`.point[data-index="${idx}"]`);
    if (!pointEl) return;

    const isBottom = pointEl.classList.contains('point-bottom');
    const step = count > 5 ? 14 : 22;
    const visCount = Math.min(count, 5);
    const isDraggable = owner === HUMAN && state.currentTurn === HUMAN && state.dice.length > 0;

    Array.from({ length: visCount }).forEach((_, si) => {
      const chk = makeCheckerEl(owner);
      chk.style.position  = 'absolute';
      chk.style.left      = '50%';
      chk.style.transform = 'translateX(-50%)';
      chk.style.zIndex    = si + 2;
      if (isBottom) {
        chk.style.bottom = `${4 + si * step}px`;
      } else {
        chk.style.top = `${4 + si * step}px`;
      }
      if (si === 0 && count > 1) {
        const badge = el('span', 'checker-count');
        badge.textContent = count;
        chk.appendChild(badge);
      }
      if (isDraggable) {
        chk.draggable = true;
        chk.addEventListener('dragstart', onDragStart.bind(null, idx));
        chk.addEventListener('dragend',   onDragEnd);
      }
      pointEl.appendChild(chk);
    });
  });
};

const makeCheckerEl = owner => el('div', `checker ${owner}`);

const renderBar = () => {
  $('bar-top').innerHTML    = '';
  $('bar-bottom').innerHTML = '';

  // AI on bar → top section
  Array.from({ length: state.bar.ai }).forEach(() => $('bar-top').appendChild(makeCheckerEl(AI)));

  // Human on bar → bottom section
  const isDraggable = state.currentTurn === HUMAN && state.dice.length > 0;
  Array.from({ length: state.bar.human }).forEach(() => {
    const chk = makeCheckerEl(HUMAN);
    if (isDraggable) {
      chk.draggable = true;
      chk.addEventListener('dragstart', onDragStart.bind(null, -1));
      chk.addEventListener('dragend',   onDragEnd);
    }
    $('bar-bottom').appendChild(chk);
  });
};

const renderOffTrays = () => {
  $('tray-human').innerHTML = '';
  $('tray-ai').innerHTML    = '';
  const miniStyle = chk => { chk.style.width='26px'; chk.style.height='26px'; chk.style.marginBottom='-6px'; };
  Array.from({ length: state.off.human }).forEach(() => { const c=makeCheckerEl(HUMAN); miniStyle(c); $('tray-human').appendChild(c); });
  Array.from({ length: state.off.ai    }).forEach(() => { const c=makeCheckerEl(AI);    miniStyle(c); $('tray-ai').appendChild(c); });
};

const renderDice = () => {
  $('dice-area').innerHTML = '';
  state.dice.forEach((val, i) => {
    const d = el('div', `die${state.usedDice.includes(i) ? ' used' : ''}`);
    d.textContent = DIE_FACES[val] || val;
    $('dice-area').appendChild(d);
  });
};

const renderTurnIndicator = () => {
  const ind = $('turn-indicator');
  if (state.isGameOver) {
    ind.textContent = `Game Over! ${state.winner === HUMAN ? 'You win' : 'AI wins'}!`;
    return;
  }
  if (state.currentTurn === HUMAN) {
    if (state.dice.length === 0) {
      ind.textContent = 'Your turn — Roll the dice';
    } else {
      const rem = state.dice.filter((_, i) => !state.usedDice.includes(i)).length;
      ind.textContent = `Your turn — ${rem} move${rem !== 1 ? 's' : ''} remaining`;
    }
  } else {
    ind.textContent = 'AI is thinking…';
  }
};

// ── Dice Rolling ──────────────────────────────────────────────────────────────
const rollDice = () => {
  const roll = () => Math.floor(Math.random() * 6) + 1;
  const d1 = roll(), d2 = roll();
  return d1 === d2 ? [d1, d2, d1, d2] : [d1, d2];
};

$('roll-btn').addEventListener('click', () => {
  if (state.currentTurn !== HUMAN || state.dice.length > 0 || state.isGameOver) return;
  state.dice     = rollDice();
  state.usedDice = [];
  $('roll-btn').disabled = true;
  renderAll();
  if (!hasAnyLegalMove(state, HUMAN)) {
    setTimeout(() => { alert('No legal moves. Turn passes to AI.'); endHumanTurn(); }, 300);
  }
});

// ── Legal Moves for Human ─────────────────────────────────────────────────────
const availableDice = s => s.dice.map((v, i) => ({ v, i })).filter(({ i }) => !s.usedDice.includes(i));

// Can human land on toIdx?
const isOpenForHuman = (board, toIdx) => toIdx >= 0 && toIdx <= 23 && board[toIdx] >= -1;

// Are all human checkers in home (indices 0–5)?
const allHumanHome = s => {
  if (s.bar.human > 0) return false;
  return s.board.every((v, i) => i <= 5 || v <= 0);
};

// Returns [{from, to, diceIndex}] for all legal human moves
const getLegalMovesHuman = s => {
  const moves   = [];
  const dv      = availableDice(s);
  const canBear = allHumanHome(s);

  const addMoveIfLegal = (fromIdx, v, di) => {
    const toIdx = fromIdx - v; // human moves toward 0

    if (canBear) {
      if (toIdx < 0) {
        // Bearing off: exact or overshoot
        if (toIdx === -1) {
          // Exact roll — always legal
          moves.push({ from: fromIdx, to: BEAR_OFF_INDEX, diceIndex: di });
        } else {
          // Overshoot — legal only if no checker on a higher point
          const highestOccupied = [5,4,3,2,1,0].find(p => s.board[p] > 0) ?? -1;
          if (fromIdx === highestOccupied) moves.push({ from: fromIdx, to: BEAR_OFF_INDEX, diceIndex: di });
        }
      } else if (isOpenForHuman(s.board, toIdx)) {
        moves.push({ from: fromIdx, to: toIdx, diceIndex: di });
      }
    } else {
      if (toIdx >= 0 && isOpenForHuman(s.board, toIdx)) {
        moves.push({ from: fromIdx, to: toIdx, diceIndex: di });
      }
    }
  };

  if (s.bar.human > 0) {
    // Must enter from bar — human enters AI's home board (indices 18–23)
    dv.forEach(({ v, i }) => {
      const toIdx = 24 - v; // die 1 → idx 23, die 6 → idx 18
      if (isOpenForHuman(s.board, toIdx)) moves.push({ from: -1, to: toIdx, diceIndex: i });
    });
  } else {
    s.board.forEach((val, idx) => {
      if (val > 0) dv.forEach(({ v, i }) => addMoveIfLegal(idx, v, i));
    });
  }
  return moves;
};

const hasAnyLegalMove = (s, player) => player === HUMAN ? getLegalMovesHuman(s).length > 0 : true;

// ── Drag & Drop ───────────────────────────────────────────────────────────────
const onDragStart = (fromIdx, e) => {
  dragState = { fromIdx };
  e.currentTarget.classList.add('dragging');
  highlightLegal(fromIdx);
};

const onDragEnd = e => {
  e.currentTarget.classList.remove('dragging');
  clearHighlights();
  dragState = null;
};

const highlightLegal = fromIdx => {
  const targets = new Set(getLegalMovesHuman(state).filter(m => m.from === fromIdx).map(m => m.to));
  targets.forEach(toIdx => {
    if (toIdx === BEAR_OFF_INDEX) {
      $('bear-off-human').classList.add('legal-target');
    } else {
      const pt = document.querySelector(`.point[data-index="${toIdx}"]`);
      if (pt) pt.classList.add('legal-target');
    }
  });
};

const clearHighlights = () => document.querySelectorAll('.legal-target').forEach(e => e.classList.remove('legal-target'));

const setupDropTargets = () => {
  document.querySelectorAll('.point').forEach(pt => {
    pt.addEventListener('dragover', e => e.preventDefault());
    pt.addEventListener('drop', e => {
      e.preventDefault();
      if (!dragState) return;
      handleHumanDrop(dragState.fromIdx, parseInt(pt.dataset.index));
    });
  });
  $('bear-off-human').addEventListener('dragover', e => e.preventDefault());
  $('bear-off-human').addEventListener('drop', e => {
    e.preventDefault();
    if (!dragState) return;
    handleHumanDrop(dragState.fromIdx, BEAR_OFF_INDEX);
  });
};

// ── Apply Human Move ──────────────────────────────────────────────────────────
const handleHumanDrop = (fromIdx, toIdx) => {
  const legal = getLegalMovesHuman(state).filter(m => m.from === fromIdx && m.to === toIdx);
  if (legal.length === 0) return;
  // Pick move using smallest die (natural choice); both dice give same destination when equal
  const move = legal.slice().sort((a, b) => state.dice[a.diceIndex] - state.dice[b.diceIndex])[0];
  applyHumanMove(move);
  clearHighlights();
  renderAll();
  if (checkWin(state, HUMAN)) { state.isGameOver = true; state.winner = HUMAN; renderAll(); return; }
  const remaining = state.dice.filter((_, i) => !state.usedDice.includes(i)).length;
  if (remaining === 0 || !hasAnyLegalMove(state, HUMAN)) setTimeout(endHumanTurn, 400);
};

const applyHumanMove = ({ from, to, diceIndex }) => {
  if (from === -1) {
    state.bar.human--;
  } else {
    state.board[from]--;
  }
  if (to === BEAR_OFF_INDEX) {
    state.off.human++;
  } else {
    if (state.board[to] === -1) { state.board[to] = 0; state.bar.ai++; }
    state.board[to]++;
  }
  state.usedDice = [...state.usedDice, diceIndex];
};

const endHumanTurn = () => {
  state.dice       = [];
  state.usedDice   = [];
  state.currentTurn = AI;
  $('roll-btn').disabled = false;
  renderAll();
  setTimeout(doAITurn, 600);
};

// ── Win Check ─────────────────────────────────────────────────────────────────
const checkWin = (s, player) => player === HUMAN ? s.off.human === 15 : s.off.ai === 15;

// ── AI Turn ───────────────────────────────────────────────────────────────────
const doAITurn = async () => {
  const dice = rollDice();
  state.dice     = dice;
  state.usedDice = [];
  renderDice();

  /*
    AI perspective board: same indices (0–23), but flip signs.
    AI checkers are negative in our board → positive in AI board.
    AI moves from index 0 → 23 (same direction as our array).
  */
  const aiBoard = state.board.map(v => -v);
  const aiBar   = { active: state.bar.ai, opponent: state.bar.human };
  const aiOff   = { active: state.off.ai, opponent: state.off.human };

  try {
    const response = await callOpenAI(JSON.stringify({ board: aiBoard, dice, bar: aiBar, off: aiOff }));
    const parsed   = parseAIResponse(response);
    $('ai-strategy-text').textContent = parsed.strategy_short || '';
    $('ai-strategy-box').classList.remove('hidden');
    await animateAIMoves(parsed.moves || []);
    if (checkWin(state, AI)) { state.isGameOver = true; state.winner = AI; }
  } catch (err) {
    console.error('AI move error:', err);
    $('ai-strategy-text').textContent = 'AI error: ' + err.message;
    $('ai-strategy-box').classList.remove('hidden');
  }

  state.dice        = [];
  state.usedDice    = [];
  state.currentTurn = HUMAN;
  $('roll-btn').disabled = false;
  renderAll();
};

const callOpenAI = async boardJson => {
  const systemPrompt = `Role: You are a professional Backgammon AI engine. Your goal is to analyze the board state and return the optimal legal move.
Game Rules & Logic:
- Movement: You always move checkers from lower indices toward higher indices (0 → 23 → 99).
- Blocking: You cannot land on a point occupied by 2 or more opponent checkers (negative integers).
- Hitting: If you land on a point with exactly -1, the opponent's checker is moved to their bar. You must set "hit": true in your response.
- The Bar: If your bar.active is > 0, you must move those checkers back onto the board (entering at indices 0–5) before moving any other checkers.
- Bearing Off: You may only move checkers to index 99 if all your remaining checkers are located between indices 18 and 23.
- Forced Moves: You must use the maximum number of dice pips possible. If you can only use one die, you must use the larger one.
Board State Format: The user will provide a JSON object:
- board: Array of 24 integers. Positive integers are your checkers. Negative integers are your opponent's.
- dice: Array of 2 integers representing the roll.
- bar: Object with active (your checkers on bar) and opponent (theirs).
- off: Object with active (your checkers removed) and opponent (theirs).
Response Format: Return a JSON object only. No conversational text, no markdown code blocks.
- Variable Move Count: 2 moves for standard rolls, 4 for doubles. If blocked, return only the possible legal moves (0–4).
- Special Indices: Use -1 for from when entering from the bar. Use 99 for to when bearing off. Use 0–23 for board points.
JSON Schema:
{
  "move_notation": "string",
  "moves": [{"from": integer, "to": integer, "hit": boolean}],
  "strategy_short": "string"
}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: boardJson }],
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
};

const parseAIResponse = raw => JSON.parse(raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim());

// ── Apply AI Move ─────────────────────────────────────────────────────────────
/*
  AI sends moves in the same index space as our board (no reversal needed since AI perspective
  uses the same indices — AI moves from low→high which is our 0→23 direction).
  AI checkers are stored as negative values in state.board.
*/
const applyAIMove = ({ from, to, hit }) => {
  if (from === -1) {
    state.bar.ai--;
  } else {
    state.board[from]++;  // remove one AI checker (less negative)
    if (state.board[from] > 0) state.board[from] = 0; // safety clamp
  }
  if (to === BEAR_OFF_INDEX) {
    state.off.ai++;
  } else {
    if (hit) { state.board[to] = 0; state.bar.human++; }
    state.board[to]--;  // add one AI checker (more negative)
  }
};

const animateAIMoves = async moves =>
  moves.reduce(
    (chain, move) => chain.then(async () => {
      applyAIMove(move);
      renderAll();
      await new Promise(r => setTimeout(r, 650));
    }),
    Promise.resolve()
  );

// ── Init ──────────────────────────────────────────────────────────────────────
initApiModal();
