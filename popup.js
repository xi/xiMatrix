/* global browser */

var TYPES = ['font', 'css', 'media', 'script', 'xhr', 'frame', 'other'];

var table = document.querySelector('table');
var colgroup = table.querySelector('colgroup');

var sendMessage = function(type, data) {
    return browser.runtime.sendMessage({type: type, data: data});
};

var getHostnames = function(data) {
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

    for (const hostname in data.rules) {
        addSubdomains(hostname);
    }
    for (const hostname in data.requests) {
        addSubdomains(hostname);
    }

    hostnames = hostnames
        .map(h => h.split('.').reverse())
        .sort()
        .map(h => h.reverse().join('.'));

    addSubdomains(data.context);

    return hostnames.filter((value, i) => hostnames.indexOf(value) === i);
};

var createCheckbox = function(hostname, type, rule, group) {
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = rule;
    input.onchange = () => {
        if (group) {
            group.classList.toggle('inherit-allow', input.checked);
        }
        sendMessage('setRule', [
            hostname, type, input.checked
        ]);
    };
    if (group) {
        group.classList.toggle('inherit-allow', !!rule);
    }
    return input;
};

sendMessage('get').then(data => {
    var createHeader = function(rules) {
        let tr = document.createElement('tr');

        tr.append(document.createElement('th'));
        colgroup.append(document.createElement('col'));

        for (const type of TYPES) {
            let rule = rules['*'] ? rules['*'][type] : null;

            let col = document.createElement('col');
            colgroup.append(col);

            let th = document.createElement('th');
            th.append(createCheckbox('*', type, rule, col));
            tr.append(th);

            let span = document.createElement('span');
            span.textContent = type;
            th.append(span);
        }

        return tr;
    };

    var createRow = function(hostname, rules) {
        let tr = document.createElement('tr');

        let th = document.createElement('th');
        let rule = rules[hostname] ? rules[hostname]['*'] : null;
        th.append(createCheckbox(hostname, '*', rule, tr));
        tr.append(th);

        let span = document.createElement('span');
        span.textContent = hostname;
        th.append(span);

        for (const type of TYPES) {
            let count = data.requests[hostname] ? data.requests[hostname][type] : null;
            let rule = rules[hostname] ? rules[hostname][type] : null;

            let td = document.createElement('td');
            if (hostname !== 'inline' || ['css', 'script', 'media'].includes(type)) {
                td.append(createCheckbox(hostname, type, rule));
            } else {
                td.className = 'disabled';
            }
            tr.append(td);

            let span = document.createElement('span');
            span.textContent = count;
            td.append(span);
        }

        return tr;
    };

    table.append(createHeader(data.rules));
    table.append(createRow('inline', data.rules));
    table.append(createRow('first-party', data.globalRules));

    for (const hostname of getHostnames(data)) {
        table.append(createRow(hostname, data.rules));
    }
});
