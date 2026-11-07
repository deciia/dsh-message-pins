/**
 * dsh-message-pins — browser half (DSH 0.2.x client plugin).
 *
 * 做什么：
 *   1. 每条已完成的 assistant 回答的操作条上加一个五角星按钮，一键收藏 / 取消收藏；
 *   2. 在右侧栏注册「收藏」标签页（sidebarRightTabs + guide 卡片），点击星标或卡片在右栏打开；
 *   3. 顶部会话视图新增「收藏」页签（conversation.view）；
 *   4. 左栏入口默认隐藏，可在收藏面板头部开关（localStorage 记忆）。
 *
 * 数据在宿主半区（Obsidian 落盘），本文件只负责 UI。
 */
window.__ModuleLoader__.load({
  id: 'dsh-message-pins',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const PKG = 'dsh-message-pins'
    const KIND = 'dsh-message-pins'
    const TAB_ID = KIND
    const API = '/api/message-pins'

    //#region 数据存储

    const store = {
      pins: [],
      listeners: new Set(),
      loaded: false,
      loading: false,
    }

    function emit() {
      for (const fn of [...store.listeners]) {
        try {
          fn()
        } catch (error) {
          console.error('[message-pins] listener failed', error)
        }
      }
    }

    function subscribe(fn) {
      store.listeners.add(fn)
      return () => store.listeners.delete(fn)
    }

    async function api(path, body) {
      const init = body === undefined ? {} : {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }
      const response = await fetch(API + path, init)
      let data = {}
      try {
        data = await response.json()
      } catch {
        /* 非 JSON 响应 */
      }
      if (!response.ok) {
        throw new Error(data && data.error ? String(data.error) : 'HTTP ' + response.status)
      }
      return data
    }

    async function refresh() {
      if (store.loading) return
      store.loading = true
      try {
        const data = await api('/list')
        store.pins = Array.isArray(data.pins) ? data.pins : []
        store.loaded = true
      } catch (error) {
        console.error('[message-pins] 读取收藏失败', error)
      } finally {
        store.loading = false
        emit()
      }
    }

    function ensureLoaded() {
      if (!store.loaded) refresh()
    }

    function findPin(sessionId, messageId) {
      return store.pins.find(
        (pin) => pin.messageId === messageId && (!sessionId || pin.sessionId === sessionId),
      )
    }

    //#endregion

    //#region 左栏入口开关（localStorage 持久化，默认隐藏）

    let railEnabled = false
    try {
      railEnabled = localStorage.getItem('dsh-message-pins:rail') === '1'
    } catch {
      /* localStorage 不可用 */
    }

    let railSlots = null
    let railDispose = null

    function buildRail() {
      if (!railSlots) return null
      const disposers = []
      try {
        disposers.push(
          railSlots.inject('sidebar.panellist', () =>
            railSlots.register({ name: 'sidebar.panellist', id: PKG, order: 7, label: '收藏' }, (props) =>
              h(Guard, { label: '收藏图标' }, h(PanelIcon, props)),
            ),
          ),
        )
        disposers.push(
          railSlots.inject('sidebar.footer.action', () =>
            railSlots.register({ name: 'sidebar.footer.action', id: PKG, order: 45, label: '收藏' }, (props) =>
              h(Guard, { label: '收藏入口' }, h(FooterEntry, props)),
            ),
          ),
        )
      } catch (error) {
        console.error('[message-pins] 左栏入口注册失败', error)
      }
      return () => {
        for (const dispose of disposers) {
          try {
            dispose()
          } catch (error) {
            console.error('[message-pins] rail disposer failed', error)
          }
        }
      }
    }

    function syncRail() {
      if (railDispose) {
        railDispose()
        railDispose = null
      }
      if (railEnabled) railDispose = buildRail()
    }

    function setRail(on) {
      railEnabled = Boolean(on)
      try {
        localStorage.setItem('dsh-message-pins:rail', railEnabled ? '1' : '0')
      } catch {
        /* localStorage 不可用 */
      }
      syncRail()
      return railEnabled
    }

    /** 用宿主配置覆盖左栏开关（宿主 JSON 是权威来源）。 */
    async function syncRailFromHost() {
      try {
        const data = await api('/config')
        if (typeof data.rail === 'boolean') {
          railEnabled = data.rail
          syncRail()
        }
      } catch (error) {
        console.error('[message-pins] 读取宿主配置失败', error)
      }
    }

    //#endregion

    //#region 样式

    const CSS = `
.dsh-mp-star{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;
  padding:0;border:none;background:transparent;color:var(--dsw-alias-text-tertiary);cursor:pointer;
  border-radius:var(--dsw-radius-sm);font-size:15px;line-height:1;transition:color .15s ease,background .15s ease}
.dsh-mp-star:hover{color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}
.dsh-mp-star.is-pinned{color:var(--dsw-alias-brand-primary)}
.dsh-mp-star[disabled]{opacity:.45;cursor:default}
.dsh-mp-root{display:flex;flex-direction:column;height:100%;min-height:0;font-size:12.5px;color:var(--dsw-alias-text-primary)}
.dsh-mp-head{display:flex;flex-wrap:wrap;gap:6px;padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dsh-mp-head .dsh-mp-title{flex:1;min-width:80px;font-weight:600;font-size:13px;line-height:26px}
.dsh-mp-btn{display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);
  border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-text-secondary);cursor:pointer;font-size:12px}
.dsh-mp-btn:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.dsh-mp-btn.is-on{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent);
  border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.dsh-mp-search{flex:1 1 140px;min-width:100px;height:26px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);
  border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-text-primary);outline:none}
.dsh-mp-search:focus{border-color:var(--dsw-alias-brand-primary)}
.dsh-mp-list{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:0 6px 6px}
.dsh-mp-empty{padding:28px 14px;text-align:center;color:var(--dsw-alias-text-tertiary);line-height:1.7}
.dsh-mp-card{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;
  background:var(--dsw-alias-bg-layer-1);margin-bottom:8px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.dsh-mp-card:hover{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 35%,var(--dsw-alias-border-l1))}
.dsh-mp-card-head{display:flex;gap:6px;align-items:flex-start;padding:8px 10px;cursor:pointer}
.dsh-mp-card-head:hover{background:var(--dsw-alias-bg-layer-2)}
.dsh-mp-card-main{flex:1;min-width:0}
.dsh-mp-card-title{font-weight:600;font-size:12.5px;line-height:1.45;word-break:break-all}
.dsh-mp-card-meta{margin-top:3px;font-size:11px;color:var(--dsw-alias-text-tertiary);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsh-mp-card-excerpt{margin-top:4px;font-size:11.5px;color:var(--dsw-alias-text-secondary);line-height:1.5;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.dsh-mp-tag{display:inline-flex;align-items:center;height:17px;padding:0 5px;margin:3px 3px 0 0;border-radius:3px;
  background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent);color:var(--dsw-alias-brand-primary);font-size:10.5px}
.dsh-mp-del{flex:0 0 auto;width:22px;height:22px;padding:0;border:none;background:transparent;color:var(--dsw-alias-text-tertiary);
  cursor:pointer;border-radius:var(--dsw-radius-sm);font-size:14px;line-height:1}
.dsh-mp-del:hover{color:var(--dsw-alias-danger, #e5484d);background:var(--dsw-alias-bg-layer-2)}
.dsh-mp-detail{border-top:2px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 25%,var(--dsw-alias-border-l1));
  padding:12px;background:var(--dsw-alias-bg-layer-2);box-shadow:inset 0 6px 10px -8px rgba(0,0,0,.25)}
.dsh-mp-detail pre{margin:0;white-space:pre-wrap;word-break:break-word;font-family:var(--dsw-font-family-mono, monospace);
  font-size:11.5px;line-height:1.6;max-height:46vh;overflow:auto;color:var(--dsw-alias-text-primary)}
.dsh-mp-detail .dsh-mp-actions{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
.dsh-mp-note-edit{display:flex;gap:6px;margin-top:6px;flex-wrap:wrap}
.dsh-mp-note-edit input{flex:1 1 120px;height:24px;padding:0 6px;border:1px solid var(--dsw-alias-border-l1);
  border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-text-primary);font-size:11.5px;outline:none}
.dsh-mp-toast{margin-left:6px;font-size:11px;color:var(--dsw-alias-brand-primary);white-space:nowrap}
.dsh-mp-settings{padding:12px 16px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;margin:12px 0;
  background:var(--dsw-alias-bg-layer-1);font-size:12.5px}
.dsh-mp-settings h3{margin:0 0 10px;font-size:14px;font-weight:600}
.dsh-mp-row{display:flex;align-items:center;gap:10px;margin:8px 0}
.dsh-mp-row label{width:72px;flex:0 0 auto;color:var(--dsw-alias-text-secondary)}
.dsh-mp-row .dsh-mp-search{flex:1 1 auto;min-width:160px}
.dsh-mp-chev{flex:0 0 auto;width:16px;text-align:center;color:var(--dsw-alias-text-tertiary);font-size:11px;line-height:22px;transition:transform .15s ease}
.dsh-mp-card.is-open{overflow:visible}
.dsh-mp-card.is-open .dsh-mp-card-head{position:sticky;top:6px;z-index:6;
  margin:0 -1px;
  border:1px solid var(--dsw-alias-border-l1);
  border-radius:8px 8px 0 0;
  background:var(--dsw-alias-bg-layer-1);
  box-shadow:0 2px 8px rgba(0,0,0,.10)}
.dsh-mp-card.is-open .dsh-mp-card-head::before{content:'';position:absolute;left:-1px;right:-1px;top:-6px;height:5px;
  background:var(--dsw-alias-bg-layer-1)}
.dsh-mp-card.is-open{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 55%,var(--dsw-alias-border-l1));
  box-shadow:0 6px 18px rgba(0,0,0,.12);background:var(--dsw-alias-bg-layer-1);position:relative}
.dsh-mp-card.is-open::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--dsw-alias-brand-primary)}
.dsh-mp-card.is-open .dsh-mp-card-title{color:var(--dsw-alias-brand-primary)}
.dsh-mp-list.has-open .dsh-mp-card:not(.is-open){opacity:.62}
.dsh-mp-list.has-open .dsh-mp-card:not(.is-open):hover{opacity:.9}
.dsh-mp-md-fallback{margin:0;white-space:pre-wrap;word-break:break-word;font-family:var(--dsw-font-family-mono, monospace);font-size:11.5px;line-height:1.6;max-height:46vh;overflow:auto}
.dsh-mp-md{font-size:12.5px;line-height:1.7;color:var(--dsw-alias-text-primary);word-break:break-word}
.dsh-mp-md h1,.dsh-mp-md h2,.dsh-mp-md h3,.dsh-mp-md h4{margin:10px 0 6px;font-weight:600;line-height:1.4}
.dsh-mp-md h1{font-size:16px}.dsh-mp-md h2{font-size:15px}.dsh-mp-md h3{font-size:14px}.dsh-mp-md h4{font-size:13px}
.dsh-mp-md p{margin:6px 0}
.dsh-mp-md ul,.dsh-mp-md ol{margin:6px 0;padding-left:20px}
.dsh-mp-md li{margin:2px 0}
.dsh-mp-md blockquote{margin:8px 0;padding:2px 10px;border-left:3px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-text-secondary)}
.dsh-mp-md pre{margin:8px 0;padding:8px 10px;border-radius:6px;background:var(--dsw-alias-bg-layer-2);overflow:auto;max-height:40vh}
.dsh-mp-md pre code{font-family:var(--dsw-font-family-mono, monospace);font-size:11.5px;line-height:1.6}
.dsh-mp-md code{font-family:var(--dsw-font-family-mono, monospace);font-size:11.5px;padding:1px 4px;border-radius:4px;background:var(--dsw-alias-bg-layer-2)}
.dsh-mp-md table{border-collapse:collapse;margin:8px 0;font-size:11.5px;display:block;overflow:auto;max-height:40vh}
.dsh-mp-md th,.dsh-mp-md td{border:1px solid var(--dsw-alias-border-l1);padding:4px 8px;text-align:left;vertical-align:top}
.dsh-mp-md th{background:var(--dsw-alias-bg-layer-2);font-weight:600}
.dsh-mp-md hr{border:none;border-top:1px solid var(--dsw-alias-border-l1);margin:10px 0}
.dsh-mp-md a{color:var(--dsw-alias-brand-primary);text-decoration:none}
.dsh-mp-hint{color:var(--dsw-alias-text-tertiary);font-size:11.5px;line-height:1.6;margin-top:6px}
.dsh-mp-selbar{position:fixed;z-index:1200;display:flex;align-items:center;gap:4px;padding:4px;
  border-radius:8px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);
  box-shadow:0 6px 18px rgba(0,0,0,.18)}
.dsh-mp-selbtn{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);
  border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-text-primary);cursor:pointer;font-size:12px}
.dsh-mp-selbtn:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.dsh-mp-selstar{color:var(--dsw-alias-brand-primary);font-size:14px;line-height:1}
.dsh-mp-selbar-icon{padding:2px;border-radius:16px}
.dsh-mp-selbtn-icon{width:26px;height:26px;padding:0;justify-content:center;border-radius:50%;font-size:16px;line-height:1}
.dsh-mp-mark{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 28%,transparent);border-radius:2px;color:inherit}
.dsh-mp-quote{border-left:3px solid var(--dsw-alias-brand-primary);padding:2px 8px;margin-top:4px;
  color:var(--dsw-alias-text-secondary);font-size:11.5px;line-height:1.5;display:-webkit-box;
  -webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
`

    function registerStyles() {
      try {
        const element = document.createElement('style')
        element.setAttribute('data-dsh-message-pins-style', '')
        element.textContent = CSS
        document.head.appendChild(element)
        return () => element.remove()
      } catch (error) {
        console.error('[message-pins] 样式注入失败', error)
        return () => {}
      }
    }

    /** 渲染失败兜底，避免一个坏卡片拖垮整个操作条。 */
    class Guard extends React.Component {
      constructor(props) {
        super(props)
        this.state = { message: '' }
      }
      static getDerivedStateFromError(error) {
        return { message: String((error && error.message) || error || '未知错误') }
      }
      componentDidCatch(error, info) {
        console.error('[message-pins] ' + ((this.props && this.props.label) || '组件') + '渲染失败', error, info && info.componentStack)
      }
      render() {
        if (this.state.message) {
          return h('span', { className: 'dsh-mp-toast' }, '收藏不可用')
        }
        return (this.props && this.props.children) || null
      }
    }

    //#region 图标

    function StarGlyph(props) {
      const size = props && typeof props.size === 'number' ? props.size : 16
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        h('polygon', { points: '12 2.5 15 8.6 21.6 9.5 16.8 14.2 18 20.8 12 17.6 6 20.8 7.2 14.2 2.4 9.5 9 8.6' }),
      )
    }

    function PanelIcon(props) {
      return h(StarGlyph, props)
    }

    //#endregion

    //#region 打开右侧栏「收藏」标签

    function openPanel(context) {
      try {
        const service = context && typeof context.get === 'function' ? context.get('sidebarRight') : null
        if (service && typeof service.openTab === 'function') {
          service.openTab(KIND)
          return ''
        }
      } catch (error) {
        console.error('[message-pins] sidebarRight.openTab 失败', error)
      }
      try {
        const layout = context && typeof context.get === 'function' ? context.get('layout') : null
        if (layout && typeof layout.selectPanel === 'function') {
          layout.selectPanel(KIND)
        }
      } catch (error) {
        console.error('[message-pins] layout.selectPanel 失败', error)
      }
      return ''
    }

    //#endregion

    //#region 五角星收藏按钮（conversation.chat.assistant-actions）

    function StarButton(props) {
      const messageId = props && props.messageId ? String(props.messageId) : ''
      const sessionId = props && props.sessionId ? String(props.sessionId) : ''
      const context = props && props.context
      const [pinned, setPinned] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [toast, setToast] = React.useState('')

      React.useEffect(() => {
        const sync = () => setPinned(Boolean(findPin(sessionId, messageId)))
        sync()
        ensureLoaded()
        return subscribe(sync)
      }, [sessionId, messageId])

      const showToast = (text) => {
        setToast(text)
        if (showToast.timer) clearTimeout(showToast.timer)
        showToast.timer = setTimeout(() => setToast(''), 1800)
      }

      const onClick = async () => {
        if (!messageId || busy) return
        setBusy(true)
        try {
          const existing = findPin(sessionId, messageId)
          if (existing) {
            await api('/remove', { file: existing.file })
            await refresh()
            showToast('已取消收藏')
            return
          }
          await api('/add', { sessionId, messageId })
          await refresh()
          showToast('已收藏')
          // 在右侧栏的「收藏」标签里展示列表（不另建面板）
          try {
            openPanel(context)
          } catch (error) {
            console.error('[message-pins] 打开收藏标签失败', error)
          }
        } catch (error) {
          console.error('[message-pins] 收藏操作失败', error)
          showToast('收藏失败')
        } finally {
          setBusy(false)
        }
      }

      return h(
        React.Fragment,
        null,
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-mp-star' + (pinned ? ' is-pinned' : ''),
            title: pinned ? '取消收藏' : '收藏回答',
            'aria-label': pinned ? '取消收藏' : '收藏回答',
            'aria-pressed': pinned,
            disabled: busy || !messageId,
            onClick,
          },
          pinned ? '★' : '☆',
        ),
        toast ? h('span', { className: 'dsh-mp-toast' }, toast) : null,
      )
    }

    //#endregion

    //#region 收藏中心面板（右栏 tab / 会话视图 / 主面板共用）

    function PinPanel(props) {
      const sessionId = props && props.sessionId ? String(props.sessionId) : ''
      const [pins, setPins] = React.useState(store.pins)
      const [query, setQuery] = React.useState('')
      const [sessionOnly, setSessionOnly] = React.useState(false)
      const [expanded, setExpanded] = React.useState('')
      const [detail, setDetail] = React.useState('')
      const [detailLoading, setDetailLoading] = React.useState(false)
      const [noteDraft, setNoteDraft] = React.useState('')
      const [tagDraft, setTagDraft] = React.useState('')
      const [toast, setToast] = React.useState('')
      const [railOn, setRailOn] = React.useState(railEnabled)

      React.useEffect(() => {
        const sync = () => setPins(store.pins)
        sync()
        ensureLoaded()
        return subscribe(sync)
      }, [])

      const showToast = (text) => {
        setToast(text)
        if (showToast.timer) clearTimeout(showToast.timer)
        showToast.timer = setTimeout(() => setToast(''), 1800)
      }

      const rows = pins.filter((pin) => {
        if (sessionOnly && sessionId && pin.sessionId !== sessionId) return false
        if (!query.trim()) return true
        const q = query.trim().toLowerCase()
        return (
          String(pin.title || '').toLowerCase().includes(q) ||
          String(pin.excerpt || '').toLowerCase().includes(q) ||
          String(pin.note || '').toLowerCase().includes(q) ||
          (pin.tags || []).some((tag) => String(tag).toLowerCase().includes(q))
        )
      })

      const toggle = async (pin) => {
        if (expanded === pin.file) {
          setExpanded('')
          setDetail('')
          return
        }
        setExpanded(pin.file)
        setDetail('')
        setDetailLoading(true)
        setNoteDraft(pin.note || '')
        setTagDraft((pin.tags || []).join(', '))
        try {
          const data = await api('/read?file=' + encodeURIComponent(pin.file))
          const raw = String(data.content || '')
          const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').replace(/^\s*# .*\r?\n/, '')
          setDetail(body.trim())
        } catch (error) {
          console.error('[message-pins] 读取收藏失败', error)
          setDetail('（读取失败）')
        } finally {
          setDetailLoading(false)
        }
      }

      const remove = async (pin) => {
        try {
          await api('/remove', { file: pin.file })
          if (expanded === pin.file) setExpanded('')
          await refresh()
          showToast('已删除')
        } catch (error) {
          console.error('[message-pins] 删除失败', error)
          showToast('删除失败')
        }
      }

      const saveMeta = async (pin) => {
        try {
          const tags = tagDraft
            .split(/[,，]/)
            .map((t) => t.trim())
            .filter(Boolean)
          await api('/update', { file: pin.file, note: noteDraft, tags })
          await refresh()
          showToast('已保存笔记')
        } catch (error) {
          console.error('[message-pins] 保存笔记失败', error)
          showToast('保存失败')
        }
      }

      const copyText = async (text) => {
        try {
          await navigator.clipboard.writeText(text)
          showToast('已复制')
        } catch {
          showToast('复制失败')
        }
      }

      const exportAll = async () => {
        try {
          const data = await api('/export')
          const markdown = String(data.markdown || '')
          const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = 'message-pins-export.md'
          document.body.appendChild(link)
          link.click()
          link.remove()
          setTimeout(() => URL.revokeObjectURL(url), 2000)
          showToast('已导出 ' + rows.length + ' 条')
        } catch (error) {
          console.error('[message-pins] 导出失败', error)
          showToast('导出失败')
        }
      }

      return h(
        'div',
        { className: 'dsh-mp-root' },
        h(
          'div',
          { className: 'dsh-mp-head' },
          h('span', { className: 'dsh-mp-title' }, '收藏 · ' + pins.length),
          h('input', {
            className: 'dsh-mp-search',
            placeholder: '搜索标题 / 内容 / 标签 / 笔记',
            value: query,
            onChange: (event) => setQuery(event.target.value),
          }),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-mp-btn' + (sessionOnly ? ' is-on' : ''),
              title: '只显示当前会话的收藏',
              onClick: () => setSessionOnly((v) => !v),
            },
            '本会话',
          ),
          h('button', { type: 'button', className: 'dsh-mp-btn', title: '导出全部收藏为 Markdown', onClick: exportAll }, '导出'),
          toast ? h('span', { className: 'dsh-mp-toast' }, toast) : null,
        ),
        h(
          'div',
          { className: 'dsh-mp-list' + (expanded ? ' has-open' : '') },
          rows.length === 0
            ? h(
                'div',
                { className: 'dsh-mp-empty' },
                '还没有收藏。',
                h('br'),
                '点回答下方的 ☆ 五角星即可收藏到 Obsidian。',
              )
            : rows.map((pin) =>
                h(
                  'div',
                  { className: 'dsh-mp-card' + (expanded === pin.file ? ' is-open' : ''), key: pin.file },
                  h(
                    'div',
                    { className: 'dsh-mp-card-head', onClick: () => toggle(pin) },
                    h(
                      'div',
                      { className: 'dsh-mp-card-main' },
                      h('div', { className: 'dsh-mp-card-title' }, (pin.type === 'quote-pin' ? '❝ ' : '') + (pin.title || pin.file)),
                      h(
                        'div',
                        { className: 'dsh-mp-card-meta' },
                        (pin.created ? new Date(pin.created).toLocaleString() : '') +
                          (pin.length ? ' · ' + pin.length + ' 字' : ''),
                      ),
                      pin.type === 'quote-pin'
                        ? h('div', { className: 'dsh-mp-quote' }, '“' + (pin.quote || pin.excerpt || '') + '”')
                        : pin.excerpt
                          ? h('div', { className: 'dsh-mp-card-excerpt' }, pin.excerpt)
                          : null,
                      (pin.tags || []).map((tag) => h('span', { className: 'dsh-mp-tag', key: tag }, tag)),
                    ),
                    h('span', { className: 'dsh-mp-chev' }, expanded === pin.file ? '▾' : '▸'),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-mp-del',
                        title: '删除这条收藏',
                        onClick: (event) => {
                          event.stopPropagation()
                          remove(pin)
                        },
                      },
                      '✕',
                    ),
                  ),
                  expanded === pin.file
                    ? h(
                        'div',
                        { className: 'dsh-mp-detail' },
                        detailLoading
                          ? h('div', { className: 'dsh-mp-card-meta' }, '读取中…')
                          : String(detail || pin.excerpt || '').length > 40000
                            ? h('pre', { className: 'dsh-mp-md-fallback' }, detail || pin.excerpt || '（空）')
                            : h(MarkdownBlock, { text: detail || pin.excerpt || '（空）' }),
                        h(
                          'div',
                          { className: 'dsh-mp-actions' },
                          pin.type === 'quote-pin'
                            ? h(
                                'button',
                                {
                                  type: 'button',
                                  className: 'dsh-mp-btn',
                                  onClick: () => {
                                    if (!jumpToQuote(pin)) showToast('请先打开该会话')
                                  },
                                },
                                '跳到原文',
                              )
                            : null,
                          h(
                            'button',
                            { type: 'button', className: 'dsh-mp-btn', onClick: () => copyText(detail || pin.excerpt || '') },
                            '复制内容',
                          ),
                          h(
                            'button',
                            { type: 'button', className: 'dsh-mp-btn', onClick: () => copyText(pin.file) },
                            '复制文件名',
                          ),
                        ),
                        h(
                          'div',
                          { className: 'dsh-mp-note-edit' },
                          h('input', {
                            placeholder: '笔记（给自己的备注）',
                            value: noteDraft,
                            onChange: (event) => setNoteDraft(event.target.value),
                          }),
                          h('input', {
                            placeholder: '标签，逗号分隔',
                            value: tagDraft,
                            onChange: (event) => setTagDraft(event.target.value),
                          }),
                          h('button', { type: 'button', className: 'dsh-mp-btn', onClick: () => saveMeta(pin) }, '保存'),
                        ),
                      )
                    : null,
                ),
              ),
        ),
      )
    }

    function PinTabTitle() {
      const [count, setCount] = React.useState(store.pins.length)
      React.useEffect(() => {
        const sync = () => setCount(store.pins.length)
        sync()
        return subscribe(sync)
      }, [])
      return count > 0 ? '收藏 · ' + count : '收藏'
    }

    //#endregion

    //#region 左侧栏入口（默认隐藏）

    function FooterEntry(props) {
      const [count, setCount] = React.useState(store.pins.length)
      React.useEffect(() => {
        const sync = () => setCount(store.pins.length)
        sync()
        return subscribe(sync)
      }, [])
      return h(
        'button',
        {
          type: 'button',
          className: 'dsh-mp-btn',
          title: '打开收藏',
          onClick: () => openPanel(props && props.context),
        },
        '☆ 收藏' + (count > 0 ? ' · ' + count : ''),
      )
    }

    //#endregion

    //#region Markdown 渲染（收藏详情用）

    function inlineMd(text, keyBase) {
      const nodes = []
      const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g
      let last = 0
      let m = null
      let i = 0
      while ((m = re.exec(text)) !== null) {
        if (m.index > last) nodes.push(text.slice(last, m.index))
        const tok = m[0]
        if (tok.startsWith('`')) nodes.push(h('code', { key: keyBase + '-c' + i }, tok.slice(1, -1)))
        else if (tok.startsWith('**')) nodes.push(h('strong', { key: keyBase + '-b' + i }, tok.slice(2, -2)))
        else if (tok.startsWith('[')) {
          const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)
          nodes.push(h('a', { key: keyBase + '-a' + i, href: mm[2], target: '_blank', rel: 'noreferrer' }, mm[1]))
        } else nodes.push(h('em', { key: keyBase + '-i' + i }, tok.slice(1, -1)))
        last = m.index + tok.length
        i += 1
      }
      if (last < text.length) nodes.push(text.slice(last))
      return nodes
    }

    /** 轻量 Markdown 渲染：每轮必须前进，避免任何输入造成死循环。 */
    function MarkdownBlock(props) {
      const raw = String((props && props.text) || '')
      const lines = raw.split(/\r?\n/)
      const out = []
      let i = 0
      let key = 0
      let steps = 0
      const STEP_LIMIT = Math.max(2000, lines.length * 8)
      const next = () => key++
      try {
        while (i < lines.length && steps++ < STEP_LIMIT) {
          const start = i
          const line = lines[i]
          if (/^\s*$/.test(line)) {
            i += 1
            continue
          }
          if (/^\s*\`\`\`/.test(line)) {
            const code = []
            i += 1
            while (i < lines.length && !/^\s*\`\`\`/.test(lines[i])) {
              code.push(lines[i])
              i += 1
            }
            if (i < lines.length) i += 1
            out.push(h('pre', { key: 'pre' + next() }, h('code', null, code.join('\n'))))
            continue
          }
          const hd = /^(#{1,6})\s+(.*)$/.exec(line)
          if (hd) {
            const level = Math.min(hd[1].length, 4)
            out.push(h('h' + level, { key: 'h' + next() }, inlineMd(hd[2], 'h' + key)))
            i += 1
            continue
          }
          if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
            out.push(h('hr', { key: 'hr' + next() }))
            i += 1
            continue
          }
          if (/^>\s?/.test(line)) {
            const buf = []
            while (i < lines.length && /^>\s?/.test(lines[i])) {
              buf.push(lines[i].replace(/^>\s?/, ''))
              i += 1
            }
            out.push(h('blockquote', { key: 'q' + next() }, h(MarkdownBlock, { text: buf.join('\n') })))
            continue
          }
          if (
            /^\s*\|/.test(line) &&
            i + 1 < lines.length &&
            /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(lines[i + 1])
          ) {
            const cells = (row) =>
              row
                .trim()
                .replace(/^\|/, '')
                .replace(/\|$/, '')
                .split('|')
                .map((c) => c.trim())
            const head = cells(line)
            i += 2
            const rows = []
            while (i < lines.length && /^\s*\|/.test(lines[i])) {
              rows.push(cells(lines[i]))
              i += 1
            }
            out.push(
              h(
                'table',
                { key: 't' + next() },
                h(
                  'thead',
                  null,
                  h('tr', null, head.map((c, x) => h('th', { key: 'th' + x }, inlineMd(c, 'th' + x)))),
                ),
                h(
                  'tbody',
                  null,
                  rows.map((row, ri) =>
                    h(
                      'tr',
                      { key: 'tr' + ri },
                      row.map((cell, ci) =>
                        h('td', { key: 'td' + ci }, inlineMd(cell, 'td' + ri + '-' + ci)),
                      ),
                    ),
                  ),
                ),
              ),
            )
            continue
          }
          const li = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(line)
          if (li) {
            const ordered = /\d/.test(li[2])
            const items = []
            while (i < lines.length) {
              const m2 = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(lines[i])
              if (!m2) break
              items.push(m2[3])
              i += 1
            }
            out.push(
              h(
                ordered ? 'ol' : 'ul',
                { key: 'l' + next() },
                items.map((t, ix) => h('li', { key: 'li' + ix }, inlineMd(t, 'li' + ix))),
              ),
            )
            continue
          }
          // 段落兜底：至少消费当前行，保证循环前进
          const buf = [line]
          i += 1
          while (i < lines.length) {
            const cur = lines[i]
            if (/^\s*$/.test(cur)) break
            if (/^(#{1,6}\s|\s*\`\`\`|>|\s*\|)/.test(cur)) break
            if (/^(\s*)([-*+]|\d+\.)\s+/.test(cur)) break
            if (/^(-{3,}|\*{3,})\s*$/.test(cur)) break
            buf.push(cur)
            i += 1
          }
          out.push(h('p', { key: 'p' + next() }, inlineMd(buf.join(' '), 'p' + key)))
          if (i === start) i += 1
        }
      } catch (error) {
        console.error('[message-pins] Markdown 渲染失败，降级为纯文本', error)
        return h('pre', { className: 'dsh-mp-md-fallback' }, raw)
      }
      return h('div', { className: 'dsh-mp-md' }, out)
    }

    //#endregion

    //#region 插件详情页设置区（plugins.detail.section）

    function SettingsSection(props) {
      const subject = props && props.subject
      let text = ''
      try {
        text = JSON.stringify(subject || {})
      } catch {
        text = ''
      }
      if (!/message-pins/i.test(text)) return null
      const [mode, setMode] = React.useState('local')
      const [folder, setFolder] = React.useState('')
      const [rail, setRail] = React.useState(railEnabled)
      const [vault, setVault] = React.useState('')
      const [dir, setDir] = React.useState('')
      const [msg, setMsg] = React.useState('')

      React.useEffect(() => {
        api('/config')
          .then((data) => {
            setMode(data.mode === 'obsidian' ? 'obsidian' : 'local')
            setFolder(String(data.folder || ''))
            setRail(data.rail === true)
            setVault(String(data.vault || ''))
            setDir(String(data.dir || ''))
          })
          .catch((error) => console.error('[message-pins] 读取设置失败', error))
      }, [])

      /** 切换保存方式立即持久化；切到 Obsidian 但仓库根为空时不写盘。 */
      const applyMode = async (next) => {
        if (next === 'obsidian' && !String(vault || '').trim()) {
          setMode('obsidian')
          setMsg('请先填写仓库根再保存')
          return
        }
        setMode(next)
        try {
          const data = await api('/set-config', { mode: next })
          setDir(String(data.dir || ''))
          setMsg('已保存')
        } catch (error) {
          console.error('[message-pins] 保存保存方式失败', error)
          setMsg('保存失败')
        }
      }

      const save = async () => {
        try {
          const data = await api('/set-config', { mode, vault, folder })
          setMode(data.mode === 'obsidian' ? 'obsidian' : 'local')
          setVault(String(data.vault || ''))
          setFolder(String(data.folder || ''))
          setDir(String(data.dir || ''))
          setMsg('已保存')
        } catch (error) {
          console.error('[message-pins] 保存设置失败', error)
          setMsg('保存失败')
        }
      }

      return h(
        'section',
        { className: 'dsh-mp-settings' },
        h('h3', null, '收藏设置'),
        h(
          'div',
          { className: 'dsh-mp-row' },
          h('label', null, '保存方式'),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-mp-btn' + (mode === 'local' ? ' is-on' : ''),
              onClick: () => applyMode('local'),
            },
            '本地目录',
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-mp-btn' + (mode === 'obsidian' ? ' is-on' : ''),
              onClick: () => applyMode('obsidian'),
            },
            'Obsidian 仓库',
          ),
        ),
        mode === 'obsidian'
          ? h(
              'div',
              { className: 'dsh-mp-row' },
              h('label', null, '仓库根'),
              h('input', {
                className: 'dsh-mp-search',
                value: vault,
                placeholder: 'C:/Sync/datas/moonlightGarden',
                onChange: (event) => setVault(event.target.value),
              }),
            )
          : null,
        mode === 'obsidian'
          ? h(
              'div',
              { className: 'dsh-mp-row' },
              h('label', null, '保存目录'),
              h('input', {
                className: 'dsh-mp-search',
                value: folder,
                placeholder: 'DSH 收藏/回答收藏',
                onChange: (event) => setFolder(event.target.value),
              }),
            )
          : null,
        h(
          'div',
          { className: 'dsh-mp-row' },
          h('label', null, '左栏入口'),
          h('input', {
            type: 'checkbox',
            checked: rail,
            onChange: (event) => {
              setRailState(event.target.checked)
              setRail(event.target.checked)
            },
          }),
          h('span', { className: 'dsh-mp-hint' }, '在左侧栏显示「☆ 收藏」入口（默认关闭）'),
        ),
        h('div', { className: 'dsh-mp-hint' }, '当前保存到：' + (dir || '(保存后显示)')),
        h(
          'div',
          { className: 'dsh-mp-row' },
          h('button', { type: 'button', className: 'dsh-mp-btn', onClick: save }, '保存设置'),
          msg ? h('span', { className: 'dsh-mp-toast' }, msg) : null,
        ),
      )
    }

    //#endregion

    //#region 选中文字收藏（浮条嵌在消息行内 + 锚点 + 跳回高亮）

    function rowOf(el) {
      let node = el
      while (node && node !== document.body) {
        if (node.nodeType === 1 && (node.getAttribute('data-chat-flow-key') || node.getAttribute('data-chat-anchor-key'))) {
          return node
        }
        node = node.parentElement
      }
      return null
    }

    function sessionOf(row) {
      let node = row
      while (node && node !== document.body) {
        if (node.nodeType === 1) {
          const id = node.getAttribute('data-session-id')
          if (id) return id
        }
        node = node.parentElement
      }
      const bodyId = document.body && document.body.getAttribute('data-session-id')
      if (bodyId) return bodyId
      const path = location.pathname + location.hash + location.search
      const m = path.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
      return m ? m[1] : ''
    }

    /** 从当前浏览器选区计算锚点。 */
    function anchorFromSelection() {
      try {
        const selection = window.getSelection()
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null
        const quote = String(selection.toString() || '').trim()
        if (!quote || quote.length > 8000) return null
        const range = selection.getRangeAt(0)
        const startNode = range.startContainer
        const startEl = startNode.nodeType === 1 ? startNode : startNode.parentElement
        const row = startEl ? rowOf(startEl) : null
        if (!row) return null
        const flowKey = row.getAttribute('data-chat-flow-key') || row.getAttribute('data-chat-anchor-key') || ''
        const sessionId = sessionOf(row)
        const pre = document.createRange()
        pre.selectNodeContents(row)
        pre.setEnd(range.startContainer, range.startOffset)
        const before = pre.toString()
        const full = row.textContent || ''
        const offset = before.length
        const rect = range.getBoundingClientRect()
        const rowRect = row.getBoundingClientRect()
        return {
          quote,
          flowKey,
          sessionId,
          offset,
          prefix: before.slice(-40),
          suffix: full.slice(offset + quote.length, offset + quote.length + 40),
          row,
          left: rect.left - rowRect.left,
          top: rect.top - rowRect.top - 34,
        }
      } catch (error) {
        console.error('[message-pins] 计算选区锚点失败', error)
        return null
      }
    }

    function flashQuote(row, quote) {
      try {
        for (const mark of document.querySelectorAll('mark.dsh-mp-mark')) {
          const parent = mark.parentNode
          if (!parent) continue
          parent.replaceChild(document.createTextNode(mark.textContent || ''), mark)
          parent.normalize()
        }
        const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT)
        let node
        while ((node = walker.nextNode())) {
          const text = node.textContent || ''
          const idx = text.indexOf(quote)
          if (idx < 0) continue
          const range = document.createRange()
          range.setStart(node, idx)
          range.setEnd(node, idx + quote.length)
          const mark = document.createElement('mark')
          mark.className = 'dsh-mp-mark'
          range.surroundContents(mark)
          setTimeout(() => {
            try {
              const parent = mark.parentNode
              if (parent) {
                parent.replaceChild(document.createTextNode(mark.textContent || ''), mark)
                parent.normalize()
              }
            } catch {
              /* ignore */
            }
          }, 4500)
          return true
        }
      } catch (error) {
        console.error('[message-pins] 高亮失败', error)
      }
      return false
    }

    function jumpToQuote(pin) {
      const quote = String(pin.quote || pin.excerpt || '').trim()
      let row = null
      if (pin.flowKey) {
        row = document.querySelector('[data-chat-flow-key="' + String(pin.flowKey).replace(/"/g, '\\"') + '"]')
        if (!row) {
          row = document.querySelector('[data-chat-anchor-key="' + String(pin.flowKey).replace(/"/g, '\\"') + '"]')
        }
      }
      if (!row && quote) {
        const rows = [...document.querySelectorAll('[data-chat-flow-key],[data-chat-anchor-key]')]
        row = rows.find((candidate) => (candidate.textContent || '').includes(quote)) || null
      }
      if (!row) return false
      try {
        row.scrollIntoView({ block: 'center', behavior: 'smooth' })
      } catch {
        row.scrollIntoView()
      }
      if (quote) setTimeout(() => flashQuote(row, quote), 320)
      return true
    }

    let pluginContext = null

    async function saveQuote(sel, dismiss, clearSelection) {
      try {
        const saved = await api('/add-quote', {
          sessionId: sel.sessionId,
          flowKey: sel.flowKey,
          quote: sel.quote,
          offset: sel.offset,
          prefix: sel.prefix,
          suffix: sel.suffix,
        })
        console.log('[message-pins] add-quote response: ' + JSON.stringify(saved).slice(0, 240))
        await refresh()
        const found = store.pins.some((pin) => pin.type === 'quote-pin' && pin.quote === sel.quote)
        console.log('[message-pins] pin visible after save: ' + found)
        if (!found) {
          console.error('[message-pins] 保存成功但列表里找不到该引用，检查文件扩展名/目录配置')
          return false
        }
        try {
          openPanel(pluginContext)
        } catch {
          /* ignore */
        }
      } catch (error) {
        console.error('[message-pins] 收藏选中失败', error)
        return false
      }
      try {
        if (typeof dismiss === 'function') dismiss()
        else if (typeof clearSelection === 'function') clearSelection()
      } catch {
        /* ignore */
      }
      return true
    }

    /** 选区浮条（dsh-pins 已验证写法）：React + shell.overlay；根节点 mousedown 阻止默认以保住宿选区。 */
    function FloatingActions(props) {
      const context = props && props.context
      const [pos, setPos] = React.useState(null)
      const [anchor, setAnchor] = React.useState(null)
      const [ui, setUi] = React.useState('idle')
      const rangeRef = React.useRef(null)

      const place = () => {
        const range = rangeRef.current
        if (!range) return
        let rect = null
        try {
          rect = range.getBoundingClientRect()
        } catch {
          rect = null
        }
        if (!rect) return
        const barWidth = 30
        const barHeight = 28
        // 优先放在选区右侧、垂直居中；右侧空间不足时放到选区左侧
        let left = rect.right + 8
        if (left + barWidth > window.innerWidth - 8) {
          left = Math.max(8, rect.left - barWidth - 8)
        }
        const top = Math.max(8, rect.top + rect.height / 2 - barHeight / 2)
        setPos({ left, top })
      }

      React.useEffect(() => {
        const onSelectionChange = () => {
          try {
            const selection = window.getSelection()
            if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
              rangeRef.current = null
              setPos(null)
              setAnchor(null)
              setUi('idle')
              return
            }
            const range = selection.getRangeAt(0)
            const startNode = range.startContainer
            const startEl = startNode.nodeType === 1 ? startNode : startNode.parentElement
            const row = startEl ? rowOf(startEl) : null
            if (!row) return
            rangeRef.current = range
            const sel = anchorFromSelection()
            console.log('[message-pins] selection captured: ' + String((sel && sel.quote) || '').slice(0, 24))
            setAnchor(sel)
            place()
          } catch (error) {
            console.error('[message-pins] selectionchange 处理失败', error)
          }
        }
        const onScroll = () => place()
        document.addEventListener('selectionchange', onSelectionChange)
        document.addEventListener('scroll', onScroll, true)
        return () => {
          document.removeEventListener('selectionchange', onSelectionChange)
          document.removeEventListener('scroll', onScroll, true)
        }
      }, [])

      if (!pos || !anchor) return null

      const save = async () => {
        console.log('[message-pins] save selected clicked')
        if (ui === 'busy') return
        setUi('busy')
        const ok = await saveQuote(anchor)
        console.log('[message-pins] save selected result: ' + ok)
        setUi(ok ? 'done' : 'fail')
        if (ok) {
          rangeRef.current = null
          setTimeout(() => {
            setPos(null)
            setAnchor(null)
            setUi('idle')
          }, 700)
        } else {
          setTimeout(() => setUi('idle'), 1500)
        }
      }

      const close = () => {
        rangeRef.current = null
        setPos(null)
        setAnchor(null)
        setUi('idle')
      }

      return h(
        'div',
        {
          className: 'dsh-mp-selbar dsh-mp-selbar-icon',
          style: { left: pos.left + 'px', top: pos.top + 'px' },
          onMouseDown: (event) => event.preventDefault(),
        },
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-mp-selbtn dsh-mp-selbtn-icon',
            title: ui === 'done' ? '已收藏' : ui === 'fail' ? '收藏失败' : '收藏选中',
            onClick: save,
          },
          ui === 'busy' ? '…' : ui === 'done' ? '✓' : ui === 'fail' ? '!' : '☆',
        ),
      )
    }

    //#endregion

    //#region 注册

    function apply(context) {
      const disposers = []
      const own = (dispose) => {
        if (typeof dispose === 'function') disposers.push(dispose)
      }

      console.log('[message-pins] client v13 loaded (mode-settings)')
      try {
        own(registerStyles())
      } catch (error) {
        console.error('[message-pins] 样式注册失败', error)
      }

      // 注册右侧栏标签类型 + guide 卡片（右侧栏「开始」页的工具列表来源）
      try {
        const doRegister = (scoped) => {
          try {
            const tabs = scoped && scoped.sidebarRightTabs
            if (!tabs || typeof tabs.register !== 'function') {
              console.error('[message-pins] sidebarRightTabs 服务不可用')
              return
            }
            own(
              tabs.register({
                id: PKG,
                kind: KIND,
                title: () => '收藏',
                guide: [
                  {
                    order: 40,
                    title: () => '收藏',
                    description: () => '收藏的回答（落盘到 Obsidian）',
                    icon: PanelIcon,
                  },
                ],
              }),
            )
          } catch (error) {
            console.error('[message-pins] 收藏标签注册失败', error)
          }
        }
        if (typeof context.inject === 'function') {
          own(context.inject(['sidebarRightTabs'], (scoped) => doRegister(scoped)))
        } else {
          doRegister(context)
        }
      } catch (error) {
        console.error('[message-pins] sidebarRightTabs 注入失败', error)
      }

      let slots = null
      try {
        slots = context.get('slots') || null
      } catch (error) {
        console.error('[message-pins] 获取 slots 失败', error)
      }

      if (slots && typeof slots.inject === 'function' && typeof slots.register === 'function') {
        try {
          own(
            slots.inject('conversation.chat.assistant-actions', () =>
              slots.register(
                { name: 'conversation.chat.assistant-actions', id: PKG, order: 15, label: '收藏' },
                (props) => h(Guard, { label: '收藏按钮' }, h(StarButton, { ...props, context })),
              ),
            ),
          )
        } catch (error) {
          console.error('[message-pins] 收藏按钮注册失败', error)
        }

        try {
          own(
            slots.inject('sidebar.right.pane.tab', () =>
              slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, (props) =>
                h(Guard, { label: '收藏面板' }, h(PinPanel, props)),
              ),
            ),
          )
        } catch (error) {
          console.error('[message-pins] 收藏面板注册失败', error)
        }

        try {
          own(
            slots.inject('sidebar.right.pane.tab.title', () =>
              slots.register({ name: 'sidebar.right.pane.tab.title', key: TAB_ID }, (props) =>
                h(Guard, { label: '收藏标题' }, h(PinTabTitle, props)),
              ),
            ),
          )
        } catch (error) {
          console.error('[message-pins] 收藏标题注册失败', error)
        }

        try {
          own(
            slots.inject('conversation.view', () =>
              slots.register({ name: 'conversation.view', id: 'pins', order: 40, label: '收藏' }, (props) =>
                h(Guard, { label: '收藏视图' }, h(PinPanel, props)),
              ),
            ),
          )
        } catch (error) {
          console.error('[message-pins] 收藏视图注册失败', error)
        }

        try {
          own(
            slots.inject('main', () =>
              slots.register({ name: 'main', key: PKG }, (props) =>
                h(Guard, { label: '收藏中心' }, h(PinPanel, props)),
              ),
            ),
          )
        } catch (error) {
          console.error('[message-pins] 收藏主面板注册失败', error)
        }

        try {
          own(
            slots.inject('plugins.detail.section', () =>
              slots.register({ name: 'plugins.detail.section', id: PKG, order: 20, label: '收藏设置' }, (props) =>
                h(Guard, { label: '收藏设置' }, h(SettingsSection, props)),
              ),
            ),
          )
        } catch (error) {
          console.error('[message-pins] 收藏设置注册失败', error)
        }

        try {
          own(
            slots.inject('shell.overlay', () =>
              slots.register({ name: 'shell.overlay', id: PKG, order: 50, label: '选中收藏' }, () =>
                h(Guard, { label: '选中收藏' }, h(FloatingActions, { context })),
              ),
            ),
          )
        } catch (error) {
          console.error('[message-pins] 选中收藏浮条注册失败', error)
        }

        railSlots = slots
        syncRail()
        syncRailFromHost()
      }

      ensureLoaded()

      return () => {
        while (disposers.length > 0) {
          const dispose = disposers.pop()
          try {
            dispose()
          } catch (error) {
            console.error('[message-pins] disposer failed', error)
          }
        }
      }
    }

    return {
      inject: ['slots'],
      apply,
    }
  },
})
