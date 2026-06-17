/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import test from 'node:test'
import { fileVariantObjectPath, originalFileObjectPath } from './file-paths'

test('file object paths use canonical ids instead of original filenames', () => {
  const id = '019e4a8b-0ebe-76e7-abb4-71a6ae06ed63'

  assert.equal(
    originalFileObjectPath(id, '88dd1b1e-85cb-49ec-90ff-8d489994205d.jpeg', 'image/jpeg'),
    '019e4a8b-0ebe-76e7-abb4-71a6ae06ed63.jpeg',
  )
  assert.equal(fileVariantObjectPath(id, 'thumb', 'webp'), '019e4a8b-0ebe-76e7-abb4-71a6ae06ed63__thumb.webp')
  assert.equal(fileVariantObjectPath(id, 'preview', 'webp'), '019e4a8b-0ebe-76e7-abb4-71a6ae06ed63__preview.webp')
})

test('file object paths fall back to mime extension when the filename has none', () => {
  assert.equal(originalFileObjectPath('file-id', 'upload', 'image/png'), 'file-id.png')
  assert.equal(originalFileObjectPath('file-id', undefined, 'application/octet-stream'), 'file-id.bin')
})
