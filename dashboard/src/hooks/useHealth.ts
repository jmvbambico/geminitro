import { useEffect, useState } from 'react'

export type HealthData = {
  status: string
  uptime: number
  version: string
  models: number
  keys: {
    total: number
    active: number
    cooldown: number
    minCooldown: number
    cooldownKeys: { tail: string; remaining: number }[]
  }
}

export function useHealth() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const fetchHealth = () =>
      fetch('/api/health')
        .then(r => r.json())
        .then(d => { setHealth(d); setError(false) })
        .catch(() => setError(true))

    fetchHealth()
    const interval = setInterval(fetchHealth, 5000)
    return () => clearInterval(interval)
  }, [])

  return { health, error }
}
