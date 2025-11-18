use anchor_lang::prelude::*;

declare_id!("2mGptfx2M9rTGsGExE9T3yLZ6MHSXLcgiQjD1NoVsfVa");

#[program]
pub mod rental_escrow {
    use super::*;

    pub fn initialize(ctx: Context<InitializeEscrow>,
         apartment_id:u64,
         amount: u64,
         rent_time: u64
        ) -> Result<()> {
        let escrow_account =  &mut ctx.accounts.escrow_account;
        escrow_account.apartment_id = apartment_id;
        escrow_account.amount = amount;
        escrow_account.owner_address = ctx.accounts.owner.key();
        escrow_account.guest_address = ctx.accounts.guest.key();
        escrow_account.rent_time = rent_time;
        escrow_account.rent_started =false;
        escrow_account.rent_ended = false;


        msg!("Escrow account for apartment {}", apartment_id);
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(apartment_id: u64)]
pub struct InitializeEscrow <'info> {
#[account(
    init,
    payer = guest,
    space= EscrowAccount::LEN,
    seeds = [b"escrow", guest.key().as_ref(), apartment_id.to_le_bytes().as_ref()],
    bump
)]
    
pub escrow_account: Account < 'info, EscrowAccount>,
    
#[account(mut)]
pub guest: Signer<'info>,

///CHECK: The property owner's wallet address, is only stored for reference.
/// No need to validate because I am just recording when owner wallet receives payment later
pub owner: UncheckedAccount<'info>,

pub system_program: Program <'info, System>

}


#[account]
#[derive(InitSpace)]
pub struct EscrowAccount {
    pub apartment_id: u64,
    pub amount: u64,
    pub owner_address: Pubkey,
    pub guest_address: Pubkey,
    pub rent_time: u64,
    pub rent_started: bool,
    pub rent_ended: bool
}

impl EscrowAccount {
    pub const LEN: usize = Self::DISCRIMINATOR.len() + Self::INIT_SPACE;
}
