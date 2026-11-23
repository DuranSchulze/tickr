package com.trackly.internal;

import static org.junit.Assert.*;

import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.Before;
import org.junit.Assume;
import org.junit.runner.RunWith;

/** Emulator smoke gate. Physical managed-device/SW cold-boot QA remains separate. */
@RunWith(AndroidJUnit4.class)
public class StorageCapabilityTest {
    @Before
    public void isolateDeviceWipeTests() {
        String profile = InstrumentationRegistry.getArguments().getString("storageProfile");
        if ("local-signout".equals(profile) || "offline-boot".equals(profile)) {
            assertTrue("Device-wipe QA must use the debug app", InstrumentationRegistry.getInstrumentation().getTargetContext().getPackageName().endsWith(".debug"));
            // API 28+: configure before any WebView exists. This separate QA
            // profile never touches the default app's cookies, keys or queue.
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
                android.webkit.WebView.setDataDirectorySuffix("offline-boot".equals(profile)
                    ? "trackly_offline_boot_qa" : "trackly_local_signout_qa"));
        }
    }

    private ActivityScenario<MainActivity> productionBootApp(String stage) throws Exception {
        Assume.assumeTrue("offline-boot".equals(InstrumentationRegistry.getArguments().getString("storageProfile")));
        Assume.assumeTrue(stage.equals(InstrumentationRegistry.getArguments().getString("m1stage")));
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("Production boot QA only uses its local server", "http://localhost:3008/app/time-tracker",
            new JSONObject(readConfig(context)).getJSONObject("server").getString("url"));
        ActivityScenario<MainActivity> scenario = ActivityScenario.launch(new Intent(context, MainActivity.class));
        waitForRemoteOrigin(scenario);
        return scenario;
    }

    @Test
    public void productionOfflineBootPrime() throws Exception {
        try (ActivityScenario<MainActivity> scenario = productionBootApp("prime")) {
            evaluate(scenario, """
                (async()=>{try{
                  const registration=await navigator.serviceWorker.register('/sw.js');
                  await navigator.serviceWorker.ready;
                  const fixture=await import('http://localhost:3009/fixture.js');
                  const now=Date.now();
                  await fixture.prepareOfflineBootstrapFixture(now);
                  await fixture.prepareOfflineEditDraftFixture(now);
                  if (%s) await fixture.prepareOfflineExpiryFixture(now);
                  window.__tracklyM0Result='primed';
                }catch(error){window.__tracklyM0Error=String(error);window.__tracklyM0Result='failed'}})()
                """.formatted("1".equals(InstrumentationRegistry.getArguments().getString("graceExpiryQa"))));
            waitForResult(scenario, "primed");
        }
    }

    @Test
    public void productionOfflineBootAfterProcessDeath() throws Exception {
        try (ActivityScenario<MainActivity> scenario = productionBootApp("restore")) {
            assertEquals("Android must report offline", "false", evaluate(scenario, "navigator.onLine"));
            long deadline = SystemClock.elapsedRealtime() + 30_000;
            while (SystemClock.elapsedRealtime() < deadline) {
                if ("true".equals(evaluate(scenario, "document.body.innerText.includes('Cached own entry')"))) {
                    assertEquals("Other members' data must not be restored", "false",
                        evaluate(scenario, "document.body.innerText.includes('Private foreign')"));
                    assertEquals("Tracker route must render", "\"/app/time-tracker\"", evaluate(scenario, "location.pathname.replace(/\\/$/, '')"));
                    evaluate(scenario, "document.querySelector('button[aria-label=\"Start timer\"]').click()");
                    long timerDraftDeadline = SystemClock.elapsedRealtime() + 10_000;
                    boolean restoredTimerInputs = false;
                    while (SystemClock.elapsedRealtime() < timerDraftDeadline) {
                        if ("true".equals(evaluate(scenario, "Array.from(document.querySelectorAll('[role=\"dialog\"] input,[role=\"dialog\"] textarea')).some(input=>input.value==='Unstarted Android task')"))) {
                            restoredTimerInputs = true;
                            break;
                        }
                        SystemClock.sleep(100);
                    }
                    assertTrue("Unstarted timer inputs must survive process death", restoredTimerInputs);
                    long draftDeadline = SystemClock.elapsedRealtime() + 10_000;
                    while (SystemClock.elapsedRealtime() < draftDeadline) {
                        evaluate(scenario, "document.querySelector('[role=\"dialog\"] button[title=\"Manual entry\"]')?.click()");
                        if ("true".equals(evaluate(scenario, "Array.from(document.querySelectorAll('[role=\"dialog\"] input,[role=\"dialog\"] textarea')).some(input=>input.value==='Unsubmitted Android draft')"))) {
                            assertSavedEntryEditOffline(scenario);
                            assertOwnTimesheetOffline(scenario);
                            return;
                        }
                        SystemClock.sleep(100);
                    }
                    fail("The unsubmitted manual draft did not survive process death");
                    return;
                }
                SystemClock.sleep(250);
            }
            fail("Production cached tracker did not render: " + evaluate(scenario, "document.body.innerText.slice(0,1800)"));
        }
    }
    @Test
    public void productionServerUnreachableWhileAndroidOnline() throws Exception {
        try (ActivityScenario<MainActivity> scenario = productionBootApp("restore")) {
            assertEquals("Keep Android networking enabled for this case", "true", evaluate(scenario, "navigator.onLine"));
            long deadline = SystemClock.elapsedRealtime() + 30_000;
            while (SystemClock.elapsedRealtime() < deadline) {
                if ("true".equals(evaluate(scenario, "document.body.innerText.includes('Cached own entry') && Array.from(document.querySelectorAll('button')).some(button=>button.innerText.includes('Offline') && button.innerText.includes('No pending work'))"))) {
                    assertEquals("The browser still reports online", "true", evaluate(scenario, "navigator.onLine"));
                    assertEquals("Other members remain absent", "false", evaluate(scenario, "document.body.innerText.includes('Private foreign')"));
                    return;
                }
                SystemClock.sleep(200);
            }
            fail("Failed health probe did not reach the root offline surface: " + evaluate(scenario, "document.body.innerText.slice(-1800)"));
        }
    }
    @Test
    public void productionOfflineWarmGraceExpiry() throws Exception {
        try (ActivityScenario<MainActivity> scenario = productionBootApp("restore")) {
            assertEquals("Android must report offline", "false", evaluate(scenario, "navigator.onLine"));
            long deadline = SystemClock.elapsedRealtime() + 45_000;
            boolean openedWithinGrace = false;
            boolean openedCapture = false;
            while (SystemClock.elapsedRealtime() < deadline) {
                if ("true".equals(evaluate(scenario, "Array.from(document.querySelectorAll('button[aria-label=\"Start timer\"]')).some(button=>!button.closest('[hidden]'))"))) openedWithinGrace = true;
                if (openedWithinGrace && !openedCapture) {
                    evaluate(scenario, "document.querySelector('button[aria-label=\"Start timer\"]')?.click()");
                    openedCapture = "true".equals(evaluate(scenario, "!!document.querySelector('[role=\"dialog\"]')"));
                }
                if ("true".equals(evaluate(scenario, "Array.from(document.querySelectorAll('h1')).some(title=>title.innerText==='Sign in to keep tracking') && document.body.innerText.includes('Your offline session has expired')"))) {
                    assertTrue("The workspace must first open within grace", openedWithinGrace);
                    assertTrue("Open a capture overlay before expiry", openedCapture);
                    assertEquals("Portaled capture dialog must close at expiry", "true", evaluate(scenario, "document.querySelector('[role=\"dialog\"]') === null"));
                    assertEquals("Pending count stays reachable", "true", evaluate(scenario, "Array.from(document.querySelectorAll('button')).some(button=>button.innerText.includes('1 pending') && !button.closest('[hidden]'))"));
                    assertEquals("Capture controls are removed from interaction", "true", evaluate(scenario, "!!document.querySelector('button[aria-label=\"Start timer\"]')?.closest('[hidden][inert]')"));
                    assertEquals("Expiry is explained", "true", evaluate(scenario, "document.body.innerText.includes('Your offline session has expired')"));
                    return;
                }
                SystemClock.sleep(200);
            }
            fail("Warm offline grace did not expire: " + evaluate(scenario, "document.body.innerText.slice(-1800)"));
        }
    }
    private void assertSavedEntryEditOffline(ActivityScenario<MainActivity> scenario) throws Exception {
        // Close capture through the production dialog control.
        evaluate(scenario, "document.querySelector('[role=\"dialog\"] button[aria-label=\"Close\"]')?.click()");
        long deadline = SystemClock.elapsedRealtime() + 10_000;
        while (SystemClock.elapsedRealtime() < deadline) {
            evaluate(scenario, "Array.from(document.querySelectorAll('[aria-label=\"Saved entry edits\"] button')).find(button=>button.innerText.trim()==='Resume edit')?.click()");
            if ("true".equals(evaluate(scenario, "Array.from(document.querySelectorAll('[role=\"dialog\"] input,[role=\"dialog\"] textarea')).some(input=>input.value==='Restored entry edit')"))) {
                assertEquals("Saved notes must restore", "true", evaluate(scenario, "Array.from(document.querySelectorAll('[role=\"dialog\"] input,[role=\"dialog\"] textarea')).some(input=>input.value==='Recovered edit notes')"));
                assertEquals("Synced edit must stay read-only offline", "true", evaluate(scenario, "Array.from(document.querySelectorAll('[role=\"dialog\"] button')).find(button=>button.innerText.trim()==='Save Changes')?.disabled === true"));
                assertEquals("Offline restriction must be explained", "true", evaluate(scenario, "document.querySelector('[role=\"dialog\"]')?.innerText.includes('Connect to edit this synced entry') || false"));
                return;
            }
            SystemClock.sleep(150);
        }
        fail("Saved entry edit did not restore: " + evaluate(scenario, "document.body.innerText.slice(-1800)"));
    }
    private void assertOwnTimesheetOffline(ActivityScenario<MainActivity> scenario) throws Exception {
        // Full document navigation exercises the worker shell and route guards
        // again with both servers stopped; no fixture imports are available.
        evaluate(scenario, "location.assign('/app/timesheet')");
        long navigationDeadline = SystemClock.elapsedRealtime() + 30_000;
        int stable = 0;
        while (SystemClock.elapsedRealtime() < navigationDeadline && stable < 3) {
            java.util.concurrent.atomic.AtomicBoolean loaded = new java.util.concurrent.atomic.AtomicBoolean(false);
            scenario.onActivity(activity -> {
                android.webkit.WebView view = activity.getBridge().getWebView();
                loaded.set(view.getProgress() == 100 && "http://localhost:3008/app/timesheet".equals(view.getUrl()));
            });
            stable = loaded.get() ? stable + 1 : 0;
            SystemClock.sleep(250);
        }
        assertEquals("Offline timesheet document navigation must complete", 3, stable);
        long deadline = SystemClock.elapsedRealtime() + 30_000;
        while (SystemClock.elapsedRealtime() < deadline) {
            if ("true".equals(evaluate(scenario, "document.querySelector('[aria-label=\"Weekly DTR grid\"]')?.innerText.includes('QA member') || false"))) {
                assertEquals("Offline timesheet must be marked read-only", "true", evaluate(scenario, "document.body.innerText.includes('Your own cached timesheet, read-only')"));
                assertEquals("Foreign data must remain absent", "false", evaluate(scenario, "document.body.innerText.includes('Private foreign')"));
                assertEquals("Offline export must be unavailable", "true", evaluate(scenario, "Array.from(document.querySelectorAll('button')).find(button=>button.innerText.trim()==='Export')?.disabled === true"));
                return;
            }
            SystemClock.sleep(250);
        }
        fail("Own offline timesheet did not render: " + evaluate(scenario, "document.body.innerText.slice(0,1800)"));
    }
    private String readConfig(Context context) throws Exception {
        try (java.io.InputStream stream = context.getAssets().open("capacitor.config.json");
             java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = stream.read(buffer)) != -1) bytes.write(buffer, 0, count);
            return new String(bytes.toByteArray(), java.nio.charset.StandardCharsets.UTF_8);
        }
    }

    private String evaluate(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(script, value -> {
            result.set(value);
            latch.countDown();
        }));
        assertTrue("WebView JS evaluation timed out", latch.await(10, TimeUnit.SECONDS));
        return result.get();
    }

    private void waitForRemoteOrigin(ActivityScenario<MainActivity> scenario) throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String config = readConfig(context);
        String expected = new JSONObject(config).getJSONObject("server").getString("url");
        String origin = android.net.Uri.parse(expected).getScheme() + "://" + android.net.Uri.parse(expected).getAuthority();
        long deadline = SystemClock.elapsedRealtime() + 45_000;
        String previousHref = "";
        int stable = 0;
        while (SystemClock.elapsedRealtime() < deadline) {
            Object observed = new org.json.JSONTokener(evaluate(scenario, "location.origin")).nextValue();
            // The tracker can redirect to /auth during the first document load.
            // Do not inject a storage test into a document about to disappear.
            String href = evaluate(scenario, "location.href");
            if (origin.equals(observed) && evaluate(scenario, "document.readyState").equals("\"complete\"")) {
                stable = href.equals(previousHref) ? stable + 1 : 0;
                if (stable >= 3) return;
            } else stable = 0;
            previousHref = href;
            SystemClock.sleep(250);
        }
        fail("Configured Trackly origin did not load in the Android WebView. Observed: " + evaluate(scenario, "location.origin"));
    }

    @Test
    public void remoteOriginSupportsDurableEncryptedStorageAcrossActivityRestart() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Intent intent = new Intent(context, MainActivity.class);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(intent)) {
            waitForRemoteOrigin(scenario);
            assertEquals("true", evaluate(scenario, "isSecureContext && 'serviceWorker' in navigator && !!indexedDB && !!crypto.subtle"));
            evaluate(scenario, "(async()=>{try{const r=indexedDB.open('__trackly_m0_probe',1);r.onupgradeneeded=()=>r.result.createObjectStore('probe');const db=await new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode('trackly-probe'));await new Promise((ok,no)=>{const t=db.transaction('probe','readwrite');t.objectStore('probe').put({key,iv,data},'saved');t.oncomplete=ok;t.onerror=()=>no(t.error)});db.close();window.__tracklyM0Result='saved'}catch(e){window.__tracklyM0Error=e.message;window.__tracklyM0Result='failed'}})()");
            waitForResult(scenario, "saved");
        }
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(intent)) {
            waitForRemoteOrigin(scenario);
            evaluate(scenario, "(async()=>{try{const r=indexedDB.open('__trackly_m0_probe',1);const db=await new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});const saved=await new Promise((ok,no)=>{const q=db.transaction('probe').objectStore('probe').get('saved');q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)});const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:saved.iv},saved.key,saved.data);window.__tracklyM0Result=new TextDecoder().decode(plain)==='trackly-probe'&&!saved.key.extractable?'restored':'failed';db.close();indexedDB.deleteDatabase('__trackly_m0_probe')}catch(e){window.__tracklyM0Error=e.message;window.__tracklyM0Result='failed'}})()");
            waitForResult(scenario, "restored");
        }
    }

    private void waitForResult(ActivityScenario<MainActivity> scenario, String expected) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 15_000;
        while (SystemClock.elapsedRealtime() < deadline) {
            String result = evaluate(scenario, "window.__tracklyM0Result || 'pending'");
            if (result.equals(JSONObject.quote(expected))) return;
            assertNotEquals("Storage probe failed: " + evaluate(scenario, "window.__tracklyM0Error || 'unknown'"), "\"failed\"", result);
            SystemClock.sleep(100);
        }
        fail("Encrypted storage probe timed out: " + expected + "; phase: " + evaluate(scenario, "window.__tracklyM0Phase || 'document changed'"));
    }

    private void setFixtureOffline(boolean offline) throws Exception {
        java.net.HttpURLConnection connection = (java.net.HttpURLConnection)
            new java.net.URL("http://localhost:4174/" + (offline ? "__offline" : "__online")).openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(5000);
        connection.setReadTimeout(5000);
        try { assertEquals(204, connection.getResponseCode()); }
        finally { connection.disconnect(); }
    }

    private ActivityScenario<MainActivity> localDevelopmentApp(String stage) throws Exception {
        Assume.assumeTrue(stage.equals(InstrumentationRegistry.getArguments().getString("m1stage")));
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String config = readConfig(context);
        assertEquals("These tests only use local synthetic data", "http://localhost:3000/app/time-tracker", new JSONObject(config).getJSONObject("server").getString("url"));
        ActivityScenario<MainActivity> scenario = ActivityScenario.launch(new Intent(context, MainActivity.class));
        waitForRemoteOrigin(scenario);
        return scenario;
    }

    @Test
    public void localSignOutPrimeForRestart() throws Exception {
        Assume.assumeTrue("local-signout".equals(InstrumentationRegistry.getArguments().getString("storageProfile")));
        try (ActivityScenario<MainActivity> scenario = localDevelopmentApp("prime")) {
            evaluate(scenario, """
                (async()=>{try{
                  window.__tracklyM0Phase='imports';
                  if(navigator.onLine) throw new Error('QA requires Android connectivity disabled');
                  const db=await import('http://localhost:3000/src/lib/time-tracker/offline-db.ts');
                  const q=await import('http://localhost:3000/src/lib/time-tracker/offline-queue.ts');
                  const logout=await import('http://localhost:3000/src/lib/time-tracker/offline-signout.ts');
                  const cookie=await import('http://localhost:3000/src/lib/local-signout.ts');
                  const scope={workspaceId:'__android_local_signout_qa',memberId:'__android_local_signout_qa'};
                  window.__tracklyM0Phase='reset';await db.wipeOfflineDevice();cookie.clearLocalSignOutMarker();await db.activateOfflineScope(scope);
                  window.__tracklyM0Phase='enqueue';
                  await q.enqueueOfflineMutation(scope.workspaceId,scope.memberId,{type:'startTimer',optimisticId:'qa-signout',payload:{description:'QA synthetic work',projectId:'synthetic',taskId:null,tagIds:[],billable:false,startedAt:new Date().toISOString()}});
                  window.__tracklyM0Phase='local-logout';await logout.completeDeviceSignOut({signOut:async()=>{throw new Error('Unexpected remote signout')},clearMemory:async()=>{}},'local');
                  window.__tracklyM0Phase='read-final';
                  const state=await db.readOfflineDeviceState();
                  const items=await q.loadOfflineQueue(scope.workspaceId,scope.memberId);
                  window.__tracklyM0Result=state.pendingServerSignOut&&state.signedOut&&cookie.hasLocalSignOutMarker(document.cookie)&&items.length===0?'primed':'failed';
                }catch(e){window.__tracklyM0Error=e.message;window.__tracklyM0Result='failed'}})()
                """);
            waitForResult(scenario, "primed");
        }
    }

    @Test
    public void localSignOutRemainsLockedAfterProcessDeath() throws Exception {
        Assume.assumeTrue("local-signout".equals(InstrumentationRegistry.getArguments().getString("storageProfile")));
        try (ActivityScenario<MainActivity> scenario = localDevelopmentApp("restore")) {
            evaluate(scenario, """
                (async()=>{try{
                  if(navigator.onLine) throw new Error('QA requires Android connectivity disabled');
                  const db=await import('http://localhost:3000/src/lib/time-tracker/offline-db.ts');
                  const q=await import('http://localhost:3000/src/lib/time-tracker/offline-queue.ts');
                  const logout=await import('http://localhost:3000/src/lib/time-tracker/offline-signout.ts');
                  const cookie=await import('http://localhost:3000/src/lib/local-signout.ts');
                  const scope={workspaceId:'__android_local_signout_qa',memberId:'__android_local_signout_qa'};
                  const state=await db.readOfflineDeviceState();
                  const items=await q.loadOfflineQueue(scope.workspaceId,scope.memberId);
                  let blocked=false;try{await db.activateOfflineScope(scope,state.generation)}catch{blocked=true}
                  if(!state.pendingServerSignOut||!cookie.hasLocalSignOutMarker(document.cookie)||items.length||!blocked)throw new Error('Local signout fence did not survive');
                  const valid=await navigator.locks.request('trackly-pending-server-signout',async()=>{
                    const pending=await db.readOfflineDeviceState();
                    await db.acknowledgeServerSignOut(pending.generation);cookie.clearLocalSignOutMarker();
                    const confirmed=await db.readOfflineDeviceState();
                    return !cookie.hasLocalSignOutMarker(document.cookie)&&!confirmed.pendingServerSignOut&&confirmed.signedOut&&confirmed.generation!==pending.generation;
                  });
                  await db.wipeOfflineDevice();cookie.clearLocalSignOutMarker();
                  window.__tracklyM0Result=valid?'restored':'failed';
                }catch(e){window.__tracklyM0Error=e.message;window.__tracklyM0Result='failed'}})()
                """);
            waitForResult(scenario, "restored");
        }
    }

    @Test
    public void actualQueuePrimeForRestart() throws Exception {
        try (ActivityScenario<MainActivity> scenario = localDevelopmentApp("prime")) {
            evaluate(scenario, "(async()=>{try{const q=await import('http://localhost:3000/src/lib/time-tracker/offline-queue.ts');const db=await import('http://localhost:3000/src/lib/time-tracker/offline-db.ts');const scope={workspaceId:'__android_m1_qa',memberId:'__android_m1_qa'};await db.wipeOfflineScope(scope);await db.activateOfflineScope(scope);const payload={description:'M1 synthetic offline entry',projectId:'synthetic',taskId:null,tagIds:[],billable:false,startedAt:'2026-11-05T00:00:00.000Z',endedAt:'2026-11-05T01:00:00.000Z',durationSeconds:3600,notes:''};localStorage.setItem('offline-queue:__android_m1_qa:__android_m1_qa',JSON.stringify([{id:'c13460a7-205a-4c7f-8ebe-a614b2bab112',type:'createManualEntry',optimisticId:'qa-legacy',payload}]));await q.loadOfflineQueue(scope.workspaceId,scope.memberId);await q.enqueueOfflineMutation(scope.workspaceId,scope.memberId,{type:'createManualEntry',optimisticId:'qa-new',payload});const items=await q.loadOfflineQueue(scope.workspaceId,scope.memberId);window.__tracklyM0Result=items.length===2&&!localStorage.getItem('offline-queue:__android_m1_qa:__android_m1_qa')?'primed':'failed'}catch(e){window.__tracklyM0Error=e.message;window.__tracklyM0Result='failed'}})()");
            waitForResult(scenario, "primed");
        }
    }

    @Test
    public void actualQueueRestoresAfterProcessDeath() throws Exception {
        try (ActivityScenario<MainActivity> scenario = localDevelopmentApp("restore")) {
            evaluate(scenario, "(async()=>{try{const q=await import('http://localhost:3000/src/lib/time-tracker/offline-queue.ts');const db=await import('http://localhost:3000/src/lib/time-tracker/offline-db.ts');const scope={workspaceId:'__android_m1_qa',memberId:'__android_m1_qa'};const items=await q.loadOfflineQueue(scope.workspaceId,scope.memberId);const valid=items.length===2&&items[0].id==='c13460a7-205a-4c7f-8ebe-a614b2bab112'&&items.every(i=>i.payload.description==='M1 synthetic offline entry'&&i.payload.durationSeconds===3600);await db.wipeOfflineScope(scope);window.__tracklyM0Result=valid?'restored':'failed'}catch(e){window.__tracklyM0Error=e.message;window.__tracklyM0Result='failed'}})()");
            waitForResult(scenario, "restored");
        }
    }

    @Test
    public void serviceWorkerBootsCachedDocumentWhenOriginIsUnavailable() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String config = readConfig(context);
        // Synthetic fixture only: never changes availability of a real origin.
        Assume.assumeTrue(new JSONObject(config).getJSONObject("server").getString("url").equals("http://localhost:4174/app/time-tracker"));
        setFixtureOffline(false);
        Intent intent = new Intent(context, MainActivity.class);
        try {
            try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(intent)) {
                waitForRemoteOrigin(scenario);
                long deadline = SystemClock.elapsedRealtime() + 20_000;
                while (!evaluate(scenario, "window.__tracklySwReady === true").equals("true")) {
                    assertTrue("Service worker failed to activate", SystemClock.elapsedRealtime() < deadline);
                    SystemClock.sleep(100);
                }
            }
            setFixtureOffline(true);
            try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(intent)) {
                waitForRemoteOrigin(scenario);
                assertEquals("true", evaluate(scenario, "document.getElementById('m0-spike')?.textContent === 'Trackly offline spike'"));
            }
        } finally { setFixtureOffline(false); }
    }
}
