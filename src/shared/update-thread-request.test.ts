import { describe, expect, it } from 'vitest'
import { UpdateThreadRequest } from '../../kun/src/contracts/threads'

describe('UpdateThreadRequest', () => {
  it('accepts workspace as a valid patch field', () => {
    const result = UpdateThreadRequest.safeParse({
      workspace: '/home/user/project'
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.workspace).toBe('/home/user/project')
    }
  })

  it('rejects empty workspace', () => {
    const result = UpdateThreadRequest.safeParse({
      workspace: ''
    })
    expect(result.success).toBe(false)
  })

  it('accepts workspace alongside other fields', () => {
    const result = UpdateThreadRequest.safeParse({
      title: 'My thread',
      workspace: '/home/user/project',
      status: 'archived'
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.title).toBe('My thread')
      expect(result.data.workspace).toBe('/home/user/project')
      expect(result.data.status).toBe('archived')
    }
  })

  it('accepts workspace as the only field (refine guard)', () => {
    const result = UpdateThreadRequest.safeParse({
      workspace: '/tmp/test'
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty body (no fields changed)', () => {
    const result = UpdateThreadRequest.safeParse({})
    expect(result.success).toBe(false)
  })

  it('accepts whitespace-only workspace at schema layer', () => {
    const result = UpdateThreadRequest.safeParse({
      workspace: '   '
    })
    expect(result.success).toBe(true)
  })
})
