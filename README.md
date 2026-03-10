# El Solar - Vacation Rentals on Solana

A fullstack vacation rental dApp for a family property in the Colombian Andes. Guests book stays and pay with USDC through a trustless escrow system on Solana without middleman.

**See [../../README.md](../../README.md) for full project context.**

## Overview

El Solar combines a **Next.js frontend**, an **Anchor/Rust smart contract** on Solana, and a **Supabase (PostgreSQL) backend** into a three-tier architecture where each layer has a distinct responsibility:

- **Blockchain (Solana):** Holds funds in escrow, enforces payment rules, handles releases and refunds via PDAs
- **Database (Supabase):** Prevents double bookings (exclusion constraints), tracks booking status, stores transaction signatures linking on-chain and off-chain data
- **Frontend (Next.js):** Orchestrates both. Wallet signing happens client-side, database operations run through server-side API routes

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js 16)                     │
│  React 19 · TypeScript · Tailwind CSS · shadcn/ui           │
│  Wallet Adapter · Anchor Client · TanStack Query v5         │
├──────────────────────┬──────────────────────────────────────┤
│   Client-side        │   Server-side (API Routes)           │
│   Wallet signing     │   Supabase queries                   │
│   Blockchain reads   │   Booking CRUD                       │
│   PDA derivation     │   Availability checks                │
└──────────┬───────────┴───────────────┬──────────────────────┘
           │                           │
           ▼                           ▼
┌─────────────────────┐   ┌──────────────────────────────┐
│  Solana (devnet)    │   │  Supabase (PostgreSQL)       │
│                     │   │                              │
│  rental_escrow      │   │  bookings table              │
│  ├─ initialize      │   │  ├─ exclusion constraints    │
│  ├─ release_payment │   │  ├─ status tracking          │
│  └─ cancel_booking  │   │  └─ tx_signature linking     │
│                     │   │                              │
│  PDA escrow accounts│   │  Double-booking prevention   │
│  USDC token custody │   │  Off-chain booking records   │
└─────────────────────┘   └──────────────────────────────┘
```

## Features

- **Escrow-based payments** — Guest USDC is locked in a PDA-controlled escrow account until the check-in date, then released to the owner. No trust required.
- **Cancellation with refunds** — Guests can cancel before check-in. USDC is refunded via CPI, the escrow account is closed, and the PDA is freed for rebooking.
- **Double-booking prevention** — PostgreSQL exclusion constraints at the database level ensure no overlapping reservations per apartment, independent of the blockchain.
- **On-chain ↔ off-chain linking** — Transaction signatures are stored in Supabase, connecting every booking record to its Solana Explorer proof.
- **Property listings** — 4 rooms + 1 apartment with image carousels, feature lists, shared amenities, and per-night USDC pricing.
- **Guest bookings page** — Wallet-connected guests see their booking history with status categories (upcoming, active, completed) and direct links to Solana Explorer.
- **Admin dashboard** — Owner-only view of all active escrows with one-click payment release after check-in date.
- **SEO & Open Graph** — Metadata, OG images, and social preview tags for link sharing.
- **CI/CD** — GitHub Actions pipeline runs Anchor tests on every push/PR to `main`.

## Project Structure

```
rental_escrow/
├── README.md                              # This file
├── Anchor.toml                            # Anchor workspace config
├── .github/
│   └── workflows/
│       └── test.yml                       # CI: Anchor tests on push/PR
│
├── app/                                   # Next.js frontend
│   ├── app/
│   │   ├── layout.tsx                     # Root layout, providers, metadata
│   │   ├── page.tsx                       # Property listing page
│   │   ├── properties/[id]/page.tsx       # Individual property + booking
│   │   ├── bookings/page.tsx              # Guest bookings history
│   │   ├── admin/page.tsx                 # Owner dashboard
│   │   └── api/bookings/
│   │       ├── route.ts                   # GET, POST, PATCH, DELETE bookings
│   │       ├── availability/route.ts      # POST: check date conflicts
│   │       ├── booked-dates/route.ts      # GET: disabled calendar dates
│   │       └── guest/route.ts             # GET: bookings by wallet
│   ├── components/
│   │   ├── BookingCard.tsx                # Date picker + escrow creation
│   │   ├── GuestBookings.tsx              # Booking card with cancel/view tx
│   │   ├── PropertyCard.tsx               # Property listing card
│   │   ├── ImageCarousel.tsx              # Multi-image viewer
│   │   ├── NavBar.tsx                     # Navigation + wallet button
│   │   ├── Footer.tsx                     # Social links
│   │   └── ui/                            # shadcn/ui primitives
│   ├── hooks/
│   │   ├── useRentalProgram.ts            # Anchor program, PDA derivation, RPCs
│   │   ├── useEscrowQueries.ts            # Admin: escrow reads + release mutation
│   │   ├── useGuestBookings.ts            # Guest: merged on-chain + DB data
│   │   └── useBookingAPI.ts               # Supabase API route calls
│   ├── provider/
│   │   ├── SolanaWalletProvider.tsx        # Wallet adapter config
│   │   └── QueryProvider.tsx              # TanStack Query setup
│   ├── lib/
│   │   ├── idl/rental_escrow.json         # Anchor IDL (auto-generated)
│   │   ├── types/rental_escrow.ts         # TypeScript program bindings
│   │   ├── properties.ts                  # Property data (5 listings)
│   │   ├── supabase/initSupabase.ts       # Server-side Supabase client
│   │   └── utils.ts                       # Helpers
│   └── README.md                          # Frontend-specific docs
│
├── programs/rental_escrow/                # Anchor program (Rust)
│   ├── src/lib.rs                         # All instructions + state + errors
│   └── README.md                          # On-chain-specific docs
├── supabase/
│   └── schema.sql                         # Database schema (run in Supabase SQL Editor)
└── tests/
    └── rental_escrow.ts                   # Anchor/Mocha integration tests
