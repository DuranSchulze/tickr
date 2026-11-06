# Trackly Android

Internal Android shell for the existing Trackly web application. Implementation
is in progress. Production tracker offline cold boot passed on API 37 using
synthetic data; live authentication and managed physical-device checks remain.
The application identifier `com.trackly.internal` is provisional until IT
confirms signing and distribution ownership. Debug builds use `.debug`.

The reproducible [production offline boot test](offline-boot-qa.md) covers
force-stop/relaunch with both servers stopped and Android reporting offline.

## Releases

Pushing a `vX.Y.Z` tag builds and publishes the Android APK on the
repository's [Releases](https://github.com/DuranSchulze/tickr/releases) page;
the web app keeps deploying to DigitalOcean App Platform independently. See
[RELEASING.md](RELEASING.md) for signing setup, the release checklist and the
manual dispatch path.

## Setup

Requires Node 22+, pnpm 10.10.0, Java 21 (Android Studio's bundled JDK works),
Android SDK Platform 36 and platform/build tools. Minimum device: Android 10.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --dir mobile run doctor
pnpm --dir mobile test
export MOBILE_SERVER_URL=https://your-trackly-domain.example
pnpm --dir mobile build:debug
```

The debug APK is `mobile/android/app/build/outputs/apk/debug/app-debug.apk`.
Use `pnpm --dir mobile open` for Android Studio. Supply the server URL in your
environment; `.env` files are deliberately not loaded or packaged automatically.
Keep the origin under your control: remote scripts can access native plugins.

For an Android emulator only:

```sh
export MOBILE_SERVER_URL=http://10.0.2.2:3000
export MOBILE_ALLOW_LOCAL_HTTP=1
pnpm --dir mobile build:debug
```

Release builds reject HTTP, including direct Gradle invocations after sync.
Runtime logging is debug-only. Native backups are disabled. Only internet and
foreground location permissions are declared; location must be requested by the
web app only after its workspace policy/consent check. No background location.

## Why remote origin

Per the approved plan, `server.url` loads the existing HTTPS site so Better Auth
and server functions keep their same-origin contract. Capacitor documents this
option as live-reload-oriented, not intended for production. The exception here
is restricted to the internal managed Android pilot, subject to M0 device tests.
Versions are pinned in package.json and pnpm-lock.yaml. No wildcard navigation
allowlist, CORS bypass, second API or token flow is introduced.

First sign-in requires internet. The bundled `www/index.html` is a packaging
placeholder, not an offline app implementation. An APK alone does not satisfy
the offline requirements. If the Android WebView cannot cold-boot the service
worker shell after force-stop, use the plan's bundled-shell fallback and
re-estimate before rollout.

## Repeat the local emulator spike

The real Android instrumentation test checks encrypted IndexedDB restoration
across activity restart. A separate synthetic service worker test drops origin
requests and checks that its cached document reopens. No employee data is used.

```sh
pnpm --dir mobile spike:server
# In a second terminal, with an emulator running:
adb reverse tcp:4174 tcp:4174
export MOBILE_SERVER_URL=http://localhost:4174
export MOBILE_ALLOW_LOCAL_HTTP=1
pnpm --dir mobile test:device
```

To test storage against the local Trackly app instead, reverse port 3000 and
set `MOBILE_SERVER_URL=http://localhost:3000`. The synthetic SW test is skipped
for all origins except its fixture. Reports are under
`android/app/build/reports/androidTests/connected/debug/`.

Recorded: Android 16 storage check and Android 17 storage/SW fixture tests pass.
Production HTTPS origin and managed physical devices still require testing.

## Test the real queue across process death

With the local Vite app running on port 3000 and one emulator connected:

```sh
export MOBILE_SERVER_URL=http://localhost:3000
export MOBILE_ALLOW_LOCAL_HTTP=1
pnpm --dir mobile test:restart
```

This builds/installs the debug app and test APK, imports the actual development
queue modules into the WebView, migrates a synthetic legacy entry, saves another
entry, force-stops the app and verifies both encrypted records after reopening.
It uses only a separate `__android_m1_qa` namespace, never sends mutations to the
server and wipes its test data afterwards. The test refuses any non-local origin.
Recorded: both stages passed on the Android 17 / API 37 emulator.

## Offline sign-out force-stop check

With the same local origin configuration and one emulator connected:

```sh
pnpm --dir mobile test:signout
```

This uses a dedicated `trackly_local_signout_qa` WebView data-directory suffix
configured before WebView starts ([Android API reference](<https://developer.android.com/reference/android/webkit/WebView#setDataDirectorySuffix(java.lang.String)>)).
It never clears the normal app profile. The runner temporarily disables Android
Wi-Fi/mobile data, while ADB loopback still supplies the development modules,
then restores the original connectivity settings in `finally` and stops the QA
process. The script refuses non-local origins or unknown network settings.

The test clears synthetic work through the actual local logout code, force-stops
the process, verifies the deny cookie and pending device fence remain, verifies
that activation is blocked, then injects a synthetic server acknowledgement and
checks the generation rotates. Both stages passed twice on Android 17/API 37.
This is not a real authenticated-session revocation test or full offline boot;
physical-device/production-origin cookie acceptance remains open.

## M0 physical-device checks

Record model, Android/WebView version, shell version, origin, and results in
`docs/ways-of-work/plan/cross-platform/offline-first-mobile-app/implementation/status.md`.

1. Install debug APK, sign in to a test workspace online, then force-stop and
   reopen. Verify session cookies survive.
2. Use a **production build** of the web app (Vite dev skips SW registration).
   Inspect the app through Android Studio/WebView tools: SW registration and
   Cache Storage must work on the remote HTTPS origin.
3. After one online visit and SW activation, force-stop, enable airplane mode,
   relaunch. Record whether the cached tracker can render, rather than assuming
   that asset caching alone proves offline boot. The current web app is expected
   to fail until M2; retest after that implementation.
4. In the test origin, store an IndexedDB value and a non-extractable WebCrypto
   key; force-stop/reboot; confirm restore and decrypt. Test denied persistent
   storage, quota errors and eviction without using real employee records.
5. Later M3: native geolocation on/off/denied, without Play Services, back button,
   safe areas, keyboard, resume replay, MDM install/update/rollback/wipe.

## Release and IT handoff

GitHub Releases publish the APK for internal testing; see
[RELEASING.md](RELEASING.md) for the tag workflow, signing secrets and the
release checklist. `pnpm --dir mobile build:release` still generates an
unsigned AAB until IT supplies a release signing setup. Do not distribute
unsigned or debug builds as production.
Never commit keystores/passwords. Keep the same application ID and signing key
for upgrades. Set monotonically increasing `ANDROID_VERSION_CODE` and a readable
`ANDROID_VERSION_NAME`. Downgrades and MDM uninstall/reinstall can erase local
work: sync/export pending work first; rollback must be tested for the chosen EMM.

Managed distribution, certificate custody, enrolled devices, production signing,
and physical-device acceptance are pending. No public store release is included.
