const overlay = document.getElementById('loading-overlay')
const frame = document.getElementById('app-frame')

// Hide loading overlay once the iframe has loaded
frame.addEventListener('load', () => {
  overlay.classList.add('hidden')
  // After fade, remove from layout
  setTimeout(() => { overlay.style.display = 'none' }, 250)
})

// Relay timer state messages from the iframe to the background service worker
// so it can update the extension badge
window.addEventListener('message', (event) => {
  if (event.data?.type === 'CLOCKIFY_TIMER_STATE') {
    chrome.runtime.sendMessage({ type: 'TIMER_UPDATE', ...event.data }).catch(() => {})
  }
})

// Fetch the active tab's page info and store it for the iframe to use
async function capturePageInfo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id || !tab.url || tab.url.startsWith('chrome://')) return

    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_INFO' }).catch(() => null)
    if (response) {
      await chrome.storage.session.set({ pageInfo: response })
    }
  } catch {
    // Content script may not be injected on all pages — silently ignore
  }
}

capturePageInfo()
