/**
 * The wait between sending a question and the first token of the answer.
 *
 * That wait is long here — the model reads one to three documents before it
 * writes anything — so the gap needs to say "working", not "broken". Three
 * bars of unequal width read as a paragraph about to appear.
 *
 * The sweep is CSS, defined in globals.css, where the reduced-motion query
 * that stops it also lives. Stopped, the bars stay visible and still say the
 * same thing; only the movement goes.
 */
export function AnswerShimmer() {
  return (
    <div aria-hidden="true" className="w-full space-y-2 py-1">
      <div className="assistant-shimmer h-3 w-full rounded-full" />
      <div className="assistant-shimmer h-3 w-[86%] rounded-full" />
      <div className="assistant-shimmer h-3 w-[52%] rounded-full" />
    </div>
  )
}
