// ============================================================
// Pipelines and their stages (e.g. Orders: New order → Paid → Shipped → Delivered).
// Leads are the pipelines' deals; each lead sits in one stage. Admins create and edit
// pipelines; anyone on the team can move a lead to another stage. Row-level security
// in the database enforces the same roles.
// ============================================================

import { useEffect } from 'react'
import { createStore, useStore } from '@/lib/workspace/store'
import { createClient } from '@/lib/supabase/client'
import { isLive, myAccount } from '@/lib/workspace/live'

export interface Stage {
  id: string
  name: string
  position: number
  /** Leads currently in this stage. */
  leads: number
}

export interface Pipeline {
  id: string
  name: string
  stages: Stage[]
}

/** A stage while editing: existing ones keep their id. */
export interface StageDraft {
  id?: string
  name: string
}

export const MAX_STAGES = 12
export const NAME_MAX = 40

/** Ready-made stage lists to start from. */
export const PIPELINE_PRESETS: Record<'sales' | 'orders' | 'bookings', string[]> = {
  sales: ['New', 'Contacted', 'Qualified', 'Proposal', 'Won'],
  orders: ['New order', 'Paid', 'Cash on delivery', 'Shipped', 'Delivered', 'Cancelled'],
  bookings: ['Requested', 'Confirmed', 'Visited', 'Follow-up', 'Closed'],
}

export type PipelineProblem = 'nameRequired' | 'nameTaken' | 'nameTooLong' | 'needStage' | 'tooManyStages' | 'stageEmpty' | 'stageTooLong' | 'stageDuplicate'

/** What's wrong with a pipeline being saved (empty list = fine). */
export function checkPipeline(name: string, stages: StageDraft[], otherNames: string[]): PipelineProblem[] {
  const out: PipelineProblem[] = []
  const n = name.trim()
  if (!n) out.push('nameRequired')
  else if (n.length > NAME_MAX) out.push('nameTooLong')
  else if (otherNames.some((o) => o.trim().toLowerCase() === n.toLowerCase())) out.push('nameTaken')
  if (stages.length === 0) out.push('needStage')
  if (stages.length > MAX_STAGES) out.push('tooManyStages')
  const names = stages.map((s) => s.name.trim())
  if (names.some((s) => !s)) out.push('stageEmpty')
  if (names.some((s) => s.length > NAME_MAX)) out.push('stageTooLong')
  const lower = names.filter(Boolean).map((s) => s.toLowerCase())
  if (new Set(lower).size !== lower.length) out.push('stageDuplicate')
  return out
}

// ------------------------------------------------------------- store

export const pipelinesStore = createStore<{ pipelines: Pipeline[]; loaded: boolean }>(() => ({ pipelines: [], loaded: false }))
const SERVER = { pipelines: [] as Pipeline[], loaded: false }
let loading: Promise<void> | null = null

export function loadPipelines(force = false): Promise<void> {
  if (!isLive()) return Promise.resolve()
  if (!loading || force) {
    loading = fetchPipelines()
      .then((pipelines) => pipelinesStore.set({ pipelines, loaded: true }))
      .catch((err) => {
        console.error('[pipelines] load failed', err)
        loading = null
      })
  }
  return loading
}

export function usePipelines() {
  useEffect(() => {
    void loadPipelines()
  }, [])
  return useStore(pipelinesStore, SERVER)
}

async function fetchPipelines(): Promise<Pipeline[]> {
  const sb = createClient()
  const { data: pipes, error } = await sb.from('pipelines').select('id, name, created_at').order('created_at', { ascending: true })
  if (error) throw error
  const ids = (pipes ?? []).map((p) => p.id as string)
  if (ids.length === 0) return []
  const [{ data: stages }, { data: deals }] = await Promise.all([
    sb.from('pipeline_stages').select('id, name, position, pipeline_id').in('pipeline_id', ids).order('position', { ascending: true }),
    sb.from('deals').select('stage_id').in('pipeline_id', ids).limit(5000),
  ])
  const counts = new Map<string, number>()
  for (const d of deals ?? []) counts.set(d.stage_id as string, (counts.get(d.stage_id as string) ?? 0) + 1)
  return (pipes ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    stages: (stages ?? [])
      .filter((s) => s.pipeline_id === p.id)
      .map((s) => ({ id: s.id as string, name: s.name as string, position: s.position as number, leads: counts.get(s.id as string) ?? 0 })),
  }))
}

// ------------------------------------------------------------- changes

export async function createPipeline(name: string, stages: string[]): Promise<void> {
  const sb = createClient()
  const { accountId, userId } = await myAccount()
  const { data: made, error } = await sb.from('pipelines').insert({ account_id: accountId, user_id: userId, name: name.trim() }).select('id').single()
  if (error || !made) throw new Error(error?.message ?? 'Could not create the pipeline')
  const rows = stages.map((s, position) => ({ pipeline_id: made.id, name: s.trim(), position }))
  const { error: stageError } = await sb.from('pipeline_stages').insert(rows)
  if (stageError) {
    await sb.from('pipelines').delete().eq('id', made.id) // never leave a pipeline without stages
    throw new Error(stageError.message)
  }
  await loadPipelines(true)
}

/**
 * Saves a pipeline's name and stages: renames and reorders existing stages, adds new ones and
 * removes the ones taken out (only empty stages can be removed; the editor doesn't offer it otherwise).
 */
export async function savePipeline(pipeline: Pipeline, name: string, stages: StageDraft[]): Promise<void> {
  const sb = createClient()
  if (name.trim() !== pipeline.name) {
    const { error } = await sb.from('pipelines').update({ name: name.trim() }).eq('id', pipeline.id)
    if (error) throw new Error(error.message)
  }
  const kept = new Set(stages.filter((s) => s.id).map((s) => s.id))
  const removed = pipeline.stages.filter((s) => !kept.has(s.id))
  if (removed.some((s) => s.leads > 0)) throw new Error('A stage with leads in it can’t be removed')
  for (const [position, s] of stages.entries()) {
    const { error } = s.id
      ? await sb.from('pipeline_stages').update({ name: s.name.trim(), position }).eq('id', s.id)
      : await sb.from('pipeline_stages').insert({ pipeline_id: pipeline.id, name: s.name.trim(), position })
    if (error) throw new Error(error.message)
  }
  if (removed.length) {
    const { error } = await sb.from('pipeline_stages').delete().in('id', removed.map((s) => s.id))
    if (error) throw new Error(error.message)
  }
  await loadPipelines(true)
}

/** Deletes a pipeline that has no leads (deleting one with leads would delete them too). */
export async function deletePipeline(pipeline: Pipeline): Promise<void> {
  if (pipeline.stages.some((s) => s.leads > 0)) throw new Error('Move or delete its leads first')
  const { error } = await createClient().from('pipelines').delete().eq('id', pipeline.id)
  if (error) throw new Error(error.message)
  await loadPipelines(true)
}

/** Moves a lead to another stage of its pipeline. A closed (won/lost) lead is reopened. */
export async function moveLeadToStage(leadId: string, stageId: string): Promise<void> {
  const { error } = await createClient()
    .from('deals')
    .update({ stage_id: stageId, status: 'open', closed_at: null, updated_at: new Date().toISOString() })
    .eq('id', leadId)
  if (error) throw new Error(error.message)
  await loadPipelines(true)
}
