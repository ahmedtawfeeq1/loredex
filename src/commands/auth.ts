/**
 * `loredex auth login|status|logout` + `loredex dex list|join|create`
 * (AUTH-GITHUB.md §4 terminal surface) — same engine, same keychain entry
 * as the desktop app: sign in once anywhere. Failure states stay honest
 * (§5): denied prints "nothing was stored", expired offers a fresh run.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pc from 'picocolors'
import {
  createDexRepo,
  deleteToken,
  deviceFlowPoll,
  deviceFlowStart,
  ghCliToken,
  listDexRepos,
  liveToken,
  maskToken,
  storedToken,
  storeToken,
  validateToken,
} from '../core/auth'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export async function runAuthLogin(opts: { withToken?: boolean }): Promise<void> {
  if (opts.withToken) {
    // CI / PAT path: token on stdin, never in argv (shell history)
    const token = readFileSync(0, 'utf8').trim()
    const user = await validateToken(token)
    if (!user) {
      console.error(pc.red('GitHub rejected that token — nothing was stored.'))
      process.exitCode = 1
      return
    }
    if (!storeToken(token)) {
      console.error(pc.red('no secure token store on this OS yet — use `gh auth login` instead'))
      process.exitCode = 1
      return
    }
    console.log(pc.green(`signed in as ${user.login} (${maskToken(token)}, keychain)`))
    return
  }

  const gh = ghCliToken()
  if (gh) {
    const user = await validateToken(gh)
    if (user) {
      console.log(pc.green(`already signed in via gh as ${user.login} — nothing to do`))
      return
    }
  }

  const dc = await deviceFlowStart()
  console.log(`\n  One-time code: ${pc.bold(dc.userCode)}`)
  console.log(`  Enter it at:   ${dc.verificationUri}`)
  console.log(pc.dim('  Only enter this code on a page YOU opened.\n'))
  try {
    execFileSync('open', [dc.verificationUri], { timeout: 3000 })
  } catch {
    // no opener — the URL is printed
  }
  let interval = Math.max(5, dc.intervalSeconds)
  const deadline = Date.now() + dc.expiresInSeconds * 1000
  while (Date.now() < deadline) {
    await sleep(interval * 1000)
    const r = await deviceFlowPoll(dc.deviceCode)
    if (r.state === 'authorized') {
      const user = await validateToken(r.token)
      if (!storeToken(r.token)) {
        console.error(pc.red('no secure token store on this OS yet — token NOT saved'))
        process.exitCode = 1
        return
      }
      console.log(pc.green(`signed in as ${user?.login ?? 'you'} (${maskToken(r.token)}, keychain)`))
      return
    }
    if (r.state === 'slow_down') interval += 5
    if (r.state === 'expired') {
      console.error(pc.red('that code expired — run `loredex auth login` for a fresh one'))
      process.exitCode = 1
      return
    }
    if (r.state === 'denied') {
      console.error(pc.red('you declined on GitHub — nothing was stored'))
      process.exitCode = 1
      return
    }
  }
  console.error(pc.red('timed out waiting for authorization'))
  process.exitCode = 1
}

export async function runAuthStatus(): Promise<void> {
  const stored = storedToken()
  if (stored) {
    const user = await validateToken(stored)
    if (user) {
      console.log(
        `signed in as ${pc.bold(user.login)} · keychain (${maskToken(stored)}) · scopes: ${user.scopes.join(', ') || '-'}`,
      )
      return
    }
    console.log(pc.yellow(`stored token (${maskToken(stored)}) was revoked — run auth login`))
    return
  }
  const gh = ghCliToken()
  if (gh) {
    const user = await validateToken(gh)
    if (user) {
      console.log(`signed in via ${pc.bold('gh')} as ${pc.bold(user.login)} (${maskToken(gh)})`)
      return
    }
  }
  console.log('signed out — `loredex auth login` (SSH dexes need no login)')
}

export function runAuthLogout(): void {
  deleteToken()
  console.log('signed out — revoke the token at https://github.com/settings/applications')
}

export async function runDexList(): Promise<void> {
  const token = liveToken()
  if (!token) {
    console.error(pc.red('not signed in — `loredex auth login` first'))
    process.exitCode = 1
    return
  }
  const repos = await listDexRepos(token)
  if (repos.length === 0) {
    console.log(`no repos carry the ${pc.bold('loredex-dex')} topic yet — \`loredex dex create <name>\``)
    return
  }
  for (const r of repos) {
    console.log(
      `${pc.bold(r.fullName)} · ${r.isPrivate ? 'private' : 'public'}${r.pushedAt ? ` · pushed ${r.pushedAt.slice(0, 10)}` : ''}`,
    )
  }
}

export async function runDexJoin(name: string, opts: { dir?: string }): Promise<void> {
  const token = liveToken()
  if (!token) {
    console.error(pc.red('not signed in — `loredex auth login` first'))
    process.exitCode = 1
    return
  }
  const repos = await listDexRepos(token)
  const repo = repos.find((r) => r.name === name || r.fullName === name)
  if (!repo) {
    console.error(pc.red(`no dex named "${name}" — \`loredex dex list\``))
    process.exitCode = 1
    return
  }
  const dest = resolve(opts.dir ?? name)
  if (existsSync(dest)) {
    console.error(pc.red(`${dest} already exists`))
    process.exitCode = 1
    return
  }
  console.log(`cloning ${repo.fullName} → ${dest}`)
  execFileSync('git', ['clone', repo.cloneUrl, dest], { stdio: 'inherit' })
  console.log(pc.green(`joined — now: cd into a project and \`loredex init --vault ${dest}\``))
}

export async function runDexCreate(name: string, opts: { private?: boolean }): Promise<void> {
  const token = liveToken()
  if (!token) {
    console.error(pc.red('not signed in — `loredex auth login` first'))
    process.exitCode = 1
    return
  }
  const repo = await createDexRepo(token, name, opts.private !== false)
  console.log(pc.green(`created ${repo.fullName} (${repo.isPrivate ? 'private' : 'public'}, topic loredex-dex)`))
  console.log(`join it: loredex dex join ${repo.name}`)
}
