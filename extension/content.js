chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_PAGE_INFO') {
    sendResponse({
      title: document.title,
      url: location.href,
    })
  }
})
