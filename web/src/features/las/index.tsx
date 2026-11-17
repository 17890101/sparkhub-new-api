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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
      toast.success(t('Submitted. Follow progress in the results below.'))
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
    if (reference) {
      content.push({
        type: 'image_url',
        image_url: { url: reference },
        role: 'reference_image',
      })
    }
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
  const actionLabels: Record<string, string> = {
    asset_group: 'Material group',
    asset: 'Reference material',
    video: 'Video generation',
    edit: 'Video editing',
    asset_delete: 'Material deletion',
  }
  const statusLabels: Record<string, string> = {
    NOT_START: 'Waiting',
    SUBMITTED: 'Waiting',
    QUEUED: 'Queued',
    IN_PROGRESS: 'Processing',
    SUCCESS: 'Completed',
    FAILURE: 'Failed',
  }
  const busy = submit.isPending
  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-2xl font-semibold'>{t('LAS Connection Lab')}</h1>
        <p className='text-muted-foreground'>
          {t(
            'Start with a text prompt, or add a reference image before generating a video.'
          )}
        </p>
        <p className='text-muted-foreground text-sm'>
          {t(
            'For a first test: paste a platform token, enter a description, then click Generate a new video. Reference materials are optional.'
          )}
        </p>
      </div>
      <Card>
        <CardContent className='space-y-2 pt-6'>
          <Label htmlFor='las-key'>{t('1. Platform API token')}</Label>
          <Input
            id='las-key'
            type='password'
            autoComplete='off'
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <p className='text-muted-foreground text-sm'>
            {t(
              'Copy a token from API Keys and paste it here. Keep your upstream LAS key in the channel settings.'
            )}
          </p>
        </CardContent>
      </Card>
      <div className='grid gap-6 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>{t('2. Add reference material (optional)')}</CardTitle>
            <CardDescription>
              {t(
                'Skip this section for text-only generation. To use your own image, first create a group, select it in the results below, then add the image link.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <Label htmlFor='las-name'>
              {t('Name for a new group or material')}
            </Label>
            <Input
              id='las-name'
              value={name}
              maxLength={64}
              onChange={(e) => setName(e.target.value)}
            />
            <Button disabled={busy || !name} onClick={createGroup}>
              {t('Create a material group')}
            </Button>
            <Label htmlFor='las-group'>{t('Selected material group')}</Label>
            <Input
              id='las-group'
              placeholder={t('Choose Select this group in the results below')}
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              aria-describedby='las-group-help'
            />
            <p id='las-group-help' className='text-muted-foreground text-sm'>
              {t(
                'This field fills automatically when you select a group below. You do not need to type an ID.'
              )}
            </p>
            <Label htmlFor='las-url'>{t('Material download link')}</Label>
            <Input
              id='las-url'
              value={url}
              onChange={(e) => setURL(e.target.value)}
              placeholder='https://example.com/reference.jpg'
              aria-describedby='las-url-help'
            />
            <p id='las-url-help' className='text-muted-foreground text-sm'>
              {t(
                'Paste a public HTTPS image, video or audio link. Local file paths and links requiring login cannot be imported.'
              )}
            </p>
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
              {t('Add material to selected group')}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('3. Generate or edit a video')}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <Label htmlFor='las-model'>
              {t('Video model (default selected)')}
            </Label>
            <Input
              id='las-model'
              value={model}
              onChange={(e) => setModel(e.target.value)}
              aria-describedby='las-model-help'
            />
            <p id='las-model-help' className='text-muted-foreground text-sm'>
              {t(
                'Seedance Fast is selected for a first test. The model ID usually does not need changing.'
              )}
            </p>
            <Label htmlFor='las-prompt'>
              {t('Describe the video you want')}
            </Label>
            <Textarea
              id='las-prompt'
              value={prompt}
              maxLength={10000}
              placeholder={t(
                'Example: a slow camera move across a quiet landscape in warm morning light'
              )}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <Label htmlFor='las-reference'>
              {t('Reference image (optional)')}
            </Label>
            <Input
              id='las-reference'
              placeholder={t(
                'Select a ready image below, or paste a public image link'
              )}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              aria-describedby='las-reference-help'
            />
            <p
              id='las-reference-help'
              className='text-muted-foreground text-sm'
            >
              {t(
                'Use as reference image fills this field automatically. Leave it empty for text-only generation.'
              )}
            </p>
            <Label htmlFor='las-seconds'>{t('Video length in seconds')}</Label>
            <Input
              id='las-seconds'
              type='number'
              min={4}
              max={15}
              value={seconds}
              onChange={(e) => setSeconds(Number(e.target.value))}
              aria-describedby='las-duration-help'
            />
            <p id='las-duration-help' className='text-muted-foreground text-sm'>
              {t(
                'This test form uses 4 to 15 seconds and 480p output. New videos are generated without audio.'
              )}
            </p>
            <Button disabled={busy || !prompt} onClick={generate}>
              {t('Generate a new video')}
            </Button>
            <Label htmlFor='las-source'>
              {t('Original video link (editing only)')}
            </Label>
            <Input
              id='las-source'
              value={sourceVideo}
              onChange={(e) => setSourceVideo(e.target.value)}
              placeholder='https://example.com/original.mp4'
              aria-describedby='las-edit-help'
            />
            <p id='las-edit-help' className='text-muted-foreground text-sm'>
              {t(
                'Only fill this when editing an existing video. Use a public HTTPS video link and describe the changes above; generating a new video does not need this field.'
              )}
            </p>
            <Button
              variant='outline'
              disabled={busy || !prompt || !sourceVideo}
              onClick={edit}
            >
              {t('Edit the original video')}
            </Button>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('4. Results and reference materials')}</CardTitle>
          <CardDescription>
            {t(
              'This list refreshes automatically. Select a ready group or image for the form above; open completed video results to preview or download.'
            )}
          </CardDescription>
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
                <Badge variant='outline'>
                  {t(actionLabels[task.action] || task.action)}
                </Badge>
                <Badge>{t(statusLabels[task.status] || task.status)}</Badge>
                <span>{task.data?.Name}</span>
              </div>
              <div className='flex items-center gap-2'>
                <span className='text-muted-foreground text-xs'>
                  {t('Record ID')}
                </span>
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
                  {t('Select this group')}
                </Button>
              )}
              {task.action === 'asset' && task.status === 'SUCCESS' && (
                <div className='flex gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => setReference(`asset://${task.task_id}`)}
                  >
                    {t('Use as reference image')}
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
