import { useState } from 'react'
import { api } from '@/lib/api'
import type { KeyEntry } from '@/hooks/useSocket'
import { Trash2, Plus, RefreshCw } from 'lucide-react'

const statusColors: Record<string, string> = {
  active: 'text-green-500 bg-green-500/10',
  idle: 'text-blue-500 bg-blue-500/10',
  cooldown: 'text-yellow-500 bg-yellow-500/10',
}

export function Keys({ keys }: { keys: KeyEntry[] }) {
  const [newKey, setNewKey] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [addSuccess, setAddSuccess] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)

  const handleAdd = async () => {
    if (!newKey.trim()) return
    setAdding(true)
    setAddError('')
    setAddSuccess('')
    try {
      const res = await api.post('/api/keys', { key: newKey.trim() })
      if (res.error) {
        setAddError(res.error)
      } else {
        setAddSuccess(`Key added. ${res.models?.length ?? 0} models available.`)
        setNewKey('')
      }
    } catch {
      setAddError('Request failed — is the server running?')
    }
    setAdding(false)
  }

  const handleRemove = async (tail: string) => {
    setRemoving(tail)
    try {
      await api.delete(`/api/keys/${tail}`)
    } catch {}
    setRemoving(null)
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-6">API Keys</h1>

      <div className="rounded-xl border border-border bg-card p-4 mb-6">
        <h2 className="text-sm font-medium mb-3">Add Key</h2>
        <div className="flex gap-2">
          <input
            type="password"
            placeholder="AIzaSy..."
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newKey.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {adding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {adding ? 'Validating...' : 'Add'}
          </button>
        </div>
        {addError && <p className="text-sm text-destructive mt-2">{addError}</p>}
        {addSuccess && <p className="text-sm text-green-500 mt-2">{addSuccess}</p>}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-muted-foreground font-medium">Key</th>
              <th className="px-4 py-3 text-left text-muted-foreground font-medium">Status</th>
              <th className="px-4 py-3 text-right text-muted-foreground font-medium">Requests</th>
              <th className="px-4 py-3 text-right text-muted-foreground font-medium">Errors</th>
              <th className="px-4 py-3 text-right text-muted-foreground font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No keys in pool. Add one above.
                </td>
              </tr>
            )}
            {keys.map(k => (
              <tr key={k.tail} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-mono">...{k.tail}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[k.status] ?? 'text-muted-foreground bg-muted'}`}>
                    {k.status}
                  </span>
                  {k.status === 'cooldown' && k.cooldownUntil && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {Math.max(0, Math.ceil((k.cooldownUntil - Date.now()) / 1000))}s
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{k.usage ?? 0}</td>
                <td className="px-4 py-3 text-right tabular-nums text-destructive">{k.errors ?? 0}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleRemove(k.tail)}
                    disabled={removing === k.tail}
                    className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
