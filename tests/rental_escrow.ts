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
let escrowPDA2: anchor.web3.PublicKey;
let escrowPDA3: anchor.web3.PublicKey;
let escrowTokenAccount: any;
let escrowTokenAccount2: any;
let escrowTokenAccount3: any;
const apartmentId = new anchor.BN(1);
const apartmentId2 = new anchor.BN(2);
const apartmentId3 = new anchor.BN(3);
const amount = new anchor.BN(500_000000);
let rentTime: anchor.BN;
let rentTime2: anchor.BN;
let rentTime3: anchor.BN;

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

  it("should create a second escrow for testing..", async() => {
      rentTime2 = new anchor.BN(Math.floor(Date.now()/ 1000) + 30)

    const escrowPDAResult = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"),
        guest.publicKey.toBuffer(),
        apartmentId2.toArrayLike(Buffer, "le", 8)
      ],
      program.programId
    );

    escrowPDA2 = escrowPDAResult[0]

      console.log("Escrow PDA 2:", escrowPDA2.toString());

      escrowTokenAccount2 = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        guest.payer,
        usdcMint,
        escrowPDA2,
        true
      )

      console.log("escrow token account2 created with address:", escrowTokenAccount2.address.toString())

      await mintTo(
        provider.connection,
        guest.payer,
        usdcMint,
        guestTokenAccount.address,
        guest.publicKey,
        500_000000 
      )

      const tx = await program.methods.initialize(
        apartmentId2, amount, rentTime2
      ).accounts({
        escrowAccount: escrowPDA2,
        escrowTokenAccount: escrowTokenAccount2.address,
        guestTokenAccount: guestTokenAccount.address,
        usdcMint: usdcMint,
        guest: guest.publicKey,
        owner: owner.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any).rpc()

      console.log("second escrow account created", tx);

      const escrowBalance = await getAccount(provider.connection, escrowTokenAccount2.address);
      console.log("Balance inside token escrow account", Number(escrowTokenAccount2.amount)/ 1_000000, "USDC");

        assert.equal(Number(escrowBalance.amount), 500_000000, "Escrow 2 should hold 500 USDC");

    })

    it("Should successfully cancel booking before check-in", async() => {
      
      const balanceBeforeCancel = await getAccount(provider.connection, guestTokenAccount.address);
      console.log("Balance before canceling room is", Number(balanceBeforeCancel.amount)/1_000000, "USDC");

      const tx = await program.methods.cancelBooking().accounts({
      escrowAccount: escrowPDA2,
      escrowTokenAccount: escrowTokenAccount2.address,
      guestTokenAccount: guestTokenAccount.address,
      guest: guest.publicKey,
      usdcMint,
      tokenProgram: TOKEN_PROGRAM_ID,
      } as any).rpc();

      console.log("✅ Cancel transaction:", tx);

      const balanceAfterCancel = await getAccount(provider.connection, guestTokenAccount.address);
      console.log("  Guest balance AFTER:", Number(balanceAfterCancel.amount) / 1_000000, "USDC");

      const fundsReceived = Number(balanceAfterCancel.amount) - Number(balanceBeforeCancel.amount);
      console.log("Funds received", fundsReceived/1_000000, "USDC");

      assert.equal(fundsReceived, 500_000000, "Guest should receive 500 USDC refund");
    
      try {
       await program.account.escrowAccount.fetch(escrowPDA2);
        assert.fail("Escrow account is not closed!");
        } catch (error) {
        console.log("✅ Escrow account successfully closed!");
        assert.include(error.message, "Account does not exist")
        }
      //Verifying that Token escrow account is closed
      try {
        await getAccount(provider.connection, escrowTokenAccount2.address);
        assert.fail("Escrow token account is not closed!");
      } catch (error) {
          console.log("✅ Escrow token account successfully closed!");
      }
       console.log("\n🎉 Cancel booking test passed!");
      })

    it("should fail to cancel booking after check-in started", async() => {
        rentTime3 = new anchor.BN(Math.floor(Date.now() / 1000) + 2);

        [escrowPDA3] = anchor.web3.PublicKey.findProgramAddressSync(
          [Buffer.from("escrow"),
           guest.publicKey.toBuffer(), 
           apartmentId3.toArrayLike(Buffer,"le", 8)
          ],
        program.programId
        )

        console.log("PDA3 created for test 3", escrowPDA3);

        escrowTokenAccount3 = await getOrCreateAssociatedTokenAccount(
          provider.connection,
           guest.payer,
          usdcMint,
           escrowPDA3,
            true
          )

        await mintTo(
          provider.connection,
          guest.payer,
          usdcMint,
          guestTokenAccount.address,
          guest.publicKey,
          500_000000,
        )

        await program.methods.initialize(apartmentId3, amount, rentTime3).accounts({
          escrowAccount: escrowPDA3,
          escrowTokenAccount: escrowTokenAccount3.address,
          guestTokenAccount: guestTokenAccount.address,
          usdcMint,
          guest: guest.publicKey,
          owner: owner.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId
        } as any).rpc();

        await new Promise((resolve) => setTimeout(resolve, 3000))

        console.log("Check-in time passed, trying to cancel booking...");

        try {
          await program.methods.cancelBooking().accounts({
          escrowAccount: escrowPDA3,
          escrowTokenAccount: escrowTokenAccount3.address,
          guest: guest.publicKey,
          guestTokenAccount: guestTokenAccount.address,
          usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any).rpc();

          assert.fail("Cancel should have failed after check-in!");
        } catch (error) {
          console.log("Successfully failed to cancel booking!", error.message);

          assert.include(
          error.message,
        "CannotCancelAfterCheckIn",
        "Should fail with CannotCancelAfterCheckIn"
          );
    console.log("✅ Correctly prevented late cancellation!");
        }
      

  })

})
