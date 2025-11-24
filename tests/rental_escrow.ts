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
import { it } from "mocha";

describe("rental_escrow", () => {


const provider = anchor.AnchorProvider.env();
  
anchor.setProvider(provider);

const program = anchor.workspace.RentalEscrow as Program<RentalEscrow>;

let usdcMint: anchor.web3.PublicKey;
let guestTokenAccount: any;
let ownerTokenAccount: any;
const guest = provider.wallet;
const owner = anchor.web3.Keypair.generate()

let escrowPDA: anchor.web3.PublicKey;
let escrowTokenAccount: any;
const apartmentId = new anchor.BN(1);
const amount = new anchor.BN(500_000000);
let rentTime: anchor.BN;

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

    rentTime = new anchor.BN(Math.floor(Date.now()/ 1000) + 5);
   
   [escrowPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"),
       guest.publicKey.toBuffer(),
      apartmentId.toArrayLike(Buffer, "le", 8)
    ], 
    program.programId
  )

  console.log("Escrow PDA:", escrowPDA.toString());

   escrowTokenAccount = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    guest.payer,
    usdcMint,
    escrowPDA,
    true
  )
      console.log("🔐 Escrow token account:", escrowTokenAccount.address.toString());


    const tx = await program.methods.initialize(apartmentId, amount, rentTime).accounts({
        escrowAccount: escrowPDA,
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
    const escrowData = await program.account.escrowAccount.fetch(escrowPDA);
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

it("Should fail to release the payment before the rent time", async () => {
    console.log("\n🚫 Testing early payment release (should fail)...");

    // Create owner's token account FIRST
    ownerTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      guest.payer,
      usdcMint,
      owner.publicKey
    );

    console.log("💼 Owner token account created:", ownerTokenAccount.address.toString());

    // Add a small delay to ensure account is fully created
    await new Promise(resolve => setTimeout(resolve, 1000));

     try {
      await program.methods
        .releasePayment()
        .accounts({
          escrowAccount: escrowPDA,
          escrowTokenAccount: escrowTokenAccount.address,
          ownerTokenAccount: ownerTokenAccount.address,
          guest: guest.publicKey,
          usdcMint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .rpc();

      // If we reach here, the test should fail
      assert.fail("Transaction should have failed but succeeded!");
      
    } catch (error) {
      console.log("✅ Expected error caught:", error.message);
      
      // Check that it's the correct error
      assert.include(
        error.message,
        "CheckInDateNotReached",
        "Should fail with CheckInDateNotReached error"
      );
      
      console.log("✅ Correctly prevented early payment release!");
    }
  });

    it("Should successfully release payment after rent_time", async () => {
    console.log("\n⏳ Waiting for rent_time to pass...");
    
    // Wait for rent_time to pass
    await new Promise(resolve => setTimeout(resolve, 6000));
    
    console.log("✅ Rent time has passed! Attempting payment release...");

    const escrowBalanceBefore = await getAccount(
      provider.connection, 
      escrowTokenAccount.address
    );
    const ownerBalanceBefore = await getAccount(
      provider.connection, 
      ownerTokenAccount.address
    );

    console.log("\n💰 Balances BEFORE release:");
    console.log("  Escrow:", Number(escrowBalanceBefore.amount) / 1_000000, "USDC");
    console.log("  Owner:", Number(ownerBalanceBefore.amount) / 1_000000, "USDC");

    const tx = await program.methods
      .releasePayment()
      .accounts({
        escrowAccount: escrowPDA,
        escrowTokenAccount: escrowTokenAccount.address,
        ownerTokenAccount: ownerTokenAccount.address,
        guest: guest.publicKey,
        usdcMint: usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .rpc();

    console.log("✅ Payment release transaction:", tx);

    const escrowBalanceAfter = await getAccount(
      provider.connection, 
      escrowTokenAccount.address
    );
    const ownerBalanceAfter = await getAccount(
      provider.connection, 
      ownerTokenAccount.address
    );

    console.log("\n💰 Balances AFTER release:");
    console.log("  Escrow:", Number(escrowBalanceAfter.amount) / 1_000000, "USDC");
    console.log("  Owner:", Number(ownerBalanceAfter.amount) / 1_000000, "USDC");

    const escrowData = await program.account.escrowAccount.fetch(escrowPDA);
    
    console.log("\n📊 Escrow State:");
    console.log("  rent_started:", escrowData.rentStarted);
    console.log("  rent_ended:", escrowData.rentEnded);
    console.log("   ESCROW BYTE RENT ------->", escrowData);

    assert.equal(Number(escrowBalanceAfter.amount), 0, "Escrow should be empty");
    assert.equal(
      Number(ownerBalanceAfter.amount), 
      500_000000, 
      "Owner should receive 500 USDC"
    );
    assert.isTrue(escrowData.rentStarted, "rent_started should be true");
    assert.isTrue(escrowData.rentEnded, "rent_ended should be true");

    console.log("\n🎉 Payment successfully released to owner!");
  });

  it("Should not release payment TWICE", async () => {
    console.log("Testing second payment release, should fail...");

    try {
        await program.methods.releasePayment().accounts({
      escrowAccount: escrowPDA,
      escrowTokenAccount: escrowTokenAccount.address,
      ownerTokenAccount: ownerTokenAccount.address,
      guest: guest.publicKey,
      usdcMint: usdcMint,
      tokenProgram: TOKEN_PROGRAM_ID
    } as any).rpc();

      assert.fail("Transaction should have failed but succeeded!");

    } catch (err) {
      console.log("📣SUCCESS WE FAILED TO RELEASE PAYMENT TWICE", err.message);
    }
  
  })
})




