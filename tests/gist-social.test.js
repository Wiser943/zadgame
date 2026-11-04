'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { GistPost, GistSave, GistMute } = require('../models/Gist');

function uniqueIndex(schema, keys) {
  return schema.indexes().find(([fields, options]) => options.unique && Object.keys(keys).every((key) => fields[key] === keys[key]));
}

test('saved-post relationship is unique per user and post', () => {
  assert.ok(uniqueIndex(GistSave.schema, { user: 1, post: 1 }));
  assert.equal(GistSave.schema.path('createdAt').options.default instanceof Function, true);
});

test('muted-creator relationship is unique per user and creator', () => {
  assert.ok(uniqueIndex(GistMute.schema, { user: 1, muted: 1 }));
  assert.equal(GistMute.schema.path('user').instance, 'String');
  assert.equal(GistMute.schema.path('muted').instance, 'String');
});

test('P-Gist captions have a dedicated Mongo text index for search', () => {
  assert.ok(GistPost.schema.indexes().some(([fields, options]) => fields.text === 'text' && options.name === 'gist_text_search'));
});
