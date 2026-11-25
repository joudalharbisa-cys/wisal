import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// The full suite runs many jsdom files in parallel; give async lookups room on a busy machine.
configure({ asyncUtilTimeout: 4000 })

afterEach(() => cleanup())
