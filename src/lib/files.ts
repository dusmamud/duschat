import imageCompression from 'browser-image-compression'
import { supabase } from './supabase'

// Single shared Supabase client lives in ./supabase.ts — re-exported here
// so older imports (e.g. TxtViewer) keep working.
export { supabase } from './supabase'

const BUCKET = 'chat-files'
const MAX_TXT_BYTES = 2 * 1024 * 1024 // 2 MB
const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB (bucket limit)

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
  publicUrl?: string
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

/**
 * Upload any file as-is (max 10 MB, the bucket limit) to
 * `chat-files/<userId>/<uuid>.<ext>`. The original extension is kept so the
 * receiver sees the real file name. Only `.txt` files get the popup viewer;
 * every other file is a download attachment.
 */
export async function uploadFile(file: File, userId: string): Promise<UploadedFile> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('File must be 10 MB or smaller.')
  }
  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : ''
  const path = `${userId}/${crypto.randomUUID()}${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
  })
  if (error) throw new Error(error.message)
  return { path, fileName: file.name, fileSize: file.size }
}

/**
 * Compress an image client-side (max 0.8 MB / 1600 px) and upload it as JPEG
 * to `chat-files/<userId>/<uuid>.jpg`.
 */
export async function uploadImage(file: File, userId: string): Promise<UploadedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.')
  }
  const compressed = await imageCompression(file, {
    maxSizeMB: 0.8,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
  })
  const path = `${userId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, compressed, {
    contentType: 'image/jpeg',
  })
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { path, publicUrl: data.publicUrl }
}

/**
 * Validate and upload a `.txt` file (max 2 MB) to
 * `chat-files/<userId>/<uuid>.txt`.
 */
export async function uploadTxt(file: File, userId: string): Promise<UploadedTxt> {
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
