import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldAllow } from './src/shared.js';

describe('shouldAllow()', () => {
    it('empty rules denies everything', () => {
        const rules = {};
        assert.equal(shouldAllow(rules, 'example.com', 'sub.example.com', 'script'), false);
    });

    it('* matches any domain', () => {
        const rules = { '*': { '*': { script: true } } };
        assert.equal(shouldAllow(rules, 'example.com', 'sub.example.com', 'script'), true);
        assert.equal(shouldAllow(rules, 'example.com', 'sub.example.com', 'css'), false);
        assert.equal(shouldAllow(rules, 'other.com', 'example.com', 'script'), true);
    });

    it('* matches any type', () => {
        const rules = { '*': { '*': { '*': true } } };
        assert.equal(shouldAllow(rules, 'example.com', 'other.com', 'font'), true);
    });

    it('a context-specific allow applies to that context', () => {
        const rules = { 'example.com': { 'sub.example.com': { script: true } } };
        assert.equal(shouldAllow(rules, 'example.com', 'sub.example.com', 'script'), true);
        assert.equal(shouldAllow(rules, 'example.com', 'other.com', 'script'), false);
        assert.equal(shouldAllow(rules, 'other.com', 'sub.example.com', 'script'), false);
    });

    it('sub-domains are allowed along with their parent', () => {
        const rules = { '*': { 'example.com': { script: true } } };
        assert.equal(shouldAllow(rules, 'example.com', 'deep.sub.example.com', 'script'), true);
    });

    it('first-party rules apply to the context host and its sub-domains', () => {
        const rules = { 'example.com': { 'first-party': { script: true } } };
        assert.equal(shouldAllow(rules, 'example.com', 'example.com', 'script'), true);
        assert.equal(shouldAllow(rules, 'example.com', 'sub.example.com', 'script'), true);
        assert.equal(shouldAllow(rules, 'example.com', 'other.com', 'script'), false);
    });
});
