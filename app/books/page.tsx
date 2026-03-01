import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Recommended Books',
  description:
    'Books on leadership, software engineering, and management that I recommend.',
}

const bookCategories = [
  {
    title: 'Leadership',
    books: [
      {
        title: 'Extreme Ownership',
        author: 'Jocko Willink & Leif Babin',
        url: 'https://www.barnesandnoble.com/w/extreme-ownership-jocko-willink/1121081209',
      },
      {
        title: 'The Obstacle Is the Way',
        author: 'Ryan Holiday',
        url: 'https://www.barnesandnoble.com/w/the-obstacle-is-the-way-ryan-holiday/1118482432',
      },
      {
        title: 'Stillness Is the Key',
        author: 'Ryan Holiday',
        url: 'https://www.barnesandnoble.com/w/stillness-is-the-key-ryan-holiday/1130068915',
      },
      {
        title: 'Ego Is the Enemy',
        author: 'Ryan Holiday',
        url: 'https://www.barnesandnoble.com/w/ego-is-the-enemy-ryan-holiday/1122680805',
      },
      {
        title: 'Multipliers',
        author: 'Liz Wiseman',
        url: 'https://www.barnesandnoble.com/w/multipliers-revised-and-updated-liz-wiseman/1124435198',
      },
      {
        title: 'Turn the Ship Around!',
        author: 'L. David Marquet',
        url: 'https://www.barnesandnoble.com/w/turn-the-ship-around-l-david-marquet/1115459209',
      },
    ],
  },
  {
    title: 'Software Engineering',
    books: [
      {
        title: 'Code Complete',
        author: 'Steve McConnell',
        url: 'https://www.barnesandnoble.com/w/code-complete-steve-mcconnell/1100354307',
      },
      {
        title: 'Release It!',
        author: 'Michael T. Nygard',
        url: 'https://www.barnesandnoble.com/w/release-it-michael-t-nygard/1111870490',
      },
      {
        title: 'Microservices Patterns',
        author: 'Chris Richardson',
        url: 'https://www.barnesandnoble.com/w/microservices-patterns-chris-richardson/1127841408',
      },
    ],
  },
  {
    title: 'Management',
    books: [
      {
        title: "The Manager's Path",
        author: 'Camille Fournier',
        url: 'https://www.barnesandnoble.com/w/the-managers-path-camille-fournier/1125298642',
      },
      {
        title: 'The Making of a Manager',
        author: 'Julie Zhuo',
        url: 'https://www.barnesandnoble.com/w/the-making-of-a-manager-julie-zhuo/1128003975',
      },
      {
        title: 'Engineering Management for the Rest of Us',
        author: 'Sarah Drasner',
        url: 'https://www.barnesandnoble.com/w/engineering-management-for-the-rest-of-us-sarah-drasner/1142398485',
      },
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
              <ul className="space-y-3">
                {category.books.map((book) => (
                  <li
                    key={book.title}
                    className="pl-4 border-l-2 border-border"
                  >
                    <Link
                      href={book.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline underline-offset-2 decoration-primary/40 hover:decoration-primary transition-colors"
                    >
                      {book.title}
                    </Link>
                    <span className="text-muted-foreground text-sm ml-2">
                      by {book.author}
                    </span>
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
