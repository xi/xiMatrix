/* global browser */

var TYPES = ['css', 'font', 'media', 'script', 'xhr', 'frame', 'other'];

var table = document.querySelector('table');

var sendMessage = function(type, data) {
    return browser.runtime.sendMessage({type: type, data: data});
};

var createRadios = function(hostname, type, rule) {
    var div = document.createElement('div');
    div.className = 'radios';

    var label = document.createElement('label');
    var input = document.createElement('input');
    input.type = 'radio';
    input.name = `${hostname}:${type}`;
    input.checked = rule === true;
    input.onchange = () => sendMessage('setRule', [hostname, type, true]);
    label.append(input);
    label.append(' allowed');
    div.append(label);

    label = document.createElement('label');
    input = document.createElement('input');
    input.type = 'radio';
    input.name = `${hostname}:${type}`;
    input.checked = rule == null;  // but undefined == null
    input.onchange = () => sendMessage('setRule', [hostname, type, null]);
    label.append(input);
    label.append(' unset');
    div.append(label);

    label = document.createElement('label');
    input = document.createElement('input');
    input.type = 'radio';
    input.name = `${hostname}:${type}`;
    input.checked = rule === false;
    input.onchange = () => sendMessage('setRule', [hostname, type, false]);
    label.append(input);
    label.append(' blocked');
    div.append(label);

    return div;
};

sendMessage('get').then(data => {
    var createHeader = function() {
        let tr = document.createElement('tr');

        let th = document.createElement('th');
        tr.append(th);

        for (const type of TYPES) {
            let th = document.createElement('th');
            th.textContent = type;
            tr.append(th);
        }

        return tr;
    };

    var createRow = function(hostname) {
        let tr = document.createElement('tr');

        let th = document.createElement('th');
        th.textContent = hostname;
        tr.append(th);

        for (const type of TYPES) {
            let count = data.requests[hostname] ? data.requests[hostname][type] : null;
            let rule = data.rules[hostname] ? data.rules[hostname][type] : null;

            let td = document.createElement('td');
            if (hostname !== 'inline' || ['css', 'script', 'media'].includes(type)) {
                td.append(createRadios(hostname, type, rule));
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
