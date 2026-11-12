import { useCallback, useEffect, useState } from 'react'
import type { ChannelApi, ChannelSnapshot } from './service'
import ChannelView from './ChannelView'

type ReadState = {
  loading: boolean
  snapshot: ChannelSnapshot | null
  error: string
}

/** @summary Own abortable, repository-scoped Channel reads and retry state. */
export default function ChannelPage({ owner, repo, api }: {
  owner: string
  repo: string
  api: ChannelApi
}) {
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<ReadState>({
    loading: true, snapshot: null, error: '',
  })
  const retry = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    const abort = new AbortController()
    setState({ loading: true, snapshot: null, error: '' })
    void api.getChannels(owner, repo, abort.signal).then(snapshot => {
      if (!abort.signal.aborted) setState({
        loading: false, snapshot, error: '',
      })
    }).catch(error => {
      if (!abort.signal.aborted) setState({
        loading: false, snapshot: null,
        error: error instanceof Error ? error.message : '频道读取失败',
      })
    })
    return () => abort.abort()
  }, [api, owner, repo, revision])

  return <ChannelView owner={owner} repo={repo} {...state} onRetry={retry} />
}
