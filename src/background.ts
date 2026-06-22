import { type ExtensionMessage, type MessageResponse, type EQSettings } from './types';

let activeTabId: number | null = null;
let isMuted = false;

// Clean up if user closes the tab while EQ is active
chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeTabId === tabId) {
    chrome.runtime.sendMessage({ type: 'CAPTURE_STOP' } as ExtensionMessage).catch(() => {});
    activeTabId = null;
    isMuted = false;
  }
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  const respond = (data: MessageResponse) => { if (sendResponse) sendResponse(data); };

  switch (message.type) {
    case 'TOGGLE_TAB': {
      const { tabId, enabled } = message.payload as { tabId: number, enabled: boolean };
      if (enabled) {
        if (activeTabId && activeTabId !== tabId) {
          stopCapture(activeTabId);
        }
        startCapture(tabId, respond);
      } else {
        stopCapture(tabId);
        respond({ success: true });
      }
      return true; // Keep message channel open for async response
    }
    case 'GET_STATE': {
      respond({ active: !!activeTabId, tabId: activeTabId ?? undefined });
      return false;
    }
    case 'EQ_UPDATE': {
      // Forward EQ updates to offscreen doc
      chrome.runtime.sendMessage(message).catch(() => {});
      if (message.payload.bypass !== undefined) {
        if (activeTabId) {
          chrome.tabs.update(activeTabId, { muted: !message.payload.bypass && isMuted });
        }
      }
      return false;
    }
  }
});

async function startCapture(tabId: number, respond: (res: MessageResponse) => void) {
  try {
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
    if (!streamId) throw new Error("Failed to get stream ID");

    // Ensure offscreen document exists
    const hasOffscreen = await chrome.offscreen.hasDocument();
    if (!hasOffscreen) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK as any],
        justification: 'Audio equalization processing',
      });
    }

    chrome.runtime.sendMessage({ type: 'CAPTURE_START', payload: { streamId } } as ExtensionMessage, (r: MessageResponse) => {
      if (r?.success) {
        activeTabId = tabId;
        isMuted = true;
        chrome.tabs.update(tabId, { muted: true });
        respond({ success: true });
      } else {
        respond({ success: false, error: r?.error });
      }
    });
  } catch (err) {
    respond({ success: false, error: String(err) });
  }
}

function stopCapture(tabId: number) {
  if (activeTabId === tabId) {
    chrome.runtime.sendMessage({ type: 'CAPTURE_STOP' } as ExtensionMessage).catch(() => {});
    chrome.tabs.update(tabId, { muted: false });
    activeTabId = null;
    isMuted = false;
  }
}

// Keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]?.id) return;
  const tabId = tabs[0].id;

  if (command === 'toggle-eq') {
    if (activeTabId === tabId) {
      stopCapture(tabId);
    } else {
      startCapture(tabId, () => {});
    }
  } else if (command === 'toggle-bypass') {
    if (activeTabId) {
      try {
        const data = await chrome.storage.local.get(`settings_${activeTabId}`);
        const current = (data[`settings_${activeTabId}`] as EQSettings) || { bypass: false };
        const next = { ...current, bypass: !current.bypass };
        await chrome.storage.local.set({ [`settings_${activeTabId}`]: next });
        chrome.runtime.sendMessage({ type: 'EQ_UPDATE', payload: { bypass: next.bypass } } as ExtensionMessage);
      } catch (_e) {}
    }
  }
});

// Clean up on extension unload
chrome.runtime.onSuspend?.addListener(() => {
  if (activeTabId) stopCapture(activeTabId);
  chrome.offscreen.closeDocument().catch(() => {});
});
