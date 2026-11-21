/**
 * For IMAGE/VIDEO/DOCUMENT templates, GET /{waba}/message_templates
 * returns `example.header_handle` as a public CDN URL of the approved
 * sample (not the opaque upload handle used at creation). The send
 * builder needs a link in `header_media_url` — it deliberately ignores
 * `header_handle` — so without this every synced media-header template
 * failed at send with "image header requires a media link or id".
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