```

## Prerequisites

- **Node.js** 20+ and **bun** (or npm)
- **Rust** (`rustup update`)
- **Solana CLI** 3.0+ (`solana --version`)
- **Anchor CLI** 0.31+ (`anchor --version`)
- A **Solana wallet** browser extension (Phantom, Solflare, etc.)

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/ChristianCL92/rental_escrow.git
cd rental_escrow
npm install && cd app && bun install && cd ..
```

### 2. Configure Solana

```bash
solana config set --url devnet
```

### 3. Build and deploy the program

```bash
anchor build
anchor deploy
```

Update the program ID in `Anchor.toml` and `app/lib/idl/rental_escrow.json` → `"address"` field if it changes.

### 4. Set environment variables

Create `app/.env.local`:

```env
# Client-side (exposed to browser)
NEXT_PUBLIC_OWNER_ADDRESS=<owner_solana_pubkey>
NEXT_PUBLIC_USDC_MINT_ADDRESS=<devnet_usdc_mint>
NEXT_PUBLIC_SUPABASE_URL=<supabase_project_url>

# Server-side only (never exposed to browser)
SUPABASE_SERVICE_ROLE_KEY=<supabase_service_role_key>
```

> For production (Vercel), set these in the dashboard under Settings → Environment Variables. `.env` files are local-only.

### 5. Run the frontend

```bash
cd app
bun dev
```

