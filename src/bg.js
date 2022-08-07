/* global browser shared */

var rules = {};
var requests = {};

var getHostname = function(url) {
    var u = new URL(url);
    return u.hostname;
};

var setRule = function(context, hostname, type, rule) {
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
    browser.storage.local.set({'rules': rules});
};

var restrictRules = function(context) {
    var restricted = {};
    restricted['*'] = rules['*'] || {};
    restricted[context] = rules[context] || {};
    return restricted;
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

browser.runtime.onMessage.addListener((msg, sender) => {
    if (msg.type === 'get') {
        return getCurrentTab().then(tab => {
            var context = msg.data || getHostname(tab.url);
            return {
                context: context,
                rules: restrictRules(context),
                requests: requests[tab.id] || {},
            };
        });
    } else if (msg.type === 'setRule') {
        setRule(
            msg.data.context,
            msg.data.hostname,
            msg.data.type,
            msg.data.value,
        );
        return Promise.resolve(restrictRules(msg.data.context));
    } else if (msg.type === 'securitypolicyviolation') {
        pushRequest(sender.tab.id, 'inline', msg.data);
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
    var type = shared.TYPE_MAP[details.type] || 'other';

    pushRequest(details.tabId, hostname, type);

    if (!shared.shouldAllow(rules, context, hostname, type)) {
        if (details.type === 'sub_frame') {
            return {redirectUrl: 'data:,' + encodeURIComponent(details.url)};
        } else {
            return {cancel: true};
        }
    }
}, {urls: ['<all_urls>']}, ['blocking']);

browser.webRequest.onHeadersReceived.addListener(function(details) {
    var context = getHostname(details.url);
    var policy = [];

    if (!shared.shouldAllow(rules, context, 'inline', 'css')) {
        policy.push("style-src 'self' *");
    }
    if (!shared.shouldAllow(rules, context, 'inline', 'script')) {
        policy.push("script-src 'self' *");
    }
    if (!shared.shouldAllow(rules, context, 'inline', 'media')) {
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
