import { describe, expect, it, vi } from 'vitest';
import { isMetaCdnUrl, rehostTemplateSample, sampleMediaUrl } from './template-sample-media';

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

describe('rehostTemplateSample', () => {
  function fakeStorage(uploadError: string | null = null) {
    const upload = vi.fn().mockResolvedValue({ error: uploadError ? { message: uploadError } : null });
    const storage = {
      from: vi.fn(() => ({
        upload,
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://sb.example/${p}` } }),
      })),
    };
    return { storage, upload };
  }
  const img = () =>
    new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } });
  const base = { accountId: 'A1', metaTemplateId: 'T9', headerType: 'image' as const };

  it('uploads the sample to chat-media at a stable path and returns its public URL', async () => {
    const { storage, upload } = fakeStorage();
    const url = await rehostTemplateSample({
      ...base,
      storage,
      sampleUrl: 'https://scontent.whatsapp.net/x.jpg',
      fetchImpl: vi.fn().mockResolvedValue(img()),
    });
    expect(storage.from).toHaveBeenCalledWith('chat-media');
    const [path, , opts] = upload.mock.calls[0];
    expect(path).toBe('account-A1/template-headers/tpl-T9.jpg');
    expect(opts).toMatchObject({ contentType: 'image/jpeg', upsert: true });
    expect(url).toBe('https://sb.example/account-A1/template-headers/tpl-T9.jpg');
  });

  it('refuses non-Meta hosts without fetching', async () => {
    const fetchImpl = vi.fn();
    const { storage } = fakeStorage();
    expect(
      await rehostTemplateSample({ ...base, storage, sampleUrl: 'https://169.254.169.254/x', fetchImpl }),
    ).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns null on download or upload failure', async () => {
    const { storage } = fakeStorage();
    expect(
      await rehostTemplateSample({
        ...base,
        storage,
        sampleUrl: 'https://scontent.whatsapp.net/x.jpg',
        fetchImpl: vi.fn().mockResolvedValue(new Response('', { status: 403 })),
      }),
    ).toBeNull();
    const bad = fakeStorage('mime type not allowed');
    expect(
      await rehostTemplateSample({
        ...base,
        storage: bad.storage,
        sampleUrl: 'https://scontent.whatsapp.net/x.jpg',
        fetchImpl: vi.fn().mockResolvedValue(img()),
      }),
    ).toBeNull();
  });
});
