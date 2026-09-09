import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { DbProvider, useDbContext } from '@/db/provider'
import { AppShell } from '@/components/layout/AppShell'
import { BootScreen } from '@/components/layout/BootScreen'
import { EntityPage } from '@/components/data/EntityPage'
import { ENTITY_BY_SLUG } from '@/registry/entities'
import { EmptyState, Spinner } from '@/components/ui/primitives'

const GroupDashboard = lazy(() => import('@/modules/overview/GroupDashboard'))
const Scorecard = lazy(() => import('@/modules/overview/Scorecard'))
const AlertsPage = lazy(() => import('@/modules/overview/AlertsPage'))
const ProductionDashboard = lazy(() => import('@/modules/operations/ProductionDashboard'))
const GeologyDashboard = lazy(() => import('@/modules/geology/GeologyDashboard'))
const ProcessingDashboard = lazy(() => import('@/modules/processing/ProcessingDashboard'))
const FleetDashboard = lazy(() => import('@/modules/maintenance/FleetDashboard'))
const WorkforceDashboard = lazy(() => import('@/modules/workforce/WorkforceDashboard'))
const SafetyDashboard = lazy(() => import('@/modules/safety/SafetyDashboard'))
const EnvironmentDashboard = lazy(() => import('@/modules/environment/EnvironmentDashboard'))
const SupplyDashboard = lazy(() => import('@/modules/supply/SupplyDashboard'))
const CommercialDashboard = lazy(() => import('@/modules/commercial/CommercialDashboard'))
const FinanceDashboard = lazy(() => import('@/modules/finance/FinanceDashboard'))
const ComplianceDashboard = lazy(() => import('@/modules/compliance/ComplianceDashboard'))
const DataTools = lazy(() => import('@/modules/admin/DataTools'))
const SqlConsole = lazy(() => import('@/modules/admin/SqlConsole'))
const About = lazy(() => import('@/modules/admin/About'))

function EntityRoute() {
  const { slug } = useParams<{ slug: string }>()
  const config = slug ? ENTITY_BY_SLUG.get(slug) : undefined
  if (!config) {
    return (
      <EmptyState
        title="Screen not found"
        description={`No registered entity for "${slug}". Check the navigation or the entity registry.`}
      />
    )
  }
  return <EntityPage key={config.slug} config={config} />
}

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-24">
      <Spinner className="size-5" />
    </div>
  )
}

function Shell() {
  const { status } = useDbContext()
  if (status.phase !== 'ready') return <BootScreen status={status} />

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route
            path="/"
            element={
              <Suspense fallback={<PageFallback />}>
                <GroupDashboard />
              </Suspense>
            }
          />
          {(
            [
              ['/scorecard', Scorecard],
              ['/alerts', AlertsPage],
              ['/operations', ProductionDashboard],
              ['/geology', GeologyDashboard],
              ['/processing', ProcessingDashboard],
              ['/maintenance', FleetDashboard],
              ['/workforce', WorkforceDashboard],
              ['/safety', SafetyDashboard],
              ['/environment', EnvironmentDashboard],
              ['/supply', SupplyDashboard],
              ['/commercial', CommercialDashboard],
              ['/finance', FinanceDashboard],
              ['/compliance', ComplianceDashboard],
              ['/admin/data', DataTools],
              ['/admin/sql', SqlConsole],
              ['/admin/about', About],
            ] as const
          ).map(([path, Component]) => (
            <Route
              key={path}
              path={path}
              element={
                <Suspense fallback={<PageFallback />}>
                  <Component />
                </Suspense>
              }
            />
          ))}
          <Route path="/m/:slug" element={<EntityRoute />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <DbProvider>
      <Shell />
    </DbProvider>
  )
}
