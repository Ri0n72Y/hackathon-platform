import { useState, type ReactNode } from 'react'
import styles from './SafeMarkdown.module.css'
const safeLink = (value: string) => {
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : null }
  catch { return null }
}
const safeMedia = (value: string) => {
  const url = safeLink(value)
  return url?.startsWith('https://') ? url : null
}
function Inline({ source }: { source: string }) {
  const pattern = /(\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|\*([^*]+)\*|_([^_]+)_|\x60([^\x60]+)\x60)/g
  const output: ReactNode[] = []
  let from = 0, match: RegExpExecArray | null
  while ((match = pattern.exec(source))) {
    if (match.index > from) output.push(source.slice(from, match.index))
    const key = match.index
    if (match[2] !== undefined) {
      const href = safeLink(match[3])
      output.push(href ? <a key={key} href={href} target="_blank" rel="noopener noreferrer">{match[2]}</a> : match[2])
    } else if (match[4] || match[5]) output.push(<strong key={key}>{match[4] || match[5]}</strong>)
    else if (match[6]) output.push(<del key={key}>{match[6]}</del>)
    else if (match[7] || match[8]) output.push(<em key={key}>{match[7] || match[8]}</em>)
    else output.push(<code key={key}>{match[9]}</code>)
    from = pattern.lastIndex
  }
  if (from < source.length) output.push(source.slice(from))
  return <>{output}</>
}
function ImageBlock({ url, alt }: { url: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  const href = safeMedia(url)
  if (!href) return <p className={styles.invalid}>图片链接不可用：{alt || url}</p>
  return <figure className={styles.media}>
    {failed ? <figcaption>图片加载失败：{alt || '未提供替代文字'}</figcaption> :
      <img src={href} alt={alt} loading="lazy" onError={() => setFailed(true)} />}
    <figcaption><a href={href} target="_blank" rel="noopener noreferrer">查看图片来源</a></figcaption>
  </figure>
}
function VideoBlock({ url }: { url: string }) {
  const href = safeMedia(url)
  if (!href) return <p className={styles.invalid}>视频链接不可用：{url}</p>
  return <aside className={styles.video}><strong>视频</strong> <span>{new URL(href).hostname}</span>
    <a href={href} target="_blank" rel="noopener noreferrer">打开视频</a></aside>
}
/** @summary Preserve inline media order without executing embedded HTML or unsafe links. */
function Paragraph({ source }: { source: string }) {
  const pattern = /(!\[([^\]]*)\]\(([^)\s]+)\)|@\[video\]\(([^)\s]+)\))/g
  const pieces: ReactNode[] = []
  let from = 0, match: RegExpExecArray | null
  while ((match = pattern.exec(source))) {
    if (match.index > from) pieces.push(<span key={'text-' + from}><Inline source={source.slice(from, match.index)} /></span>)
    pieces.push(match[4] !== undefined
      ? <VideoBlock key={'v-' + match.index} url={match[4]} />
      : <ImageBlock key={'i-' + match.index} url={match[3]} alt={match[2]} />)
    from = pattern.lastIndex
  }
  if (from < source.length) pieces.push(<span key={'text-' + from}><Inline source={source.slice(from)} /></span>)
  return <div className={styles.paragraph}>{pieces}</div>
}
/** @summary Render a deliberately small safe Markdown subset for the original Issue body. */
export function SafeMarkdown({ body, preview = false }: { body: string; preview?: boolean }) {
  const lines = body.replace(/\r\n?/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  for (let i = 0; i < lines.length;) {
    const s = lines[i].trim()
    if (!s) { i++; continue }
    const fence = /^(?:\x60{3,}|~{3,})/.exec(s)
    if (fence) {
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith(fence[0])) code.push(lines[i++])
      if (i < lines.length) i++
      blocks.push(<pre key={blocks.length}><code>{code.join('\n')}</code></pre>)
      continue
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(s)
    if (heading) {
      const level = heading[1].length
      const content = <Inline source={heading[2]} />
      blocks.push(<div key={blocks.length} role="heading" aria-level={level} className={styles.heading}>{content}</div>)
      i++; continue
    }
    if (/^(?:---+|___+|\*\*\*+)$/.test(s)) { blocks.push(<hr key={blocks.length} />); i++; continue }
    if (/^>\s?/.test(s)) {
      const quote: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) quote.push(lines[i++].trim().replace(/^>\s?/, ''))
      blocks.push(<blockquote key={blocks.length}><Paragraph source={quote.join(' ')} /></blockquote>)
      continue
    }
    const list = /^([-*+]|\d+\.)\s+(.+)$/.exec(s)
    if (list) {
      const ordered = /^\d/.test(list[1]), entries: string[] = []
      while (i < lines.length) {
        const item = /^([-*+]|\d+\.)\s+(.+)$/.exec(lines[i].trim())
        if (!item || /^\d/.test(item[1]) !== ordered) break
        entries.push(item[2]); i++
      }
      const nodes = entries.map((value, index) => <li key={index}><Paragraph source={value} /></li>)
      blocks.push(ordered ? <ol key={blocks.length}>{nodes}</ol> : <ul key={blocks.length}>{nodes}</ul>)
      continue
    }
    const para = [s]; i++
    while (i < lines.length && lines[i].trim() &&
      !/^(?:#{1,6}\s|>\s?|[-*+]\s|\d+\.\s|\x60{3,}|~{3,})/.test(lines[i].trim())) para.push(lines[i++].trim())
    blocks.push(<Paragraph key={blocks.length} source={para.join(' ')} />)
  }
  return <div className={preview ? `${styles.markdown} ${styles.preview}` : styles.markdown}>{blocks}</div>
}
