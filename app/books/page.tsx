import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Recommended Books',
  description:
    'Books on leadership, software engineering, and management that I recommend.',
}

const bookCategories = [
  {
    title: 'Leadership',
    books: [
      'Extreme Ownership',
      'The Obstacle is the Way',
      'Stillness Is the Key',
      'Ego is the Enemy',
      'Multipliers',
      'Turn the Ship Around',
    ],
  },
  {
    title: 'Software Engineering',
    books: [
      'Code Complete',
      'Release It!',
      'Microservices Patterns: With examples in Java',
    ],
  },
  {
    title: 'Management',
    books: [
      "The Manager's Path",
      'The Making of a Manager',
      'Engineering Management for the Rest of Us',
    ],
  },
]

export default function BooksPage() {
  return (
    <div className="flex min-h-screen items-start justify-center">
      <div className="w-full max-w-3xl px-4 py-12 md:px-8">
        <h1
          className="font-bold mb-8"
          style={{ fontSize: 'clamp(1.75rem, 4vw + 0.25rem, 3rem)' }}
        >
          Recommended Books
        </h1>

        <div className="space-y-10">
          {bookCategories.map((category, i) => (
            <section
              key={category.title}
              className="animate-fade-in-up"
              style={{ '--index': i } as React.CSSProperties}
            >
              <h2 className="text-xl font-semibold mb-4">{category.title}</h2>
              <ul className="space-y-2">
                {category.books.map((book) => (
                  <li
                    key={book}
                    className="text-foreground/90 leading-relaxed pl-4 border-l-2 border-border"
                  >
                    {book}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
