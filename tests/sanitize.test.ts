import { describe, expect, it } from 'vitest'
import { sanitizeWikilinks } from '../src/core/sanitize'

describe('sanitizeWikilinks', () => {
  it('rewrites non-md wikilinks to inline code', () => {
    const { body, changed } = sanitizeWikilinks('see [[chat.py]] and [[config.toml]]')
    expect(body).toBe('see `chat.py` and `config.toml`')
    expect(changed).toBe(2)
  })

  it('uses the alias text when present', () => {
    expect(sanitizeWikilinks('[[src/agent.py|the agent core]]').body).toBe('`the agent core`')
  })

  it('keeps note links and .md links', () => {
    const input = 'see [[some-note]] and [[other-note.md]] and [[future idea]]'
    const { body, changed } = sanitizeWikilinks(input)
    expect(body).toBe(input)
    expect(changed).toBe(0)
  })

  it('leaves fenced code blocks untouched', () => {
    const input = 'before [[a.py]]\n```\n[[b.py]]\n```\nafter [[c.py]]'
    const { body } = sanitizeWikilinks(input)
    expect(body).toBe('before `a.py`\n```\n[[b.py]]\n```\nafter `c.py`')
  })

  it('is idempotent', () => {
    const once = sanitizeWikilinks('x [[a.py]] y').body
    const twice = sanitizeWikilinks(once)
    expect(twice.body).toBe(once)
    expect(twice.changed).toBe(0)
  })
})
