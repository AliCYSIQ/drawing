# Drawing Practice

A Windows desktop app for timed reference drawing, drawing from memory, review, challenges and a PureRef-style float mode. Everything stays on your computer.

## Use it

- **Install:** run `Drawing Practice Setup 0.2.5.exe` from the GitHub release (or build it with `npm run build:win`). The installer isn't signed, so Windows SmartScreen will warn once; choose "More info", then "Run anyway".
- **Updates:** from 0.2.5 on, the app updates itself from GitHub Releases. It downloads in the background and installs when you press Restart or close the app, never during a session. Settings → Updates can check now or turn it off.
- **Library:** add a folder, single images, a public Pinterest board link, or a collection you fill by dragging or pasting images from your browser.
  - Folders on disk are linked, not copied. If files move, the collection shows what's missing and **Find folder…** relinks it; sessions skip missing images, and history keeps a smaller copy of every practiced reference.
  - A folder with sub-folders keeps its structure:
    - it becomes a library folder
    - a sub-folder with only images becomes a collection
    - a sub-folder with its own sub-folders becomes a folder, all levels down
    - a preview shows exactly what will be added
    - you can make one collection instead, or take only the top folder's images
  - Pasted, dropped and Pinterest images are copied into the app, so practice works offline.
  - Organize collections in library folders that work like folders in Windows:
    - click selects, double-click opens
    - Ctrl/Shift+click selects more
    - drag onto a folder to move (Ctrl copies)
    - right-click for Move to, Copy to, Rename and Delete
    - keys: Ctrl+X / C / V, Del, F2, Enter, Ctrl+Z
    - every change can be undone
  - A collection is in one folder. To have it in two folders, copy it: the copy is a separate collection that shares the image files, so nothing is duplicated on disk.
  - Add free tags, star favorites (collections or single images), search by name or tag, and sort by name, date, last practiced or size.
- **Practice modes:**
  - **Classic:** the same time for every pose.
  - **Class:** blocks of poses that get longer.
  - **Relaxed:** no timer.
  - **Memory:** study the reference, it hides, you draw it from memory, then reveal it and mark the differences in red. Then draw it again.
- **Choosing what to draw:** Practice and Challenges show the library's folders.
  - Click a folder to practice everything inside it, sub-folders included (and collections added later).
  - Double-click a folder to open it and pick from its sub-folders and collections.
  - Click a collection to practice just that one.
  - Picked folders show how many collections and images they hold.
- **Options:**
  - shuffle, fresh images first (shuffled first, then images you haven't drawn in the last 7 days go to the front, then the ones drawn longest ago), favorites only
  - rest between pictures (seconds or minutes), and a longer break between class blocks
  - review afterwards, and capture of your Clip Studio canvas at the end of each pose
- **During a session:** space pauses, ← and → move between poses, R restarts the pose, F flips, G turns it grey, Esc ends. Settings can hide the clock (the progress line stays) and add soft ticks in the last 3 seconds.
- **Review:** each reference again, next to your drawing: a canvas capture, a photo of that drawing, or a photo of the whole page.
  - Side by side or overlay; every pane zooms (scroll) and moves (drag).
  - Each drawing image is a tab: hover for × to remove it, double-click (or F2) to rename it. Removing can be undone.
  - The red pen (M) marks corrections on the reference and on your drawing, in side by side and in overlay. One Undo (Ctrl+Z) and one Clear. Memory mode's reveal uses the same view.
  - Tag mistakes, write a note, and flag poses to redo. Done shows this session's mistakes next to how often they usually come up, and the practice screen reminds you of your most common recent ones.
- **Float mode (borderless, on top):** the float button in a session or the image viewer, or `Ctrl+Alt+F` from anywhere.
  - Options: keep on top, opacity, lock and click-through.
  - `Ctrl+Alt+L` turns click-through off.
  - Double-click the image, or click the × in its toolbar, to leave float mode.
- **Challenges:** speed, volume and class ladders, or build your own levels. Finishing a level opens the next one.
- **Skills:** keep a list of what you practice (Settings, or "New skill" on Practice). A session, preset or challenge can count toward one skill, and Review can change it afterwards.
- **History:** every session by month. Search notes, mistakes, collections and challenges; filter by date, kind, review state, skill, and whether it has notes, drawings, marks or flagged poses.
- **Stats:** a heatmap of practice per day (click a day to see its sessions), streaks, totals and recent sessions; time and sessions per skill, and a skill filter for the rest of the page.

- **Big screens:** galleries fill the window and forms stay readable. Interface size is in Settings, or Ctrl `+` / `-` / `0`. The window reopens where it was, and the screen stays awake during a session.

Your data lives in `%APPDATA%\Drawing Practice\data` (Settings → Open data folder). Updates never touch it.
- **Backups:** Settings can save a backup zip. Before a data format change, the app copies the data to `data/backups/`.
- **Restore:** Settings → Backups restores any backup, or a saved .zip.
- **Start over:** Settings → Start over clears all of it or only some (history, library, skills, presets and challenges, settings). Nothing is erased: it moves into a backup you can restore.
- **Diagnostics:** Settings → Diagnostics shows CPU and memory per part of the app, and problems recorded in `data/logs/app.log` (crashes, hangs, slow work).

## Develop

```bash
npm install
npm run dev          # run the app with hot reload
npm test             # unit tests (timer, memory loop, scheduling, stats, challenges, library, history, review, float, reset, Pinterest parsing)
npm run test:e2e     # builds, then drives the real app with Playwright
npm run build:win    # Windows installer in release/
```

- **Releasing:** raise the version, push a `v<version>` tag, and publish the draft release GitHub Actions builds. Steps, and what to do if the repository becomes private, are in [docs/releasing.md](docs/releasing.md).

- Optional live check of Pinterest: `PINTEREST_LIVE=<board url> npx playwright test pinterest-live`
- Screenshots of every screen: `SCREENSHOTS=<folder> npx playwright test screenshots`

**Stack:** Electron, React, TypeScript, Tailwind, Zustand, electron-vite.

**Code layout:**
- `src/main`: windows, float mode, hotkeys, capture, Pinterest, storage, updates, start over and restore, the app log.
- `src/preload`: the bridge between the app's screens and the rest of Electron.
- `src/renderer`: the screens. The timer engines (`lib/sessionEngine.ts`, `lib/memoryEngine.ts`), library operations (`lib/library.ts`), history filters (`lib/history.ts`) and review changes (`lib/review.ts`) are pure functions with tests.

**Pinterest:** there's no free official API for reading boards. `src/main/pinterest.ts` reads what Pinterest's own web page loads. If Pinterest changes that, this file and its fixture test are the only things to update.
