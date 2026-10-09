# Releasing a new version

Installed apps update themselves from GitHub Releases. A release needs three
files: `Drawing Practice Setup <version>.exe`, its `.blockmap` (lets updates
download only what changed), and `latest.yml` (the version number and a
checksum the app verifies). The release workflow makes all three.

## Steps

1. Raise `version` in `package.json` (for example `0.2.5` → `0.3.0`) and run `npm install` so `package-lock.json` matches.
2. Commit, then tag and push the tag:
   ```bash
   git tag v0.3.0
   git push origin v0.3.0
   ```
3. GitHub Actions (`.github/workflows/release.yml`) checks the tag matches `package.json`, runs the type check and tests, builds the installer on Windows and uploads it to a **draft** release.
4. Open the draft on GitHub, write what changed, and press **Publish release**. Installed apps find it the next time they start (or with Settings → Updates → Check now).

Building on your own PC still works: `npm run build:win` puts the installer in `release/`. To publish from your PC instead of GitHub Actions, set a `GH_TOKEN` environment variable and run `npx electron-builder --win --publish always`.

The first version with the updater (0.2.5) has to be installed by hand once; every version after it arrives as an update.

## If the repository becomes private

The app checks for updates without signing in, so the releases it reads must be public. A private repository would need a token built into the app, which anyone could pull out of it.

Keep the code private and the installers public:

1. Create an empty **public** repository, for example `AliCYSIQ/drawing-releases`.
2. Create a fine-grained personal access token with **Contents: read and write** on that repository only.
3. In the code repository's settings:
   - Secrets and variables → Actions → **Secrets**: add `RELEASE_TOKEN` with the token.
   - Secrets and variables → Actions → **Variables**: add `RELEASE_REPO` with `drawing-releases`.
4. Change `repo:` under `publish:` in `electron-builder.yml` to `drawing-releases` too, so local builds match.

Installed apps read where to look from inside themselves, so the first version built with the new setting has to be installed by hand once. If you think the repository may become private, set this up before many versions are out.

## What updates never touch

- Your data (`%APPDATA%\Drawing Practice\data`): sessions, library, settings, captures. Updates and uninstalling leave it alone.
- Before a version changes the data format, the app copies the data to `data/backups/`.

## Notes

- The installer isn't signed. Windows SmartScreen warns on the first manual install; updates run the installer quietly. Because the app isn't signed, the updater skips the publisher check, but it still checks the download against the checksum in `latest.yml`.
- An install in Program Files makes Windows ask for permission on each update. The default (your user folder) doesn't.
- The app never restarts on its own: a ready update waits for **Restart now** or installs when you close the app.
