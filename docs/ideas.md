# Ideas for later

Things worth doing someday, kept here so they don't get lost. None of them are being built now.

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
- Weighted random (practice weak areas more often), and repeatable sessions from a seed.

## Performance
- If the app log shows slow work on the main thread (canvas capture, history copies), move image encoding to a background process (Electron's `utilityProcess`).

## Review
- A confidence or difficulty rating per pose (for example 1–3).
- Remember how a drawing was lined up in overlay, per pose.
- Reorder page photos by dragging their tabs.
- A high-contrast theme.

## Bigger ideas
- AI help built on your review notes: summarizing recurring mistakes, suggesting what to practice. Only as help; never a score for your drawings.
- Sharing and importing challenges with other people.
- A small drawing canvas inside the app. Not planned: you draw on paper or in Clip Studio.
- A tray icon.
