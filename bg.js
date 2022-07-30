/* global browser */

const TYPES = {
    'stylesheet': 'css',
    'font': 'font',
    'image': 'media',
    'imageset': 'media',
    'media': 'media',
    'script': 'script',
    'beacon': 'xhr',
    'xmlhttprequest': 'xhr',
    'websocket': 'xhr',
    'sub_frame': 'frame',
};

var requests = {};

var getHostname = function(url) {
    var u = new URL(url);
    return u.hostname;
};

var pushRequest = function(tabId, hostname, type) {
    if (!requests[tabId]) {
        requests[tabId] = {};
    }
    if (!requests[tabId][hostname]) {
        requests[tabId][hostname] = {};
    }
    if (!requests[tabId][hostname][type]) {
        requests[tabId][hostname][type] = 0;
    }
    requests[tabId][hostname][type] += 1;
};

var clearRequests = function(tabId) {
    if (requests[tabId]) {
        delete requests[tabId];
    }
};

var getCurrentTab = function() {
    return browser.tabs.query({
        active: true,
        currentWindow: true,
    }).then(tabs => tabs[0]);
};

browser.runtime.onMessage.addListener(msg => {
    if (msg.type === 'get') {
        return getCurrentTab().then(tab => requests[tab.id]);
    }
});

browser.tabs.onRemoved.addListener(clearRequests);
browser.webNavigation.onBeforeNavigate.addListener(details => {
    clearRequests(details.tabId);
});

browser.webRequest.onBeforeRequest.addListener(details => {
    if (details.type === 'main_frame') {
        return;
    }

    var hostname = getHostname(details.url);
    var type = TYPES[details.type] || 'other';
    pushRequest(details.tabId, hostname, type);
}, {urls: ['<all_urls>']});
