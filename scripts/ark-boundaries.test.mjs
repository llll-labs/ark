import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { inspectTenantBoundaries } from './ark-boundaries.mjs'

async function withTenant(run) {
  const root = await mkdtemp(join(tmpdir(), 'ark-boundaries-'))
  await mkdir(join(root, 'app/components'), { recursive: true })
  await mkdir(join(root, 'server/utils'), { recursive: true })
  await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { '@kurark/ark': 'github:llll-labs/ark#main' } }))
  try {
    await run(root)
  }
  finally {
    await rm(root, { force: true, recursive: true })
  }
}

test('tenant boundary inspection rejects copied transports, components, and Ark writes', async () => {
  await withTenant(async (root) => {
    await writeFile(join(root, 'app/components/ArkAuthPanel.vue'), '<script setup>const { $trpc } = useNuxtApp()</script>')
    await writeFile(join(root, 'server/utils/write.ts'), 'db.insert(arkChannels).values({})')
    const issues = inspectTenantBoundaries(root)
    assert.equal(issues.length, 3)
    assert.match(issues.join('\n'), /REST instead of \$trpc/)
    assert.match(issues.join('\n'), /must not shadow/)
    assert.match(issues.join('\n'), /must use an Ark Domain Operation/)
  })
})

test('tenant boundary inspection allows product adapters and explicit system imports', async () => {
  await withTenant(async (root) => {
    await writeFile(join(root, 'app/components/AbcgAuthModal.vue'), '<template><ArkAuthModal /></template>')
    await writeFile(join(root, 'server/utils/import.ts'), '// ark-boundaries: system-import\ndb.insert(arkPages).values({})')
    assert.deepEqual(inspectTenantBoundaries(root), [])
  })
})
