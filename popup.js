/* global browser */

var TYPES = ['css', 'font', 'media', 'script', 'xhr', 'frame', 'other'];

var table = document.querySelector('table');

var sendMessage = function(type, data) {
    return browser.runtime.sendMessage({type: type, data: data});
};

var createCheckbox = function(hostname, type, rule) {
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = rule;
    input.onchange = () => sendMessage('setRule', [
        hostname, type, input.checked
    ]);
    return input;
};

sendMessage('get').then(data => {
    var createHeader = function() {
        let tr = document.createElement('tr');

        let th = document.createElement('th');
        tr.append(th);

        for (const type of TYPES) {
            let rule = data.rules['*'] ? data.rules['*'][type] : null;

            let th = document.createElement('th');
            th.append(createCheckbox('*', type, rule));
            tr.append(th);

            let span = document.createElement('span');
            span.textContent = type;
            th.append(span);
        }

        return tr;
    };

    var createRow = function(hostname) {
        let tr = document.createElement('tr');

        let th = document.createElement('th');
        let rule = data.rules[hostname] ? data.rules[hostname]['*'] : null;
        th.append(createCheckbox(hostname, '*', rule));
        tr.append(th);

        let span = document.createElement('span');
        span.textContent = hostname;
        th.append(span);

        for (const type of TYPES) {
            let count = data.requests[hostname] ? data.requests[hostname][type] : null;
            let rule = data.rules[hostname] ? data.rules[hostname][type] : null;

            let td = document.createElement('td');
            if (hostname !== 'inline' || ['css', 'script', 'media'].includes(type)) {
                td.append(createCheckbox(hostname, type, rule));
            }
            tr.append(td);

            let span = document.createElement('span');
            span.textContent = count;
            td.append(span);
        }

        return tr;
    };

    table.append(createHeader());
    table.append(createRow('inline'));

    for (const hostname in data.requests) {
        table.append(createRow(hostname));
    }
});
