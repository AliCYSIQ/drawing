# Drawing Practice

A Windows desktop app for timed reference drawing, drawing from memory, review, challenges and a PureRef-style float mode. Everything stays on your computer.

## Use it

- **Install:** run `release/Drawing Practice Setup 0.1.0.exe` (build it with `npm run build:win`). The installer isn't signed, so Windows SmartScreen will warn once; choose "More info", then "Run anyway".
- **Library:** add a folder, single images, a public Pinterest board link, or a collection you fill by dragging or pasting images from your browser. Pinterest images are downloaded, so practice works offline.
- **Practice modes:**
  - **Classic:** the same time for every pose.
  - **Class:** blocks of poses that get longer.
  - **Relaxed:** no timer.
  - **Memory:** study the reference, it hides, you draw it from memory, then reveal it and mark the differences in red. Then draw it again.
- **Options:**
  - shuffle, fresh images first (ones you haven't drawn in the last 7 days), favorites only
  - rest between pictures (seconds or minutes), and a longer break between class blocks
  - review afterwards, and capture of your Clip Studio canvas at the end of each pose
- **During a session:** space pauses, ← and → move between poses, R restarts the pose, F flips, G turns it grey, Esc ends. Settings can hide the clock (the progress line stays) and add soft ticks in the last 3 seconds.
- **Review:** each reference again, next to your captured drawing (side by side or overlay) or a photo of your paper page. Tag mistakes, write a note, and flag poses to redo. The practice screen reminds you of your most common recent mistakes.
- **Float mode (borderless, on top):** the float button in a session or the image viewer, or `Ctrl+Alt+F` from anywhere.
  - Options: keep on top, opacity, lock and click-through.
  - `Ctrl+Alt+L` turns click-through off.
  - Double-click the image or press X to leave float mode.
- **Challenges:** speed, volume and class ladders, or build your own levels. Finishing a level opens the next one.
- **Stats:** a heatmap of practice per day, streaks, totals and history.

Your data lives in `%APPDATA%\drawing-practice\data` (Settings → Open data folder). Settings can also save a backup zip.

## Develop

```bash
npm install
npm run dev          # run the app with hot reload
npm test             # unit tests (timer, memory loop, scheduling, stats, challenges, Pinterest parsing)
npm run test:e2e     # builds, then drives the real app with Playwright
npm run build:win    # Windows installer in release/
```

- Optional live check of Pinterest: `PINTEREST_LIVE=<board url> npx playwright test pinterest-live`
- Screenshots of every screen: `SCREENSHOTS=<folder> npx playwright test screenshots`

**Stack:** Electron, React, TypeScript, Tailwind, Zustand, electron-vite.

**Code layout:**
- `src/main`: windows, float mode, hotkeys, capture, Pinterest, storage.
- `src/preload`: the bridge between the app's screens and the rest of Electron.
- `src/renderer`: the screens. The timer engines (`lib/sessionEngine.ts`, `lib/memoryEngine.ts`) are pure functions with tests.

**Pinterest:** there's no free official API for reading boards. `src/main/pinterest.ts` reads what Pinterest's own web page loads. If Pinterest changes that, this file and its fixture test are the only things to update.
