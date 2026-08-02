import { useParams, Navigate } from 'react-router-dom'
import { toolRegistry } from '@/core/registry/ToolRegistry'

export function ToolPage() {
  const { toolId } = useParams<{ toolId: string }>()
  const tool = toolId ? toolRegistry.get(toolId) : undefined

  if (!tool) {
    return <Navigate to="/" replace />
  }

  const ToolComponent = tool.component
  return <ToolComponent />
}
