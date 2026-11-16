// ============================================================
// The business's product list, imported from an Excel or CSV file on the Files page.
// The AI assistant can answer from it and a flow's Add to cart step can take its prices from it.
// The backend reads the file; the browser only sends it.
// ============================================================

import { useEffect } from 'react'
import { createStore, useStore } from '@/lib/workspace/store'
import { createClient } from '@/lib/supabase/client'
import { isLive } from '@/lib/workspace/live'
import { backend, backendUrl } from '@/lib/backend/client'

export interface CatalogProduct {
  code: string
  name: string
  price: number
  details?: Record<string, string>
}

export interface Catalog {
  file_name: string
  file_url: string | null
  products: CatalogProduct[]
  columns: string[]
  updated_at: string
}

export interface ImportSummary {
  file_name: string
  count: number
  columns: string[]
  skipped_rows: number[]
  sample: CatalogProduct[]
}

/** Files the product list can be read from. */
export const isCatalogFile = (name: string) => /\.(xlsx|csv)$/i.test(name)

const store = createStore<{ catalog: Catalog | null; loaded: boolean }>(() => ({ catalog: null, loaded: false }))
const SERVER = { catalog: null, loaded: false }
let loading: Promise<void> | null = null

export function loadCatalog(force = false): Promise<void> {
  if (!isLive()) return Promise.resolve()
  if (!loading || force) {
    loading = (async () => {
      const { data, error } = await createClient().from('product_catalog').select('file_name, file_url, products, columns, updated_at').maybeSingle()
      if (error) throw error
      store.set({ catalog: (data as Catalog | null) ?? null, loaded: true })
    })().catch((err) => {
      console.error('[catalog] load failed', err)
      loading = null
    })
  }
  return loading
}

export function useCatalog() {
  useEffect(() => {
    void loadCatalog()
  }, [])
  return useStore(store, SERVER)
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** Reads a file from the Files page (by its link). dryRun only checks it and returns what was found. */
export async function importCatalog(file: { name: string; url: string }, dryRun: boolean): Promise<ImportSummary> {
  const res = await fetch(file.url)
  if (!res.ok) throw new Error(`Could not open the file (${res.status})`)
  return importCatalogBlob({ name: file.name, blob: await res.blob(), url: file.url }, dryRun)
}

/** Reads a file picked on this device and sends it straight to AutoShift (it is not stored on the Files page). */
export async function importCatalogBlob(file: { name: string; blob: Blob; url?: string }, dryRun: boolean): Promise<ImportSummary> {
  if (!backendUrl()) throw new Error('The AutoShift API is not connected')
  if (file.blob.size > 2 * 1024 * 1024) throw new Error('The file is larger than 2 MB')
  const summary = await backend<ImportSummary>('/v1/catalog/import', {
    method: 'POST',
    body: { file_name: file.name, file_url: file.url ?? null, content_base64: await toBase64(file.blob), dry_run: dryRun },
  })
  if (!dryRun) await loadCatalog(true)
  return summary
}
