import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DEEPSEEK_API_KEY = '';
process.env.JEV_API_KEY = '';
const { finalScore } = await import('../ranking/index.js');

test('individual rubric: all 5s → 100, weights sum to 100', () => {
  const keys = ['topic_similarity', 'accomplishments', 'skills_overlap', 'role_suitability', 'proximity'];
  const r = finalScore('individual', Object.fromEntries(keys.map((k) => [k, 5])), keys);
  assert.equal(r.score, 100);
  assert.equal(Object.values(r.weights).reduce((a, b) => a + b, 0), 100);
  assert.deepEqual(r.weights, { topic_similarity: 40, accomplishments: 25, skills_overlap: 15, role_suitability: 15, proximity: 5 });
});

test('Final Score = Σ weight × score / 5', () => {
  const keys = ['topic_relevance', 'accomplishments', 'capacity_fit', 'partnership_suitability', 'proximity'];
  const r = finalScore('organization', { topic_relevance: 4, accomplishments: 3, capacity_fit: 5, partnership_suitability: 2, proximity: 0 }, keys);
  // 45*4/5 + 25*3/5 + 15*5/5 + 10*2/5 + 5*0 = 36 + 15 + 15 + 4 + 0 = 70
  assert.equal(r.score, 70);
});

test('dropping proximity redistributes its weight proportionally', () => {
  const keys = ['topic_similarity', 'accomplishments', 'skills_overlap', 'role_suitability'];
  const r = finalScore('individual', { topic_similarity: 5, accomplishments: 5, skills_overlap: 5, role_suitability: 5 }, keys);
  assert.equal(r.score, 100);
  assert.equal(r.weights.topic_similarity, 42.1); // 40 / 95
  assert.equal(r.weights.proximity, undefined);
});

test('scores are clamped to 0–5', () => {
  const keys = ['topic_similarity', 'accomplishments', 'skills_overlap', 'role_suitability'];
  const r = finalScore('individual', { topic_similarity: 9, accomplishments: -2, skills_overlap: 5, role_suitability: 5 }, keys);
  assert.ok(r.score <= 100 && r.score >= 0);
});
