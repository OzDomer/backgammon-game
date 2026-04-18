# Backgammon vs GPT

A browser-based backgammon game where you play against GPT-4.1. Originally a prompt engineering course assignment, this project turned into a deep dive on **how to reliably integrate an LLM into a deterministic system** — one that has to follow strict rules, pick legal moves, and play strategically.

Built with vanilla JavaScript, HTML, and CSS — no frameworks, no build step.

## Live demo

> ⚠️ **Requires your own OpenAI API key.** You'll be prompted for it when the page loads. [Get one here](https://platform.openai.com/api-keys). Your key is kept in memory only and never leaves your browser except to call the OpenAI API directly.

**[Play here](https://backgammon-game-ozdomers-projects.vercel.app/)**

## Screenshot

<img width="1893" height="892" alt="Screenshot_2026-04-18-125436" src="https://github.com/user-attachments/assets/6a42ef0f-317e-4a81-a12f-898c621bb989" />


## The engineering story

This project is, at its core, a study in the gap between what LLMs *sound* like they can do and what they *actually* do reliably. The full prompt log — every iteration, dead end, and breakthrough — lives in [`prompts.md`](./prompts.md). Below are the three moments that changed how I think about working with LLMs.

### 1. Stopping the AI from cheating

**Problem:** Early versions let the AI generate its own moves from the board state. It constantly produced illegal moves — wrong direction, landing on blocked points, bearing off when it shouldn't — no matter how carefully I wrote the prompt.

**Approach:** I stopped trusting the AI with rule validation. Instead, I wrote an algorithm that computes every legal move combination for the current board and dice, then hands that list to the AI and asks it to *choose* one.

**Result:** Illegal moves became impossible by construction. The AI is now a strategist, not a rule interpreter. A fallback retry loop catches the rare cases where the model picks something outside the list.

### 2. Making the AI actually think

**Problem:** Even with legal-moves-as-constraints, the AI's strategic play felt shallow. It would pick moves that were technically legal but tactically weak.

**Approach:** I restructured the JSON response schema to force a chain-of-thought flow — `board_analysis` → `threats_analysis` → `opportunities_analysis` → `full_reasoning_explanation` → `moves`. Because LLMs generate tokens left-to-right, putting reasoning fields *before* the committed move means the model thinks out loud before answering.

**Result:** Noticeably sharper play. The model reasons about primes, blots, and escape routes before picking a move, and the logged reasoning is readable enough to verify.

### 3. The sign convention trap

**Problem:** Even with chain-of-thought, the AI's board analysis was sometimes confused — it would describe the opponent's checkers as its own and vice versa. The game engine used negative integers for the AI's checkers (an arbitrary internal convention) and the AI had to mentally invert that with every turn.

**Approach:** I flipped the signs with a one-line `.map()` right before sending the board to the API. From the AI's perspective, *its* checkers are now the natural positive values.

**Result:** The confused analyses vanished. Same model, same prompt — just less cognitive load. A reminder that prompt engineering isn't only about wording; the data you send matters just as much.

## Tech stack

Vanilla JavaScript, HTML, CSS. OpenAI API (GPT-4.1). Deployed on Vercel.

## Key architectural decisions

- **Legal moves computed in code, chosen by AI.** Rule validation is deterministic; strategy is delegated to the LLM.
- **Chain-of-thought response schema.** The AI is forced to analyze the board before committing to moves.
- **Sign-flip adapter at the API boundary.** The game engine uses one convention internally; the AI receives the one it reasons about most clearly.
- **Retry-with-context on rejected moves.** If the AI's chosen move somehow doesn't match a legal combination, the rejection reason is fed back into the next call. This rejection loop runs 3 times then defaults to the first legal move from the predetermined ones.

## Run locally

Clone the repo, open `index.html` in a browser, and paste your OpenAI API key when prompted. No build step, no dependencies.

```bash
git clone https://github.com/OzDomer/backgammon-game.git
cd backgammon-game
# open index.html in your browser (or use a local server like `npx serve`)
```

## Development log

This project was built through iterative AI-assisted development. The full evolution of the prompts, decisions, and debugging process is documented in [`prompts.md`](./prompts.md).
