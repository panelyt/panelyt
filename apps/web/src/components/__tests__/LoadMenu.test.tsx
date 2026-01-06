import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { LoadMenu } from '../load-menu'
import { renderWithIntl } from '../../test/utils'

const sampleLists = [
  {
    id: '1',
    name: 'Metabolic panel',
    biomarkers: [
      {
        id: 'entry-1',
        code: 'ALT',
        display_name: 'Alanine aminotransferase',
        sort_order: 0,
        biomarker_id: null,
        created_at: '',
      },
    ],
    created_at: '',
    updated_at: '',
    share_token: null,
    shared_at: null,
    notify_on_price_drop: false,
    last_known_total_grosz: null,
    last_total_updated_at: null,
    last_notified_total_grosz: null,
    last_notified_at: null,
  },
]

describe('LoadMenu', () => {
  it('opens and allows selecting a saved list', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    renderWithIntl(
      <LoadMenu lists={sampleLists} isLoading={false} onSelect={onSelect} />,
    )

    await user.click(screen.getByRole('button', { name: /load/i }))

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByText(/saved lists/i)).toBeInTheDocument()

    const listItem = screen.getByRole('menuitem', { name: /metabolic panel/i })
    expect(listItem).toBeInTheDocument()

    await user.click(listItem)

    expect(onSelect).toHaveBeenCalledWith(sampleLists[0])
  })
})
