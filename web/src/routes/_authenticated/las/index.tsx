import { createFileRoute } from '@tanstack/react-router'

import { Main } from '@/components/layout'
import { LASWorkspace } from '@/features/las'

export const Route = createFileRoute('/_authenticated/las/')({
  component: LASPage,
})
function LASPage() {
  return (
    <Main>
      <LASWorkspace />
    </Main>
  )
}
