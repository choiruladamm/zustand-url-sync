import {
  createFiltersStore,
  createViewStore,
  Demo,
  type UrlSource,
  urlSyncApi,
} from '@example/shared'
import type { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import { nextPagesRouterAdapter } from 'zustand-url-sync/adapters/next'

/**
 * Same shape as the App Router example, and for the same two reasons: `useRouter()` is a hook, so
 * the adapter cannot exist before a component renders; and the server has no `window`, so it reads
 * the URL from `initialUrl` instead. The cache is browser-only because one Node process serves
 * concurrent requests.
 */
type Stores = {
  useFilters: ReturnType<typeof createFiltersStore>
  useView: ReturnType<typeof createViewStore>
}

let browserStores: Stores | undefined

const build = (source: UrlSource): Stores => ({
  useFilters: createFiltersStore(source),
  useView: createViewStore(source),
})

function useStores(
  router: Parameters<typeof nextPagesRouterAdapter>[0],
  initialUrl: string,
): Stores {
  if (typeof window === 'undefined') return build({ initialUrl })
  browserStores ??= build({ adapter: nextPagesRouterAdapter(router) })
  return browserStores
}

let renders = 0

export const getServerSideProps: GetServerSideProps<{
  serverStamp: string
  initialUrl: string
}> = async (context) => {
  renders += 1
  return {
    props: { serverStamp: String(renders), initialUrl: context.resolvedUrl },
  }
}

export default function Page({
  serverStamp,
  initialUrl,
}: {
  serverStamp: string
  initialUrl: string
}) {
  const router = useRouter()
  const { useFilters, useView } = useStores(router, initialUrl)

  return (
    <Demo
      adapter="nextPagesRouterAdapter"
      useFilters={useFilters}
      useView={useView}
      filtersApi={urlSyncApi(useFilters)}
      serverStamp={serverStamp}
    />
  )
}
