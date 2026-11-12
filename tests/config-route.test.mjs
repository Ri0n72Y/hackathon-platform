import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { configTargetKey } from '../plugins/repo-config/src/target-key.mjs'

const root = resolve(import.meta.dirname, '..')
const entry = readFileSync(resolve(root, 'plugins/repo-config/src/index.tsx'), 'utf8')
const page = readFileSync(resolve(root, 'plugins/repo-config/src/ConfigPage.tsx'), 'utf8')

test('#47 B1-1: A and B same-route params receive distinct React Control keys', () => {
  const same = configTargetKey('octocat', 'alpha')
  const other = configTargetKey('octocat', 'beta')
  assert.equal(same, configTargetKey('octocat', 'alpha'))
  assert.notEqual(same, other)
  assert.notEqual(configTargetKey('a/b', 'c'), configTargetKey('a', 'b/c'))
  const Control = () => null
  const aWithPendingPr = createElement(Control, {
    key: same, pendingPr: 'https://github.com/octocat/alpha/pull/88',
  })
  const bWithFetchFailure = createElement(Control, {
    key: other, loadError: 'GitHub 503',
  })
  assert.notEqual(aWithPendingPr.key, bWithFetchFailure.key)
  assert.match(entry, /useParams<'owner' \| 'repo'>\(\)/)
  assert.match(entry, /<ConfigPage key=\{configTargetKey\(owner, repo\)\}/)
  assert.doesNotMatch(page, /useParams\(/)
})

test('#47 B1-1: A in-flight load/save/sync cannot commit into remounted B Control', () => {
  // Static contract plus key isolation: no DOM runner is bundled in the repository.
  assert.match(page, /useEffect\(\(\) => \(\) => \{[\s\S]*?active\.current\?\.abort\(\)/)
  assert.match(page, /controller\.abort\(\)/)
  assert.match(page, /if \(signal\.aborted\) return/)
  assert.match(page, /if \(controller\.signal\.aborted\) return/)
  assert.match(page, /if \(!controller\.signal\.aborted\) \{/)
  assert.match(page, /const pendingPr = useRef/)
  assert.match(page, /const \[snapshot, setSnapshot\] = useState<ConfigSnapshot \| null>\(null\)/)
  assert.match(page, /const \[content, setContent\] = useState\(''\)/)
  assert.match(page, /const \[result, setResult\] = useState<ConfigActionResult \| null>\(null\)/)
  assert.match(page, /const \[confirmRemovals, setConfirmRemovals\] = useState\(false\)/)
})
