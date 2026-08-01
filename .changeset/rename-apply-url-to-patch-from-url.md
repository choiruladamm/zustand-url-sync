---
"zustand-url-sync": patch
---

Rename `urlSync.applyUrl(url)` to `urlSync.patchFromUrl(url)`. The method only ever parsed the URL string and patched the store — it never wrote to the URL bar — so the new name matches what the call actually does. Signature is identical. Update any direct callers.
