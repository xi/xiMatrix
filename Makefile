bundle.zip: manifest.json icon-128.png bg.js popup.html popup.js popup.css
	zip $@ $^

icon-128.png: icon.svg
	inkscape $< --export-filename=$@
