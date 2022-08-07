/* global browser shared */

var context;
var requests;
var rules;

var table = document.querySelector('table');

var sendMessage = function(type, data) {
    return browser.runtime.sendMessage({type: type, data: data});
};

var getHostnames = function() {
    var hostnames = [];

    var addSubdomains = function(h) {
        if (['inline', 'first-party', '*'].includes(h)) {
            return;
        }
        hostnames.unshift(h);
        var parts = h.split('.');
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

    var contextRoot = context.split('.').slice(-2).join('.');
    hostnames = hostnames
        .map(h => {
            var parts = h.split('.');
            var root = parts.slice(-2).join('.');
            var isContext = root === contextRoot ? 0 : 1;
            return [isContext, parts.reverse()];
        })
        .sort()
        .map(a => a[1].reverse().join('.'));

    return hostnames.filter((value, i) => hostnames.indexOf(value) === i);
};

var updateInherit = function(type) {
    var selector = 'input';
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

var createCheckbox = function(hostname, type) {
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.hostname = hostname;
    input.dataset.type = type;

    var c = (hostname === 'first-party') ? '*' : context;
    input.checked = (rules[c][hostname] || {})[type];

    input.onchange = () => {
        sendMessage('setRule', {
            context: context,
            hostname: hostname,
            type: type,
            value: input.checked,
        }).then(newRules => {
            rules = newRules;
            updateInherit(type);
        });
    };

    return input;
};

var createCell = function(tag, hostname, type, text) {
    const cell = document.createElement(tag);
    cell.append(createCheckbox(hostname, type));

    const span = document.createElement('span');
    span.textContent = text;
    cell.append(span);

    return cell;
};

var createHeader = function() {
    var tr = document.createElement('tr');

    var th = document.createElement('th');
    th.textContent = context;
    tr.append(th);

    for (const type of shared.TYPES) {
        tr.append(createCell('th', '*', type, type));
    }
    return tr;
};

var createRow = function(hostname) {
    var tr = document.createElement('tr');
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

var loadContext = function(c) {
    sendMessage('get', c).then(data => {
        context = data.context;
        requests = data.requests;
        rules = data.rules;

        table.innerHTML = '';
        table.append(createHeader());
        table.append(createRow('inline'));
        table.append(createRow('first-party'));

        for (const hostname of getHostnames()) {
            table.append(createRow(hostname));
        }

        updateInherit('*');
    });
};

browser.webNavigation.onBeforeNavigate.addListener(window.close);

loadContext();
