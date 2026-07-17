import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const runtimeExtensions = new Set(['.js', '.mjs', '.ts', '.vue'])

function runtimeFiles(root) {
  const files = []
  for (const top of ['app', 'server']) {
    const start = join(root, top)
    if (!existsSync(start))
      continue
    const visit = (directory) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) {
          visit(path)
          continue
        }
        if (runtimeExtensions.has(extname(entry.name)) && !/\.(?:spec|test)\.[^.]+$/.test(entry.name))
          files.push(path)
      }
    }
    visit(start)
  }
  return files
}

export function inspectTenantBoundaries(root = process.cwd()) {
  const issues = []
  const packagePath = join(root, 'package.json')
  if (!existsSync(packagePath))
    return ['package.json was not found.']
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
  const arkDependency = packageJson.dependencies?.['@kurark/ark'] ?? packageJson.devDependencies?.['@kurark/ark']
  if (arkDependency !== 'github:llll-labs/ark#main')
    issues.push('@kurark/ark must use github:llll-labs/ark#main.')

  for (const file of runtimeFiles(root)) {
    const name = relative(root, file).split('\\').join('/')
    const source = readFileSync(file, 'utf8')
    if (source.includes('$trpc'))
      issues.push(`${name}: tenant runtime code must use REST instead of $trpc.`)
    if (/^app\/components\/(?:core\/)?Ark[^/]*\.vue$/.test(name))
      issues.push(`${name}: tenant components must not shadow Ark component names.`)
    if (!source.includes('ark-boundaries: system-import') && /\.(?:insert|update|delete)\(ark[A-Z][A-Za-z0-9_]*/.test(source))
      issues.push(`${name}: interactive Ark table writes must use an Ark Domain Operation.`)
  }
  return issues
}

export function assertTenantBoundaries(root = process.cwd()) {
  const issues = inspectTenantBoundaries(root)
  if (issues.length)
    throw new Error(`Ark tenant boundary check failed:\n${issues.map(issue => `  - ${issue}`).join('\n')}`)
}
