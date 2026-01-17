import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'

describe('coverage configuration', () => {
  it('defines a test:coverage script and coverage thresholds', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url))
    const webRoot = path.resolve(currentDir, '../../..')

    const packageJsonPath = path.join(webRoot, 'package.json')
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
    const coverageScript = packageJson.scripts?.['test:coverage']

    expect(coverageScript).toBeTruthy()
    expect(coverageScript).toContain('--coverage')

    const vitestConfigPath = path.join(webRoot, 'vitest.config.ts')
    const vitestConfigText = readFileSync(vitestConfigPath, 'utf-8')

    expect(vitestConfigText).toMatch(/coverage\s*:\s*\{/)
    expect(vitestConfigText).toMatch(/provider\s*:\s*['"]v8['"]/)
    expect(vitestConfigText).toMatch(/thresholds\s*:\s*\{/)
    expect(vitestConfigText).toMatch(/lines\s*:/)
    expect(vitestConfigText).toMatch(/branches\s*:/)
    expect(vitestConfigText).toMatch(/functions\s*:/)
    expect(vitestConfigText).toMatch(/statements\s*:/)
  })
})
