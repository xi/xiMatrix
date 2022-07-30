bundle.zip: manifest.json icon-128.png src/*
	zip $@ $^

icon-128.png: icon.svg
	inkscape $< --export-filename=$@
