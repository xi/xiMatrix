/* global browser */

import * as shared from './shared.js';

var lock = Promise.resolve();

var STORAGE_DEFAULTS = {
    'rules': {},
    'savedRules': {},
    'requests': {},
    'recording': true,
};
var STORAGE_AREAS = {
    'rules': browser.storage.local,
    'savedRules': browser.storage.local,
    'requests': browser.storage.session,
    'recording': browser.storage.local,
};

var getHostname = function(url) {
    var u = new URL(url);
    return u.hostname;
};

var storageGet = async function(key) {
    var data = await STORAGE_AREAS[key].get(key);
    return data[key] ?? STORAGE_DEFAULTS[key];
};

var _storageChange = async function(key, fn) {
    var oldValue = await storageGet(key);
    var data = {};
    data[key] = fn(oldValue);
    await STORAGE_AREAS[key].set(data);
};

var storageChange = async function(key, fn) {
    lock = lock.then(() => _storageChange(key, fn));
    await lock;
};

var setRule = async function(context, hostname, type, rule) {
    var savedRules = await storageGet('savedRules');
    await storageChange('rules', rules => {
        if (hostname === 'first-party') {
            context = '*';
        }
        if (!rules[context]) {
            rules[context] = savedRules[context] || {};
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
            if (Object.keys(rules[context]).length === 0 && !savedRules[context]) {
                delete rules[context];
            }
        }
        return rules;
    });
};

var getRules = async function(context) {
    var [rules, savedRules] = await Promise.all([
        storageGet('rules'),
        storageGet('savedRules'),
    ]);
    var restricted = {};
    restricted['*'] = rules['*'] || savedRules['*'] || {};
    restricted[context] = rules[context] || savedRules[context] || {};
    restricted.dirty = !!rules[context];
    return restricted;
};

var pushRequest = async function(tabId, hostname, type) {
    var recording = await storageGet('recording');
    if (recording) {
        await storageChange('requests', requests => {
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
            return requests;
        });
    }
};

var clearRequests = async function(tabId) {
    await storageChange('requests', requests => {
        if (requests[tabId]) {
            delete requests[tabId];
        }
        return requests;
    });
};

var getCurrentTab = async function() {
    var tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
    });
    return tabs[0];
};

browser.runtime.onMessage.addListener(async (msg, sender) => {
    if (msg.type === 'get') {
        const tab = await getCurrentTab();
        const context = getHostname(tab.url);
        const [rules, requests, recording] = await Promise.all([
            getRules(context),
            storageGet('requests'),
            storageGet('recording'),
        ]);
        return {
            context: context,
            rules: rules,
            requests: requests[tab.id] || {},
            recording: recording,
        };
    } else if (msg.type === 'setRule') {
        await setRule(
            msg.data.context,
            msg.data.hostname,
            msg.data.type,
            msg.data.value,
        );
        return await getRules(msg.data.context);
    } else if (msg.type === 'commit') {
        let r;
        await storageChange('rules', rules => {
            r = rules[msg.data];
            delete rules[msg.data];
            return rules;
        });
        await storageChange('savedRules', savedRules => {
            if (Object.keys(r).length === 0) {
                delete savedRules[msg.data];
            } else {
                savedRules[msg.data] = r;
            }
            return savedRules;
        });
    } else if (msg.type === 'reset') {
        await storageChange('rules', rules => {
            delete rules[msg.data];
            return rules;
        });
    } else if (msg.type === 'securitypolicyviolation') {
        await pushRequest(sender.tab.id, 'inline', msg.data);
    } else if (msg.type === 'toggleRecording') {
        await storageChange('recording', recording => !recording);
    }
});

browser.tabs.onRemoved.addListener(clearRequests);
browser.webNavigation.onBeforeNavigate.addListener(async details => {
    if (details.frameId === 0) {
        await clearRequests(details.tabId);
    }
});

browser.webRequest.onBeforeSendHeaders.addListener(async details => {
    var context = getHostname(details.documentUrl || details.url);
    if (details.frameAncestors && details.frameAncestors.length) {
        var last = details.frameAncestors.length - 1;
        context = getHostname(details.frameAncestors[last].url);
    }
    var hostname = getHostname(details.url);
    var type = shared.TYPE_MAP[details.type] || 'other';

    var promises = [
        getRules(context),
    ];

    if (details.type !== 'main_frame') {
        promises.push(pushRequest(details.tabId, hostname, type));
    }

    var isCookie = h => h.name.toLowerCase() === 'cookie';
    if (details.requestHeaders.some(isCookie)) {
        promises.push(pushRequest(details.tabId, hostname, 'cookie'));
    }

    var [rules, ...rest] = await Promise.all(promises);
    if (
        details.type !== 'main_frame'
        && !shared.shouldAllow(rules, context, hostname, type)
    ) {
        if (details.type === 'sub_frame') {
            // this can in turn be blocked by a local CSP
            return {redirectUrl: 'data:,' + encodeURIComponent(details.url)};
        } else {
            return {cancel: true};
        }
    }

    if (shared.shouldAllow(rules, context, hostname, 'cookie')) {
        return {requestHeaders: details.requestHeaders};
    } else {
        var filtered = details.requestHeaders.filter(h => !isCookie(h));
        return {requestHeaders: filtered};
    }
}, {urls: ['<all_urls>']}, ['blocking', 'requestHeaders']);

browser.webRequest.onHeadersReceived.addListener(async details => {
    var context = getHostname(details.url);
    var [rules, recording] = await Promise.all([
        getRules(context),
        storageGet('recording'),
    ]);
    var csp = (type, value) => {
        var name = 'Content-Security-Policy';
        if (shared.shouldAllow(rules, context, 'inline', type)) {
            if (recording) {
                name = 'Content-Security-Policy-Report-Only';
            } else {
                return;
            }
        }
        details.responseHeaders.push({
            name: name,
            value: value,
        });
    };

    csp('css', "style-src 'self' *");
    csp('script', "script-src 'self' *");
    csp('media', "img-src 'self' *");

    return {responseHeaders: details.responseHeaders};
}, {
    urls: ['<all_urls>'],
    types: ['main_frame'],
}, ['blocking', 'responseHeaders']);

// migrations
browser.runtime.onInstalled.addListener(() => {
    // 0.8.0: store requests to session storage
    lock = lock.then(() => browser.storage.local.remove('requests'));
});
