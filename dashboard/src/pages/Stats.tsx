import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export function Stats() {
  const [stats, setStats] = useState<any>(null)

  useEffect(() => {
    api.get('/api/stats').then(setStats).catch(() => {})
  }, [])

  if (!stats) return <div className="p-6 text-muted-foreground">Loading stats...</div>

  const days = Object.entries(stats.daily ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-7)
    .map(([date, data]: [string, any]) => ({
      date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      success: (data as any).success ?? 0,
      errors: (data as any).errors ?? 0,
    }))

  const modelEntries = Object.entries(stats.models ?? {})
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 10) as [string, number][]

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Stats</h1>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-medium text-muted-foreground mb-4">7-Day Requests</h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={days}>
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="success" fill="var(--color-chart-2)" radius={[4, 4, 0, 0] as any} />
            <Bar dataKey="errors" fill="var(--color-chart-5)" radius={[4, 4, 0, 0] as any} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-medium text-muted-foreground mb-4">Model Usage</h2>
        {modelEntries.length === 0
          ? <p className="text-sm text-muted-foreground">No model usage recorded yet.</p>
          : (
            <div className="space-y-2">
              {modelEntries.map(([model, count]) => (
                <div key={model} className="flex justify-between text-sm">
                  <span className="font-mono text-muted-foreground truncate max-w-xs">{model}</span>
                  <span className="tabular-nums font-medium">{count}</span>
                </div>
              ))}
            </div>
          )
        }
      </div>
    </div>
  )
}
