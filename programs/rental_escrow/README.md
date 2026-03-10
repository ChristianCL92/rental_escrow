# On-Chain Program: Rental Escrow

The Anchor/Rust smart contract that manages escrow accounts, USDC custody, and payment flows for the El Solar vacation rental system.

**Program ID:** `2mGptfx2M9rTGsGExE9T3yLZ6MHSXLcgiQjD1NoVsfVa`

**See [../../README.md](../../README.md) for full project context.**

## Overview

The `rental_escrow` program implements three instructions for a complete booking lifecycle:

1. **`initialize`** — Guest creates an escrow, USDC transfers from guest to escrow token account
2. **`release_payment`** — Owner releases USDC from escrow to their wallet after check-in date
3. **`cancel_booking`** — Guest cancels before check-in, USDC refunds to guest, escrow account closes

All escrow accounts are **Program Derived Addresses (PDAs)** with seeds `[b"escrow", guest_pubkey, apartment_id_le_u64]`, ensuring one unique escrow per guest–apartment pair.

## File Structure

```
programs/rental_escrow/
├── Cargo.toml                     # Dependencies (anchor-lang, anchor-spl)
├── Xargo.toml                     # BPF build config
└── src/
    ├── lib.rs                     # Program entry point, instruction routing
    ├── state.rs                   # EscrowAccount struct + space calculation
    ├── errors.rs                  # Custom error codes
    ├── constants.rs               # Hardcoded security values
    └── instructions/
        ├── mod.rs                 # Re-exports all instructions
        ├── initialize.rs          # Create escrow + transfer USDC from guest
        ├── release_payment.rs     # Release USDC to owner + close token account
        └── cancel_booking.rs      # Refund USDC to guest + close escrow
```

## Account Layout

```rust
pub struct EscrowAccount {
    pub apartment_id: u64,       // Property identifier (1–5)
    pub amount: u64,             // USDC amount locked (6 decimals)
    pub owner_address: Pubkey,   // Property owner's wallet
    pub guest_address: Pubkey,   // Guest's wallet (used in PDA seeds)
    pub rent_time: u64,          // Check-in date as Unix timestamp (UTC)
    pub rent_started: bool,      // Set to true on release
    pub rent_ended: bool,        // Set to true on release (final state)
    pub reserved: [u8; 64],      // Reserved space for future fields
}
```

The `rent_started` and `rent_ended` flags form a simple state machine. Both start as `false`. On `release_payment`, both flip to `true` — there's no intermediate "started but not ended" state in the current implementation. The `reserved` bytes allow adding fields later without breaking existing account layouts.

## Security Constraints

Hardcoded in `constants.rs` — these are enforced on-chain and cannot be changed without redeploying:

| Constraint             | Value                                          | Purpose                                     |
| ---------------------- | ---------------------------------------------- | ------------------------------------------- |
| `OWNER_PUBKEY`         | `BFkaEmBxMfN3vcrmhzo1y86K4AHXi69eZPVE15bgs9xs` | Only this wallet can call `release_payment` |
| `MIN_APARTMENT_NUMBER` | 1                                              | Rejects apartment IDs below range           |
| `MAX_APARTMENT_NUMBER` | 5                                              | Rejects apartment IDs above range           |
| `MIN_PAYMENT_AMOUNT`   | 30,000,000 (30 USDC)                           | Prevents dust/spam escrows                  |

