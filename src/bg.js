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

var storageGet = function(key) {
    return STORAGE_AREAS[key].get(key).then(data => {
        return data[key] ?? STORAGE_DEFAULTS[key];
    });
};

var _storageChange = function(key, fn) {
    return storageGet(key).then(oldValue => {
        var data = {};
        data[key] = fn(oldValue);
        return STORAGE_AREAS[key].set(data);
    });
};

var storageChange = function(key, fn) {
    lock = lock.then(() => _storageChange(key, fn));
    return lock;
};

var setRule = function(context, hostname, type, rule) {
    return storageGet('savedRules').then(savedRules => {
        return storageChange('rules', rules => {
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
    });
};

var getRules = function(context) {
    return Promise.all([
        storageGet('rules'),
        storageGet('savedRules'),
    ]).then(([rules, savedRules]) => {
        var restricted = {};
        restricted['*'] = rules['*'] || savedRules['*'] || {};
        restricted[context] = rules[context] || savedRules[context] || {};
        restricted.dirty = !!rules[context];
        return restricted;
    });
};

var pushRequest = function(tabId, hostname, type) {
    return storageGet('recording').then(recording => {
        if (recording) {
            return storageChange('requests', requests => {
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
    });
};

var clearRequests = function(tabId) {
    return storageChange('requests', requests => {
        if (requests[tabId]) {
            delete requests[tabId];
        }
        return requests;
    });
};

var getCurrentTab = function() {
    return browser.tabs.query({
        active: true,
        currentWindow: true,
    }).then(tabs => tabs[0]);
};

browser.runtime.onMessage.addListener((msg, sender) => {
    if (msg.type === 'get') {
        return getCurrentTab().then(tab => {
            var context = getHostname(tab.url);
            return Promise.all([
                getRules(context),
                storageGet('requests'),
                storageGet('recording'),
            ]).then(([rules, requests, recording]) => {
                return {
                    context: context,
                    rules: rules,
                    requests: requests[tab.id] || {},
                    recording: recording,
                };
            });
        });
    } else if (msg.type === 'setRule') {
        return setRule(
            msg.data.context,
            msg.data.hostname,
            msg.data.type,
            msg.data.value,
        ).then(() => getRules(msg.data.context));
    } else if (msg.type === 'commit') {
        var r;
        return storageChange('rules', rules => {
            r = rules[msg.data];
            delete rules[msg.data];
            return rules;
        }).then(() => storageChange('savedRules', savedRules => {
            if (Object.keys(r).length === 0) {
                delete savedRules[msg.data];
            } else {
                savedRules[msg.data] = r;
            }
            return savedRules;
        }));
    } else if (msg.type === 'reset') {
        return storageChange('rules', rules => {
            delete rules[msg.data];
            return rules;
        });
    } else if (msg.type === 'securitypolicyviolation') {
        return pushRequest(sender.tab.id, 'inline', msg.data);
    } else if (msg.type === 'toggleRecording') {
        return storageChange('recording', recording => !recording);
    }
});

browser.tabs.onRemoved.addListener(clearRequests);
browser.webNavigation.onBeforeNavigate.addListener(details => {
    if (details.frameId === 0) {
        return clearRequests(details.tabId);
    }
});

browser.webRequest.onBeforeSendHeaders.addListener(details => {
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

    return Promise.all(promises).then(([rules, ...rest]) => {
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
    });
}, {urls: ['<all_urls>']}, ['blocking', 'requestHeaders']);

browser.webRequest.onHeadersReceived.addListener(details => {
    var context = getHostname(details.url);
    return Promise.all([
        getRules(context),
        storageGet('recording'),
    ]).then(([rules, recording]) => {
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
    });
}, {
    urls: ['<all_urls>'],
    types: ['main_frame'],
}, ['blocking', 'responseHeaders']);

// migrations
browser.runtime.onInstalled.addListener(() => {
    // 0.8.0: store requests to session storage
    lock = lock.then(() => browser.storage.local.remove('requests'));
});
