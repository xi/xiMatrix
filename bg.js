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

var rules = {};
var requests = {};

var getHostname = function(url) {
    var u = new URL(url);
    return u.hostname;
};

var setRule = function(context, hostname, type, rule) {
    if (!rules[context]) {
        rules[context] = {};
    }
    if (!rules[context][hostname]) {
        rules[context][hostname] = {};
    }
    if (rule === null) {
        delete rules[context][hostname][type];
        if (Object.keys(rules[context][hostname]).length === 0) {
            delete rules[context][hostname];
        }
        if (Object.keys(rules[context]).length === 0) {
            delete rules[context];
        }
    } else {
        rules[context][hostname][type] = rule;
    }
    browser.storage.local.set({'rules': rules});
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
        return getCurrentTab().then(tab => {
            var context = getHostname(tab.url);
            return {
                rules: rules[context] || {},
                requests: requests[tab.id] || {},
            };
        });
    } else if (msg.type === 'setRule') {
        return getCurrentTab().then(tab => {
            var context = getHostname(tab.url);
            setRule(context, msg.data[0], msg.data[1], msg.data[2]);
        });
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

browser.storage.local.get('rules').then(stored => {
    rules = stored.rules || {};
});
