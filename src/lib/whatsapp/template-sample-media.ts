import { buildMediaPath, MEDIA_MAX_BYTES_BY_KIND } from '@/lib/storage/upload-media'

/**
 * Send-time media for templates pulled in by "Sync from Meta".
 *
 * For IMAGE/VIDEO/DOCUMENT templates, GET /{waba}/message_templates
 * returns `example.header_handle` as a signed CDN URL of the approved
 * sample (scontent.whatsapp.net), not the opaque upload handle used at
 * creation. The send builder needs a link in `header_media_url` — it
 * deliberately ignores `header_handle` — so synced media templates used
 * to fail locally with "image header requires a media link or id".
 *
 * Passing that CDN URL straight through is NOT a fix: Meta's own media
 * downloader is refused by its CDN, and the send fails asynchronously
 * with status `failed`, error 131053 "Downloading media from weblink
 * failed with http code 403". Our server CAN fetch it, so sync downloads
 * the sample once and re-hosts it in the public `chat-media` bucket —
 * the same bucket the template editor's own upload uses — and stores
 * that URL instead.
 */

export function sampleMediaUrl(handle: string | undefined): string | null {
  if (!handle) return null
  try {
    const u = new URL(handle)
    return u.protocol === 'https:' ? handle : null
  } catch {
    return null
  }
}

export function isMetaCdnUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return (
      host.endsWith('.whatsapp.net') ||
      host.endsWith('.fbcdn.net') ||
      host.endsWith('.facebook.com')
    )
  } catch {
    return false
  }
}

const BUCKET = 'chat-media'
const FOLDER = 'template-headers'

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'application/pdf': 'pdf',
}

type HeaderKind = 'image' | 'video' | 'document'

/** Minimal slice of `supabase.storage` used here — keeps this testable. */
export interface SampleStorage {
  from(bucket: string): {
    upload(
      path: string,
      body: Uint8Array,
      opts: { contentType: string; upsert: boolean; cacheControl?: string },
    ): Promise<{ error: { message: string } | null }>
    getPublicUrl(path: string): { data: { publicUrl: string } }
  }
}

export interface RehostArgs {
  storage: SampleStorage
  accountId: string
  /** Meta's template id — makes the object path stable across re-syncs. */
  metaTemplateId: string
  headerType: HeaderKind
  sampleUrl: string
  fetchImpl?: typeof fetch
}

/**
 * Download Meta's sample and upload it to `chat-media`. Returns the
 * public URL, or null (with a logged reason) on any failure — sync must
 * not abort the whole catalog over one template's header.
 */
export async function rehostTemplateSample(args: RehostArgs): Promise<string | null> {
  const { storage, accountId, metaTemplateId, headerType, sampleUrl } = args
  const doFetch = args.fetchImpl ?? fetch
  const tag = `[template-sync] header for ${metaTemplateId}`

  // The URL comes from Meta's API response, but it's still a server-side
  // fetch: pin it to Meta's CDN and don't follow redirects.
  if (!isMetaCdnUrl(sampleUrl)) {
    console.warn(`${tag}: sample URL is not on Meta's CDN, skipping`)
    return null
  }

  let res: Response
  try {
    res = await doFetch(sampleUrl, { redirect: 'manual', signal: AbortSignal.timeout(15_000) })
  } catch (err) {
    console.warn(`${tag}: download failed: ${err instanceof Error ? err.message : err}`)
    return null
  }
  if (!res.ok) {
    console.warn(`${tag}: download returned HTTP ${res.status}`)
    return null
  }

  const mime = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  const ext = EXT_BY_MIME[mime]
  if (!ext) {
    console.warn(`${tag}: unsupported content-type "${mime}"`)
    return null
  }

  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.byteLength === 0 || bytes.byteLength > MEDIA_MAX_BYTES_BY_KIND[headerType]) {
    console.warn(`${tag}: size ${bytes.byteLength} bytes is outside the ${headerType} limit`)
    return null
  }

  // Stable path (no timestamp) + upsert: a re-sync overwrites the same
  // object instead of orphaning a new copy each time.
  const path = buildMediaPath(accountId, `tpl-${metaTemplateId}.${ext}`, null, FOLDER)
  const { error } = await storage.from(BUCKET).upload(path, bytes, {
    contentType: mime,
    upsert: true,
    cacheControl: '3600',
  })
  if (error) {
    console.warn(`${tag}: upload failed: ${error.message}`)
    return null
  }
  return storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}
