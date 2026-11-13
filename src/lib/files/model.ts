/**
 * Files library: images, PDFs and videos to reuse in chats, templates,
 * drips and AI replies: the account's uploaded media in Supabase Storage.
 */
import { useEffect } from 'react'
import { createStore, useStore } from '@/lib/workspace/store'
import { createClient } from '@/lib/supabase/client'
import { isLive, myAccount } from '@/lib/workspace/live'

export const FILE_KINDS = ['image', 'pdf', 'video', 'other'] as const
export type FileKind = (typeof FILE_KINDS)[number]

export interface LibraryFile {
  id: string
  name: string
  kind: FileKind
  size: number
  /** Preview colour when there's no image url. */
  tint: string
  url: string | null
  usedIn: string[]
  uploadedAt: string
}

export const STORAGE_LIMIT = 1024 * 1024 * 1024

export function kindOf(file: { name: string; type?: string }): FileKind {
  const type = file.type ?? ''
  if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(file.name)) return 'image'
  if (type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf'
  if (type.startsWith('video/') || /\.(mp4|mov|3gp)$/i.test(file.name)) return 'video'
  return 'other'
}

/** WhatsApp's media size limits, in bytes. */
export const MAX_SIZE: Record<FileKind, number> = { image: 5 * 1024 * 1024, pdf: 100 * 1024 * 1024, video: 16 * 1024 * 1024, other: 100 * 1024 * 1024 }

export function formatSize(bytes: number, locale = 'en'): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: n < 10 && i > 0 ? 1 : 0 }).format(n)} ${units[i]}`
}


// Real accounts: the account's uploaded media (Supabase Storage, bucket chat-media). Demo: samples.
export const MEDIA_BUCKET = 'chat-media'
export const filesStore = createStore<{ files: LibraryFile[] }>(() => ({ files: [] }))
const SERVER = { files: [] as LibraryFile[] }
let liveLoad: Promise<void> | null = null

export function loadLiveFiles(force = false): Promise<void> {
  if (!isLive()) return Promise.resolve()
  if (!liveLoad || force) {
    liveLoad = (async () => {
      const { accountId } = await myAccount()
      const sb = createClient()
      const dir = `account-${accountId}`
      const { data, error } = await sb.storage.from(MEDIA_BUCKET).list(dir, { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } })
      if (error) throw error
      const files: LibraryFile[] = (data ?? [])
        .filter((o) => o.id) // folders have no id
        .map((o) => {
          const path = `${dir}/${o.name}`
          const size = Number((o.metadata as { size?: number } | null)?.size ?? 0)
          return {
            id: path,
            name: o.name.replace(/^\d{10,}-/, ''),
            kind: kindOf({ name: o.name, type: (o.metadata as { mimetype?: string } | null)?.mimetype }),
            size,
            tint: '#1E4C41',
            url: sb.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl,
            usedIn: [],
            uploadedAt: o.created_at ?? new Date().toISOString(),
          }
        })
      filesStore.set({ files })
    })().catch((err) => {
      console.error('[files] load failed', err)
      liveLoad = null
    })
  }
  return liveLoad
}

export const useFiles = () => {
  useEffect(() => {
    void loadLiveFiles()
  }, [])
  return useStore(filesStore, SERVER).files
}

/** Deletes an uploaded file for real (its id is the storage path). */
export async function deleteLiveFile(id: string): Promise<void> {
  if (!isLive()) return
  const { error } = await createClient().storage.from(MEDIA_BUCKET).remove([id])
  if (error) throw new Error(error.message)
}
