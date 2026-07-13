# TON Address Converter

Read-only TON testnet tool: convert raw and friendly addresses, toggle bounceable and testnet flags, validate formats, and look up live account state from the toncenter testnet API.

## Framework

`preact-vite` — Preact 10 with `@preact/preset-vite` on Vite 6. TypeScript end-to-end. No wallet SDK, no heavy crypto dependencies.

## Folder structure

```
ton-address-tool/
├── .framework                # framework marker (preact-vite)
├── .npmrc                    # verify-deps-before-run=false
├── index.html                # Vite entry, mounts #app
├── package.json              # dev / build / preview scripts
├── tsconfig.json             # TS with jsxImportSource=preact
├── vite.config.ts            # uses @preact/preset-vite
└── src/
    ├── main.tsx              # render(<App />, #app)
    ├── app.tsx               # UI: form, conversions, live lookup
    ├── index.css             # styling
    └── ton.ts                # all address logic: parse, build, CRC16, API
```

All TON logic lives in `src/ton.ts`:
- `crc16` — CRC16-CCITT used for the friendly form checksum
- `base64UrlEncode` / `base64UrlDecode` — uses the URL-safe alphabet (no `=`)
- `detectKind` — distinguishes friendly vs raw input
- `parseFriendly` / `parseRaw` — decode into `{ workchain, hash, bounceable, testnet }`
- `buildFriendly` — encode back to the 48-char base64url form with the right tag byte (bounceable `0x11`, non-bounceable `0x51`, testnet flag `0x40`)
- `formatRaw` — produce `wc:hash64`
- `fetchAccountState` — calls `/getAddressInformation` on the testnet endpoint

## Testnet endpoint

Tonicnter v2 testnet (no API key required for read calls):

```
https://testnet.toncenter.com/api/v2/getAddressInformation?address=<addr>
```

Response shape: `{ ok: true, result: { balance, state, code, data, last_transaction_lt } }`.

## Run

```bash
pnpm install
pnpm dev      # http://localhost:5173
pnpm build    # tsc -b && vite build
pnpm preview  # serve dist/
```

## Features

- Parse either friendly (48-char base64url) or raw (`wc:hash64`) input
- Validate CRC16 checksum on friendly input
- Display workchain, hash, bounceable flag, network (mainnet/testnet)
- Render all four friendly variants: bounceable/mainnet, non-bounceable/mainnet, bounceable/testnet, non-bounceable/testnet
- Render the raw form
- Toggle bounceable and testnet flags live
- Look up live balance and state from toncenter testnet
- Copy buttons on every output
- Handles loading + error states
