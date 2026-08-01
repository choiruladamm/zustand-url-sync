import { Suspense } from 'react'
import { Client } from './client'

// Never cached: the point of the `serverStamp` is that it changes when the server re-runs, so a
// cached render would make a `shallow: false` write look identical to a shallow one.
export const dynamic = 'force-dynamic'

let renders = 0

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  renders += 1

  // The server has no `window`, so the store reads the URL from here instead. Without it the server
  // would render defaults and the browser would render the deep link.
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) for (const one of value) query.append(key, one)
    else if (value !== undefined) query.set(key, value)
  }
  const search = query.toString()

  return (
    <Suspense>
      <Client serverStamp={String(renders)} initialUrl={search === '' ? '/' : `/?${search}`} />
    </Suspense>
  )
}
