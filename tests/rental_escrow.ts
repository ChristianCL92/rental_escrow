import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { RentalEscrow } from "../target/types/rental_escrow";
import { 
  TOKEN_PROGRAM_ID, 
  createMint, 
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount
} from "@solana/spl-token";
import { assert } from "chai";

describe("rental_escrow", () => {


const provider = anchor.AnchorProvider.env();
  
anchor.setProvider(provider);

const program = anchor.workspace.RentalEscrow as Program<RentalEscrow>;

let usdcMint: anchor.web3.PublicKey;
let guestTokenAccount;
const guest = provider.wallet;
const owner = anchor.web3.Keypair.generate()

it("Should create USDC mint and fund guest", async() => {
console.log("\n creating fake USDC mint for testing...");

usdcMint = await createMint(
  provider.connection,
  guest.payer,
  guest.publicKey,
  null,
  6
); 

console.log("Mint address for USDC created successfully", usdcMint.toString());

const guestAccount = guest.payer;

   guestTokenAccount = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    guestAccount,
    usdcMint,
    guest.publicKey
    );

  await mintTo(
  provider.connection, 
  guestAccount, 
  usdcMint,
  guestTokenAccount.address,
  guest.publicKey,
  1000_000000
);

const guestAccountInfo = await getAccount(provider.connection, guestTokenAccount.address);

console.log("Guest has the following USDC balance:", Number(guestAccountInfo.amount)/1_000000, "USDC")

})

it("Should create the PDA for escrow-account and fund it with UDSC", async () => {
  const apartmentId = new anchor.BN(1);
  const amount = new anchor.BN(500_000000)
  const rentTime = new anchor.BN(Math.floor(Date.now()/ 1000) + 86400);
  
  const [PDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"),
       guest.publicKey.toBuffer(),
      apartmentId.toArrayLike(Buffer, "le", 8)
    ], 
    program.programId
  )

  console.log("Escrow PDA:", PDA.toString());

  const escrowTokenAccount = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    guest.payer,
    usdcMint,
    PDA,
    true
  )
      console.log("🔐 Escrow token account:", escrowTokenAccount.address.toString());


    const tx = await program.methods.initialize(apartmentId, amount, rentTime).accounts({
        escrowAccount: PDA,
        escrowTokenAccount: escrowTokenAccount.address,
        guestTokenAccount: guestTokenAccount.address,
        usdcMint: usdcMint,
        guest: guest.publicKey,
        owner: owner.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,

    } as any).rpc();

    console.log("✅ Transaction signature:", tx);

    // Verify escrow was created
    const escrowData = await program.account.escrowAccount.fetch(PDA);
    console.log("\n📊 Escrow Data:");
    console.log("  Apartment ID:", escrowData.apartmentId.toNumber());
    console.log("  Amount:", Number(escrowData.amount) / 1_000000, "USDC");
    console.log("  Rent Time:", escrowData.rentTime.toNumber())

    // Check balances
    const guestBalance = await getAccount(provider.connection, guestTokenAccount.address);
    const escrowBalance = await getAccount(provider.connection, escrowTokenAccount.address);

    console.log("\n💸 Balances after escrow:");
    console.log("  Guest:", Number(guestBalance.amount) / 1_000000, "USDC");
    console.log("  Escrow:", Number(escrowBalance.amount) / 1_000000, "USDC");

    // Assertions
    assert.equal(escrowData.apartmentId.toNumber(), 1);
    assert.equal(Number(escrowBalance.amount), 500_000000);
    assert.equal(Number(guestBalance.amount), 500_000000);

    console.log("\n✅ All checks passed! Escrow holds 500 USDC!");

})

});


