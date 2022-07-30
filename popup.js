/* global browser */

var table = document.querySelector('table');

var sendMessage = function(type, data) {
    return browser.runtime.sendMessage({type: type, data: data});
};

sendMessage('get').then(data => {
    var createRow = function(hostname, type, count) {
        var tr = document.createElement('tr');
        var rule = data.rules[hostname] ? data.rules[hostname][type] : null;

        let td = document.createElement('td');
        td.textContent = hostname;
        tr.append(td);

        td = document.createElement('td');
        td.textContent = type;
        tr.append(td);

        td = document.createElement('td');
        td.textContent = count;
        tr.append(td);

        td = document.createElement('td');
        tr.append(td);

        let label = document.createElement('label');
        let input = document.createElement('input');
        input.type = 'radio';
        input.name = `${hostname}:${type}`;
        input.checked = rule === true;
        input.onchange = () => sendMessage('setRule', [hostname, type, true]);
        label.append(input);
        label.append(' allowed');
        td.append(label);

        label = document.createElement('label');
        input = document.createElement('input');
        input.type = 'radio';
        input.name = `${hostname}:${type}`;
        input.checked = rule == null;  // but undefined == null
        input.onchange = () => sendMessage('setRule', [hostname, type, null]);
        label.append(input);
        label.append(' unset');
        td.append(label);

        label = document.createElement('label');
        input = document.createElement('input');
        input.type = 'radio';
        input.name = `${hostname}:${type}`;
        input.checked = rule === false;
        input.onchange = () => sendMessage('setRule', [hostname, type, false]);
        label.append(input);
        label.append(' blocked');
        td.append(label);

        table.append(tr);
    };

    createRow('inline', '*', '');

    for (const hostname in data.requests) {
        for (const type in data.requests[hostname]) {
            createRow(hostname, type, data.requests[hostname][type]);
        }
    }
});
