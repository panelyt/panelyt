import { fireEvent, screen } from '@testing-library/react'
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
  it('opens with saved lists and keeps the menu layered above content', () => {
    renderWithIntl(
      <LoadMenu lists={sampleLists} isLoading={false} onSelect={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /load/i }))

    const menu = screen.getByRole('menu', { name: /saved lists/i })
    expect(menu).toBeInTheDocument()
    expect(menu).toHaveClass('z-30')
    expect(screen.getByText('Metabolic panel')).toBeInTheDocument()
  })
})
