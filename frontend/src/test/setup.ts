import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// vitest doesn't wire up RTL's auto-cleanup without `test.globals: true` -- this file
// runs before every test file, so unmounting here keeps one test's render from leaking
// into the next.
afterEach(() => {
  cleanup()
})
