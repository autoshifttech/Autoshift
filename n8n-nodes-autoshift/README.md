# n8n-nodes-autoshift

One n8n node for the AutoShift API. It uses an AutoShift API key, so it can do only what that
key's owner can do in the app (read-only keys cannot change anything).

| Resource | Operations |
| --- | --- |
| Assistant | Get many, Get, Switch on or off, Test a reply (costs one AI reply, never charged twice for the same key) |
| Wallet | Get balance, Get ledger |
| Plan | Get many |
| Subscription | Get |

## Install

```bash
npm install && npm run build
# then in your n8n: install the folder as a community node, or copy dist/ into ~/.n8n/custom
```

Create an API key in AutoShift, then in n8n add an **AutoShift API** credential with your API URL and the key.

## Workflows

`workflows/*.json` import with n8n's **Import from file**. After importing, open each AutoShift node and pick your credential.

- `low-wallet-alert.json`: every morning, alert when the wallet is under ₹500.
- `try-an-assistant.json`: send one test message to an assistant.
- `weekly-plan-check.json`: every Monday, flag a workspace still on its trial.

## AutoShift Trigger

Starts a workflow when something happens: wallet topped up, wallet refunded, subscription updated.
Activating the workflow registers the webhook with AutoShift for you; deactivating removes it. Every
delivery is signed (HMAC-SHA256 over `timestamp.body`) and the trigger rejects bad signatures and anything older
than five minutes. The API key must have **read and change** access. `workflows/wallet-topped-up.json` is an example.

AutoShift retries a failed delivery after 1, 5, 30 minutes, 2 and 6 hours, then gives up. Webhook URLs must be public `https` addresses.

## Not included yet

Events for new WhatsApp messages and contacts, and nodes to send WhatsApp messages: those features still run in the Next app, not the backend.
