# On-Chain Program: Rental Escrow

The Anchor/Rust program that manages escrow accounts and USDC transfers for the Rental Escrow system.

**See [../../README.md](../../README.md) for full project context.**

## Overview

The `rental_escrow` Anchor program implements two core instructions:

1. **`initialize`** — Create an escrow account and transfer USDC from guest to escrow
2. **`release_payment`** — Transfer USDC from escrow to owner (after check-in date)

All accounts use **Program Derived Addresses (PDAs)** with seeds `[b"escrow", guest_pubkey, apartment_id_le_u64]` for deterministic account derivation.

## Architecture

### Account Layout (`EscrowAccount`)
```rust
pub struct EscrowAccount {
    pub apartment_id: u64,           // Identifies the rental property
    pub amount: u64,                 // USDC amount (with 6 decimals)
    pub owner_address: Pubkey,       // Property owner's wallet
    pub guest_address: Pubkey,       // Guest's wallet (for PDA derivation)
    pub rent_time: u64,              // Unix timestamp of check-in date
    pub rent_started: bool,          // Payment released?
    pub rent_ended: bool,            // Final state after release
    pub reserved: [u8; 64],          // Space for future fields
}
```

### Data Flow

```
Guest creates escrow:
  1. Derive PDA: [b"escrow", guest_pubkey, apartment_id]
  2. Call initialize(amount, rent_time)
  3. Transfer USDC: guest_token_account → escrow_token_account

Owner releases payment:
  1. Call release_payment()
  2. Check: rent_time <= now && !rent_ended
  3. CPI transfer: escrow_token_account → owner_token_account (escrow signs)
```

## Prerequisites

