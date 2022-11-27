var form = document.querySelector('form');
var textarea = document.querySelector('textarea');

browser.storage.local.get('rules').then(data => {
	var rules = data.rules || {};
	textarea.value = JSON.stringify(rules, null, 2)
});

form.addEventListener('submit', event => {
	event.preventDefault();
	var rules = JSON.parse(textarea.value);
	browser.storage.local.set({'rules': rules}).then(() => {
		location.reload();
	});
});