Additionally, `initialize` validates that `rent_time` is not in the past (compared against UTC start-of-day from Solana's clock).

## Instructions

### `initialize(apartment_id, amount, rent_time)`

**Signer:** Guest

**What it does:**

1. Validates owner pubkey, apartment ID range, minimum payment, and future rent time
2. Creates the escrow PDA account (guest pays rent)
3. Stores booking details in the escrow account
4. CPI transfers USDC from guest's token account → escrow's token account

**Accounts:**

| Account                | Type             | Description                                            |
| ---------------------- | ---------------- | ------------------------------------------------------ |
| `escrow_account`       | PDA (init)       | New escrow, seeded by guest + apartment_id             |
| `escrow_token_account` | TokenAccount     | Holds USDC, authority = escrow PDA                     |
| `guest_token_account`  | TokenAccount     | Guest's USDC source                                    |
| `guest`                | Signer           | Pays for account creation + signs transfer             |
| `owner`                | UncheckedAccount | Stored for reference, validated against `OWNER_PUBKEY` |
| `usdc_mint`            | Mint             | USDC token mint                                        |
| `token_program`        | Program          | SPL Token Program                                      |
| `system_program`       | Program          | System Program                                         |

### `release_payment()`

**Signer:** Owner

**What it does:**

1. Checks `rent_ended == false` (prevents double release)
2. Checks `current_time >= rent_time` (check-in date must have passed)
3. Sets `rent_started = true`, `rent_ended = true`
4. CPI transfers USDC from escrow token account → owner's token account (PDA signs)
5. Closes the escrow token account (rent refund goes to guest)
6. Closes the escrow PDA account (via `close = guest` constraint, lamports return to guest)

**Accounts:**

| Account                | Type             | Description                               |
| ---------------------- | ---------------- | ----------------------------------------- |
| `escrow_account`       | PDA (mut, close) | Escrow being released                     |
| `escrow_token_account` | TokenAccount     | Source of USDC                            |
| `owner_token_account`  | TokenAccount     | Owner's USDC destination                  |
| `owner`                | Signer           | Must match `escrow_account.owner_address` |
| `guest`                | UncheckedAccount | Receives lamports from closed accounts    |
| `usdc_mint`            | Mint             | USDC token mint                           |
| `token_program`        | Program          | SPL Token Program                         |

### `cancel_booking()`

**Signer:** Guest

**What it does:**

1. Checks `current_time < rent_time` (can only cancel before check-in)
2. CPI transfers USDC from escrow token account → guest's token account (full refund, PDA signs)
3. Closes the escrow token account (lamports return to guest)
4. Closes the escrow PDA account (via `close = guest` constraint)

**Accounts:**

| Account                | Type             | Description                       |
| ---------------------- | ---------------- | --------------------------------- |
| `escrow_account`       | PDA (mut, close) | Escrow being cancelled            |
| `escrow_token_account` | TokenAccount     | USDC to refund                    |
| `guest`                | Signer           | Must match escrow's guest_address |
| `guest_token_account`  | TokenAccount     | Guest's USDC destination          |
| `usdc_mint`            | Mint             | USDC token mint                   |
| `token_program`        | Program          | SPL Token Program                 |
| `system_program`       | Program          | System Program                    |

## Account Closure and Rebooking

Both `release_payment` and `cancel_booking` close the escrow PDA account. This is important because PDAs are deterministic — the same guest + apartment_id always derives the same address. If the account weren't closed, a guest couldn't book the same apartment again since `init` would fail on the existing account. Closing it frees the PDA for reuse.

## Data Flow

```
BOOKING:
  Guest → initialize(apartment_id, amount, rent_time)
       → USDC moves: guest_token_account → escrow_token_account
       → Escrow PDA created with booking details

RELEASE (happy path):
  Owner → release_payment()
       → Requires: check-in date passed, not already released
       → USDC moves: escrow_token_account → owner_token_account (PDA signs)
       → Escrow token account closed
       → Escrow PDA closed (lamports → guest)

CANCEL:
  Guest → cancel_booking()
       → Requires: before check-in date
       → USDC moves: escrow_token_account → guest_token_account (PDA signs)
       → Escrow token account closed
       → Escrow PDA closed (lamports → guest)
```

## Key Implementation Details

### PDA as Token Authority

The escrow PDA acts as the authority over its associated token account. This means no private key exists for the escrow — token transfers are authorized via **signer seeds** in CPI calls:

```rust
let seeds = &[
    b"escrow",
    guest_key.as_ref(),
    &apartment_id.to_le_bytes(),
    &[ctx.bumps.escrow_account],
];
let signer_seeds = &[&seeds[..]];

let transfer_ctx = CpiContext::new_with_signer(
    ctx.accounts.token_program.to_account_info(),
    Transfer { from: escrow_token, to: destination_token, authority: escrow_account },
    signer_seeds,
);
token::transfer(transfer_ctx, amount)?;
```

### Idempotent Token Account Creation

The program does not create the escrow's associated token account — the **frontend** handles this before calling `initialize` using `createAssociatedTokenAccountIdempotentInstruction`. This keeps the on-chain logic simpler and avoids failures if the ATA already exists.

### Timezone Handling

Solana's `Clock::get()` returns UTC timestamps. The `rent_time` field stores the check-in date as a UTC Unix timestamp. The frontend must normalize dates using `Date.UTC()` to avoid off-by-one bugs where a booking made late in the day (local time) would appear to be in the past (UTC).

## Building

```bash
anchor build
```

Output: `target/deploy/rental_escrow.so` (compiled program binary)

After building, copy the IDL and types to the frontend:

```bash
cp target/idl/rental_escrow.json app/lib/idl/
cp target/types/rental_escrow.ts app/lib/types/
```

## Testing

```bash
anchor test
```

This starts a local validator, deploys the program, and runs `tests/rental_escrow.ts` with Mocha. To run a specific test:

```bash
anchor test -- --grep "initialize"
```

### Testing Patterns

```typescript
// Creating an escrow
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

// Releasing payment
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

// Cancelling a booking
await program.methods
  .cancelBooking()
  .accounts({
    escrowAccount: escrowPDA,
    escrowTokenAccount: escrowATA,
    guest: guest.publicKey,
    guestTokenAccount: guestATA,
    usdcMint,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  })
  .signers([guest])
  .rpc();
```

## Deploying

1. Set the cluster: `solana config set --url devnet`
2. Ensure wallet has SOL: `solana airdrop 2`
3. Deploy: `anchor deploy`

After deployment, update `Anchor.toml` and `app/lib/idl/rental_escrow.json` → `"address"` field if the program ID changes.

## Error Codes

| Error                      | When                                                   |
| -------------------------- | ------------------------------------------------------ |
| `PaymentAlreadyReleased`   | `release_payment` called on an already-released escrow |
| `CheckInDateNotReached`    | `release_payment` called before `rent_time`            |
| `CannotCancelAfterCheckIn` | `cancel_booking` called after `rent_time`              |
| `InvalidGuest`             | Guest address doesn't match escrow's stored guest      |
| `InvalidOwner`             | Owner address doesn't match `OWNER_PUBKEY` constant    |
| `InvalidApartmentId`       | Apartment ID outside 1–5 range                         |
| `InvalidAmount`            | Payment below 30 USDC minimum                          |
| `InvalidRentTime`          | Check-in date is in the past                           |

## Common Issues

**"Account is not executable"**

- Program ID in frontend IDL doesn't match deployed program. Update `app/lib/idl/rental_escrow.json` → `"address"` field.

**"Constraint failed"**

- Account doesn't satisfy `#[account(...)]` constraints. Check PDA seed derivation, token mint match, and account authority.

**"Insufficient funds for rent"**

- Transaction fee + account rent exceeds wallet SOL balance. Run `solana airdrop 2`.

## Related

- Root project: [../../README.md](../../README.md)
- Frontend: [../../app/README.md](../../app/README.md)
