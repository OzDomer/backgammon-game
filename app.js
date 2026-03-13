'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────
const HUMAN = 'human';
const AI = 'ai';
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
  b[23] = 2;   // human 24-point
  b[12] = 5;   // human 13-point
  b[7] = 3;   // human 8-point
  b[5] = 5;   // human 6-point
  b[0] = -2;   // AI 24-point  (= human's 1-point)
  b[11] = -5;   // AI 13-point  (= human's 12-point)
  b[16] = -3;   // AI 8-point   (= human's 17-point)
  b[18] = -5;   // AI 6-point   (= human's 19-point)
  return b;
};

const createInitialState = () => ({
  board: buildInitialBoard(),
  bar: { human: 0, ai: 0 },
  off: { human: 0, ai: 0 },
  dice: [],
  usedDice: [],
  currentTurn: HUMAN,
  isGameOver: false,
  winner: null,
});

let state = createInitialState();
let dragState = null; // { fromIdx }

// ── DOM Helpers ───────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
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
const TOP_LEFT_POINTS = [13, 14, 15, 16, 17, 18];
const TOP_RIGHT_POINTS = [19, 20, 21, 22, 23, 24];
const BOTTOM_LEFT_POINTS = [12, 11, 10, 9, 8, 7];
const BOTTOM_RIGHT_POINTS = [6, 5, 4, 3, 2, 1];

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
  $('top-left').innerHTML = '';
  $('top-right').innerHTML = '';
  $('bottom-left').innerHTML = '';
  $('bottom-right').innerHTML = '';

  TOP_LEFT_POINTS.forEach(n => $('top-left').appendChild(buildPointEl(n, true)));
  TOP_RIGHT_POINTS.forEach(n => $('top-right').appendChild(buildPointEl(n, true)));
  BOTTOM_LEFT_POINTS.forEach(n => $('bottom-left').appendChild(buildPointEl(n, false)));
  BOTTOM_RIGHT_POINTS.forEach(n => $('bottom-right').appendChild(buildPointEl(n, false)));

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
    const count = Math.abs(val);
    const owner = val > 0 ? HUMAN : AI;
    const pointEl = document.querySelector(`.point[data-index="${idx}"]`);
    if (!pointEl) return;

    const isBottom = pointEl.classList.contains('point-bottom');
    const step = count > 5 ? 14 : 22;
    const visCount = Math.min(count, 5);
    const isDraggable = owner === HUMAN && state.currentTurn === HUMAN && state.dice.length > 0;

    Array.from({ length: visCount }).forEach((_, si) => {
      const chk = makeCheckerEl(owner);
      chk.style.position = 'absolute';
      chk.style.left = '50%';
      chk.style.transform = 'translateX(-50%)';
      chk.style.zIndex = si + 2;
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
        chk.addEventListener('dragend', onDragEnd);
      }
      pointEl.appendChild(chk);
    });
  });
};

const makeCheckerEl = owner => el('div', `checker ${owner}`);

const renderBar = () => {
  $('bar-top').innerHTML = '';
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
      chk.addEventListener('dragend', onDragEnd);
    }
    $('bar-bottom').appendChild(chk);
  });
};