Open [http://localhost:3000](http://localhost:3000) and connect your wallet.

### 6. Test the booking flow

1. Connect a Solana wallet with devnet USDC
2. Browse properties and select dates
3. Create an escrow (locks USDC on-chain + creates pending booking in DB)
4. After check-in date, the owner releases payment from the admin dashboard
5. Verify the transaction on [Solana Explorer](https://explorer.solana.com/?cluster=devnet)

## Developer Workflows

### Frontend

```bash
cd app
bun dev          # Dev server with hot reload
bun run build    # Production build
bun run lint     # ESLint
```

### On-Chain

```bash
anchor build     # Compile Rust program
anchor test      # Build + deploy to localnet + run tests
anchor deploy    # Deploy to configured cluster
```

After program changes, copy the updated IDL and TypeScript types:

```bash
cp target/idl/rental_escrow.json app/lib/idl/
cp target/types/rental_escrow.ts app/lib/types/
```

## Key Concepts

### Program Derived Addresses (PDAs)

Escrow accounts use seeds `[b"escrow", guest_pubkey, apartment_id_le_u64]`, ensuring one unique escrow per guest–apartment pair. The PDA acts as authority over the escrow's token account, enabling CPI transfers without a private key.

### Three-Tier Orchestration

Blockchain operations (wallet signing, escrow creation) must happen **client-side**. Database operations (booking records, availability checks) run through **server-side API routes** to protect Supabase credentials. The frontend orchestrates both in sequence — for example, a booking first creates a pending DB record, then submits the on-chain transaction, then updates the DB with the transaction signature.

### Token Flow

1. **Book:** Guest USDC → escrow token account (PDA authority)
2. **Release:** Escrow token account → owner token account (CPI with PDA signer seeds)
3. **Cancel:** Escrow token account → guest token account (refund CPI + account closure)

### React Query Caching

TanStack Query v5 manages all async state with stable `queryKey`s (`['escrows']`, `['guest-booking', wallet]`) and automatic cache invalidation on mutation success.

## CI/CD

GitHub Actions runs the full Anchor test suite on every push to `main` and on pull requests. The workflow installs Solana CLI, Anchor CLI, and uses a stored keypair secret (`SOLANA_KEYPAIR`) that matches the hardcoded owner pubkey in the program.

```
Push/PR to main → Install toolchain → Setup wallet → anchor test
```

## Environment Variables

| Variable                        | Scope  | Purpose                                    |
| ------------------------------- | ------ | ------------------------------------------ |
| `NEXT_PUBLIC_OWNER_ADDRESS`     | Client | Owner wallet for UI gating + program calls |
| `NEXT_PUBLIC_USDC_MINT_ADDRESS` | Client | USDC token mint on target cluster          |
| `NEXT_PUBLIC_SUPABASE_URL`      | Client | Supabase project URL                       |
| `SUPABASE_SERVICE_ROLE_KEY`     | Server | Supabase admin key (API routes only)       |
| `SOLANA_KEYPAIR`                | CI     | GitHub Actions secret for test wallet      |

## On-Chain Program

**Program ID:** `2mGptfx2M9rTGsGExE9T3yLZ6MHSXLcgiQjD1NoVsfVa`

Three instructions with hardcoded security constraints (owner pubkey, apartment ID range 1–5, minimum payment, future rent time):

| Instruction       | Signer | What it does                                                          |
| ----------------- | ------ | --------------------------------------------------------------------- |
| `initialize`      | Guest  | Creates escrow PDA, transfers USDC from guest to escrow token account |
| `release_payment` | Owner  | After check-in date, CPI transfers USDC from escrow to owner          |
| `cancel_booking`  | Guest  | Before check-in, refunds USDC to guest and closes the escrow account  |

See [programs/rental_escrow/README.md](./programs/rental_escrow/README.md) for account layout, CPI patterns, and testing.

## Demo

> Connect any Solana wallet to test the booking flow on devnet.

> Want to test the full flow? Reach out and I'll send you devnet USDC — [LinkedIn](https://www.linkedin.com/in/chrlono/)

## Documentation

- **[Frontend docs](./app/README.md)** — Next.js setup, component architecture, hooks
- **[On-chain docs](./programs/rental_escrow/README.md)** — Anchor program internals, account layout, testing patterns

## Troubleshooting

**"Program not initialized" error**

- Verify the program is deployed and the IDL address in `app/lib/idl/rental_escrow.json` matches the deployed program ID.

**"Wallet not connected" during token operations**

- Ensure the browser wallet extension is unlocked and set to the correct Solana cluster (devnet).

**"Account is not executable"**

- The program ID in the IDL doesn't match the deployed program. Re-run `anchor deploy` and update the address.

**Dates not disabled in calendar**

- Check that the Supabase environment variables are set and the `bookings` table has the correct exclusion constraint.

**Mobile wallet issues**

- Wallet-connected dApps must be accessed through the wallet's built-in browser (e.g., Phantom browser), not an external mobile browser.

## License

MIT
