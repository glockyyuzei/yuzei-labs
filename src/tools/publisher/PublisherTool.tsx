import { Routes, Route, Navigate } from 'react-router-dom'
import { PublisherDashboard } from './pages/PublisherDashboard'

export function PublisherTool() {
  return (
    <Routes>
      <Route index element={<PublisherDashboard />} />
      <Route path="history" element={<Navigate to="/history" replace />} />
      <Route path="*" element={<Navigate to="/tools/publisher" replace />} />
    </Routes>
  )
}
