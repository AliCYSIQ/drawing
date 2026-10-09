# Drawing Practice

A Windows desktop app for timed reference drawing, drawing from memory, review, challenges and a PureRef-style float mode. Everything stays on your computer.

## Use it

- **Install:** run `release/Drawing Practice Setup 0.2.0.exe` (build it with `npm run build:win`). The installer isn't signed, so Windows SmartScreen will warn once; choose "More info", then "Run anyway".
- **Library:** add a folder, single images, a public Pinterest board link, or a collection you fill by dragging or pasting images from your browser.
  - Folders on disk are linked, not copied. If files move, the collection shows what's missing and **Find folder…** relinks it; sessions skip missing images, and history keeps a smaller copy of every practiced reference.
  - A folder with sub-folders asks whether to make one collection, one per sub-folder, or use only the top folder.
  - Pasted, dropped and Pinterest images are copied into the app, so practice works offline.
  - Organize collections in library folders (with shortcuts in other folders), add free tags, star favorites (collections or single images), and search by name or tag.
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
- **Review:** each reference again, next to your drawing: a canvas capture, a photo of that drawing, or a photo of the whole page.
  - Side by side or overlay; every pane zooms (scroll) and moves (drag).
  - The red pen (M) marks corrections, with undo (Ctrl+Z). Memory mode's reveal uses the same view.
  - Tag mistakes, write a note, and flag poses to redo. Done shows this session's mistakes next to how often they usually come up, and the practice screen reminds you of your most common recent ones.
- **Float mode (borderless, on top):** the float button in a session or the image viewer, or `Ctrl+Alt+F` from anywhere.
  - Options: keep on top, opacity, lock and click-through.
  - `Ctrl+Alt+L` turns click-through off.
  - Double-click the image, or click the × in its toolbar, to leave float mode.
- **Challenges:** speed, volume and class ladders, or build your own levels. Finishing a level opens the next one.
- **Skills:** keep a list of what you practice (Settings, or "New skill" on Practice). A session, preset or challenge can count toward one skill, and Review can change it afterwards.
- **Stats:** a heatmap of practice per day, streaks, totals and history; time and sessions per skill, and a skill filter for the rest of the page.

- **Big screens:** galleries fill the window and forms stay readable. Interface size is in Settings, or Ctrl `+` / `-` / `0`. The window reopens where it was, and the screen stays awake during a session.

Your data lives in `%APPDATA%\drawing-practice\data` (Settings → Open data folder). Settings can also save a backup zip. Before an update changes the data format, the app copies the data to `data/backups/`.

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
