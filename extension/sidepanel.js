const overlay = document.getElementById('loading-overlay')
const frame = document.getElementById('app-frame')
const appOrigin = new URL(APP_URL).origin

// Hide loading overlay once the iframe has loaded
frame.addEventListener('load', () => {
  overlay.classList.add('hidden')
  // After fade, remove from layout
  setTimeout(() => {
    overlay.style.display = 'none'
  }, 250)
})

// Relay timer state messages from the iframe to the background service worker
// so it can update the extension badge
window.addEventListener('message', (event) => {
  const isAppFrame = event.source === frame.contentWindow
  const isTrustedOrigin = event.origin === appOrigin
  const isTimerState =
    event.data?.type === 'TRACKLY_TIMER_STATE' ||
    event.data?.type === 'CLOCKIFY_TIMER_STATE'

  if (isAppFrame && isTrustedOrigin && isTimerState) {
    // Relay timer state to the background service worker for badge updates.
    // NOTE: type must come AFTER the spread to override event.data.type.
    chrome.runtime
      .sendMessage({ ...event.data, type: 'TIMER_UPDATE' })
      .catch(() => {})
  }
})

// Fetch the active tab's page info and store it for the iframe to use
async function capturePageInfo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id || !tab.url || tab.url.startsWith('chrome://')) return

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        title: document.title,
        url: location.href,
      }),
    })

    if (result?.result) {
      await chrome.storage.session.set({ pageInfo: result.result })
    }
  } catch {
    // Chrome-internal pages and restricted hosts do not allow script injection.
  }
}

capturePageInfo()
