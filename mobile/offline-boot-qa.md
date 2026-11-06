# Production offline boot QA

This local synthetic test uses the real production web build and Capacitor app.
It does not establish live account authentication, payroll correctness, physical
device durability, MDM compatibility or launch performance. Use an emulator.
The test uses a separate WebView profile; never clear the default app profile.

From the repository root, build the web app, then build the debug and test APKs:

```sh
pnpm build
export MOBILE_SERVER_URL=http://localhost:3008
export MOBILE_ALLOW_LOCAL_HTTP=1
pnpm --dir mobile build:debug
pnpm --dir mobile exec node scripts/gradle.mjs assembleDebugAndroidTest
```

Start these two servers in separate terminals. Only the first loads local
environment configuration; neither prints it. The second serves a standalone
synthetic fixture compiled from the real storage/bootstrap helpers.

```sh
pnpm exec dotenv -e .env.local -- env PORT=3008 node .output/server/index.mjs
```

```sh
node mobile/scripts/boot-fixture-server.mjs
```

With the emulator running, set `adb` to the installed SDK platform-tools binary.
For example, on macOS:

```sh
export PATH="$HOME/Library/Android/sdk/platform-tools:$PATH"
adb reverse tcp:3008 tcp:3008
adb reverse tcp:3009 tcp:3009
adb install -r mobile/android/app/build/outputs/apk/debug/app-debug.apk
adb install -r mobile/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell am force-stop com.trackly.internal.debug
# Only this dedicated synthetic QA directory may be reset:
adb shell run-as com.trackly.internal.debug rm -rf app_webview_trackly_offline_boot_qa
adb shell am instrument -w -e class com.trackly.internal.StorageCapabilityTest#productionOfflineBootPrime -e m1stage prime -e storageProfile offline-boot com.trackly.internal.debug.test/androidx.test.runner.AndroidJUnitRunner
```

Require `OK (1 test)`; instrument commands can exit successfully after test
failures. Record the current Wi-Fi and mobile-data settings (`0` or `1`) before
changing them. Stop **both servers above** and verify port 3008 no longer responds.
Then:

```sh
adb shell settings get global wifi_on
adb shell settings get global mobile_data
adb shell svc wifi disable
adb shell svc data disable
adb shell am force-stop com.trackly.internal.debug
adb shell am instrument -w -e class com.trackly.internal.StorageCapabilityTest#productionOfflineBootAfterProcessDeath -e m1stage restore -e storageProfile offline-boot com.trackly.internal.debug.test/androidx.test.runner.AndroidJUnitRunner
```

Require `OK (1 test)` again. This stage imports no fixture or source code: it
launches the cached production app, requires Android to report offline, verifies
the own cached entry appears, verifies foreign-member data is absent, opens the
mobile manual-entry dialog, and verifies the seeded unsubmitted draft restores.
Before switching to manual mode, it verifies the saved unstarted timer inputs
in the mobile timer dialog. These are form details, not an automatically started
timer or a restored historical start timestamp.
It closes the capture dialog, resumes the separately seeded entry edit, and
checks that its description and notes restore. Because this is a synced entry,
Save Changes stays disabled and the dialog explains that a connection is needed.
The edit fixture is opt-in and shares the exact timestamp used for the cached
entry, so it does not manufacture a source-version conflict. This verifies
production restoration from seeded durable storage; real-user editor capture
and multi-device concurrency remain separate acceptance checks.
It then performs a full-document offline navigation to timesheet and verifies
the own DTR grid, foreign-member exclusion, read-only notice and disabled Export.

Finally, restore Wi-Fi/mobile data to their recorded values using `svc ... enable`
or `disable`, force-stop the QA app, and restore the development app:

```sh
adb shell am force-stop com.trackly.internal.debug
export MOBILE_SERVER_URL=http://localhost:3000
pnpm --dir mobile build:debug
adb install -r mobile/android/app/build/outputs/apk/debug/app-debug.apk
adb reverse tcp:3000 tcp:3000
```

The standard debug APK/config must point to localhost:3000 after this test. The
synthetic profile never authenticates a real account and remains separate from
the normal profile. Remove QA reverse mappings when no longer needed.

## Warm grace expiry

Repeat the prime/restore procedure with a fresh isolated QA profile. Add
`-e graceExpiryQa 1` to the prime instrumentation command. This seeds one pending
manual entry and a **30-second test-only** session grace; standard builds retain
the configured 24-hour default. Stop both servers, disable networking and run the
restore command promptly, using the test class method
`StorageCapabilityTest#productionOfflineWarmGraceExpiry` instead of
`productionOfflineBootAfterProcessDeath`. Keep `-e m1stage restore` and
`-e storageProfile offline-boot`.

Require `OK (1 test)`. The workspace must first open within grace, then show
`Sign in to keep tracking` and the expiry explanation. The test opens the mobile capture dialog before expiry; that portaled dialog
must disappear when the gate appears. Capture controls must be inside the
hidden/inert workspace and the root pending button must still report one item. Starting after the short grace has already expired fails the test;
repeat the prime procedure in that case. Restore connectivity and the standard
localhost:3000 debug app as above. This case verifies a warm session deadline in
the real production WebView; successful live re-auth/replay and physical-device
background/resume remain separate acceptance checks.

## Server unreachable while Android reports online

Prime the standard isolated profile without `graceExpiryQa`. Stop both local
servers and verify their ports are no longer listening. Keep Wi-Fi and mobile
data enabled; do not use airplane mode for this case. Force-stop the app, then
run the restore instrumentation command with the method
`StorageCapabilityTest#productionServerUnreachableWhileAndroidOnline`.
Keep `-e m1stage restore` and `-e storageProfile offline-boot`.

Require `OK (1 test)`. The test requires `navigator.onLine === true`, the own
cached tracker, no foreign data, and the root `Offline · No pending work` button.
That root label requires the shared failed-probe state even though no mutations
are queued. The fixture has no live account, so successful authenticated recovery
is covered by coordinator integration tests rather than this native scenario.
Restore localhost:3000 and stop the emulator as described above.
