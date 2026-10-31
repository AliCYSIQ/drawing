# Drawing Practice

A Windows desktop app for timed reference drawing, drawing from memory, review, challenges and a PureRef-style float mode. Everything stays on your computer.

## Use it

- **Install:** run `Drawing Practice Setup 0.3.0.exe` from the GitHub release (or build it with `npm run build:win`). The installer isn't signed, so Windows SmartScreen will warn once; choose "More info", then "Run anyway".
- **Updates:** from 0.2.5 on, the app updates itself from GitHub Releases. It downloads in the background and installs when you press Restart or close the app, never during a session. Settings → Updates can check now or turn it off.
- **Library:** one tree of folders, like Windows Explorer. A folder can hold images, other folders, both, or nothing.
  - **Add** (one button): a folder from disk, single images, or a public Pinterest board link. You can also drag images in from your browser or Explorer, or paste one (Ctrl+V), into whatever folder is open.
  - **Folders from disk are linked, not copied.** Adding one keeps its structure: every sub-folder with images becomes a folder, all levels down, and each image stays in the folder it is in. A preview shows exactly what will be added; you can also put everything in one folder, or take only the top folder's images, or copy the images into the app.
  - **Rescan** brings a linked folder up to date: new images and new sub-folders come in; a sub-folder you removed from the library stays out. If a file was renamed or moved on disk, a rescan recognises it by its content (SHA-256) and keeps its history and favorite. If the whole folder moved, **Find folder…** (in the folder's ··· menu) relinks it.
  - **Pinterest boards** become a folder that remembers its link; **Sync** updates it. Images are saved on this computer, so practice works offline. When a full sync finds pins that left the board, the app asks whether to keep them (the default) or remove them. A partial or failed sync never removes anything.
  - **Working with things:**
    - click a folder to open it, click an image to view it
    - the check in a tile's corner selects it (it shows on hover); Ctrl/Shift+click selects more
    - drag onto a folder or a part of the folder path to move (Ctrl copies)
    - right-click for Open, Practice this folder, Rename, Favorite, Cut, Copy, Move to, Copy to and Delete
    - keys: Ctrl+X / C / V, Del, F2, Enter, Ctrl+Z (undo), Ctrl+Y (redo), Backspace (up a folder)
  - **Nothing in the library ever moves or deletes your files on disk.** Deleting removes the library entry. A copy is a new, independent entry that shares the stored image, so nothing is duplicated. Images the app stored itself (pasted, downloaded, Pinterest) are removed at the next start, once no library image uses them.
  - Tags on folders, favorites (folders or single images), search across folder names, tags and image names, and sorting by name, date, last practiced or size.
- **Practice modes:**
  - **Classic:** the same time for every pose.
  - **Class:** blocks of poses that get longer.
  - **Relaxed:** no timer.
  - **Memory:** study the reference, it hides, you draw it from memory, then reveal it and mark the differences in red. Then draw it again.
- **Free drawing:** a clock for drawing without references from the library, say in Clip Studio with PureRef next to it, or on paper. Practice → Free drawing.
  - Pause and resume (space, or the pause hotkey from any app); paused time doesn't count.
  - An optional skill, and a note afterwards. The time counts toward your totals and the skill.
  - Optionally the Clip Studio canvas area is captured once, when you end. If the capture fails, the session is still saved.
  - A session that is still going survives closing the app: it comes back paused.
- **Choosing what to draw:** Practice and Challenges browse the library's folders.
  - Click a folder to open it; opening never changes what is picked.
  - The check in a folder's corner (or "Pick this folder") picks it: every image inside, sub-folders included.
  - In the Library, **Practice this folder** goes straight to Practice with that folder picked.
  - An image reached through two picked folders, or kept twice, is drawn once.
- **Options:**
  - shuffle, fresh images first (shuffled first, then images you haven't drawn in the last 7 days go to the front, then the ones drawn longest ago), favorites only
  - rest between pictures (seconds or minutes), and a longer break between class blocks
  - review afterwards, and capture of your canvas at the end of each pose: choose the window once (Clip Studio or any app), the whole window or a part of it. It is captured even when another window is in front; if it is minimized or closed, the app says so instead of capturing something else.
- **During a session:** space pauses, ← and → move between poses, R restarts the pose, F flips, G turns it grey, Esc ends. Settings can hide the clock (the progress line stays) and add soft ticks in the last 3 seconds.
  - Ending early, or closing the app, saves the session as "stopped early" with the time you drew. A challenge level counts as done only when it is finished.
- **Zoom:** every image zooms the same way (sessions, the image viewer, challenges, review, memory mode): scroll to zoom, drag to move, double-click (or Fit) to see it whole.
- **Review:** each reference again, next to your drawing: a canvas capture, a photo of that drawing, or a photo of the whole page.
  - Side by side or overlay; every pane zooms (scroll) and moves (drag).
  - Each drawing image is a tab: hover for × to remove it (it asks first, and can be undone), double-click (or F2) to rename it.
  - The red pen (M) marks corrections on the reference and on your drawing, in side by side and in overlay. Each layout keeps its own marks: Clear in one never clears the other. One Undo (Ctrl+Z) and one Clear. Memory mode's reveal uses the same view.
  - Tag mistakes, write a note, and flag poses to redo. Done shows this session's mistakes next to how often they usually come up, and the practice screen reminds you of your most common recent ones.
- **Float mode (borderless, on top):** the float button in a session or the image viewer, or `Ctrl+Alt+F` from anywhere.
  - Options: keep on top, opacity, lock and click-through.
  - `Ctrl+Alt+L` turns click-through off.
  - Double-click the image, or click the × in its toolbar, to leave float mode.
- **Challenges:** speed, volume and class ladders, or build your own levels. Finishing a level opens the next one.
- **Skills:** keep a list of what you practice (Settings, or "New skill" on Practice). A session, preset or challenge can count toward one skill, and Review can change it afterwards.
- **History:** every session by month, free drawing included. Search notes, mistakes, folders and challenges; filter by date, kind, review state, skill, and whether it has notes, drawings, marks or flagged poses.
- **Stats:** a heatmap of practice per day (click a day to see its sessions), streaks, totals and recent sessions; time and sessions per skill, and a skill filter for the rest of the page.

- **Big screens:** galleries fill the window and forms stay readable. Interface size is in Settings, or Ctrl `+` / `-` / `0`. The window reopens where it was, and the screen stays awake during a session.

Your data lives in `%APPDATA%\Drawing Practice\data` (Settings → Open data folder). Updates never touch it.
- **Backups:** Settings can save a backup zip. Before a data format change, the app copies the data to `data/backups/`. (Updating to the folder-tree library, data version 4, keeps the old `boards.json` too; the app no longer reads it.)
- **Restore:** Settings → Backups restores any backup, or a saved .zip.
- **Start over:** Settings → Start over clears all of it or only some (history, library, skills, presets and challenges, settings). Nothing is erased: it moves into a backup you can restore.
- **Diagnostics:** Settings → Diagnostics shows CPU and memory per part of the app, and problems recorded in `data/logs/app.log` (crashes, hangs, slow work).

## Develop

```bash
npm install
npm run dev          # run the app with hot reload
npm test             # unit tests (timer, memory loop, free drawing, scheduling, stats, challenges, library, migration, history, review, float, reset, Pinterest)
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
- `src/renderer`: the screens. The timer engines (`lib/sessionEngine.ts`, `lib/memoryEngine.ts`, `lib/freeEngine.ts`), library operations (`lib/library.ts`), history filters (`lib/history.ts`) and review changes (`lib/review.ts`) are pure functions with tests.
- **Library data** (`library.json`): `folders` (the tree; a folder may have a `source`: a disk folder or a Pinterest board), `images` (entries: an image in a folder), `assets` (what an image is: its file, whether the app stored it, where it came from, its SHA-256). History, favorites and "fresh first" use asset ids, which stay when files move.

**Pinterest:** there's no free official API for reading boards. `src/main/pinterest.ts` reads what Pinterest's own web page loads. If Pinterest changes that, this file and its fixture test are the only things to update.
