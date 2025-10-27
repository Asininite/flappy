# Flappy Clone

A lightweight, asset-free Flappy Bird–style game built with HTML5 Canvas and Web Audio. All visuals and sounds are procedurally drawn/synthesized.

Note: This project replicates gameplay mechanics but does not use original copyrighted art/audio or the trademarked name.

## Features

- Smooth fixed-timestep physics, tuned to feel similar to the classic
- Procedural pipes, ground, clouds; vector bird art
- Scoring with localStorage high score
- Synthesized sounds (flap, score, hit) with a mute toggle
- Responsive scaling and crisp pixel rendering
- Keyboard, mouse, and touch controls

## Controls

- Space / Click / Tap: Flap
- P: Pause
- M: Mute
- R: Restart (on Game Over)

## Run

Just open `index.html` in a modern browser.

Optional local server (any one of these):

```powershell
# Python (3.x)
python -m http.server 8000

# Node (http-server, if installed)
npx http-server -p 8000
```
Then visit http://localhost:8000

## Custom assets

You can skin the game with your own images and sounds. Place files in the `assets/` folder using these exact names:

- `assets/bird.png` — Bird sprite (transparent PNG), ~34×24 px suggested.
- `assets/tower.png` — Pipe body (transparent PNG), ~52×512 px suggested.
- `assets/flap.ogg` — Flap sound.
- `assets/hit.ogg` — Collision sound.
- `assets/score.ogg` — Score sound.

All files are optional. If a file is missing, the game falls back to built‑in vector art and synthesized sounds. See `assets/README.md` for more details.

## Customize feel

Adjust constants in `src/game.js` to tweak physics:
- `GRAVITY`, `FLAP_VELOCITY`, `MAX_DROP_SPEED` – bird motion
- `SCROLL_SPEED`, `PIPE_GAP_MIN/MAX`, `PIPE_SPAWN_INTERVAL` – level cadence

## License

MIT for code. Keep any derivative art/audio original.
