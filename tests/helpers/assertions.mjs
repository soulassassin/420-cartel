/**
 * E2E Test Suite Assertion & Registry Helpers
 * 420 Cartel Test Infrastructure
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const ROOT_DIR = path.resolve(__dirname, '..', '..');

export class AssertionError extends Error {
  constructor(message, actual, expected) {
    super(message);
    this.name = 'AssertionError';
    this.actual = actual;
    this.expected = expected;
  }
}

export function assert(condition, message = 'Assertion failed') {
  if (!condition) {
    throw new AssertionError(message, condition, true);
  }
}

export function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    const msg = message || `Expected ${JSON.stringify(expected)}, but received ${JSON.stringify(actual)}`;
    throw new AssertionError(msg, actual, expected);
  }
}

export function assertNotEqual(actual, unexpected, message) {
  if (actual === unexpected) {
    const msg = message || `Expected value NOT to equal ${JSON.stringify(unexpected)}`;
    throw new AssertionError(msg, actual, unexpected);
  }
}

export function assertIncludes(haystack, needle, message) {
  if (typeof haystack === 'string' || Array.isArray(haystack)) {
    if (!haystack.includes(needle)) {
      const preview = typeof haystack === 'string' && haystack.length > 120 
        ? haystack.slice(0, 120) + '...' 
        : haystack;
      const msg = message || `Expected target to include ${JSON.stringify(needle)}`;
      throw new AssertionError(msg, preview, needle);
    }
  } else {
    throw new AssertionError(`Target is not string or array`, typeof haystack, 'string|array');
  }
}

export function assertNotIncludes(haystack, needle, message) {
  if (typeof haystack === 'string' || Array.isArray(haystack)) {
    if (haystack.includes(needle)) {
      const msg = message || `Expected target NOT to include ${JSON.stringify(needle)}`;
      throw new AssertionError(msg, needle, undefined);
    }
  } else {
    throw new AssertionError(`Target is not string or array`, typeof haystack, 'string|array');
  }
}

export function assertMatch(text, regex, message) {
  if (typeof text !== 'string') {
    throw new AssertionError(`Expected string for regex match`, typeof text, 'string');
  }
  if (!regex.test(text)) {
    const preview = text.length > 120 ? text.slice(0, 120) + '...' : text;
    const msg = message || `Expected text to match pattern ${regex}`;
    throw new AssertionError(msg, preview, String(regex));
  }
}

export function assertNotMatch(text, regex, message) {
  if (typeof text !== 'string') {
    throw new AssertionError(`Expected string for regex test`, typeof text, 'string');
  }
  if (regex.test(text)) {
    const match = text.match(regex);
    const msg = message || `Expected text NOT to match pattern ${regex}, but matched "${match ? match[0] : ''}"`;
    throw new AssertionError(msg, match ? match[0] : true, 'no match');
  }
}

export function assertGreaterThan(actual, min, message) {
  if (typeof actual !== 'number' || actual <= min) {
    const msg = message || `Expected ${actual} to be greater than ${min}`;
    throw new AssertionError(msg, actual, `> ${min}`);
  }
}

export function assertGreaterThanOrEqual(actual, min, message) {
  if (typeof actual !== 'number' || actual < min) {
    const msg = message || `Expected ${actual} to be greater than or equal to ${min}`;
    throw new AssertionError(msg, actual, `>= ${min}`);
  }
}

export function assertLessThan(actual, max, message) {
  if (typeof actual !== 'number' || actual >= max) {
    const msg = message || `Expected ${actual} to be less than ${max}`;
    throw new AssertionError(msg, actual, `< ${max}`);
  }
}

export function resolveProjectPath(relPath) {
  return path.resolve(ROOT_DIR, relPath);
}

export function fileExists(relPath) {
  try {
    const fullPath = resolveProjectPath(relPath);
    return fs.existsSync(fullPath);
  } catch {
    return false;
  }
}

export function readFileUtf8(relPath) {
  try {
    const fullPath = resolveProjectPath(relPath);
    if (!fs.existsSync(fullPath)) return null;
    return fs.readFileSync(fullPath, 'utf8');
  } catch {
    return null;
  }
}

export function readBuffer(relPath) {
  try {
    const fullPath = resolveProjectPath(relPath);
    if (!fs.existsSync(fullPath)) return null;
    return fs.readFileSync(fullPath);
  } catch {
    return null;
  }
}

export function getFileSize(relPath) {
  try {
    const fullPath = resolveProjectPath(relPath);
    const stat = fs.statSync(fullPath);
    return stat.size;
  } catch {
    return -1;
  }
}

export function getJpegDimensions(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) return null; // Not JPEG

  let offset = 2;
  while (offset < buf.length) {
    if (buf[offset] !== 0xFF) break;
    const marker = buf[offset + 1];
    // SOF0 (Baseline), SOF1 (Extended), SOF2 (Progressive)
    if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
      const height = buf.readUInt16BE(offset + 5);
      const width = buf.readUInt16BE(offset + 7);
      const components = buf[offset + 9];
      return { width, height, components };
    }
    const len = buf.readUInt16BE(offset + 2);
    offset += 2 + len;
  }
  return null;
}

export function parseEnvFile(relPath) {
  const content = readFileUtf8(relPath);
  if (!content) return {};
  const map = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      map[key] = value;
    }
  }
  return map;
}

/**
 * Global test registry singleton
 */
class TestRegistryClass {
  constructor() {
    this.tests = [];
  }

  register(testDef) {
    const { id, name, feature, tier, description, fn } = testDef;
    if (!id || !name || !feature || !tier || typeof fn !== 'function') {
      throw new Error(`Invalid test definition: ${JSON.stringify(testDef)}`);
    }
    this.tests.push(testDef);
  }

  getAll() {
    return this.tests;
  }

  getByTier(tier) {
    const tNum = Number(tier);
    return this.tests.filter((t) => t.tier === tNum);
  }

  getByFeature(feature) {
    const fUpper = feature.toUpperCase();
    return this.tests.filter((t) => t.feature.toUpperCase() === fUpper);
  }

  clear() {
    this.tests = [];
  }
}

export const TestRegistry = new TestRegistryClass();
