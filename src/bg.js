/* global browser shared */

var lock = Promise.resolve();

var STORAGE_DEFAULTS = {
    'rules': {},
    'requests': {},
    'recording': true,
};

var getHostname = function(url) {
    var u = new URL(url);
    return u.hostname;
};

var storageGet = function(key) {
    return browser.storage.local.get(key).then(data => {
        return data[key] ?? STORAGE_DEFAULTS[key];
    });
};

var _storageChange = function(key, fn) {
    return storageGet(key).then(oldValue => {
        var data = {};
        data[key] = fn(oldValue);
        return browser.storage.local.set(data);
    });
};

var storageChange = function(key, fn) {
    lock = lock.then(() => _storageChange(key, fn));
    return lock;
};

var setRule = function(context, hostname, type, rule) {
    return storageChange('rules', rules => {
        if (hostname === 'first-party') {
            context = '*';
        }
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
        return rules;
    });
};

var restrictRules = function(rules, context) {
    var restricted = {};
    restricted['*'] = rules['*'] || {};
    restricted[context] = rules[context] || {};
    return restricted;
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
        return Promise.all([
            getCurrentTab(),
            storageGet('rules'),
            storageGet('requests'),
            storageGet('recording'),
        ]).then(([tab, rules, requests, recording]) => {
            var context = msg.data || getHostname(tab.url);
            return {
                context: context,
                rules: restrictRules(rules, context),
                requests: requests[tab.id] || {},
                recording: recording,
            };
        });
    } else if (msg.type === 'setRule') {
        return setRule(
            msg.data.context,
            msg.data.hostname,
            msg.data.type,
            msg.data.value,
        ).then(() => storageGet('rules')).then(rules => {
            return restrictRules(rules, msg.data.context);
        });
    } else if (msg.type === 'securitypolicyviolation') {
        return pushRequest(sender.tab.id, 'inline', msg.data);
    } else if (msg.type === 'toggleRecording') {
        return storageChange('recording', recording => !recording);
    }
});

browser.tabs.onRemoved.addListener(clearRequests);
browser.webNavigation.onBeforeNavigate.addListener(details => {
    return clearRequests(details.tabId);
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
    var type = shared.TYPE_MAP[details.type] || 'other';

    return Promise.all([
        pushRequest(details.tabId, hostname, type),
        storageGet('rules'),
    ]).then(([_, rules]) => {
        if (!shared.shouldAllow(rules, context, hostname, type)) {
            if (details.type === 'sub_frame') {
                // this can in turn be blocked by a local CSP
                return {redirectUrl: 'data:,' + encodeURIComponent(details.url)};
            } else {
                return {cancel: true};
            }
        }
    });
}, {urls: ['<all_urls>']}, ['blocking']);

browser.webRequest.onHeadersReceived.addListener(function(details) {
    return Promise.all([
        storageGet('rules'),
        storageGet('recording'),
    ]).then(([rules, recording]) => {
        var context = getHostname(details.url);

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

        return {
            responseHeaders: details.responseHeaders,
        };
    });
}, {
    urls: ['<all_urls>'],
    types: ['main_frame'],
}, ['blocking', 'responseHeaders']);
