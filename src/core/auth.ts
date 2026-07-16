/**
 * GitHub auth for the CLI (AUTH-GITHUB.md; desktop v3 §9 companion) — the
 * SAME storage contract as loredex-desktop: macOS Keychain entry service
 * `loredex`, account `github.com` — sign in once anywhere, both read it.
 * No loredex server; GitHub is identity + storage; login stays optional
 * (SSH dexes need none). Token never printed unmasked, never logged.
 */
import { execFileSync } from 'node:child_process'

/** Public client id of the registered Loredex OAuth app — device flow only,
 *  no secret exists in any Loredex binary. */
export const GITHUB_CLIENT_ID = 'Ov23li2lIaJzy9DFjm1K'
export const DEVICE_FLOW_SCOPES = 'repo read:org'
export const DEX_TOPIC = 'loredex-dex'

const SERVICE = 'loredex'
const ACCOUNT = 'github.com'

// ── token store (shared entry; macOS keychain — other OSes: gh fallback) ────

export function storedToken(): string | null {
  if (process.platform !== 'darwin') return null
  try {
    return (
      execFileSync('security', ['find-generic-password', '-s', SERVICE, '-a', ACCOUNT, '-w'], {
        encoding: 'utf8',
        timeout: 5000,
      }).trim() || null
    )
  } catch {
    return null
  }
}

export function storeToken(token: string): boolean {
  if (process.platform !== 'darwin') return false
  execFileSync(
    'security',
    ['add-generic-password', '-U', '-s', SERVICE, '-a', ACCOUNT, '-w', token],
    { timeout: 5000 },
  )
  return true
}

export function deleteToken(): void {
  if (process.platform !== 'darwin') return
  try {
    execFileSync('security', ['delete-generic-password', '-s', SERVICE, '-a', ACCOUNT], {
      timeout: 5000,
    })
  } catch {
    // nothing stored — logout is idempotent
  }
}

export function ghCliToken(): string | null {
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', timeout: 5000 }).trim() || null
  } catch {
    return null
  }
}

/** stored (explicit sign-in) wins, then a live gh session. */
export function liveToken(): string | null {
  return storedToken() ?? ghCliToken()
}

export function maskToken(token: string): string {
  return token.length <= 8 ? '…' : `${token.slice(0, 4)}…${token.slice(-4)}`
}

// ── GitHub API ───────────────────────────────────────────────────────────────

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

export async function validateToken(
  token: string,
): Promise<{ login: string; scopes: string[] } | null> {
  const res = await fetch('https://api.github.com/user', { headers: ghHeaders(token) })
  if (!res.ok) return null
  const user = (await res.json()) as { login?: string }
  if (typeof user.login !== 'string') return null
  const scopes = (res.headers.get('x-oauth-scopes') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return { login: user.login, scopes }
}

// ── device flow (§1B) ────────────────────────────────────────────────────────

export interface DeviceCode {
  deviceCode: string
  userCode: string
  verificationUri: string
  intervalSeconds: number
  expiresInSeconds: number
}

export async function deviceFlowStart(): Promise<DeviceCode> {
  const res = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, scope: DEVICE_FLOW_SCOPES }),
  })
  const body = (await res.json()) as Record<string, unknown>
  return {
    deviceCode: String(body.device_code ?? ''),
    userCode: String(body.user_code ?? ''),
    verificationUri: String(body.verification_uri ?? 'https://github.com/login/device'),
    intervalSeconds: Number(body.interval ?? 5),
    expiresInSeconds: Number(body.expires_in ?? 900),
  }
}

export type DevicePoll =
  | { state: 'authorized'; token: string }
  | { state: 'pending' | 'slow_down' | 'expired' | 'denied' }

export async function deviceFlowPoll(deviceCode: string): Promise<DevicePoll> {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  })
  const body = (await res.json()) as Record<string, unknown>
  if (typeof body.access_token === 'string')
    return { state: 'authorized', token: body.access_token }
  switch (body.error) {
    case 'authorization_pending':
      return { state: 'pending' }
    case 'slow_down':
      return { state: 'slow_down' }
    case 'expired_token':
      return { state: 'expired' }
    default:
      return { state: 'denied' }
  }
}

// ── dex registry (§3) ────────────────────────────────────────────────────────

export interface DexRepo {
  fullName: string
  name: string
  isPrivate: boolean
  cloneUrl: string
  sshUrl: string
  pushedAt: string
}

interface RepoJson {
  name?: string
  full_name?: string
  private?: boolean
  topics?: string[]
  clone_url?: string
  ssh_url?: string
  pushed_at?: string
}

export function toDexRepo(r: RepoJson): DexRepo | null {
  if (!r.full_name || !Array.isArray(r.topics) || !r.topics.includes(DEX_TOPIC)) return null
  return {
    fullName: r.full_name,
    name: r.name ?? r.full_name.split('/')[1] ?? '',
    isPrivate: r.private === true,
    cloneUrl: r.clone_url ?? `https://github.com/${r.full_name}.git`,
    sshUrl: r.ssh_url ?? `git@github.com:${r.full_name}.git`,
    pushedAt: r.pushed_at ?? '',
  }
}

export async function listDexRepos(token: string): Promise<DexRepo[]> {
  const out: DexRepo[] = []
  for (let page = 1; page <= 3; page++) {
    const res = await fetch(
      `https://api.github.com/user/repos?per_page=100&page=${page}&sort=pushed`,
      { headers: ghHeaders(token) },
    )
    if (!res.ok) throw new Error(`GitHub said ${res.status}`)
    const repos = (await res.json()) as RepoJson[]
    for (const r of repos) {
      const dex = toDexRepo(r)
      if (dex) out.push(dex)
    }
    if (repos.length < 100) break
  }
  return out
}

export async function createDexRepo(
  token: string,
  name: string,
  isPrivate: boolean,
): Promise<DexRepo> {
  const res = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      private: isPrivate,
      description: 'loredex dex — one per product',
    }),
  })
  if (!res.ok) throw new Error(`GitHub said ${res.status}`)
  const repo = (await res.json()) as RepoJson
  const fullName = repo.full_name ?? ''
  await fetch(`https://api.github.com/repos/${fullName}/topics`, {
    method: 'PUT',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ names: [DEX_TOPIC] }),
  })
  return (
    toDexRepo({ ...repo, topics: [DEX_TOPIC] }) ?? {
      fullName,
      name: repo.name ?? name,
      isPrivate,
      cloneUrl: repo.clone_url ?? `https://github.com/${fullName}.git`,
      sshUrl: repo.ssh_url ?? `git@github.com:${fullName}.git`,
      pushedAt: '',
    }
  )
}
