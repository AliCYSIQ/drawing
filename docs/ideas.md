# Ideas for later

Things worth doing someday, kept here so they don't get lost. None of them are being built now. Before building one, check: is there a real problem from real use, can an existing feature or another app (PureRef, Clip Studio) cover it, and will it be used often enough to be worth keeping up?

## Capturing drawings
- **Camera capture of paper drawings.** Use a webcam, or a phone as a camera, to photograph the page at the end of each pose, the same way the Clip Studio canvas capture works. Electron can read cameras (`getUserMedia`). The hard part is framing and lighting the page reliably. Until then, review accepts photos of the page.

## Float mode
- **Transparent background.** Show only the image, with no window background, like PureRef. On Windows, transparent frameless Electron windows can't be resized by dragging their edges, so this needs custom resize handles.
- **Stay on top of one chosen app only** (for example Clip Studio, not everything). Windows has no simple API for this. It would need a native helper that watches which window is in front.

## Library
- **SQLite instead of JSON files.** JSON is fine at today's size. Switch if the library grows past roughly 10,000 images or search gets slow. All storage goes through `src/main/store.ts`, so the change stays in one place.
- **Sessions in more than one file.** `sessions.json` holds every session and is rewritten after each change. Split it (for example per month) if it passes a few MB.
- **Smart folders:** saved searches (a tag, favorites, not practiced lately) that show in the library like folders.
- Drag a box around tiles to select them.
- Tags on single images (today only folders have tags; favorites work on single images).
- Duplicate tools: list images with the same SHA-256 across folders and merge or remove them. The data is there (assets have hashes); only build it if duplicates become a real nuisance.
- Background rescans of linked folders. Today Rescan is a button; doing it on its own would need a file watcher and care with big folders.
- Weighted random (practice weak areas more often), and repeatable sessions from a seed.

## Pinterest
- **Board groups / a profile's boards.** Pinterest has sections inside a board (a section link already syncs as its own folder) but no "group of boards" link to read. Syncing all boards of a profile would be a new reader for an undocumented page. Not built: first make sure it's needed.

## Practice
- **Recent and pinned folders on Practice.** With dozens of folders the picker could show the recent and pinned ones first. Today it opens where you last were and has search; revisit when the folder list gets long in real use.
- **References on a free drawing session, afterwards.** Sometimes a "free" drawing turns out to have used a reference. An optional "references I looked at" list on a free session (images from the library, shown in its History view) would record that, without turning it into a pose-based session: no fake poses, no review tags, no fresh-first effect. Not built yet: wait until it is missed in real use.
- **Relaxed mode from a single image** in the viewer. The viewer already shows one image with no timer (and float mode); Free drawing tracks the time.

## Review and sessions
- **Marking during a live session, or during memory-mode study.** Marking needs both the reference and your drawing side by side; during a session your drawing is in Clip Studio or on paper. Review (and memory mode's reveal) is where marking works today.
- A confidence or difficulty rating per pose (for example 1–3).
- Remember how a drawing was lined up in overlay, per pose.
- Reorder page photos by dragging their tabs.
- A high-contrast theme.
- **Comparing sessions, and redrawing an old reference later to compare.** History and Redo flagged poses cover part of this; a proper "then and now" view would be a new screen.

## Canvas capture
- **The Windows Graphics Capture picker** (the system's own "choose a window" dialog). Electron doesn't offer it from its API today; the app lists windows itself with desktopCapturer, which uses the same Windows capture underneath. Revisit if Electron adds it.
- **Recognising a window by its program** (process name) instead of its title words. Needs a native call (GetWindowThreadProcessId); worth it only if title matching picks wrong in practice.

## Performance
- If the app log shows slow work on the main thread (canvas capture, history copies), move image encoding to a background process (Electron's `utilityProcess`).

## Bigger ideas
- AI help built on your review notes: summarizing recurring mistakes, suggesting what to practice. Only as help; never a score for your drawings.
- Sharing and importing challenges with other people.
- A small drawing canvas, a drawing recorder or a journal inside the app. Not planned: you draw on paper or in Clip Studio, and Free drawing tracks the time.
- A tray icon.
