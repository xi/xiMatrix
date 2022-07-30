/* global browser */

var TYPES = ['font', 'css', 'media', 'script', 'xhr', 'frame', 'other'];

var table = document.querySelector('table');

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

    for (const hostname in (data.rules[data.context] || {})) {
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

sendMessage('get').then(data => {
    var shouldAllow = function(context, hostname, type) {
        var hostnames = ['*', hostname];
        if (context === hostname) {
            hostnames.push('first-party');
        }
        var parts = hostname.split('.');
        while (parts.length > 2) {
            parts.shift();
            hostnames.push(parts.join('.'));
        }

        return [context, '*'].some(c => {
            return data.rules[c] && hostnames.some(h => {
                return data.rules[c][h] && [type, '*'].some(t => {
                    return !!data.rules[c][h][t];
                });
            });
        });
    };

    var updateInherit = function() {
        table.querySelectorAll('input').forEach(input => {
            input.classList.toggle('inherit-allow', shouldAllow(
                data.context,
                input.dataset.hostname,
                input.dataset.type,
            ));
        });
    };

    var createCheckbox = function(hostname, type, rule) {
        var input = document.createElement('input');
        input.type = 'checkbox';
        input.dataset.hostname = hostname;
        input.dataset.type = type;
        input.checked = rule;
        input.onchange = () => {
            sendMessage('setRule', [
                hostname, type, input.checked
            ]).then(rules => {
                data.rules = rules;
                updateInherit();
            });
        };
        return input;
    };

    var createHeader = function(rules) {
        let tr = document.createElement('tr');

        tr.append(document.createElement('th'));

        for (const type of TYPES) {
            let rule = rules['*'] ? rules['*'][type] : null;

            let th = document.createElement('th');
            th.append(createCheckbox('*', type, rule));
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
        th.append(createCheckbox(hostname, '*', rule));
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

    table.append(createHeader(data.rules[data.context] || {}));
    table.append(createRow('inline', data.rules[data.context] || {}));
    table.append(createRow('first-party', data.rules['*'] || {}));

    for (const hostname of getHostnames(data)) {
        table.append(createRow(hostname, data.rules[data.context] || {}));
    }

    updateInherit();
});
