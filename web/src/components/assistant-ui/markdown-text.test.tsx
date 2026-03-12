import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { defaultComponents } from './markdown-text'

describe('default markdown components', () => {
    it('preserves soft line breaks in paragraphs', () => {
        const Paragraph = defaultComponents.p
        const { container } = render(<Paragraph>first line{'\n'}second line</Paragraph>)
        const paragraph = container.querySelector('p')

        expect(paragraph).toBeTruthy()
        expect(paragraph?.className).toContain('whitespace-pre-wrap')
    })

    it('does not force pre-wrap on list items', () => {
        const ListItem = defaultComponents.li
        const { container } = render(<ListItem>item</ListItem>)
        const item = container.querySelector('li')

        expect(item).toBeTruthy()
        expect(item?.className).not.toContain('whitespace-pre-wrap')
    })
})
