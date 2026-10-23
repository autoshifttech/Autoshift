/** Public, build-time configuration. Missing values disable the matching feature with a message. */
export const env = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, ''),
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  metaAppId: import.meta.env.VITE_META_APP_ID || '',
  metaConfigId: import.meta.env.VITE_META_CONFIG_ID || '',
  metaGraphVersion: import.meta.env.VITE_META_GRAPH_VERSION || 'v24.0',
}

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey)
export const isMetaConfigured = Boolean(env.metaAppId && env.metaConfigId)
