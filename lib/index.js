/**
 * dsh-message-pins — host half.
 *
 * 收藏 DSH 回答，落盘到 Obsidian 仓库（默认 C:/Sync/datas/moonlightGarden/20-卡片/回答收藏）。
 * 客户端半区通过同源 /api/message-pins/* 路由访问本文件。
 *
 * 合并自三个插件的思路：
 *   - message-pins（原版）：五角星收藏 → Obsidian 落盘；
 *   - dsh-bookmarks：笔记、标签、跨会话收藏中心、一键 Markdown 导出；
 *   - dsh-pins：右侧栏面板式呈现。
 *
 * 不注册 tool、不注入提示词、不写会话事件，对模型无影响。
 */
import { readFile, writeFile, readdir, rm, mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

export const name = 'message-pins'
export const inject = ['webServer', 'sessionQuery']

const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const CONFIG_FILE = join(DSH_HOME, 'storages', 'message-pins-config.json')
const LOCAL_DIR = join(DSH_HOME, 'storages', 'message-pins', 'pins')
const LEGACY_VAULT = 'C:/Sync/datas/moonlightGarden'
const LEGACY_FOLDER = '20-卡片/回答收藏'
const DEFAULT_FOLDER = 'DSH 收藏/回答收藏'
const MAX_TEXT = 12000

/** mode: 'local' 用 DSH_HOME 下的本地目录；'obsidian' 用仓库根 + 相对目录。 */
let config = { mode: 'local', vault: '', folder: DEFAULT_FOLDER, rail: false }

function normalizeFolder(v) {
  return String(v || '').replace(/^[\\/]+|[\\/]+$/g, '')
}

async function loadConfig() {
  try {
    const parsed = JSON.parse(await readFile(CONFIG_FILE, 'utf8'))
    if (parsed && typeof parsed === 'object') {
      const vault = typeof parsed.vault === 'string' ? parsed.vault.trim() : ''
      const obsidian = parsed.mode === 'obsidian' || (!parsed.mode && vault)
      config = {
        mode: obsidian && vault ? 'obsidian' : 'local',
        vault,
        folder: typeof parsed.folder === 'string' && parsed.folder.trim() ? parsed.folder.trim() : DEFAULT_FOLDER,
        rail: parsed.rail === true,
      }
      return
    }
  } catch {
    /* 没有配置文件，走迁移探测 */
  }
  // 老用户迁移：本机存在旧的 Obsidian 收藏目录就沿用，否则用本地默认目录
  try {
    await stat(join(LEGACY_VAULT, LEGACY_FOLDER))
    config = { mode: 'obsidian', vault: LEGACY_VAULT, folder: LEGACY_FOLDER, rail: false }
  } catch {
    config = { mode: 'local', vault: '', folder: DEFAULT_FOLDER, rail: false }
  }
}

async function persistConfig() {
  await mkdir(dirname(CONFIG_FILE), { recursive: true })
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8')
}

function vaultPath() {
  return String(config.vault || '').replace(/[\\/]+$/g, '')
}

/** 实际落盘目录：Obsidian 模式=仓库根+目录；本地模式=DSH_HOME 下的 pins 目录。 */
function folderPath() {
  if (config.mode === 'obsidian' && vaultPath()) return join(vaultPath(), normalizeFolder(config.folder))
  return LOCAL_DIR
}

function safeName(s) {
  return String(s || '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
}

function stripFrontmatter(raw) {
  const m = String(raw || '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  return m ? { fm: m[1], body: m[2] } : { fm: '', body: String(raw || '') }
}

function fmGet(fm, key) {
  const m = fm.match(new RegExp('^' + key + ':[ \\t]*(.*)$', 'm'))
  if (!m) return ''
  let v = m[1].trim()
  if (v.startsWith('"') && v.endsWith('"')) {
    try {
      v = JSON.parse(v)
    } catch {
      v = v.slice(1, -1)
    }
  }
  if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1)
  return v
}

function parseTags(fm) {
  const raw = fmGet(fm, 'tags')
  if (!raw) return []
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

function parsePin(fileName, raw) {
  const { fm, body } = stripFrontmatter(raw)
  const fallback = String(fileName || '').replace(/\.md$/i, '')
  const title = fmGet(fm, 'title') || fallback
  const created = fmGet(fm, 'created')
  const sessionId = fmGet(fm, 'sessionId')
  const messageId = fmGet(fm, 'messageId')
  const tags = parseTags(fm)
  const note = fmGet(fm, 'note')
  const type = fmGet(fm, 'type') || 'answer-pin'
  const quote = fmGet(fm, 'quote')
  const flowKey = fmGet(fm, 'flowKey')
  const offset = Number(fmGet(fm, 'offset') || 0) || 0
  const clean = body.replace(/^\s*# .*\r?\n/, '').replace(/\s+/g, ' ').trim()
  return {
    file: fileName,
    title,
    created,
    sessionId,
    messageId,
    tags,
    note: note === '""' ? '' : note,
    type,
    quote: quote === '""' ? '' : quote,
    flowKey,
    offset,
    excerpt: clean.slice(0, 200),
    length: clean.length,
  }
}

async function listPins() {
  const dir = folderPath()
  try {
    const names = (await readdir(dir)).filter((n) => /\.md$/i.test(n))
    const out = []
    for (const n of names) {
      try {
        out.push(parsePin(n, await readFile(join(dir, n), 'utf8')))
      } catch {
        /* 跳过不可读文件 */
      }
    }
    out.sort((a, b) => String(b.created).localeCompare(String(a.created)))
    return out
  } catch {
    return []
  }
}

/** 从消息 content 提取回答纯文本（只取 text 块，剥离 reasoning / tool-call）。 */
function answerTextOf(content) {
  if (typeof content === 'string') {
    const t = content.trim()
    return t ? t.slice(0, MAX_TEXT) : ''
  }
  if (Array.isArray(content)) {
    const parts = []
    for (const block of content) {
      if (block && block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
        parts.push(block.text.trim())
      }
    }
    return parts.join('\n\n').slice(0, MAX_TEXT)
  }
  if (content && typeof content === 'object' && typeof content.text === 'string') {
    const t = content.text.trim()
    return t ? t.slice(0, MAX_TEXT) : ''
  }
  return ''
}

/** 按 messageId 从会话日志解析 assistant 回答文本；3 秒超时后回退客户端传参。 */
async function resolveExcerpt(ctx, sessionId, messageId) {
  if (!sessionId || !messageId) return ''
  try {
    const loaded = await Promise.race([
      ctx.sessionQuery.readSession(String(sessionId)),
      new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
    ])
    if (!loaded || !Array.isArray(loaded.events)) return ''
    for (const ev of loaded.events) {
      if (!ev || ev.type !== 'assistant/message') continue
      const msg = ev.data && ev.data.message
      if (msg && msg.id === messageId) {
        const text = answerTextOf(msg.content)
        if (text) return text
      }
    }
  } catch (e) {
    console.error('[message-pins] resolveExcerpt failed', e)
  }
  return ''
}

function yamlList(items) {
  return '[' + items.map((t) => JSON.stringify(t)).join(', ') + ']'
}

async function addPin(ctx, payload) {
  const messageId = String(payload.messageId || '')
  if (!messageId) return { ok: false, error: 'no-message-id' }
  const sessionId = String(payload.sessionId || '')
  const excerpt = (await resolveExcerpt(ctx, sessionId, messageId)) || String(payload.excerpt || '').trim()
  if (!excerpt) return { ok: false, error: 'no-content' }
  const note = String(payload.note || '').trim()
  const tags = Array.isArray(payload.tags) ? payload.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 12) : []
  const title = safeName(excerpt.replace(/[#>*`\-\[\]()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30)) || safeName(messageId.slice(0, 8))
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const fileName = `${stamp}-${messageId.slice(0, 8)}.md`
  const dir = folderPath()
  await mkdir(dir, { recursive: true })
  // 去重：同会话同 messageId 只保留一份（旧收藏删掉再写新的）
  try {
    const names = (await readdir(dir)).filter((n) => /\.md$/i.test(n))
    for (const n of names) {
      try {
        const existing = parsePin(n, await readFile(join(dir, n), 'utf8'))
        if (existing.messageId === messageId && existing.sessionId === sessionId) {
          await rm(join(dir, n), { force: true })
        }
      } catch {
        /* 跳过不可读文件 */
      }
    }
  } catch {
    /* 目录不存在等 */
  }
  const front = ['---', `title: ${JSON.stringify(title)}`, `created: ${now.toISOString()}`, 'source: dsh', `sessionId: ${sessionId}`, `messageId: ${messageId}`, 'type: answer-pin', `tags: ${yamlList(tags)}`, `note: ${JSON.stringify(note)}`, '---', ''].join('\n')
  const content = `${front}\n# ${title}\n\n${excerpt}\n`
  await writeFile(join(dir, fileName), content, 'utf8')
  return { ok: true, pin: parsePin(fileName, content) }
}

async function addQuote(payload) {
  const quote = String(payload.quote || '').trim()
  if (!quote) return { ok: false, error: 'no-quote' }
  const flowKey = String(payload.flowKey || '')
  const sessionId = String(payload.sessionId || '')
  const messageId = String(payload.messageId || '')
  const offset = Number(payload.offset || 0) || 0
  const prefix = String(payload.prefix || '').slice(-40)
  const suffix = String(payload.suffix || '').slice(0, 40)
  const note = String(payload.note || '').trim()
  const tags = Array.isArray(payload.tags) ? payload.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 12) : []
  const title = safeName(quote.replace(/[#>*`\-\[\]()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30)) || '引用收藏'
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const fileKey = String(flowKey || messageId || 'x').replace(/[^A-Za-z0-9_-]/g, '').slice(-6) || 'x'
  const fileName = `${stamp}-q-${fileKey}.md`
  const dir = folderPath()
  await mkdir(dir, { recursive: true })
  // 去重：同会话同位置同文本只保留一份
  try {
    const names = (await readdir(dir)).filter((n) => /\.md$/i.test(n))
    for (const n of names) {
      try {
        const existing = parsePin(n, await readFile(join(dir, n), 'utf8'))
        if (
          existing.type === 'quote-pin' &&
          existing.sessionId === sessionId &&
          existing.flowKey === flowKey &&
          existing.offset === offset &&
          existing.quote === quote
        ) {
          await rm(join(dir, n), { force: true })
        }
      } catch {
        /* 跳过不可读文件 */
      }
    }
  } catch {
    /* 目录不存在等 */
  }
  const front = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `created: ${now.toISOString()}`,
    'source: dsh',
    `sessionId: ${sessionId}`,
    `messageId: ${messageId}`,
    'type: quote-pin',
    `flowKey: ${JSON.stringify(flowKey)}`,
    `offset: ${offset}`,
    `prefix: ${JSON.stringify(prefix)}`,
    `suffix: ${JSON.stringify(suffix)}`,
    `quote: ${JSON.stringify(quote)}`,
    `tags: ${yamlList(tags)}`,
    `note: ${JSON.stringify(note)}`,
    '---',
    '',
  ].join('\n')
  const content = `${front}\n# ${title}\n\n> ${quote}\n`
  await writeFile(join(dir, fileName), content, 'utf8')
  return { ok: true, pin: parsePin(fileName, content), file: fileName }
}

async function updatePin(fileName, patch) {
  const safe = String(fileName || '').replace(/\.{2,}/g, '').replace(/[\\/]/g, '')
  const raw = await readFile(join(folderPath(), safe), 'utf8')
  const { fm, body } = stripFrontmatter(raw)
  const note = typeof patch.note === 'string' ? patch.note.trim() : fmGet(fm, 'note')
  const tags = Array.isArray(patch.tags)
    ? patch.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 12)
    : parseTags(fm)
  const title = typeof patch.title === 'string' && patch.title.trim() ? safeName(patch.title) : (fmGet(fm, 'title') || safe)
  const lines = fm.split(/\r?\n/).filter((l) => !/^(note|tags|title):/.test(l))
  lines.push(`title: ${JSON.stringify(title)}`, `tags: ${yamlList(tags)}`, `note: ${JSON.stringify(note === '""' ? '' : note)}`)
  const next = `---\n${lines.join('\n')}\n---\n${body}`
  await writeFile(join(folderPath(), safe), next, 'utf8')
  return { ok: true, pin: parsePin(safe, next) }
}

async function removePin(fileName) {
  const safe = String(fileName || '').replace(/\.{2,}/g, '').replace(/[\\/]/g, '')
  if (!safe) return
  await rm(join(folderPath(), safe), { force: true })
}

async function readPin(fileName) {
  const safe = String(fileName || '').replace(/\.{2,}/g, '').replace(/[\\/]/g, '')
  const raw = await readFile(join(folderPath(), safe), 'utf8')
  const pin = parsePin(safe, raw)
  return { file: safe, title: pin.title, created: pin.created, tags: pin.tags, note: pin.note, content: raw }
}

function pinBody(raw) {
  const { body } = stripFrontmatter(raw)
  return body.replace(/^\s*# .*\r?\n/, '').trim()
}

async function exportMarkdown() {
  const pins = await listPins()
  const parts = ['# DSH 回答收藏', '']
  for (const p of pins) {
    const raw = await readFile(join(folderPath(), p.file), 'utf8').catch(() => '')
    const text = pinBody(raw)
    const tags = p.tags.length ? `  · 标签: ${p.tags.join(', ')}` : ''
    const note = p.note ? `\n> 笔记: ${p.note}` : ''
    parts.push(`## ${p.title}`, `${p.created || ''}${tags}${note}`, '', text, '', '---', '')
  }
  return parts.join('\n')
}

function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}

async function readBody(req) {
  let out = ''
  for await (const chunk of req) {
    out += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
  }
  return out
}

export function apply(ctx) {
  const routes = [
    {
      kind: 'exact',
      path: '/api/message-pins/list',
      handler: async (req, res) => json(res, 200, { pins: await listPins() }),
    },
    {
      kind: 'exact',
      path: '/api/message-pins/config',
      handler: async (req, res) => json(res, 200, { mode: config.mode, vault: vaultPath(), folder: config.folder, dir: folderPath(), rail: config.rail }),
    },
    {
      kind: 'exact',
      path: '/api/message-pins/set-config',
      handler: async (req, res) => {
        try {
          const body = JSON.parse((await readBody(req)) || '{}')
          if (typeof body.folder === 'string') {
            const folder = body.folder.trim()
            if (!folder) return json(res, 400, { ok: false, error: 'empty-folder' })
            config.folder = folder
          }
          if (typeof body.vault === 'string') {
            config.vault = body.vault.trim().replace(/[\\/]+$/g, '')
          }
          if (body.mode === 'obsidian' || body.mode === 'local') {
            config.mode = body.mode
          }
          if (typeof body.rail === 'boolean') config.rail = body.rail
          if (config.mode === 'obsidian' && !config.vault) {
            return json(res, 400, { ok: false, error: 'empty-vault' })
          }
          await persistConfig()
          json(res, 200, { mode: config.mode, vault: vaultPath(), folder: config.folder, dir: folderPath(), rail: config.rail })
        } catch (e) {
          json(res, 500, { ok: false, error: String((e && e.message) || e) })
        }
      },
    },
    {
      kind: 'exact',
      path: '/api/message-pins/add',
      handler: async (req, res) => {
        try {
          const body = JSON.parse((await readBody(req)) || '{}')
          const result = await addPin(ctx, body)
          json(res, result.ok ? 200 : 400, result)
        } catch (e) {
          json(res, 500, { ok: false, error: String((e && e.message) || e) })
        }
      },
    },
    {
      kind: 'exact',
      path: '/api/message-pins/add-quote',
      handler: async (req, res) => {
        try {
          const body = JSON.parse((await readBody(req)) || '{}')
          const result = await addQuote(body)
          json(res, result.ok ? 200 : 400, result)
        } catch (e) {
          json(res, 500, { ok: false, error: String((e && e.message) || e) })
        }
      },
    },
    {
      kind: 'exact',
      path: '/api/message-pins/update',
      handler: async (req, res) => {
        try {
          const body = JSON.parse((await readBody(req)) || '{}')
          json(res, 200, await updatePin(String(body.file || ''), body))
        } catch (e) {
          json(res, 500, { ok: false, error: String((e && e.message) || e) })
        }
      },
    },
    {
      kind: 'exact',
      path: '/api/message-pins/remove',
      handler: async (req, res) => {
        try {
          const body = JSON.parse((await readBody(req)) || '{}')
          await removePin(String(body.file || ''))
          json(res, 200, { ok: true })
        } catch (e) {
          json(res, 500, { ok: false, error: String((e && e.message) || e) })
        }
      },
    },
    {
      kind: 'exact',
      path: '/api/message-pins/read',
      handler: async (req, res) => {
        try {
          const url = new URL(req.url || '/', 'http://dsh.internal')
          json(res, 200, await readPin(url.searchParams.get('file') || ''))
        } catch (e) {
          json(res, 500, { error: String((e && e.message) || e) })
        }
      },
    },
    {
      kind: 'exact',
      path: '/api/message-pins/export',
      handler: async (req, res) => {
        try {
          json(res, 200, { ok: true, markdown: await exportMarkdown() })
        } catch (e) {
          json(res, 500, { ok: false, error: String((e && e.message) || e) })
        }
      },
    },
  ]
  const disposers = routes.map((r) => ctx.webServer.register(r))
  ctx.effect(
    () => () => {
      for (const d of disposers) {
        try {
          d()
        } catch {
          /* ignore */
        }
      }
    },
    'dsh-message-pins: routes',
  )
}

await loadConfig()
