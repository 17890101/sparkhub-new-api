import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { CopyButton } from '@/components/copy-button'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { TaskArtifacts } from '@/features/usage-logs/components/task-artifacts'
import { handleServerError } from '@/lib/handle-server-error'

import { listLASTasks, submitLAS } from './api'

export function LASWorkspace() {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [key, setKey] = useState('')
  const [page, setPage] = useState(1)
  const [name, setName] = useState('')
  const [group, setGroup] = useState('')
  const [url, setURL] = useState('')
  const [assetType, setAssetType] = useState('Image')
  const [model, setModel] = useState('dreamina-seedance-2-0-fast-260128')
  const [prompt, setPrompt] = useState('')
  const [reference, setReference] = useState('')
  const [seconds, setSeconds] = useState(4)
  const [sourceVideo, setSourceVideo] = useState('')
  const [deleting, setDeleting] = useState('')
  const tasks = useQuery({
    queryKey: ['las-tasks', page],
    queryFn: () => listLASTasks(page),
    refetchInterval: 5000,
  })
  const submit = useMutation({
    mutationFn: (request: { path: string; payload: unknown }) =>
      submitLAS(request.path, request.payload, key),
    onSuccess: (result) => {
      toast.success(t('Task submitted'))
      void client.invalidateQueries({ queryKey: ['las-tasks'] })
      if (deleting) setDeleting('')
      return result
    },
    onError: (error) => handleServerError(error),
  })
  function createGroup() {
    submit.mutate({
      path: '/las/asset-groups',
      payload: { model: 'las-assets', Name: name, GroupType: 'AIGC' },
    })
  }
  function createAsset() {
    submit.mutate({
      path: '/las/assets',
      payload: {
        model: 'las-assets',
        GroupId: group,
        Name: name,
        URL: url,
        AssetType: assetType,
      },
    })
  }
  function generate() {
    const content: Array<Record<string, unknown>> = [
      { type: 'text', text: prompt },
    ]
    if (reference)
      content.push({
        type: 'image_url',
        image_url: { url: reference },
        role: 'reference_image',
      })
    submit.mutate({
      path: '/las/video/tasks',
      payload: {
        model,
        content,
        duration: seconds,
        resolution: '480p',
        generate_audio: false,
        watermark: false,
      },
    })
  }
  function edit() {
    submit.mutate({
      path: '/las/edit/tasks',
      payload: {
        model: 'las-video-edit-enhance',
        data: {
          video_url: sourceVideo,
          user_prompt: prompt,
          template: { id: 'basic' },
          duration: seconds,
          resolution: '480p',
          image_urls: reference ? [reference] : [],
        },
      },
    })
  }
  const busy = submit.isPending
  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-2xl font-semibold'>{t('LAS Workspace')}</h1>
        <p className='text-muted-foreground'>
          {t('Private assets, video generation and editing')}
        </p>
      </div>
      <Card>
        <CardContent className='space-y-2 pt-6'>
          <Label htmlFor='las-key'>{t('SparkHub API key')}</Label>
          <Input
            id='las-key'
            type='password'
            autoComplete='off'
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <p className='text-muted-foreground text-sm'>
            {t(
              'Use your platform key, not the upstream LAS key. This page keeps it in memory only.'
            )}
          </p>
        </CardContent>
      </Card>
      <div className='grid gap-6 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>{t('Reference assets')}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <Label htmlFor='las-name'>{t('Name')}</Label>
            <Input
              id='las-name'
              value={name}
              maxLength={64}
              onChange={(e) => setName(e.target.value)}
            />
            <Button disabled={busy || !name} onClick={createGroup}>
              {t('Create asset group')}
            </Button>
            <Label htmlFor='las-group'>{t('Group handle')}</Label>
            <Input
              id='las-group'
              placeholder='task_…'
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            />
            <Label htmlFor='las-url'>{t('Public HTTPS asset URL')}</Label>
            <Input
              id='las-url'
              value={url}
              onChange={(e) => setURL(e.target.value)}
            />
            <div className='flex gap-2'>
              {['Image', 'Video', 'Audio'].map((value) => (
                <Button
                  key={value}
                  variant={assetType === value ? 'default' : 'outline'}
                  onClick={() => setAssetType(value)}
                >
                  {t(value)}
                </Button>
              ))}
            </div>
            <Button
              disabled={busy || !url || !group || !name}
              onClick={createAsset}
            >
              {t('Import asset')}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('Video generation and editing')}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <Label htmlFor='las-model'>{t('Model')}</Label>
            <Input
              id='las-model'
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
            <Label htmlFor='las-prompt'>{t('Prompt')}</Label>
            <Textarea
              id='las-prompt'
              value={prompt}
              maxLength={10000}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <Label htmlFor='las-reference'>
              {t('Reference image URL or asset handle')}
            </Label>
            <Input
              id='las-reference'
              placeholder='asset://task_…'
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
            <Label htmlFor='las-seconds'>{t('Duration')}</Label>
            <Input
              id='las-seconds'
              type='number'
              min={4}
              max={15}
              value={seconds}
              onChange={(e) => setSeconds(Number(e.target.value))}
            />
            <Button disabled={busy || !prompt} onClick={generate}>
              {t('Generate video')}
            </Button>
            <Label htmlFor='las-source'>{t('Source video HTTPS URL')}</Label>
            <Input
              id='las-source'
              value={sourceVideo}
              onChange={(e) => setSourceVideo(e.target.value)}
            />
            <Button
              variant='outline'
              disabled={busy || !prompt || !sourceVideo}
              onClick={edit}
            >
              {t('Edit video')}
            </Button>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('My LAS assets and tasks')}</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          {tasks.isLoading && <LoadingState />}
          {tasks.isError && (
            <ErrorState
              onRetry={() => {
                void tasks.refetch()
              }}
            />
          )}
          {!tasks.isLoading && !tasks.isError && !tasks.data?.items.length && (
            <EmptyState />
          )}
          {tasks.data?.items.map((task) => (
            <div key={task.task_id} className='space-y-2 rounded-lg border p-4'>
              <div className='flex flex-wrap items-center gap-2'>
                <Badge variant='outline'>{task.action}</Badge>
                <Badge>{task.status}</Badge>
                <span>{task.data?.Name}</span>
              </div>
              <div className='flex items-center gap-2'>
                <code className='text-xs break-all'>{task.task_id}</code>
                <CopyButton
                  value={
                    task.action === 'asset'
                      ? `asset://${task.task_id}`
                      : task.task_id
                  }
                />
              </div>
              {task.fail_reason && (
                <p role='alert' className='text-destructive text-sm'>
                  {task.fail_reason}
                </p>
              )}
              {task.action === 'asset_group' && task.status === 'SUCCESS' && (
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => setGroup(task.task_id)}
                >
                  {t('Use this group')}
                </Button>
              )}
              {task.action === 'asset' && task.status === 'SUCCESS' && (
                <div className='flex gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => setReference(`asset://${task.task_id}`)}
                  >
                    {t('Use as reference')}
                  </Button>
                  <Button
                    variant='destructive'
                    size='sm'
                    disabled={busy}
                    onClick={() => setDeleting(task.task_id)}
                  >
                    {t('Delete')}
                  </Button>
                </div>
              )}
              {['video', 'edit', 'asset'].includes(task.action) && (
                <TaskArtifacts
                  taskId={task.task_id}
                  enabled={task.status === 'SUCCESS'}
                />
              )}
            </div>
          ))}
          <div className='flex justify-between'>
            <Button
              variant='outline'
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              {t('Previous')}
            </Button>
            <Button
              variant='outline'
              disabled={page * 20 >= (tasks.data?.total || 0)}
              onClick={() => setPage(page + 1)}
            >
              {t('Next')}
            </Button>
          </div>
        </CardContent>
      </Card>
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting('')
        }}
        title={t('Delete asset')}
        desc={t(
          'The upstream asset will be deleted. Existing task records remain available.'
        )}
        destructive
        isLoading={busy}
        handleConfirm={() =>
          submit.mutate({
            path: '/las/assets/delete',
            payload: { model: 'las-assets', Id: deleting },
          })
        }
      />
    </div>
  )
}
