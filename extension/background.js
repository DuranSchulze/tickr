// Open side panel when the action icon is clicked
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {
    // Already set or not available — silently ignore
  })

// ── Timer badge ──────────────────────────────────────────────────────────────
// The side panel relays timer state from the iframe; we update the extension
// badge to show the current running time at a glance.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'TIMER_UPDATE') return

  if (msg.running && typeof msg.elapsedSeconds === 'number') {
    const totalMins = Math.floor(msg.elapsedSeconds / 60)
    const hours = Math.floor(totalMins / 60)
    const mins = totalMins % 60
    const text = hours > 0 ? `${hours}h${mins}m` : `${totalMins}m`

    chrome.action.setBadgeText({ text })
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' })
    chrome.action.setBadgeTextColor({ color: '#ffffff' })
  } else {
    chrome.action.setBadgeText({ text: '' })
  }
})

// ── Install / update handler ─────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log(
      '[Trackly] Extension installed. Click the toolbar icon to open the side panel.',
    )
  } else if (details.reason === 'update') {
    console.log('[Trackly] Extension updated.')
  }
})
