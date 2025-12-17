import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { LoadMenu } from '../load-menu'

const sampleLists = [
  {
    id: '1',
    name: 'Metabolic panel',
    biomarkers: [{ code: 'ALT', display_name: 'Alanine aminotransferase' }],
    created_at: '',
    updated_at: '',
    is_public: false,
    share_token: null,
    owner_id: 'user-1',
  },
]

describe('LoadMenu', () => {
  it('opens with saved lists and keeps the menu layered above content', () => {
    render(<LoadMenu lists={sampleLists} isLoading={false} onSelect={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /load/i }))

    const menu = screen.getByRole('menu', { name: /saved lists/i })
    expect(menu).toBeInTheDocument()
    expect(menu).toHaveClass('z-30')
    expect(screen.getByText('Metabolic panel')).toBeInTheDocument()
  })
})
