import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

export interface LASTask {
  task_id: string
  action: string
  status: string
  progress: string
  fail_reason: string
  result_url?: string
  data?: {
    Name?: string
    AssetType?: string
    URL?: string
    deleted_asset?: string
  }
}
export async function listLASTasks(
  page: number
): Promise<{ items: LASTask[]; total: number }> {
  const response = await api.get('/api/task/self', {
    params: { platform: 'las', p: page, page_size: 20 },
  })
  return requireServerSuccess(response.data).data
}
export async function submitLAS(
  path: string,
  payload: unknown,
  key: string
): Promise<{ id: string }> {
  if (!key.trim()) throw new Error('Enter a SparkHub API key')
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key.trim()}`,
    },
    body: JSON.stringify(payload),
  })
  const result = await response.json()
  if (!response.ok || result.error) {
    throw new Error(
      result.error?.message || result.message || 'LAS request failed'
    )
  }
  return result
}
