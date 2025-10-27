# Custom Assets

Drop your images and sounds here to skin the game. All files are optional. If a file is missing, the game falls back to built‑in vector art and synthesized sounds.

Expected filenames (place in this folder):

Images:
- bird.png — The bird sprite (transparent PNG). Recommended ~34×24 px facing right. The game rotates it for pitch.
- tower.png — The pipe body (transparent PNG). Recommended 52×512 px (or any tall image). It will be vertically stretched for top/bottom segments.

Audio:
- flap.ogg — Flap sound
- hit.ogg — Collision sound
- score.ogg — Point scored sound

Notes:
- File formats: .png for images, .ogg for audio (you can also try .mp3 by changing filenames to flap.mp3, etc., but .ogg is preferred for size/quality). The game currently looks for the exact .ogg names above.
- Dimensions don’t need to be exact; the game scales as needed. Keep approximate aspect ratios for best results.
- If you’re opening index.html directly from the file system, most browsers will still load local images and audio. Running a tiny local server is recommended for consistent behavior.