const renderOffTrays = () => {
  $('tray-human').innerHTML = '';
  $('tray-ai').innerHTML = '';
  const miniStyle = chk => { chk.style.width = '26px'; chk.style.height = '26px'; chk.style.marginBottom = '-6px'; };
  Array.from({ length: state.off.human }).forEach(() => { const c = makeCheckerEl(HUMAN); miniStyle(c); $('tray-human').appendChild(c); });
  Array.from({ length: state.off.ai }).forEach(() => { const c = makeCheckerEl(AI); miniStyle(c); $('tray-ai').appendChild(c); });
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
  state.dice = rollDice();
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
  const moves = [];
  const dv = availableDice(s);
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
          const highestOccupied = [5, 4, 3, 2, 1, 0].find(p => s.board[p] > 0) ?? -1;
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

// ── AI Legal Move Engine (validation + random fallback) ───────────────────────
/*
  Works in AI-perspective space: aiBoard[i] > 0 = AI checker, < 0 = opponent.
  AI moves from index 0 → 23. diceValues is a plain int[] of remaining die values.
  Returned moves use the same board indices and are compatible with applyAIMove().
*/

const allAIHome = (aiBoard, aiBarActive) => {
  if (aiBarActive > 0) return false;
  return aiBoard.every((v, i) => i >= 18 || v <= 0);
};

const isOpenForAI = (aiBoard, toIdx) => toIdx >= 0 && toIdx <= 23 && aiBoard[toIdx] >= -1;

// Returns [{from, to, hit, diceIndex}] — diceIndex is 0-based into diceValues
const getLegalMovesAI = (aiBoard, aiBarActive, diceValues) => {
  const moves = [];
  const canBear = allAIHome(aiBoard, aiBarActive);
  const dv = diceValues.map((v, i) => ({ v, i }));

  const tryFrom = (fromIdx) => {
    dv.forEach(({ v, i }) => {
      const toIdx = fromIdx + v;
      if (canBear) {
        if (toIdx >= 24) {
          if (toIdx === 24) {
            // Exact bear-off
            moves.push({ from: fromIdx, to: BEAR_OFF_INDEX, hit: false, diceIndex: i });
          } else {
            // Overshoot — only legal from the lowest occupied home index (highest pip value)
            const lowestOccupied = [18, 19, 20, 21, 22, 23].find(p => aiBoard[p] > 0) ?? -1;
            if (fromIdx === lowestOccupied) moves.push({ from: fromIdx, to: BEAR_OFF_INDEX, hit: false, diceIndex: i });
          }
        } else if (isOpenForAI(aiBoard, toIdx)) {
          moves.push({ from: fromIdx, to: toIdx, hit: aiBoard[toIdx] === -1, diceIndex: i });
        }
      } else if (isOpenForAI(aiBoard, toIdx)) {
        moves.push({ from: fromIdx, to: toIdx, hit: aiBoard[toIdx] === -1, diceIndex: i });
      }
    });
  };

  if (aiBarActive > 0) {
    // Bar entry: die v → land at index v-1 (die 1 → idx 0, die 6 → idx 5)
    dv.forEach(({ v, i }) => {
      const toIdx = v - 1;
      if (isOpenForAI(aiBoard, toIdx)) moves.push({ from: -1, to: toIdx, hit: aiBoard[toIdx] === -1, diceIndex: i });
    });
  } else {
    aiBoard.forEach((val, fromIdx) => { if (val > 0) tryFrom(fromIdx); });
  }
  return moves;
};

// Greedily picks random legal moves, consuming max possible dice
const pickRandomAIMoves = (aiBoard, aiBarActive, diceValues) => {
  const board = [...aiBoard];
  let barActive = aiBarActive;
  let remaining = [...diceValues];
  const chosen = [];

  let keepGoing = true;
  while (keepGoing && remaining.length > 0) {
    const legal = getLegalMovesAI(board, barActive, remaining);
    if (legal.length === 0) { keepGoing = false; break; }
    const move = legal[Math.floor(Math.random() * legal.length)];
    chosen.push({ from: move.from, to: move.to, hit: move.hit });
    // Apply to simulation
    if (move.from === -1) { barActive--; } else { board[move.from]--; }
    if (move.to === BEAR_OFF_INDEX) {
      // nothing extra
    } else {
      if (board[move.to] === -1) board[move.to] = 0;
      board[move.to]++;
    }
    remaining = remaining.filter((_, i) => i !== move.diceIndex);
  }
  return chosen;
};

/*
  Validates the AI's proposed move sequence against five rules:
  1. Bar Priority       — must enter from bar before any other move
  2. Source Check       — AI checker must exist at 'from'
  3. Dice Consistency   — a remaining die must cover the move distance
  4. Destination Check  — 'to' must not be blocked by 2+ opponent checkers
  5. Bearing Off        — can only bear off when all checkers are home
  After all moves: Forced Exhaustion — if dice remain, no legal moves may exist.
*/
const validateAIMoveSequence = (aiBoard, aiBarActive, diceValues, moves) => {
  const board = [...aiBoard];
  let barActive = aiBarActive;
  let remaining = [...diceValues]; // consumed as we go
  const errors = [];

  if (!Array.isArray(moves)) return { isValid: false, errors: ['moves is not an array'] };

  // Empty move list is only valid if no legal moves exist
  if (moves.length === 0) {
    const possible = getLegalMovesAI(board, barActive, remaining);
    if (possible.length > 0) return { isValid: false, errors: ['Empty moves but legal moves exist'] };
    return { isValid: true, errors };
  }

  moves.forEach((move, mi) => {
    if (errors.length) return; // stop on first failure
    const { from, to } = move;
    const tag = `Move[${mi}] (${from}→${to})`;

    // ── 1. Bar Priority ──────────────────────────────────────────────────────
    if (barActive > 0 && from !== -1) {
      errors.push(`${tag}: bar priority violated — must enter from bar (barActive=${barActive})`);
      return;
    }

    // ── 2. Source Check ──────────────────────────────────────────────────────
    if (from === -1) {
      if (barActive <= 0) { errors.push(`${tag}: from=-1 but bar is empty`); return; }
    } else {
      if (from < 0 || from > 23 || board[from] <= 0) {
        errors.push(`${tag}: no AI checker at index ${from} (board[${from}]=${board[from]})`);
        return;
      }
    }

    // ── 3 & 4. Dice Consistency + Destination Check ──────────────────────────
    const canBear = allAIHome(board, barActive);
    let usedDieIdx = -1;

    if (to === BEAR_OFF_INDEX) {
      // ── 5. Bearing Off Validation ──────────────────────────────────────────
      if (!canBear) { errors.push(`${tag}: bear-off attempt but not all AI checkers are home`); return; }
      if (from === -1) { errors.push(`${tag}: cannot bear off from bar`); return; }
      const exactDie = 24 - from; // die needed for exact removal
      const lowestOccupied = [18, 19, 20, 21, 22, 23].find(p => board[p] > 0) ?? -1;
      // Accept exact die OR any larger die if from is the lowest occupied point
      const matchIdx = remaining.findIndex(v => v === exactDie || (v > exactDie && from === lowestOccupied));
      if (matchIdx === -1) { errors.push(`${tag}: no valid die for bearing off from index ${from}`); return; }
      usedDieIdx = matchIdx;
    } else if (from === -1) {
      // Bar entry: die must equal to + 1
      const needed = to + 1;
      const matchIdx = remaining.indexOf(needed);
      if (matchIdx === -1) { errors.push(`${tag}: no die value ${needed} for bar entry to index ${to}`); return; }
      // Destination check
      if (!isOpenForAI(board, to)) { errors.push(`${tag}: destination index ${to} is blocked`); return; }
      usedDieIdx = matchIdx;
    } else {
      // Normal move: die = to - from
      const needed = to - from;
      if (needed <= 0 || needed > 6) { errors.push(`${tag}: invalid distance ${needed}`); return; }
      const matchIdx = remaining.indexOf(needed);
      if (matchIdx === -1) { errors.push(`${tag}: no die value ${needed} available`); return; }
      if (!isOpenForAI(board, to)) { errors.push(`${tag}: destination index ${to} is blocked`); return; }
      usedDieIdx = matchIdx;
    }

    // ── Apply move to simulation ──────────────────────────────────────────────
    if (from === -1) { barActive--; } else { board[from]--; }
    if (to === BEAR_OFF_INDEX) {
      // bear-off — no board update needed
    } else {
      if (board[to] === -1) board[to] = 0; // hit
      board[to]++;
    }
    remaining = remaining.filter((_, i) => i !== usedDieIdx);
  });

  if (errors.length) return { isValid: false, errors };

  // ── Forced Move Exhaustion Check ─────────────────────────────────────────────
  if (remaining.length > 0) {
    const moreMoves = getLegalMovesAI(board, barActive, remaining);
    if (moreMoves.length > 0) {
      errors.push(`Unused dice [${remaining.join(',')}] remain but ${moreMoves.length} legal move(s) still exist`);
      return { isValid: false, errors };
    }
  }

  return { isValid: true, errors };
};

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
  state.dice = [];
  state.usedDice = [];
  state.currentTurn = AI;
  $('roll-btn').disabled = false;
  renderAll();
  setTimeout(doAITurn, 600);
};

