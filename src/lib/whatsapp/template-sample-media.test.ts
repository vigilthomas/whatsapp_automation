import { describe, expect, it } from 'vitest';
import { isMetaCdnUrl, sampleMediaUrl } from './template-sample-media';

describe('sampleMediaUrl', () => {
  it('returns https sample URLs from Meta', () => {
    const u = 'https://scontent.whatsapp.net/v/t61/abc.jpg?oe=1';
    expect(sampleMediaUrl(u)).toBe(u);
  });
  it('ignores opaque upload handles, http and empty values', () => {
    expect(sampleMediaUrl('4::aW1hZ2UvanBlZw==:ARb')).toBeNull();
    expect(sampleMediaUrl('http://example.com/a.jpg')).toBeNull();
    expect(sampleMediaUrl(undefined)).toBeNull();
  });
});

describe('isMetaCdnUrl', () => {
  it('recognises Meta CDN hosts only', () => {
    expect(isMetaCdnUrl('https://scontent.whatsapp.net/x.jpg')).toBe(true);
    expect(isMetaCdnUrl('https://scontent-sin6-1.xx.fbcdn.net/x.jpg')).toBe(true);
    expect(isMetaCdnUrl('https://example.supabase.co/storage/x.jpg')).toBe(false);
    expect(isMetaCdnUrl('not a url')).toBe(false);
  });
});
