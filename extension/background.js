// Open side panel when the action icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})

// Update badge based on timer state messages relayed from the side panel
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
