/* global browser */

import * as shared from './shared.js';
import * as storage from './storage.js';

var glob = function(s, pattern) {
    var p = pattern.split('*');
    return s.startsWith(p[0]) && s.endsWith(p.at(-1));
};

var getHostname = function(url, patterns) {
    var u = new URL(url);

    for (var pattern of patterns) {
        if (glob(u.hostname, pattern)) {
            return pattern;
        }
    }

    return u.hostname;
};

var setRule = async function(context, hostname, type, rule) {
    var savedRules = await storage.get('savedRules');
    await storage.change('rules', rules => {
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

var getPatterns = async function() {
    var savedRules = await storage.get('savedRules');
    return savedRules._patterns || [];
};

var getRules = async function(context) {
    var [rules, savedRules] = await Promise.all([
        storage.get('rules'),
        storage.get('savedRules'),
    ]);
    var restricted = {};
    restricted['*'] = rules['*'] || savedRules['*'] || {};
    restricted[context] = rules[context] || savedRules[context] || {};
    restricted.dirty = !!rules[context];
    return restricted;
};

var increaseTotals = async function(tabId) {
    var value = 0;
    await storage.change('totals', totals => {
        value = (totals[tabId] || 0) + 1;
        totals[tabId] = value;
        return totals;
    });
    await browser.action.setBadgeBackgroundColor({color: '#6b6b6b', tabId: tabId});
    await browser.action.setBadgeText({text: '' + value, tabId: tabId});
};

var pushRequest = async function(tabId, hostname, type, allowed) {
    await storage.change('requests', requests => {
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
    if (!allowed) {
        await increaseTotals(tabId);
    }
};

var clearRequests = async function(tabId) {
    await Promise.all([
        storage.change('requests', requests => {
            if (requests[tabId]) {
                delete requests[tabId];
            }
            return requests;
        }),
        storage.change('totals', totals => {
            if (totals[tabId]) {
                delete totals[tabId];
            }
            return totals;
        }),
    ]);
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
        const [tab, patterns] = await Promise.all([
            getCurrentTab(),
            getPatterns(),
        ]);
        const context = getHostname(tab.url, patterns);
        const [rules, requests] = await Promise.all([
            getRules(context),
            storage.get('requests'),
        ]);
        return {
            context: context,
            rules: rules,
            requests: requests[tab.id] || {},
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
        await storage.change('rules', rules => {
            r = rules[msg.data];
            delete rules[msg.data];
            return rules;
        });
        await storage.change('savedRules', savedRules => {
            if (Object.keys(r).length === 0) {
                delete savedRules[msg.data];
            } else {
                savedRules[msg.data] = r;
            }
            return savedRules;
        });
    } else if (msg.type === 'reset') {
        await storage.change('rules', rules => {
            delete rules[msg.data];
            return rules;
        });
    } else if (msg.type === 'securitypolicyviolation') {
        var patterns = await getPatterns();
        var context = getHostname(sender.tab.url, patterns);
        var rules = await getRules(context);
        var allowed = shared.shouldAllow(rules, context, 'inline', msg.data);
        await pushRequest(sender.tab.id, 'inline', msg.data, allowed);
    }
});

browser.tabs.onRemoved.addListener(clearRequests);
browser.webNavigation.onBeforeNavigate.addListener(async details => {
    if (details.frameId === 0) {
        await clearRequests(details.tabId);
    }
});

browser.webRequest.onBeforeSendHeaders.addListener(async details => {
    var patterns = await getPatterns();
    var context = getHostname(details.documentUrl || details.url, patterns);
    if (details.frameAncestors && details.frameAncestors.length) {
        var last = details.frameAncestors.length - 1;
        context = getHostname(details.frameAncestors[last].url, patterns);
    }
    var hostname = getHostname(details.url, patterns);
    var type = shared.TYPE_MAP[details.type] || 'other';

    var rules = await getRules(context);

    if (details.type !== 'main_frame') {
        var allowed = shared.shouldAllow(rules, context, hostname, type);
        await pushRequest(details.tabId, hostname, type, allowed);
    }

    var isCookie = h => h.name.toLowerCase() === 'cookie';
    if (details.requestHeaders.some(isCookie)) {
        var allowed = shared.shouldAllow(rules, context, hostname, 'cookie');
        await pushRequest(details.tabId, hostname, 'cookie', allowed);
    }

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
    var patterns = await getPatterns();
    var context = getHostname(details.url, patterns);
    var rules = await getRules(context);
    var csp = (type, value) => {
        var name = 'Content-Security-Policy';
        if (shared.shouldAllow(rules, context, 'inline', type)) {
            name = 'Content-Security-Policy-Report-Only';
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
