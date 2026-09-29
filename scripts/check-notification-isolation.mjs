import assert from "node:assert/strict";
import {
  notificationStorageKey,
  pushAppNotification,
  readStoredNotifications,
  storeNotifications,
  NOTIFICATION_EVENT,
} from "../app/lib/notifications/client.ts";

const entries = new Map();
globalThis.localStorage = {
  getItem: key => entries.get(key) ?? null,
  setItem: (key, value) => entries.set(key, value),
  removeItem: key => entries.delete(key),
};
globalThis.window = new EventTarget();
const walletA = `0x${"a".repeat(40)}`;
const walletB = `0x${"b".repeat(40)}`;
const payload = { type: "watchlist", title: "Added", message: "Wallet A's market" };

entries.set("korum-notifications-v1", JSON.stringify([{ ...payload, id: "legacy", createdAt: new Date().toISOString(), read: false }]));
assert.deepEqual(readStoredNotifications(walletB), []);
assert.equal(entries.has("korum-notifications-v1"), false);

pushAppNotification(walletA, payload);
assert.equal(readStoredNotifications(walletA).length, 1);
assert.deepEqual(readStoredNotifications(walletB), []);
assert.deepEqual(readStoredNotifications(null), []);
assert.equal(readStoredNotifications(walletA.toUpperCase()).length, 1);

// A request started by A can finish after switching to B. Its owner stays A.
let eventOwner;
window.addEventListener(NOTIFICATION_EVENT, event => { eventOwner = event.detail.walletAddress; });
pushAppNotification(walletA, payload);
assert.equal(eventOwner, walletA);
assert.deepEqual(readStoredNotifications(walletB), []);

const notificationsA = readStoredNotifications(walletA);
storeNotifications(walletB, notificationsA);
assert.deepEqual(readStoredNotifications(walletB), []);
entries.set(notificationStorageKey(walletB), JSON.stringify(notificationsA));
assert.deepEqual(readStoredNotifications(walletB), []);
storeNotifications(walletB, []);
assert.equal(readStoredNotifications(walletA).length, 2);

storeNotifications(null, [{ ...notificationsA[0], type: "referral", walletAddress: null }]);
assert.equal(readStoredNotifications(null).length, 1);
assert.deepEqual(readStoredNotifications(walletB), []);
entries.set(notificationStorageKey(walletB), "invalid JSON");
assert.deepEqual(readStoredNotifications(walletB), []);
console.log("Notification isolation passed: legacy cleanup, wallet switching, disconnected scope, delayed events, case normalization and owner filtering.");
