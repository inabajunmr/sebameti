const TOGGLE_MESSAGE = { type: "toggle-ui" };

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, TOGGLE_MESSAGE);
  } catch (error) {
    if (chrome.runtime.lastError) {
      // Ignore runtime errors triggered when the content script has not been injected yet.
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });

    await chrome.tabs.sendMessage(tab.id, TOGGLE_MESSAGE);
  }
});