// ── Win Check ─────────────────────────────────────────────────────────────────
const checkWin = (s, player) => player === HUMAN ? s.off.human === 15 : s.off.ai === 15;

// ── AI Turn ───────────────────────────────────────────────────────────────────
const MAX_AI_RETRIES = 3;

const doAITurn = async () => {
  const dice = rollDice();
  state.dice = dice;
  state.usedDice = [];
  renderDice();

  const aiBoard = state.board.map(v => -v);
  const aiBar = { active: state.bar.ai, opponent: state.bar.human };
  const aiOff = { active: state.off.ai, opponent: state.off.human };
  const boardJson = JSON.stringify({ board: aiBoard, dice, bar: aiBar, off: aiOff });

  let validMoves = null;
  let strategyText = '';
  let lastError = '';

  // Attempt up to MAX_AI_RETRIES times; on each retry pass the validation error back
  await Array.from({ length: MAX_AI_RETRIES }).reduce(
    (chain, _, attempt) => chain.then(async () => {
      if (validMoves !== null) return; // already succeeded
      try {
        const response = await callOpenAI(boardJson, attempt > 0 ? lastError : '');
        const parsed = parseAIResponse(response);
        const moves = parsed.moves || [];
        const { isValid, errors } = validateAIMoveSequence(aiBoard, aiBar.active, dice, moves);
        if (isValid) {
          validMoves = moves;
          strategyText = parsed.strategy_short || '';
        } else {
          lastError = errors.join(' | ');
          console.warn(`AI move validation failed (attempt ${attempt + 1}): ${lastError}`);
        }
      } catch (err) {
        lastError = err.message;
        console.error(`AI API/parse error (attempt ${attempt + 1}):`, err);
      }
    }),
    Promise.resolve()
  );

  // Fallback: generate random legal moves if all retries failed
  if (validMoves === null) {
    console.warn(`All ${MAX_AI_RETRIES} AI attempts failed — using random fallback`);
    validMoves = pickRandomAIMoves(aiBoard, aiBar.active, dice);
    strategyText = `(fallback after ${MAX_AI_RETRIES} failed attempts)`;
  }

  $('ai-strategy-text').textContent = strategyText;
  $('ai-strategy-box').classList.remove('hidden');

  try {
    await animateAIMoves(validMoves);
    if (checkWin(state, AI)) { state.isGameOver = true; state.winner = AI; }
  } catch (err) {
    console.error('Animation error:', err);
  }

  state.dice = [];
  state.usedDice = [];
  state.currentTurn = HUMAN;
  $('roll-btn').disabled = false;
  renderAll();
};

