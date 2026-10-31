# Decisions

Why the app works the way it does. Newest first.

## 2026-10-31: v0.3.0, capture and Pinterest reliability

**Canvas capture takes a chosen window, not a screen area.**
- **How it worked:** the main process asked `desktopCapturer` for a picture of the whole screen (`types: ['screen']`) and cropped the rectangle you had dragged on it (display id + position, saved in settings). It ran at the end of each pose, of each memory-mode drawing, and of a free drawing session. Whatever was on top in that rectangle was captured: a browser in front meant a picture of the browser. Only the app's own window was kept out (content protection).
- **Now:** you choose a window (Settings, or the capture option on Practice), like PureRef's "pin to a window", then the whole window or a part of it dragged on its picture. The capture uses `desktopCapturer` window sources (`types: ['window']`), which take the window's own picture: tested with a window covered by another, it still came back as itself.
- **Why not the Windows Graphics Capture picker:** Electron has no API for the system picker; the window list uses the same capture underneath and needs nothing extra (no hooks, no native modules).
- **Finding it again:** Electron's source id holds the window handle, which only lasts while the window is open, so it is kept as a hint, not as the identity. The identity is the window's title: after the app was restarted, the window sharing at least half of the title words is used (so "Sketch.clip - CLIP STUDIO PAINT EX" finds "Hands.clip - CLIP STUDIO PAINT EX"). Two windows that match equally, or a reused handle whose title shares nothing, are never guessed: the capture fails with a message and you choose again.
- **The part** is stored as shares (0–1) of the window's own picture, so it follows when the window is resized, moved to another monitor or rescaled. After a big layout change inside the app, choose it again.
- **Never the desktop instead.** A minimized window isn't listed by Windows, a closed one is gone, an all-black picture counts as failed: each gives a message, never a substitute picture. A failed capture during a session only shows a message; the session goes on. Free drawing shows the capture before keeping it (Keep, Retake, or Save without a picture), and the session is safe meanwhile.
- **Older setups** with a screen area keep working as they did; the setup screens say that this captures whatever is on top, and offer to choose a window.
- **Limits:** windows of Chromium-based apps (browsers, Electron apps) may show their last painted frame while fully covered, because Chromium stops painting covered windows; native drawing apps keep painting. Elevated (administrator) windows and some protected windows can't be captured. A window's picture includes its frame (title bar); use "part of it" to leave that out.

