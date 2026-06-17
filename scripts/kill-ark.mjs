#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const arkRoot = resolve(process.cwd(), '.ark')

function isPortName(name) {
  if (!/^\d+$/.test(name))
    return false

  const port = Number(name)
  return Number.isInteger(port) && port > 0 && port <= 65535
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function listeningPids(port) {
  const result = spawnSync('lsof', ['-nP', `-tiTCP:${port}`, '-sTCP:LISTEN'], {
    encoding: 'utf8',
  })

  if (result.error?.code === 'ENOENT') {
    console.warn('lsof is not available; removing .ark without checking active listeners.')
    return []
  }

  if (result.status !== 0 && !result.stdout.trim())
    return []

  return [...new Set(result.stdout.split(/\s+/).filter(Boolean).map(Number).filter(Number.isInteger))]
}

function signalPid(pid, signal) {
  try {
    process.kill(pid, signal)
    return true
  }
  catch (error) {
    if (error?.code !== 'ESRCH')
      console.warn(`Could not ${signal} pid ${pid}: ${error.message}`)
    return false
  }
}

if (!existsSync(arkRoot)) {
  console.log(`No .ark directory found at ${arkRoot}`)
  process.exit(0)
}

const ports = readdirSync(arkRoot, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && isPortName(entry.name))
  .map(entry => Number(entry.name))
  .sort((a, b) => a - b)

const listeners = new Map(ports.map(port => [port, listeningPids(port)]))
const pids = [...new Set([...listeners.values()].flat())]

if (ports.length) {
  console.log(`Found .ark cells for ports: ${ports.join(', ')}`)
}
else {
  console.log('Found .ark, but no numeric port cells under it.')
}

for (const [port, portPids] of listeners) {
  if (portPids.length)
    console.log(`Port ${port} listener pids: ${portPids.join(', ')}`)
}

if (dryRun) {
  if (pids.length)
    console.log(`Would terminate pids: ${pids.join(', ')}`)
  console.log(`Would remove ${arkRoot}`)
  process.exit(0)
}

if (pids.length) {
  console.log(`Terminating pids: ${pids.join(', ')}`)
  for (const pid of pids)
    signalPid(pid, 'SIGTERM')

  sleep(800)

  const remaining = [...new Set(ports.flatMap(port => listeningPids(port)))]
  if (remaining.length) {
    console.log(`Force killing remaining pids: ${remaining.join(', ')}`)
    for (const pid of remaining)
      signalPid(pid, 'SIGKILL')
  }
}

rmSync(arkRoot, { recursive: true, force: true })
console.log(`Removed ${arkRoot}`)
