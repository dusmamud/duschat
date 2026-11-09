import imageCompression from 'browser-image-compression'
import { supabase, getSignedFileUrl } from './supabase'

// Single shared Supabase client lives in ./supabase.ts — re-exported here
// so older imports (e.g. TxtViewer) keep working.
export { supabase } from './supabase'

const BUCKET = 'chat-files'
const MAX_TXT_BYTES = 2 * 1024 * 1024 // 2 MB
const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB (bucket limit)

/** MIME types that must never be uploaded — they could render as active
 *  content (HTML/JS/SVG) if a signed URL were ever opened in a browser. */
const DANGEROUS_TYPES = new Set([
  'text/html',
  'image/svg+xml',
  'application/xhtml+xml',
  'text/javascript',
])

function assertSafeType(fileType: string): void {
  if (DANGEROUS_TYPES.has(fileType.toLowerCase())) {
    throw new Error('That file type is not allowed.')
  }
}

/** Keep only a safe extension: `.` + 1–10 alphanumerics, or nothing. */
function sanitizeExtension(fileName: string): string {
  const match = /\.([A-Za-z0-9]{1,10})$/.exec(fileName)
  return match ? `.${match[1]}` : ''
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let size = bytes / 1024
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unit]}`
}

export interface UploadedImage {
  path: string
}

export interface UploadedFile {
  path: string
  fileName: string
  fileSize: number
}

/** Kept for older imports — same shape as UploadedFile. */
export type UploadedTxt = UploadedFile

/** True when the file is a `.txt` file (by extension or MIME type). */
export function isTxtFile(fileName: string, fileType = ''): boolean {
  return fileName.toLowerCase().endsWith('.txt') || fileType === 'text/plain'
}

export function isImageFile(fileType: string): boolean {
  return fileType.startsWith('image/')
}

// ---------------------------------------------------------------------------
// .txt content — cached, capped, instant on tap.
//
// Opening a .txt file used to download the whole file (up to 2 MB) and
// then show a spinner. Instead the text is fetched once (first 200 KB
// only, via a Range request) and cached per storage path, so the viewer
// opens instantly — and message bubbles prefetch it on mount, so by tap
// time the text is usually already here. The viewer reads the cache
// synchronously for its first paint (see peekTxtContent).
// ---------------------------------------------------------------------------

/** Max .txt content shown in the viewer (200 KB). */
export const MAX_TXT_PREVIEW_BYTES = 200 * 1024

export interface TxtContent {
  text: string
  truncated: boolean
}

const txtContentCache = new Map<string, TxtContent>()
const txtContentInflight = new Map<string, Promise<TxtContent>>()

/** Cached text for a path, if already fetched — null otherwise. */
export function peekTxtContent(path: string): TxtContent | null {
  return txtContentCache.get(path) ?? null
}

export async function getTxtContent(path: string): Promise<TxtContent> {
  const cached = txtContentCache.get(path)
  if (cached) return cached
  const inflight = txtContentInflight.get(path)
  if (inflight) return inflight
  const promise = (async (): Promise<TxtContent> => {
    const url = await getSignedFileUrl(path, 3600)
    // Range keeps the download to the preview cap instead of the whole file.
    const res = await fetch(url, {
      headers: { Range: `bytes=0-${MAX_TXT_PREVIEW_BYTES - 1}` },
    })
    if (!res.ok) throw new Error('Could not load file.')
    const text = await res.text()
    // 206 + Content-Range "bytes 0-204799/<total>" tells the real size;
    // without it, fall back to the byte length of what arrived.
    const range = res.headers.get('content-range')
    const total = range ? Number(range.split('/')[1]) : NaN
    const truncated = Number.isFinite(total)
      ? total > MAX_TXT_PREVIEW_BYTES
      : new TextEncoder().encode(text).length >= MAX_TXT_PREVIEW_BYTES
    const result = { text, truncated }
    txtContentCache.set(path, result)
    return result
  })()
  txtContentInflight.set(path, promise)
  try {
    return await promise
  } finally {
    txtContentInflight.delete(path)
  }
}

/** Fire-and-forget prefetch for a .txt bubble — errors are swallowed;
 *  the viewer retries on tap if the prefetch never landed. */
export function prefetchTxtContent(path: string): void {
  void getTxtContent(path).catch(() => undefined)
}

/**
 * Upload any file as-is (max 10 MB, the bucket limit) to
 * `chat-files/<userId>/<uuid>.<ext>`. The original extension is kept (sanitised
 * to safe characters) so the receiver sees the real file name. Only `.txt`
 * files get the popup viewer; every other file is a download attachment.
 * Non-image/non-txt files are stored as `application/octet-stream` so a
 * signed URL downloads instead of rendering in the browser.
 */
export async function uploadFile(file: File, userId: string): Promise<UploadedFile> {
  assertSafeType(file.type)
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('File must be 10 MB or smaller.')
  }
  const ext = sanitizeExtension(file.name)
  const path = `${userId}/${crypto.randomUUID()}${ext}`
  const contentType = isImageFile(file.type)
    ? file.type
    : isTxtFile(file.name, file.type)
      ? 'text/plain'
      : 'application/octet-stream'
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType,
  })
  if (error) throw new Error(error.message)
  return { path, fileName: file.name, fileSize: file.size }
}

/**
 * Compress an image client-side (max 0.8 MB / 1600 px) and upload it as JPEG
 * to `chat-files/<userId>/<uuid>.jpg`. The bucket is private, so only the
 * storage path is returned — callers resolve a signed URL to view it.
 */
export async function uploadImage(file: File, userId: string): Promise<UploadedImage> {
  assertSafeType(file.type)
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.')
  }
  const compressed = await imageCompression(file, {
    maxSizeMB: 0.8,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    // The worker runs the library via importScripts, and the library's
    // default libURL is the jsdelivr CDN — blocked by our CSP (script-src
    // 'self') and an external dependency we don't want. Point it at our
    // own copy instead: public/vendor/browser-image-compression.js is
    // the v2.0.2 UMD build copied from node_modules (same version as
    // package.json — refresh the copy if the package is ever upgraded).
    // Without this the worker fails and every send silently falls back
    // to main-thread compression (works, but blocks the UI).
    libURL: '/vendor/browser-image-compression.js',
  })
  const path = `${userId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, compressed, {
    contentType: 'image/jpeg',
  })
  if (error) throw new Error(error.message)
  return { path }
}

/**
 * Validate and upload a `.txt` file (max 2 MB) to
 * `chat-files/<userId>/<uuid>.txt`.
 */
export async function uploadTxt(file: File, userId: string): Promise<UploadedTxt> {
  assertSafeType(file.type)
  const isTxt =
    file.name.toLowerCase().endsWith('.txt') || file.type === 'text/plain'
  if (!isTxt) {
    throw new Error('Only .txt files are supported.')
  }
  if (file.size > MAX_TXT_BYTES) {
    throw new Error('Text file must be 2 MB or smaller.')
  }
  const path = `${userId}/${crypto.randomUUID()}.txt`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: 'text/plain',
  })
  if (error) throw new Error(error.message)
  return { path, fileName: file.name, fileSize: file.size }
}

/** Remove one object from the bucket (best effort — ignores missing files). */
export async function deleteStorageFile(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw new Error(error.message)
}
