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
    if (rule) {
        rules[context][hostname][type] = rule;
    } else {
        delete rules[context][hostname][type];
        if (Object.keys(rules[context][hostname]).length === 0) {
            delete rules[context][hostname];
        }
        if (Object.keys(rules[context]).length === 0) {
            delete rules[context];
        }
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

var shouldAllow = function(context, hostname, type) {
    return [context, '*'].some(c => {
        return rules[c] && [hostname, '*', 'first-party'].some(h => {
            if (h === 'first-party' && context !== hostname) {
                return false;
            }
            return rules[c][h] && [type, '*'].some(t => {
                return rules[c][h][t];
            });
        });
    });
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

    var context = getHostname(details.documentUrl);
    if (details.frameAncestors.length) {
        var last = details.frameAncestors.length - 1;
        context = getHostname(details.frameAncestors[last].url);
    }
    var hostname = getHostname(details.url);
    var type = TYPES[details.type] || 'other';

    pushRequest(details.tabId, hostname, type);

    return {cancel: !shouldAllow(context, hostname, type)};
}, {urls: ['<all_urls>']}, ['blocking']);

browser.webRequest.onHeadersReceived.addListener(function(details) {
    var context = getHostname(details.url);
    var policy = [];

    if (!shouldAllow(context, 'inline', 'css')) {
        policy.push("style-src 'self' *");
    }
    if (!shouldAllow(context, 'inline', 'script')) {
        policy.push("script-src 'self' *");
    }
    if (!shouldAllow(context, 'inline', 'media')) {
        policy.push("img-src 'self' *");
    }

    if (policy.length) {
        details.responseHeaders.push({
            name: 'Content-Security-Policy',
            value: policy.join('; '),
        });
    }

    return {
        responseHeaders: details.responseHeaders,
    };
}, {
    urls: ['<all_urls>'],
    types: ['main_frame'],
}, ['blocking', 'responseHeaders']);

browser.storage.local.get('rules').then(stored => {
    rules = stored.rules || {};
});