const callOpenAI = async (boardJson, errorContext = '') => {
  const systemPrompt = `Role: You are a professional Backgammon AI engine. Your goal is to analyze the board state and return the optimal legal move.

CRITICAL — Direction of Play:
YOU (the AI) always move checkers from LOWER indices toward HIGHER indices: 0 → 1 → 2 → ... → 23 → bear off (99).
A move from index 5 with die value 3 lands on index 8. A move from index 20 with die value 4 lands on index 24 which means bear off (99).
NEVER move backward (never decrease the index). Every "to" must be greater than "from" (or 99 for bear-off).

Starting Position Example (game start, your checkers are positive):
board: [-2,0,0,0,0,5, 0,3,0,0,0,-5, 5,0,0,0,-3,0,-5,0,0,0,0,2]
  - Your checkers (positive): 5 at index 5, 3 at index 7, 5 at index 12, 2 at index 23
  - Opponent checkers (negative): 2 at index 0, 5 at index 11, 3 at index 16, 5 at index 18
  - Your goal: move all your checkers from their current indices toward index 23, then bear off to 99.
  - Your home board for bearing off is indices 18–23.

Game Rules & Logic:
- Movement: Always increase the index. from=5, die=4 → to=9. from=21, die=3 → to=24 means bear off (use 99).
- Blocking: You cannot land on a point where the opponent has 2 or more checkers (values ≤ -2).
- Hitting: If you land on a point with exactly -1 (one opponent checker), it is hit and goes to the bar. Set "hit": true.
- The Bar: If bar.active > 0, your first move(s) must re-enter from the bar using from=-1, landing at indices 0–5 (die value maps to index: die 1 → index 0, die 2 → index 1, ..., die 6 → index 5).
- Bearing Off: You may only use to=99 when ALL your checkers (board + bar) are at indices 18–23. Exact removal: from + die = 24. Overshoot: die > (24 - from) is only legal from the lowest-indexed occupied point.
- Forced Moves: Use the maximum number of dice pips possible. With a standard roll, play both dice if legal. With doubles, play all four. If only one die can be played, play the larger one.

Board State Format (JSON sent by user):
- board: Array of 24 integers (index 0–23). Positive = your checkers. Negative = opponent. Valid move destinations: 0–23 or 99 (bear-off only).
- dice: Array of integers (2 for normal, 4 for doubles).
- bar: { active: your checkers on bar, opponent: their checkers on bar }
- off: { active: your checkers borne off, opponent: theirs }

Response Format: Return a JSON object ONLY. No markdown, no code fences, no explanation text.
- moves array length: 2 for normal roll, 4 for doubles, fewer only if legally blocked.
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
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: errorContext ? `${boardJson}\n\nYour previous response was rejected. Validation error: ${errorContext}\nPlease return a corrected legal move sequence.` : boardJson },
      ],
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  const content = data.choices[0].message.content;
  console.log('[AI response]', content);
  return content;
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
