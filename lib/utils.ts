import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge reads any `text-*` it does not know as a text color, so
 * without this the fluid sizes in app/globals.css would knock out a color
 * class (and a color class would knock out them), and would sit beside
 * text-xl instead of replacing it.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['display', 'page-title', 'section-title'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
