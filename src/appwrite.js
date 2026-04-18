import { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID } from '../appwrite-config.js'

const { Client, Account, Databases, Realtime } = Appwrite

const client = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID)

export const account   = new Account(client)
export const databases = new Databases(client)
export const realtime  = client

// Subscribe to a document and call handler on every change.
// Returns an unsubscribe function.
export function subscribeDoc(dbId, collectionId, docId, handler) {
  const channel = `databases.${dbId}.collections.${collectionId}.documents.${docId}`
  return realtime.subscribe(channel, event => {
    handler(event.payload)
  })
}

// Subscribe to an entire collection.
export function subscribeCollection(dbId, collectionId, handler) {
  const channel = `databases.${dbId}.collections.${collectionId}.documents`
  return realtime.subscribe(channel, event => {
    handler(event.payload, event.events)
  })
}
