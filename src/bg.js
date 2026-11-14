/* global browser */

import * as shared from './shared.js';

let sessionTimeoutId = null;
const badgeTimeoutIds = {};

const sessionData = await browser.storage.session.get(['requests', 'totals']);
const requests = sessionData.requests ?? {};
const totals = sessionData.totals ?? {};

const localData = await browser.storage.local.get(['rules', 'savedRules']);
let rules = localData.rules ?? {};
let savedRules = localData.savedRules ?? {};

function invalidateSessionStorage() {
    if (sessionTimeoutId) return;

    sessionTimeoutId = setTimeout(async () => {
        sessionTimeoutId = null;
        await browser.storage.session.set({requests, totals});
    }, 500);
}

function invalidateBadge(tabId) {
    if (badgeTimeoutIds[tabId]) return;

    badgeTimeoutIds[tabId] = setTimeout(async () => {
        delete badgeTimeoutIds[tabId];
        await Promise.all([
            browser.action.setBadgeBackgroundColor({color: '#6b6b6b', tabId: tabId}),
            browser.action.setBadgeText({text: `${totals[tabId]}`, tabId: tabId}),
        ]);
    }, 100);
}

function glob(s, pattern) {
    const p = pattern.split('*');
    return s.startsWith(p[0]) && s.endsWith(p.at(-1));
}

function getHostname(url, patterns) {
    const u = new URL(url);

    for (const pattern of patterns) {
        if (glob(u.hostname, pattern)) {
            return pattern;
        }
    }

    return u.hostname;
}

async function setRule(context, hostname, type, allow) {
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
    await browser.storage.local.set({rules});
}

function getPatterns() {
    return savedRules._patterns || [];
}

function getCtxRules(context) {
    const restricted = {};
    restricted['*'] = rules['*'] || savedRules['*'] || {};
    restricted[context] = rules[context] || savedRules[context] || {};
    restricted.dirty = !!rules[context];
    return restricted;
}

function pushRequest(tabId, hostname, type, allowed) {
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
    if (!allowed) {
        totals[tabId] = (totals[tabId] || 0) + 1;
        invalidateBadge(tabId);
    }
    invalidateSessionStorage();
}

function clearRequests(tabId) {
    if (requests[tabId]) {
        delete requests[tabId];
        invalidateSessionStorage();
    }
    if (totals[tabId]) {
        delete totals[tabId];
        invalidateSessionStorage();
    }
    if (badgeTimeoutIds[tabId]) {
        clearTimeout(badgeTimeoutIds[tabId]);
        delete badgeTimeoutIds[tabId];
    }
}

async function getCurrentTab() {
    const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
    });
    return tabs[0];
}

browser.runtime.onMessage.addListener(async (msg, sender) => {
    if (msg.type === 'get') {
        const tab = await getCurrentTab();
        const patterns = getPatterns();
        const context = getHostname(tab.url, patterns);
        const ctxRules = getCtxRules(context);
        return {
            context: context,
            rules: ctxRules,
            requests: requests[tab.id] || {},
        };
    } else if (msg.type === 'setRule') {
        await setRule(
            msg.data.context,
            msg.data.hostname,
            msg.data.type,
            msg.data.allow,
        );
        return getCtxRules(msg.data.context);
    } else if (msg.type === 'commit') {
        const r = rules[msg.data] ?? {};
        delete rules[msg.data];
        if (!Object.keys(r).length) {
            delete savedRules[msg.data];
        } else {
            savedRules[msg.data] = structuredClone(r);
        }
        await browser.storage.local.set({rules, savedRules});
    } else if (msg.type === 'reset') {
        delete rules[msg.data];
        await browser.storage.local.set({rules});
    } else if (msg.type === 'securitypolicyviolation') {
        const patterns = getPatterns();
        const context = getHostname(sender.tab.url, patterns);
        const ctxRules = getCtxRules(context);
        const allowed = shared.shouldAllow(ctxRules, context, 'inline', msg.data);
        pushRequest(sender.tab.id, 'inline', msg.data, allowed);
    } else if (msg.type === 'getSettings') {
        return {rules, savedRules};
    } else if (msg.type === 'setSettings') {
        rules = msg.data.rules;
        savedRules = msg.data.savedRules;
        await browser.storage.local.set({rules, savedRules});
    }
});

browser.tabs.onRemoved.addListener(clearRequests);
browser.webNavigation.onBeforeNavigate.addListener(details => {
    if (details.frameId === 0) {
        clearRequests(details.tabId);
    }
});

browser.webRequest.onBeforeSendHeaders.addListener(details => {
    const patterns = getPatterns();
    let context = getHostname(details.documentUrl || details.url, patterns);
    if (details.frameAncestors && details.frameAncestors.length) {
        const last = details.frameAncestors.length - 1;
        context = getHostname(details.frameAncestors[last].url, patterns);
    }
    const ctxRules = getCtxRules(context);
    const hostname = getHostname(details.url, patterns);
    const type = shared.TYPE_MAP[details.type] || 'other';

    const allowType = details.type !== 'main_frame'
        && shared.shouldAllow(ctxRules, context, hostname, type);
    if (details.type !== 'main_frame') {
        pushRequest(details.tabId, hostname, type, allowType);
    }

    const isCookie = h => h.name.toLowerCase() === 'cookie';
    const hasCookie = details.requestHeaders.some(isCookie);
    const allowCookie = hasCookie && shared.shouldAllow(ctxRules, context, hostname, 'cookie');
    if (hasCookie) {
        pushRequest(details.tabId, hostname, 'cookie', allowCookie);
    }

    if (details.type !== 'main_frame' && !allowType) {
        if (details.type === 'sub_frame') {
            // this can in turn be blocked by a local CSP
            return {redirectUrl: 'data:,' + encodeURIComponent(details.url)};
        } else {
            return {cancel: true};
        }
    }

    if (!hasCookie || allowCookie) {
        return {requestHeaders: details.requestHeaders};
    } else {
        const filtered = details.requestHeaders.filter(h => !isCookie(h));
        return {requestHeaders: filtered};
    }
}, {urls: ['<all_urls>']}, ['blocking', 'requestHeaders']);

browser.webRequest.onHeadersReceived.addListener(details => {
    const patterns = getPatterns();
    const context = getHostname(details.url, patterns);
    const ctxRules = getCtxRules(context);
    const csp = (type, value) => {
        let name = 'Content-Security-Policy';
        if (shared.shouldAllow(ctxRules, context, 'inline', type)) {
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
