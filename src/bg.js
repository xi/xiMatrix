/* global browser */

import * as shared from './shared.js';
import * as storage from './storage.js';

const glob = function(s, pattern) {
    const p = pattern.split('*');
    return s.startsWith(p[0]) && s.endsWith(p.at(-1));
};

const getHostname = function(url, patterns) {
    const u = new URL(url);

    for (const pattern of patterns) {
        if (glob(u.hostname, pattern)) {
            return pattern;
        }
    }

    return u.hostname;
};

const setRule = async function(context, hostname, type, allow) {
    const savedRules = storage.get('savedRules');
    await storage.change('rules', rules => {
        if (hostname === 'first-party') {
            context = '*';
        }
        if (!rules[context]) {
            rules[context] = structuredClone(savedRules[context]) || {};
        }
        if (!rules[context][hostname]) {
            rules[context][hostname] = {};
        }
        if (allow) {
            rules[context][hostname][type] = allow;
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

const getPatterns = function() {
    const savedRules = storage.get('savedRules');
    return savedRules._patterns || [];
};

const getRules = function(context) {
    const rules = storage.get('rules');
    const savedRules = storage.get('savedRules');

    const restricted = {};
    restricted['*'] = rules['*'] || savedRules['*'] || {};
    restricted[context] = rules[context] || savedRules[context] || {};
    restricted.dirty = !!rules[context];
    return restricted;
};

const increaseTotals = async function(tabId) {
    let value = 0;
    await storage.change('totals', totals => {
        value = (totals[tabId] || 0) + 1;
        totals[tabId] = value;
        return totals;
    });
    await browser.action.setBadgeBackgroundColor({color: '#6b6b6b', tabId: tabId});
    await browser.action.setBadgeText({text: '' + value, tabId: tabId});
};

const pushRequest = async function(tabId, hostname, type, allowed) {
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

const clearRequests = async function(tabId) {
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

const getCurrentTab = async function() {
    const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
    });
    return tabs[0];
};

browser.runtime.onMessage.addListener(async (msg, sender) => {
    if (msg.type === 'get') {
        const tab = await getCurrentTab();
        const patterns = getPatterns();
        const context = getHostname(tab.url, patterns);
        const rules = getRules(context);
        const requests = storage.get('requests');
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
            msg.data.allow,
        );
        return getRules(msg.data.context);
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
                savedRules[msg.data] = structuredClone(r);
            }
            return savedRules;
        });
    } else if (msg.type === 'reset') {
        await storage.change('rules', rules => {
            delete rules[msg.data];
            return rules;
        });
    } else if (msg.type === 'securitypolicyviolation') {
        const patterns = getPatterns();
        const context = getHostname(sender.tab.url, patterns);
        const rules = getRules(context);
        const allowed = shared.shouldAllow(rules, context, 'inline', msg.data);
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
    const patterns = getPatterns();
    let context = getHostname(details.documentUrl || details.url, patterns);
    if (details.frameAncestors && details.frameAncestors.length) {
        const last = details.frameAncestors.length - 1;
        context = getHostname(details.frameAncestors[last].url, patterns);
    }
    const hostname = getHostname(details.url, patterns);
    const type = shared.TYPE_MAP[details.type] || 'other';

    const rules = getRules(context);

    if (details.type !== 'main_frame') {
        const allowed = shared.shouldAllow(rules, context, hostname, type);
        await pushRequest(details.tabId, hostname, type, allowed);
    }

    const isCookie = h => h.name.toLowerCase() === 'cookie';
    if (details.requestHeaders.some(isCookie)) {
        const allowed = shared.shouldAllow(rules, context, hostname, 'cookie');
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
        const filtered = details.requestHeaders.filter(h => !isCookie(h));
        return {requestHeaders: filtered};
    }
}, {urls: ['<all_urls>']}, ['blocking', 'requestHeaders']);

browser.webRequest.onHeadersReceived.addListener(async details => {
    const patterns = getPatterns();
    const context = getHostname(details.url, patterns);
    const rules = getRules(context);
    const csp = (type, value) => {
        let name = 'Content-Security-Policy';
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
