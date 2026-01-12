import { useState } from 'react'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithIntl } from '../../../test/utils'
import { CoverageGaps } from '../CoverageGaps'
import plMessages from '../../../i18n/messages/pl.json'

const displayNameFor = (code: string) => {
  if (code === 'ALT') return 'Alanine aminotransferase'
  if (code === 'AST') return 'Aspartate aminotransferase'
  return code
}

function Harness() {
  const [uncovered, setUncovered] = useState(['ALT', 'AST'])
  const [prefill, setPrefill] = useState('')

  return (
    <>
      <CoverageGaps
        uncovered={uncovered}
        displayNameFor={displayNameFor}
        onRemove={(code) => setUncovered((prev) => prev.filter((item) => item !== code))}
        onSearchAlternative={(code) => setPrefill(code)}
      />
      <div data-testid="prefill">{prefill}</div>
    </>
  )
}

describe('CoverageGaps', () => {
  it('renders uncovered biomarkers and supports remove/search actions', async () => {
    const user = userEvent.setup()
    renderWithIntl(<Harness />)

    expect(
      screen.getByRole('heading', { name: 'Coverage gaps' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Alanine aminotransferase')).toBeInTheDocument()
    expect(screen.getByText('ALT')).toBeInTheDocument()

    const altRow = screen.getByText('ALT').closest('li')
    if (!altRow) throw new Error('Expected ALT row to render')
    await user.click(within(altRow).getByRole('button', { name: 'Remove from panel' }))

    expect(screen.queryByText('ALT')).not.toBeInTheDocument()

    const astRow = screen.getByText('AST').closest('li')
    if (!astRow) throw new Error('Expected AST row to render')
    await user.click(within(astRow).getByRole('button', { name: 'Search alternatives' }))

    expect(screen.getByTestId('prefill')).toHaveTextContent('AST')
  })

  it('does not render when there are no uncovered biomarkers', () => {
    renderWithIntl(
      <CoverageGaps
        uncovered={[]}
        displayNameFor={displayNameFor}
      />,
    )

    expect(
      screen.queryByRole('heading', { name: 'Coverage gaps' }),
    ).not.toBeInTheDocument()
  })

  it('uses correct Polish plural form for counts of five or more', () => {
    renderWithIntl(
      <CoverageGaps
        uncovered={['ALT', 'AST', 'CHOL', 'GLU', 'HDL']}
        displayNameFor={displayNameFor}
      />,
      { locale: 'pl', messages: plMessages },
    )

    expect(
      screen.getByRole('heading', { name: 'Braki pokrycia' }),
    ).toBeInTheDocument()
    expect(document.body.textContent).toContain('5 badań nie jest teraz dostępnych')
  })
})
