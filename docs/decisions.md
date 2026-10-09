# Decisions

Why the app works the way it does. Newest first.

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

**Skills (light).** A skill list you edit yourself. Sessions, presets and challenges can be tagged with a skill, and Stats show time and sessions per skill. There are no goals or schedules: this isn't a planner.

**Storage stays JSON for now**, with a `schemaVersion`. Before any format change, the data folder is backed up to `data/backups/`.

**Pinterest.** There's no free official API for reading boards, so the app reads what Pinterest's own page loads. Every sync fetches fresh: no cache is used, and the result is compared with the board's pin count.

## 2026-10-08: v0.1 decisions
- **Electron + React + TypeScript:** the best support for frameless, always-on-top and click-through windows, global hotkeys and screen capture, and the easiest stack for AI-assisted work.
- **Memory mode** comes from the study loop in "How To 10x Your Drawing Progress" (The Art Of Nemo, after Kim Jung Gi): study, hide, draw from memory, reveal, mark, repeat. Timed sessions keep their own after-session review.
- **No drawing canvas:** you draw on paper or in Clip Studio. Review attaches captures or photos instead.
