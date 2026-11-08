import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { safeHttps, type Member } from './domain.mjs'
import type { Team } from './service'
import styles from './RepoHome.module.css'

/** @summary Use a validated avatar URL or GitHub avatar with an initial-letter fallback. */
export function MemberAvatar({ member, size = 'small' }: { member: Member; size?: 'small' | 'large' }) {
  const [failed, setFailed] = useState(false)
  const url = member.avatarUrl && safeHttps(member.avatarUrl) ? member.avatarUrl :
    member.githubUsername ? 'https://github.com/' + encodeURIComponent(member.githubUsername) + '.png' : ''
  return <span className={size === 'small' ? styles.avatar : styles.avatarLarge}>
    {url && !failed ? <img src={url} alt="" onError={() => setFailed(true)} loading="lazy" /> :
      <span aria-hidden="true">{member.name.slice(0, 1).toUpperCase()}</span>}
  </span>
}
export function TeamStatus({ team, base, onRetry }: {
  team: Team; base: string; branch?: string; onRetry?: () => void
}) {
  if (team.state === 'ready') return null
  if (team.state === 'missing') return <p>尚未添加团队成员。<Link to={base + '/members/register'}>添加成员</Link></p>
  if (team.state === 'empty') return <p>暂无成员。<Link to={base + '/members/register'}>添加成员</Link></p>
  return <p role="alert">{team.state === 'invalid' ? '成员文件格式错误：' : '成员文件读取失败：'}{team.error}
    {onRetry && <button type="button" onClick={onRetry}>重试</button>}</p>
}
export function MemberProfile({ member }: { member: Member }) {
  return <div className={styles.profile}>
    <MemberAvatar member={member} size="large" />
    <div className={styles.profileText}><strong>{member.name}</strong>
      {member.role && <p>{member.role}</p>}
      {member.bio && <p className={styles.bio}>{member.bio}</p>}
      {member.githubUsername && <a href={'https://github.com/' + encodeURIComponent(member.githubUsername)}
        target="_blank" rel="noopener noreferrer">GitHub @{member.githubUsername}</a>}
      {member.links?.map((item, i) => <a key={i} href={item.url}
        target="_blank" rel="noopener noreferrer">{item.label}</a>)}
    </div>
  </div>
}
/** @summary Provide one scrollable avatar row and a shared hover/focus/tap anchored popover. */
export function TeamStrip({ members, base }: { members: Member[]; base: string }) {
  const [active, setActive] = useState<number | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const pointer = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null }
  const delayOpen = (i: number) => { cancel(); timer.current = setTimeout(() => setActive(i), 120) }
  const delayClose = () => { cancel(); timer.current = setTimeout(() => setActive(null), 180) }
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setActive(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setActive(null); cancel() }
      if (event.key === 'Tab') pointer.current = false
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { cancel(); document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [])
  return <div className={styles.strip} ref={root} aria-label="团队成员头像">
    {members.map((member, index) => <div key={member.id} className={styles.avatarItem}
      onPointerEnter={e => { if (e.pointerType !== 'touch') delayOpen(index) }}
      onPointerLeave={delayClose}
      onFocus={e => { if (!pointer.current && e.target instanceof HTMLButtonElement) setActive(index) }}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) delayClose() }}>
      <button type="button" className={styles.avatarButton} aria-label={member.name}
        aria-expanded={active === index} aria-controls={'team-popover-' + index}
        onPointerDown={() => { pointer.current = true }}
        onClick={() => { cancel(); setActive(old => old === index ? null : index) }}>
        <MemberAvatar member={member} />
      </button>
      {active === index && <div id={'team-popover-' + index} className={styles.popover}>
        <MemberProfile member={member} />
      </div>}
    </div>)}
    <Link className={styles.stripAll} to={base + '/members'}>全部成员</Link>
  </div>
}