- **Rust** (install via [rustup](https://rustup.rs/))
- **Anchor CLI** 0.31+ (install via `cargo install --git https://github.com/coral-xyz/anchor avm --locked && avm install latest && avm use latest`)
- **Solana CLI** (install via [docs.solana.com](https://docs.solana.com/cli/installation))
- **Node.js** 18+ (for tests)

## Building

### Compile the program
```bash
anchor build
```

Output: `target/deploy/rental_escrow.so` (the compiled program binary)

### Check for errors
```bash
anchor build --verifiable
```

## Testing

### Run Anchor tests (recommended)
```bash
anchor test
```
This:
1. Starts a local Solana validator
2. Deploys the program
3. Runs `tests/rental_escrow.ts` with Mocha

### Run specific test
```bash
anchor test -- --grep "initialize"
```

## Deploying

### Prerequisites
1. Ensure Solana cluster is set: `solana config set --url devnet`
2. Ensure wallet has SOL for deploy fees: `solana airdrop 2`

### Deploy to devnet
```bash
anchor deploy --provider.cluster devnet
```

### Deploy to mainnet-beta
```bash
solana config set --url mainnet-beta
anchor deploy
```

After deployment, update:
- `Anchor.toml` cluster setting
- `app/lib/idl/rental_escrow.json` — `"address"` field
- `.env.local` — `NEXT_PUBLIC_OWNER_ADDRESS`, `NEXT_PUBLIC_USDC_MINT_ADDRESS`

## Program Instructions

### `initialize(apartment_id: u64, amount: u64, rent_time: u64)`

**Purpose:** Create an escrow account and transfer USDC from guest to escrow.

**Accounts:**
- `escrow_account` (init, PDA) — The escrow account
- `escrow_token_account` (mut) — Associated token account for escrow (owns USDC)
- `guest_token_account` (mut) — Guest's USDC token account (source of funds)
- `guest` (signer) — Guest's wallet (pays for account creation & signs transaction)
- `owner` (unchecked) — Property owner's wallet (stored for later release)
- `usdc_mint` — USDC token mint
- `token_program` — Solana Token Program
- `system_program` — Solana System Program

**Logic:**
1. Initialize `EscrowAccount` with apartment_id, amount, owner, guest, rent_time
2. CPI transfer USDC from guest → escrow_token_account

### `release_payment()`

**Purpose:** Release USDC from escrow to owner (after check-in date).

**Accounts:**
- `escrow_account` (mut, PDA) — The escrow account (must match guest seed)
- `escrow_token_account` (mut) — Source of USDC
- `owner_token_account` (mut) — Owner's USDC token account (destination)
- `guest` (unchecked) — Guest address (used in PDA derivation)
- `usdc_mint` — USDC token mint
- `token_program` — Solana Token Program

**Logic:**
1. Require: `!escrow_account.rent_ended` (prevent double-release)
2. Require: `current_time >= escrow_account.rent_time` (check-in date passed)
3. Mark `rent_started = true`, `rent_ended = true`
4. CPI transfer USDC from escrow → owner (escrow PDA signs via signer seeds)

**Errors:**
- `PaymentAlreadyReleased` — Attempted to release twice
- `CheckInDateNotReached` — Check-in time hasn't arrived yet

## IDL Generation

The IDL (Interface Definition Language) is automatically generated when building:

```bash
anchor build
```

Output: `target/idl/rental_escrow.json`

Copy to frontend:
```bash
cp target/idl/rental_escrow.json ../app/lib/idl/
```

This IDL is used by the frontend to:
- Type-check Anchor RPC calls
- Auto-generate TypeScript bindings (in `app/lib/types/rental_escrow.ts`)

## Key Implementation Details

### PDA Derivation
```rust
let [escrow_pda, bump] = Pubkey::find_program_address(
    &[b"escrow", guest.key().as_ref(), apartment_id.to_le_bytes().as_ref()],
    program_id
);
```

**Why PDA?** Ensures one unique escrow per guest–apartment pair. Escrow PDA can authorize token transfers via signer seeds without storing a private key.

### Idempotent Token Account Creation
The frontend uses `createAssociatedTokenAccountIdempotentInstruction` to ensure the token account is created only if it doesn't exist. The program doesn't handle this; the frontend does before calling `initialize`.

### CPI for Token Transfer
```rust
let transfer_ctx = CpiContext::new_with_signer(
    token_program.to_account_info(),
    Transfer { from: escrow_token, to: owner_token, authority: escrow },
    &[&[b"escrow", guest.key().as_ref(), apartment_id.to_le_bytes().as_ref(), &[bump]]],
);
token::transfer(transfer_ctx, amount)?;
```

The `escrow` PDA signs via signer seeds, allowing it to authorize the transfer without a private key.

## Testing Patterns

See `tests/rental_escrow.ts` for full test suite. Common patterns:

### Creating an escrow
```typescript
await program.methods
  .initialize(new BN(apartmentId), new BN(amount), new BN(rentTime))
  .accounts({
    escrowAccount: escrowPDA,
    escrowTokenAccount: escrowATA,
    guestTokenAccount: guestATA,
    guest: guest.publicKey,
    owner: owner.publicKey,
    usdcMint,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  })
  .signers([guest])
  .rpc();
```

### Releasing a payment
```typescript
await program.methods
  .releasePayment()
  .accounts({
    escrowAccount: escrowPDA,
    escrowTokenAccount: escrowATA,
    ownerTokenAccount: ownerATA,
    guest: guest.publicKey,
    usdcMint,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .rpc();
```

## File Structure

```
programs/rental_escrow/
├── Cargo.toml                 # Dependencies (anchor, spl-token, etc.)
├── Xargo.toml                 # (optional) BPF-specific build config
└── src/
    └── lib.rs                 # Program logic, accounts, instructions
```

## Common Issues

**"Account is not executable"**
- Program ID in frontend IDL doesn't match deployed program. Update `app/lib/idl/rental_escrow.json` → `"address"` field.

**"Constraint failed" on instruction call**
- Account doesn't satisfy `#[account(...)]` constraints. Check seed derivation, token mint, account authority.

**"Insufficient funds for rent"**
- Transaction fee + rent cost exceeds wallet balance. Airdrop more SOL: `solana airdrop 2`

## Useful Commands

| Command | Purpose |
|---------|---------|
| `anchor build` | Compile program |
| `anchor test` | Run tests in sandbox |
| `anchor deploy` | Deploy to configured cluster |
| `anchor keys list` | Show program IDs |
| `solana program show <PROGRAM_ID>` | Inspect deployed program |
| `solana config get` | Show current cluster & wallet |

## Learn More

- [Anchor Book](https://www.anchor-lang.com/docs/intro)
- [Solana Program Library (SPL) Token](https://github.com/solana-labs/solana-program-library/tree/master/token/program)
- [PDAs & Signer Seeds](https://www.anchor-lang.com/docs/accounts#seed)
- [Solana Docs](https://docs.solana.com/)

## Related

- Frontend: [../../app/README.md](../../app/README.md)