**Pinterest: the 25-of-35 board.** Traced on the board that showed it, inside the app:
- The board page held its first 25 pins but, that time, no bookmark to the next page (Pinterest leaves it out on some answers). v0.2.5 stopped there and called the gap "videos". Then, reading the feed from its start through Electron's (Chromium's) network stack, the next page came back empty.
- With Node's own HTTP client (`fetch` in the main process) the same requests page through normally: 25 + 10 = 35 pins, checked live twice. So board pages are now read with Node's fetch; images still download as before.
- When Pinterest stops listing pins before its own count (and that isn't explained by non-picture items), the sync is marked partial ("short"), says so, and never offers to remove pins.
- Every sync records what it read, page by page (status, tries, pins, new pins, next page or not, duplicates, RSS or not, why it stopped), in `data/logs/app.log`; the message after a sync uses it. A 429 ("too many requests") waits three times longer before retrying.
- The RSS feed (about the latest 25 pins) is only a last resort and always counts as partial.
- The official API would need an app registration and a Pinterest login (OAuth); not needed while public boards read reliably.

## 2026-10-31: v0.3 decisions (data version 4)

**One folder tree; no collections.** v0.2 had two ways to organize (library folders and collections), and every image had to sit in a collection, which made "(loose images)" collections up. Now there are only folders, as in Windows Explorer: a folder holds images, folders, both, or nothing.
- **Three parts in `library.json`:** `folders` (the tree), `images` (an entry: one image in one folder) and `assets` (what the image is: its file, whether it's yours or stored by the app, where it came from, size and SHA-256). Where an image sits is kept apart from what it is and where its file lives.
- **A Pinterest board or a linked disk folder is a folder with a `source`.** Its sync information lives there. The source only links: moving or deleting the folder in the library never touches the disk or the board.
- **No shortcuts, no multi-parent entries.** A copy is a new entry (or a new folder of entries) that shares the asset, so no image bytes are copied.
- **Copying a folder keeps its source.** A copy of a Pinterest folder can sync too; pins already saved anywhere are reused, never downloaded again.
- **Moving and deleting are library-only.** Nothing the library does moves or deletes a file of yours. Images the app stored itself are removed at the next start, and only when no library image uses them (history keeps its own smaller copies, so it never depends on them).
- **Undo and Redo** cover every library change in the session (Ctrl+Z, Ctrl+Y).

**Image identity.** The old image id was worked out from the file path, so a renamed or moved file looked like a new image.
- The asset id is now stored, and it stays when the file moves: Find folder and Rescan update the path, not the id.
- A new asset still gets its first id from its path (the same formula as before), so images added again after being removed match their old history. If that id is taken by another file, it gets a new one.
- **SHA-256** is the content check. Stored images get it when saved; linked files get it in the background, two at a time, never during a session. A rescan hashes only new files whose size matches a missing image (size is the cheap first check), and a match takes over the missing image's asset, history and favorite.
- Pasted or downloaded images with the same bytes share one stored asset. Two different files on disk with the same bytes stay two assets (different files can change apart), but a session draws them once.

**Migration (v3 → v4).** Each collection became a folder with the same id, in the folder it was in, holding its images; library folders stayed. Old image ids became asset ids, so history, favorites, review marks, presets, challenges and "fresh first" match without rewriting them. Plans keep `boardIds`; the app reads them as folder ids. Linked folders keep their path (flattened sub-folders as before, or top images only); Pinterest boards keep their link.
- Backed up first (`data/backups/<date>-v3`), worked out in memory, checked (every collection and every image must be there, no image without an asset, no folder in a missing folder), written next to the old files, then swapped in, with the version written last. A migration cut short runs again and sees the library is already done. A failed check writes nothing and the app says so.
- `boards.json` stays on disk untouched; the app no longer reads it.

**Library interaction.** The single-click-selects / double-click-opens model was annoying in practice.
- A click opens (a folder) or views (an image). The check in the tile's corner selects; it appears on hover, and on every tile once something is selected. Ctrl/Shift still select.
- Browsing and picking what to practice are separate on Practice and Challenges too: a click opens a folder, the check (or "Pick this folder") picks it. **Practice this folder** in the Library goes straight to Practice with it picked.
- One **Add** button (folder, images, Pinterest board) instead of four, so the toolbar stays short.
- Ctrl+V pastes the library's own cut or copied items, unless you visited another app since then: then it pastes the image you copied there.

**Free drawing** is a separate session kind, not Relaxed mode without references: Relaxed means drawing from references at your own pace, and keeps meaning that.
- It's only a clock with pause, an optional skill and note, and an optional capture of the canvas area at the end (the same capture as timed sessions, saved as a picture of the session, not of a reference). A failed capture still saves the session.
- It's a normal session record (`mode: 'free'`, no poses), so totals, streaks, skills and History count it with no special cases.
- While running it is saved every 15 seconds (and on close); after a restart it comes back paused, counting time up to when the app last saw it running.
- No journal, recorder, canvas or reference board: Clip Studio and PureRef do those.

**Ending a session early** already saved it as "stopped early" with the time drawn, and only a finished challenge level counted. Closing the app in the middle of a session lost it; now it is saved as stopped early too. No extra "count it?" question: deleting a session from History does that job.

**One zoom everywhere.** The pan/zoom from Review (scroll zooms at the pointer, drag moves, double-click fits) now also runs in sessions, the image viewer, challenges and memory study. In float mode the left button still moves the window; the right or middle button pans.

**Review.** Removing a capture or photo asks first and can still be undone. Marks made in overlay are kept apart from side-by-side marks on the same drawing, so Clear in one layout never clears the other, and switching layouts never loses marks. (Marks made in overlay before this version were stored with the side-by-side ones and stay there.)

**Pinterest.** Adding a board link always makes a new folder; an existing one updates with its own Sync. Folders are never matched to boards by name.
- The sync never deletes. A complete sync lists pins that left the board and asks: keep (default) or remove from the folder. Partial or capped syncs list nothing.
- The "25 pins, the rest were videos" report came from a board page that held its first pins but no bookmark to continue; the sync now reads the feed from its start in that case.
- The limit is 5,000 pins per sync (it was 2,000), and reaching it is reported. Non-picture items are counted and reported, instead of guessing that the gap is videos.
- Pagination is tested with mocked responses; live behavior was not verified in this update (`PINTEREST_LIVE` test).

## 2026-10-09: v0.2.5 decisions

**Click-through lag and crashes.** Three causes in the float code, fixed:
- **The mouse hook:** click-through used `setIgnoreMouseEvents(true, { forward: true })`. On Windows, forwarding installs a system-wide low-level mouse hook that runs on the app's main thread, so every mouse move on the PC waited for the app. The float controls never show during click-through, so forwarding was dropped.
- **Hotkeys:** every float change unregistered and re-registered all hotkeys, even from inside the `Ctrl+Alt+L` handler itself. Now only changed hotkeys are touched, and hotkey actions run after their handler returns.
- **Window settings:** every change re-applied all of them (frame style, layered window, on top), and the opacity slider did this on every step. Now only what changed is applied, the slider sends at most one change per frame, and opacity is never set while it's 100%.

Also:
- Sessions redraw once a second; the progress line is animated by the browser.
- Review strokes are saved when the pen lifts.
- A crash, hang and slow-work log (`data/logs/app.log`) and Settings → Diagnostics, so the next problem comes with facts.

**Updates.** electron-updater with GitHub Releases, which suits the NSIS installer the app already uses.
- It checks after start, downloads in the background, and installs on Restart or when the app closes, never during a session.
- The app isn't signed, so the updater can't check a publisher. It still checks every download against the checksum in `latest.yml`.
- A private code repository would need a token inside the app. Instead, releases can go to a public releases-only repository (`docs/releasing.md`).

**Library folders: plain folders, as in Windows.** Six options were weighed:
- tags only
- flat folders
- a strict tree
- a tree with shortcuts
- items in many folders at once (labels)
- smart folders

The choice is the strict tree, exactly like folders in Windows:
- **Move:** a collection is in one place, and moving takes it out of where it was.
- **Two folders:** to have it in two folders, you copy it.
- **No shortcuts:** v0.2 had them, and they were dropped as one concept too many. Data version 3 turns existing shortcuts into copies, backed up first like every format change.
- **Labels and smart folders:** labels (one item in many folders) leave "where does it really live?" unanswered; smart folders may come later.

Behaving like Explorer:
- click selects, Ctrl/Shift+click selects more, double-click or Enter opens
- drag to move (Ctrl copies)
- cut, copy and paste, right-click menus, F2, Delete, Undo

Rules:
- **A collection copy** is its own collection (name, tags, image list) that shares the image files, so a copy costs no disk space. A folder copy copies everything inside.
- **Shared files are deleted safely.** Stored images (pasted, Pinterest) of deleted collections are removed at the next start, and only when no collection uses them. Undo works until then, and a copy never loses images when its original is deleted. A Pinterest re-sync keeps files a copy still uses.
- **Deleting a folder** asks: keep what's inside (it moves up) or delete it all.
- **Folder tiles** are drawn as folders (tab, images standing in it, front flap), so a folder never looks like a collection.

**Adding a folder keeps its structure.** The same plan drives the preview in the add dialog and the import, so what you see is what you get:
- The chosen folder becomes a library folder (if it has no sub-folders with images, it's simply one collection).
- A sub-folder with only images becomes a collection.
- A sub-folder with its own sub-folders becomes a folder, at every depth.
- A folder with images and sub-folders keeps both: its own images become a "(loose images)" collection inside it.

The same disk folder can become a collection in one import and a folder in another if its contents change; the preview makes that visible. One collection, or only the top folder's images, are still options.

**Practicing a folder.** Practice and Challenges browse the same folders.
- **Click a folder** to practice everything in it, including sub-folders and collections added later (`folderIds` on the plan).
- **Double-click** to open it and pick inside. A double-click never changes what was picked.
- **Click a collection** to practice just that one.
- **Picked folders** show their collection and image counts.

**Review.** Pages (whole-session photos) and photos (one drawing) keep their roles.
- **Remove and rename:** both can be removed (× on the tab) and renamed (double-click or F2). Names are stored by file path in the session (`labels`).
- **Undo:** removing can be undone; the app's copy of the file is deleted only after that.
- **Marking:** the reference can be marked too, and marking works in overlay, on your drawing.
- **One Undo and one Clear:** Clear covers the reference and the shown drawing, with Undo. Marking is meant to be quick, so there are no per-pane controls.

**History** is its own tab. As sessions add up it needs search and filters:
- notes, mistakes, collections, challenges
- date, kind, review state, skill
- whether a session has notes, drawings, marks or flagged poses

Sessions now store their collection names, so renamed collections still match. A heatmap day opens History for that day.

**Shuffle with fresh images first.** It already worked as asked: shuffle, then move fresh images to the front. Images drawn this week now follow, the one drawn longest ago first. There is no separate "exclude recent" option: small boards would run out.

**Start over never erases.** What it clears moves into `data/backups/<date>-before-reset`, which Settings → Backups can restore. Restoring moves what it replaces into another backup.

## 2026-10-09: v0.2 decisions

**Wide and maximized windows.** Galleries fill the window, up to about 2200 px, and the number of columns adapts. Forms stay a readable width and are centered: Practice up to 1440 px, Settings 860 px. An **Interface size** setting (Ctrl `+` / `-` / `0`) fixes small text on big monitors. This follows Microsoft's responsive guidance (reposition, resize, reflow) and the common pattern of a capped width for forms and full width for grids.

**Float mode controls.** They show only when you click the image, never on hover, and never while click-through is on. Float mode exists only on the session and image-viewer pages. Leaving those pages turns it off and resets click-through, lock and opacity.

**One compare system for Review and Memory mode.**
- Your drawing can come from a canvas capture, a photo attached to the pose, or a photo of the whole page. A switcher picks the source.
- Side by side and overlay work for every source.
- Every pane zooms and pans, the reference included.
- The red pen is kept, because marking corrections is the key step of the memory method. It can be turned on or off (M), with undo and clear.

**Linking vs copying images.**
- **Folders are linked:** no duplicate files, and the collection follows changes in the folder.
- **Pasted, dropped, web and Pinterest images are copied**, because there's no other way to keep them.
- **Protections for linking:** missing files are detected and shown, a moved folder can be relinked, and sessions skip missing files. Every practiced reference keeps a smaller copy, so history never breaks.

**Sub-folders on import.** The app asks only when the picked folder has sub-folders with images. Then you can choose:
- one collection (the default)
- a collection per sub-folder, grouped in a folder named after the parent
- only the images directly in the top folder

There is a "Remember my choice" option.

**Folders of collections.** Each collection has one home folder and can appear in other folders as a shortcut. Removing a shortcut never deletes the collection. The fixed categories become free tags.

**Sessions.** Small additions that help while drawing, without new screens:
- **A break between class blocks** (seconds, 0 = none), on top of the usual rest between pictures.
- **Restart the pose (R)**: the timer starts again; the time already spent still counts.
- **Line-only timer** (Settings): hides the numbers during poses, in memory mode too; the progress line still shows the time. A counting clock can feel stressful.
- **Soft ticks in the last 3 seconds** (Settings, off by default): only for poses of 10 seconds or more, and only with sound on.
- **Fresh images first** (on by default): images drawn in the last 7 days come after the ones you haven't drawn. They are moved back, not removed, so small boards still work.
- **Favorites only**: uses just the starred images of the chosen boards.

**Skills (light).** A skill list you edit yourself. There are no goals or schedules: this isn't a planner.
- **Where a skill is picked:** on Practice (the next session starts with the same one), on a preset, and on a challenge (every level counts toward it). Review can change a session's skill afterwards. One skill per session, so time per skill adds up to the total.
- **Stats:** time, sessions and the last practice per skill, including skills not practiced yet. A skill filter narrows the heatmap, the figures and the history.
- **Editing:** Settings lists the skills; a new one can also be added straight from the picker. Renaming keeps everything linked. Deleting a skill keeps its sessions, which then show as "No skill".
- **Storage:** the list is its own file (`skills.json`). Sessions, presets and challenges only gain an optional `skillId`, so no migration is needed and older data reads as "no skill".

**Storage stays JSON for now**, with a `schemaVersion`. Before any format change, the data folder is backed up to `data/backups/`.

**Pinterest.** There's no free official API for reading boards, so the app reads what Pinterest's own page loads. Every sync fetches fresh: no cache is used, and the result is compared with the board's pin count.

## 2026-10-08: v0.1 decisions
- **Electron + React + TypeScript:** the best support for frameless, always-on-top and click-through windows, global hotkeys and screen capture, and the easiest stack for AI-assisted work.
- **Memory mode** comes from the study loop in "How To 10x Your Drawing Progress" (The Art Of Nemo, after Kim Jung Gi): study, hide, draw from memory, reveal, mark, repeat. Timed sessions keep their own after-session review.
- **No drawing canvas:** you draw on paper or in Clip Studio. Review attaches captures or photos instead.
