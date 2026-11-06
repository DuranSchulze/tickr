# Releasing Tickr

Tickr releases live on the repository's
[Releases page](https://github.com/DuranSchulze/tickr/releases). A release is
product-wide: the web app keeps deploying to DigitalOcean App Platform from
`main`, and the Android APK is attached to the same release page as a
downloadable asset.

- Web: `.do/app.yaml` deploys `main` to <https://trackly.ph>. Releases do not
  change or gate that deployment.
- Android: [`.github/workflows/release.yml`](../.github/workflows/release.yml)
  builds the Capacitor shell and attaches the APK (and AAB when signing is
  configured) to the GitHub Release.
- CI check (not a release): [`.github/workflows/android.yml`](../.github/workflows/android.yml)
  compiles the debug APK on `mobile/**` changes.

## Cut a release

Tags are global, so the release is built from the exact commit you tag.

```sh
git checkout mobile
git pull
git tag -a v0.1.0 -m "Tickr v0.1.0"
git push origin v0.1.0
```

Pushing a `v*` tag starts the **release** workflow. Alternatively open
**Actions → release → Run workflow** and enter the version (for example
`0.1.0`) to build and publish from the selected branch without creating a tag
first. GitHub only offers that manual button when the workflow file exists on
the default branch (`main`); tag pushes work from any branch's commit.

The workflow exports:

- `Tickr-vX.Y.Z.apk` and `Tickr-vX.Y.Z.aab` when signing secrets are configured.
- `Tickr-vX.Y.Z-debug.apk` (pre-release) when they are not.
- `SHA256SUMS.txt` with checksums for every attached file.

Versioning rules:

- Tag format is `vMAJOR.MINOR.PATCH` (for example `v0.1.0`). Add
  `-something` (for example `v0.2.0-rc.1`) to publish a pre-release.
- `versionName` comes from the tag; `versionCode` is the GitHub Actions run
  number, which increases on every run. Do not reuse or rewind version codes
  for a published app id.
- Unsigned/debug builds are always published as pre-releases.

## Android server origin

The shell loads the production web origin baked in at build time. The workflow
defaults to `https://trackly.ph` and can be overridden without editing the
workflow:

**Settings → Secrets and variables → Actions → Variables → New repository
variable**

| Variable                     | Example              | Purpose                          |
| ---------------------------- | -------------------- | -------------------------------- |
| `TRACKLY_ANDROID_SERVER_URL` | `https://trackly.ph` | HTTPS origin the APK shell loads |

The value must be an HTTPS origin only (no path, query or credentials);
`mobile/capacitor.config.ts` appends `/app/time-tracker`.

## Production signing

Until IT provides the release keystore, the workflow publishes a debug-signed
APK for internal evaluation. To publish production-signed builds, create the
keystore **once** and store it in GitHub, never in git:

```sh
keytool -genkeypair -v -storetype PKCS12 \
  -keystore trackly-release.keystore \
  -alias trackly \
  -keyalg RSA -keysize 4096 -validity 10000

# Copy the base64 form to the clipboard (macOS)
base64 -i trackly-release.keystore | pbcopy
```

Add these four repository secrets under
**Settings → Secrets and variables → Actions → New repository secret**:

| Secret                      | Value                              |
| --------------------------- | ---------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | base64 output of the keystore file |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password                  |
| `ANDROID_KEY_ALIAS`         | `trackly`                          |
| `ANDROID_KEY_PASSWORD`      | key password                       |

Keep an offline copy of the keystore and passwords. Losing the key means
existing installs can no longer be upgraded in place; the same key must sign
every update for a given application id.

When all four secrets exist, the workflow builds `assembleRelease` +
`bundleRelease` and publishes `Tickr-vX.Y.Z.apk` / `.aab` instead of the debug
APK. The `applicationId` is `com.trackly.internal` (debug builds use
`.debug`).

## First-time repository setup

1. **Settings → Actions → General → Workflow permissions**: allow
   _Read and write permissions_ (or confirm no org policy blocks it). The
   release job requests `contents: write` so it can create the release and
   upload assets.
2. Add the `TRACKLY_ANDROID_SERVER_URL` variable if the default origin is
   wrong.
3. Add the signing secrets when IT supplies the keystore.
4. Run the workflow once with **Run workflow** and confirm the APK appears on
   the Releases page.

## Verification checklist

- The release page shows the APK, `SHA256SUMS.txt`, and generated notes.
- `sha256sum -c SHA256SUMS.txt` passes after downloading the assets.
- Install the APK on a test device and confirm it loads the expected origin and
  the app version matches the tag (`0.1.0`).
- Confirm the version code increased versus the previous release.

## Rollback

Prefer publishing a new patch release. If a release must be withdrawn, delete
the GitHub release and the tag (`git push --delete origin vX.Y.Z`). Do not reuse
a published version code for a different build.
