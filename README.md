# Rental Escrow

A Solana-based rental escrow system combining a Next.js frontend with an Anchor on-chain program to securely manage guest deposits and payments.

## Overview

**Rental Escrow** enables property owners to securely hold guest deposits on Solana blockchain using USDC. Guests create escrow accounts, transfer USDC, and payments automatically release to owners when a check-in date is reached. The system uses **Program Derived Addresses (PDAs)** for account isolation and **Cross-Program Invocations (CPIs)** for safe token transfers.

### Architecture at a glance
```
Frontend (Next.js)           Anchor Program (Rust)           Solana Blockchain
─────────────────           ─────────────────────           ──────────────────
  React 19                    rental_escrow program          USDC token accounts
  Wallet adapter      ◄──►    - initialize (create escrow)   PDAs for escrow
  React Query                 - release_payment (CPI)        Devnet/Mainnet
```

## Project Structure

```
rental_escrow/
├── README.md                          # This file
│   
├── app/                               # Next.js frontend (React 19, TypeScript)
│   ├── hooks/
│   │   ├── useRentalProgram.ts        # Anchor program interaction, PDA derivation
│   │   └── useEscrowQueries.ts        # React Query for escrow reads/mutations
│   ├── provider/
│   │   ├── QueryProvider.tsx          # React Query config
│   │   └── SolanaWalletProvider.tsx   # Wallet adapter setup
│   ├── lib/
│   │   ├── idl/rental_escrow.json     # Anchor IDL (program interface)
│   │   └── types/rental_escrow.ts     # Generated TypeScript bindings
│   └── README.md                      # Frontend-specific documentation
├── programs/
│   └── rental_escrow/                 # Anchor program (Rust)
│       ├── Cargo.toml
│       ├── src/lib.rs                 # Program logic (initialize, release_payment)
│       └── README.md                  # On-chain-specific documentation
└── tests/                             # Anchor/Mocha integration tests
    └── rental_escrow.ts
```

## Prerequisites

- **Node.js** 18+ and **bun** (or npm/yarn)
- **Anchor CLI** (`anchor --version` to check; install via [Anchor docs](https://www.anchor-lang.com/docs/installation))
- **Solana CLI** (`solana --version` to check; install via [Solana docs](https://docs.solana.com/cli/installation))
- **Rust** (required for Anchor; `rustup update` to ensure latest)
- A **Solana wallet** (e.g., Phantom, Solflare) for local testing

## Quick Start

### 1. Clone and install dependencies
```bash
git clone https://github.com/ChristianCL92/rental_escrow.git
cd rental_escrow
npm install && cd app && npm install && cd ..
```

### 2. Configure Solana cluster (devnet example)
```bash
solana config set --url devnet
```

### 3. Build and deploy the Anchor program
```bash
anchor build
anchor deploy
```
Copy the program ID from the output and update:
- `Anchor.toml`: `cluster = "devnet"` (if deploying to devnet)
- `app/lib/idl/rental_escrow.json`: `"address"` field
- `.env.local` (see step 4)

### 4. Set up environment variables
Create `app/.env.local`:
```env
NEXT_PUBLIC_OWNER_ADDRESS=<property_owner_solana_pubkey>
NEXT_PUBLIC_USDC_MINT_ADDRESS=<devnet_usdc_mint_address>
# Devnet USDC mint: EPjFWdd5Au17qzZvtQZkL3jjZkfB6z4kaBarNWy74yp (when targeting devnet-equivalent)
```

### 5. Run the frontend
```bash
cd app
npm run dev  # or: bun dev
```
Open [http://localhost:3000](http://localhost:3000) and connect your wallet.

### 6. Test the flow
- **Create Escrow**: Guest enters amount, check-in date, and creates an escrow account.
- **Release Payment**: After check-in date, owner can release USDC to their token account.

## Developer Workflows

### Frontend Development
```bash
cd app
npm run dev      # Start Next.js dev server (hot reload)
npm run build    # Production build
npm run lint     # Run ESLint
```

### On-Chain Development
```bash
anchor build         # Compile Rust program
anchor test          # Run tests in sandbox
anchor deploy        # Deploy to configured cluster (devnet/mainnet)
```

After program changes, regenerate IDL:
```bash
cp target/idl/rental_escrow.json app/lib/idl/
# Optionally update TypeScript bindings if IDL structure changes
```

### Full Integration Testing
```bash
anchor test  # Builds program, runs tests/rental_escrow.ts
```

## Key Concepts

### Program Derived Addresses (PDAs)
Escrow accounts use seeds: `[b"escrow", guest_pubkey, apartment_id_le_u64]`. This ensures one unique escrow per guest–apartment pair.

### Token Flow
1. Guest creates escrow account and transfers USDC to an associated token account.
2. At release time, a **CPI (Cross-Program Invocation)** transfers USDC from escrow → owner's token account.
3. The escrow PDA acts as the token account authority (signer) for the final transfer.

### React Query Caching
The frontend uses `@tanstack/react-query` with stable `queryKey`s (e.g., `['escrows']`) and cache invalidation on mutation success. See `app/hooks/useEscrowQueries.ts`.

## Environment & Secrets

| Variable | Purpose | Example |
|----------|---------|---------|
| `NEXT_PUBLIC_OWNER_ADDRESS` | Owner's Solana wallet (for UI gating) | `8x...yz` |
| `NEXT_PUBLIC_USDC_MINT_ADDRESS` | USDC token mint on target chain | `Ep...yp` (devnet) |

> **Note:** Prefix `NEXT_PUBLIC_` makes these available in the browser; do not include sensitive keys here.

## Documentation by Component

- **[Frontend (app/README.md)](./app/README.md)**: Next.js setup, Wallet integration, component architecture
- **[On-Chain (programs/rental_escrow/README.md)](./programs/rental_escrow/README.md)**: Anchor program internals, account layout, testing

## Testing

### Unit & Integration Tests
```bash
anchor test  # Runs tests/rental_escrow.ts in sandbox (recommended)
```

### Manual / Smoke Tests
1. Start frontend: `cd app && npm run dev`
2. Connect wallet (Phantom, Solflare, etc.)
3. Create an escrow with a future check-in date
4. After check-in date passes, release payment as owner
5. Verify USDC appears in owner's token account on Solana Explorer

## Demo

🌐 **Live App:** (https://el-solar.vercel.app)

📹 **Admin Dashboard:** Only available to admin

>Connect any Solana wallet to test the booking flow on devnet.

> Want to test the full booking flow? Reach out and I'll send you devnet USDC — [LinkedIn](https://www.linkedin.com/in/chrlono/)

## Troubleshooting

**"Program not initialized" error in frontend**
- Ensure Anchor program is deployed and IDL address matches `app/lib/idl/rental_escrow.json`.
- Confirm wallet is connected.

**"Wallet not connected" during token operations**
- Check browser wallet extension is unlocked and connected.
- Ensure correct Solana cluster is selected in wallet (devnet/mainnet-beta).

**"Account is not executable" on-chain**
- Verify program ID in IDL matches deployed program ID.

## License

MIT License

---

**Questions?** See individual READMEs in `app/` and `programs/rental_escrow/`
