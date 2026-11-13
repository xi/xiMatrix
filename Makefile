bundle.zip: manifest.json icon.svg src/*
	zip $@ $^

.PHONY: test
test:
	node --test
