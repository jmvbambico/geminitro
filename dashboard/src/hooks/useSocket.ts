import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { api } from '@/lib/api'

export type LogEntry = { id: string; type: string; message: string; timestamp: string }
export type KeyEntry = { tail: string; status: string; usage: number; errors: number; lastUsed: number | null; cooldownUntil: number | null }

export function useSocket() {
  const socketRef = useRef<Socket | null>(null)
  const [keys, setKeys] = useState<KeyEntry[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [fullStats, setFullStats] = useState<any>(null)
  const [trafficTick, setTrafficTick] = useState(0)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    api.get('/api/keys/safe').then((data: KeyEntry[]) => {
      if (Array.isArray(data)) setKeys(data)
    }).catch(() => { })

    api.get('/api/stats').then(setFullStats).catch(() => { })

    const origin = import.meta.env.DEV ? 'http://localhost:7536' : window.location.origin
    const socket = io(origin, { path: '/socket.io' })
    socketRef.current = socket

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('stats_update', (pool: KeyEntry[]) => setKeys(pool))
    socket.on('stats_update_full', (stats: any) => setFullStats(stats))
    socket.on('traffic_update', () => setTrafficTick(t => t + 1))
    socket.on('log', (entry: LogEntry) => setLogs(prev => [entry, ...prev].slice(0, 500)))

    return () => { socket.disconnect() }
  }, [])

  return { keys, logs, trafficTick, connected, fullStats }
}
