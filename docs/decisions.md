# Decisions

Why the app works the way it does. Newest first.

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
