/* global browser */

import * as shared from './shared.js';

let context;
let requests;
let rules;

const table = document.querySelector('table');
const commitButton = document.querySelector('[name="commit"]');
const resetButton = document.querySelector('[name="reset"]');
const permissionsButton = document.querySelector('[name="permissions"]');

const permissions = {
    origins: ['<all_urls>'],
};

const sendMessage = async function(type, data) {
    return await browser.runtime.sendMessage({type: type, data: data});
};

const getHostnames = function() {
    let hostnames = [];

    const addSubdomains = function(h) {
        if (['inline', 'first-party', '*'].includes(h)) {
            return;
        }
        hostnames.unshift(h);
        const parts = h.split('.');
        while (parts.length > 2) {
            parts.shift();
            hostnames.unshift(parts.join('.'));
        }
    };

    for (const hostname in rules[context]) {
        addSubdomains(hostname);
    }
    for (const hostname in requests) {
        addSubdomains(hostname);
    }

    addSubdomains(context);

    const contextRoot = context.split('.').slice(-2).join('.');
    hostnames = hostnames
        .map(h => {
            const parts = h.split('.');
            const root = parts.slice(-2).join('.');
            const isContext = root === contextRoot ? 0 : 1;
            return [isContext, parts.reverse()];
        })
        .sort()
        .map(a => a[1].reverse().join('.'));

    return hostnames.filter((value, i) => hostnames.indexOf(value) === i);
};

const updateInherit = function(type) {
    let selector = 'input';
    if (type !== '*') {
        selector += `[data-type="${type}"]`;
    }
    table.querySelectorAll(selector).forEach(input => {
        input.classList.toggle('inherit-allow', shared.shouldAllow(
            rules,
            context,
            input.dataset.hostname,
            input.dataset.type,
        ));
    });
};

const createCheckbox = function(hostname, type) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.hostname = hostname;
    input.dataset.type = type;

    const c = (hostname === 'first-party') ? '*' : context;
    input.checked = (rules[c][hostname] || {})[type];

    input.onchange = async () => {
        const newRules = await sendMessage('setRule', {
            context: context,
            hostname: hostname,
            type: type,
            allow: input.checked,
        });
        rules = newRules;
        commitButton.disabled = !rules.dirty;
        resetButton.disabled = !rules.dirty;
        updateInherit(type);
    };

    return input;
};

const createCell = function(tag, hostname, type, text) {
    const cell = document.createElement(tag);
    cell.append(createCheckbox(hostname, type));

    const span = document.createElement('span');
    span.textContent = text;
    cell.append(span);

    return cell;
};

const createHeader = function() {
    const tr = document.createElement('tr');

    const th = document.createElement('th');
    th.textContent = context;
    tr.append(th);

    for (const type of shared.TYPES) {
        tr.append(createCell('th', '*', type, type));
    }
    return tr;
};

const createRow = function(hostname) {
    const tr = document.createElement('tr');
    tr.append(createCell('th', hostname, '*', hostname));
    for (const type of shared.TYPES) {
        const count = (requests[hostname] || {})[type];

        if (hostname !== 'inline' || ['css', 'script', 'media'].includes(type)) {
            tr.append(createCell('td', hostname, type, count));
        } else {
            const td = document.createElement('td');
            td.className = 'disabled';
            tr.append(td);
        }
    }
    return tr;
};

const loadContext = async function() {
    const data = await sendMessage('get');
    context = data.context;
    requests = data.requests;
    rules = data.rules;
    commitButton.disabled = !rules.dirty;
    resetButton.disabled = !rules.dirty;

    table.innerHTML = '';
    table.append(createHeader());
    table.append(createRow('inline'));
    table.append(createRow('first-party'));

    for (const hostname of getHostnames()) {
        table.append(createRow(hostname));
    }

    updateInherit('*');
};

browser.webNavigation.onBeforeNavigate.addListener(details => {
    if (details.frameId === 0) {
        window.close();
    }
});

document.querySelector('[name="settings"]').addEventListener('click', () => {
    browser.runtime.openOptionsPage();
});

document.addEventListener('DOMContentLoaded', async () => {
    const hasPermissions = await browser.permissions.contains(permissions);
    if (hasPermissions) {
        await loadContext();
    } else {
        permissionsButton.hidden = false;
    }
});

commitButton.addEventListener('click', async () => {
    await sendMessage('commit', context);
    commitButton.disabled = true;
    resetButton.disabled = true;
});

resetButton.addEventListener('click', async () => {
    await sendMessage('reset', context);
    await loadContext();
});

permissionsButton.addEventListener('click', async () => {
    await browser.permissions.request(permissions);
    window.close();
});
