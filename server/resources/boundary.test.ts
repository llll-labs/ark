/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const directAggregateWrite = /\.(?:delete|insert|update)\(ark(?:Channels|Files|MarketJobs|MarketStores|Messages|Pages|Spaces|Users)(?:Table)?\)/g

async function typescriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory())
      return typescriptFiles(path)
    return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : []
  }))
  return files.flat()
}

test('ordinary server modules do not write registered aggregate tables directly', async () => {
  const violations: string[] = []
  for (const file of await typescriptFiles(serverRoot)) {
    const source = await readFile(file, 'utf8')
    for (const match of source.matchAll(directAggregateWrite))
      violations.push(`${relative(serverRoot, file)}: ${match[0]}`)
  }

  assert.deepEqual(violations, [])
})
