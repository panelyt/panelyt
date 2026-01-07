import { renderWithIntl } from '../../../test/utils'
import { PriceRangeSparkline } from '../price-range-sparkline'

describe('PriceRangeSparkline', () => {
  it('disables marker transitions for reduced motion', () => {
    const { getByTestId } = renderWithIntl(
      <PriceRangeSparkline currentPrice={1200} minPrice={1000} isDark />,
    )

    expect(getByTestId('price-gauge-marker')).toHaveClass('motion-reduce:transition-none')
  })
})
