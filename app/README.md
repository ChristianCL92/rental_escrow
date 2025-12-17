# Frontend: Rental Escrow UI

This is the Next.js frontend for the Rental Escrow system. It provides a web interface for guests to create escrows and owners to release payments.

**See [../README.md](../README.md) for full project context and quick start.**

## Tech Stack

- **Next.js 16** (React 19, App Router)
- **TypeScript** for type safety
- **Tailwind CSS** + shadcn/ui for styling
- **@solana/wallet-adapter-react** for wallet integration
- **@coral-xyz/anchor** for on-chain program interaction
- **@tanstack/react-query** for server state & caching
- **date-fns** for date handling

## Directory Structure

```
app/
├── hooks/
│   ├── useRentalProgram.ts      # Anchor program calls, PDA derivation
│   ├── useEscrowQueries.ts      # React Query hooks for escrow data
│   └── useGuestBookings.ts      # Guest booking queries
├── provider/
│   ├── QueryProvider.tsx        # React Query setup
│   └── SolanaWalletProvider.tsx # Wallet adapter setup
├── components/
│   ├── BookingCard.tsx
│   ├── GuestBookings.tsx
│   ├── PropertyCard.tsx
│   ├── NavBar.tsx
│   └── ui/                      # shadcn/ui components
├── lib/
│   ├── idl/rental_escrow.json   # Program IDL (auto-generated)
│   ├── types/rental_escrow.ts   # TypeScript bindings (auto-generated)
│   ├── properties.ts            # Property data
│   └── utils.ts                 # Helper functions
└── page.tsx, layout.tsx         # Root pages
```

## Getting Started

### 1. Install dependencies
```bash
npm install
# or
bun install
```

### 2. Set environment variables
Create `.env.local` in the `app/` directory:
```env
NEXT_PUBLIC_OWNER_ADDRESS=<owner_solana_pubkey>
NEXT_PUBLIC_USDC_MINT_ADDRESS=<usdc_mint_address>
```

### 3. Run dev server
```bash
npm run dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Key Features

### Wallet Integration
Uses `@solana/wallet-adapter-react` with browser-based wallets (Phantom, Solflare, etc.). The `SolanaWalletProvider` wraps the entire app.

### Escrow Queries (`useEscrowQueries.ts`)
- Fetches all escrow accounts owned by the current user (if owner)
- Mutations for releasing payments
- Cache invalidation on success using React Query

### Program Interaction (`useRentalProgram.ts`)
- Initializes Anchor Provider with connected wallet
- Derives PDAs for escrow accounts: `[b"escrow", guest_pubkey, apartment_id_le_u64]`
- Converts between UI amounts and USDC integers (USDC_DECIMALS = 6)
- Encapsulates all Anchor RPC calls

### Token Account Management
Uses `@solana/spl-token` to:
- Create associated token accounts idempotently
- Transfer USDC between accounts
- Handle token account authority and delegation

## Development Workflows

### Run dev server with hot reload
```bash
npm run dev
```

### Build for production
```bash
npm run build
npm start
```

### Lint code
```bash
npm run lint
```

## Code Patterns

### Using Escrow Queries
```tsx
import useEscrowQueries from '@/hooks/useEscrowQueries';

export default function AdminPanel() {
  const { escrows, isLoading, releasePayment } = useEscrowQueries();

  return (
    <div>
      {escrows.map(escrow => (
        <button
          key={escrow.publicKey.toString()}
          onClick={() => releasePayment({ apartmentId: escrow.apartmentId, guestAddress: escrow.guestAddress })}
        >
          Release Payment
        </button>
      ))}
    </div>
  );
}
```

### Creating an Escrow
```tsx
const { createEscrow, createEscrowTokenAccount, OWNER_ADDRESS } = useRentalProgram();

// First, create the token account
const tokenAccountSig = await createEscrowTokenAccount(apartmentId);

// Then, create the escrow and transfer USDC
const escrowSig = await createEscrow({
  apartmentId,
  amount: 500, // UI amount (converted to USDC internally)
  checkInDate: new Date('2025-01-15'),
  ownerAddress: OWNER_ADDRESS,
  usdcMint,
});
```

## Styling

This project uses **Tailwind CSS** with the shadcn/ui component library. Customize colors and theme in `tailwind.config.ts`.

## Testing

### Manual testing
1. Connect wallet to frontend
2. Create an escrow (guest side)
3. Wait for check-in date to pass
4. Release payment (owner side)
5. Verify USDC transfer on Solana Explorer

### Automated testing
Frontend tests can be added using Jest or Vitest. Currently focused on integration with on-chain program.

## Troubleshooting

**"Program not initialized" error**
- Ensure `.env.local` has correct `NEXT_PUBLIC_OWNER_ADDRESS` and `NEXT_PUBLIC_USDC_MINT_ADDRESS`
- Verify the Anchor program is deployed and IDL matches

**Wallet not connecting**
- Ensure browser extension wallet is installed and unlocked
- Check correct Solana cluster is selected in wallet (devnet/mainnet-beta)
- Try refreshing the page and reconnecting

**Token amount mismatch**
- USDC has 6 decimals; always use `toUSDCAmount()`/`fromUSDCAmount()` helpers in `useRentalProgram.ts`

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Anchor Book](https://www.anchor-lang.com/docs/intro)
- [Solana Web3.js](https://solana-labs.github.io/solana-web3.js/)
- [React Query Documentation](https://tanstack.com/query/latest)

## Related

- On-chain program: [../programs/rental_escrow/README.md](../programs/rental_escrow/README.md)
- Architecture & conventions: [../.github/copilot-instructions.md](../.github/copilot-instructions.md)
