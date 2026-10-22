import { describe, expect, it } from 'vitest';
import { migrateBestLapKeys, parseRecordKey, recordKey } from './records';

describe('record keys', () => {
  it('builds and parses track-scoped keys', () => {
    expect(recordKey('buddh', 'timetrial', 'sunny')).toBe('buddh:timetrial:sunny');
    expect(parseRecordKey('monza:practice:rain')).toEqual({ trackId: 'monza', mode: 'practice', weather: 'rain' });
  });

  it('parses a legacy two-part key as Buddh', () => {
    expect(parseRecordKey('timetrial:sunny')).toEqual({ trackId: 'buddh', mode: 'timetrial', weather: 'sunny' });
  });

  it('different tracks do not collide', () => {
    expect(recordKey('buddh', 'timetrial', 'sunny')).not.toBe(recordKey('monza', 'timetrial', 'sunny'));
  });

  it('migration keeps the faster lap when a legacy key meets its migrated twin', () => {
    expect(migrateBestLapKeys({ 'timetrial:sunny': 91, 'buddh:timetrial:sunny': 89.5 })).toEqual({ 'buddh:timetrial:sunny': 89.5 });
    expect(migrateBestLapKeys({ 'timetrial:sunny': 88, 'buddh:timetrial:sunny': 89.5 })).toEqual({ 'buddh:timetrial:sunny': 88 });
  });
});
