use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint };

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

        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer{
                    from: ctx.accounts.guest_token_account.to_account_info(),
                    to: ctx.accounts.escrow_token_account.to_account_info(),
                    authority: ctx.accounts.guest.to_account_info(),
            },
          );

         token::transfer(transfer_ctx, amount)?;


        msg!("Escrow created! {} USDC transferred to escrow", amount);
        Ok(())
    }

    pub fn release_payment(ctx: Context<ReleasePayment>) -> Result<()> {
        
        let amount = ctx.accounts.escrow_account.amount;
        let apartment_id = ctx.accounts.escrow_account.apartment_id;
        let guest_key = ctx.accounts.escrow_account.guest_address;

        let escrow_account =  &mut ctx.accounts.escrow_account;

        require!(!escrow_account.rent_ended,
            EscrowError::PaymentAlreadyReleased
        );

        let clock = Clock::get()?;
        require!(clock.unix_timestamp >= escrow_account.rent_time as i64,
        EscrowError::CheckInDateNotReached
        );

        escrow_account.rent_started = true;
        escrow_account.rent_ended = true;

        

        let seeds = &[
            b"escrow",
            guest_key.as_ref(),
            &apartment_id.to_le_bytes(),
            &[ctx.bumps.escrow_account],
        ];

        let signer_seeds = &[&seeds[..]];

        let tx_to_owner = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer{
                from:ctx.accounts.escrow_token_account.to_account_info(),
                to: ctx.accounts.owner_token_account.to_account_info(),
                authority: ctx.accounts.escrow_account.to_account_info(),
            }            
            , 
            signer_seeds,
        );

        token::transfer(tx_to_owner, amount)?;

    msg!("Payment released! {} USDC transferred to owner", amount);
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
    pub escrow_account: Account <'info, EscrowAccount>,

    #[account(
    mut,
    token::mint = usdc_mint,
    token:: authority = escrow_account, 
    )]
    pub escrow_token_account: Account <'info, TokenAccount>,

    #[account(
    mut,
    constraint = guest_token_account.owner == guest.key(),
    constraint= guest_token_account.mint == usdc_mint.key(),

    )]
    pub guest_token_account: Account<'info, TokenAccount>,

    
    #[account(mut)]
    pub guest: Signer<'info>,

    pub usdc_mint: Account <'info, Mint>,

    ///CHECK: The property owner's wallet address, is only stored for reference.
    /// No need to validate because I am just recording when owner wallet receives payment later
    pub owner: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program <'info, System>,

}

#[derive(Accounts)]
pub struct ReleasePayment <'info> {  
    #[account(
        mut,
        seeds =[b"escrow", guest.key().as_ref(), escrow_account.apartment_id.to_le_bytes().as_ref()],
        bump
    )]
    pub escrow_account: Account <'info, EscrowAccount>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = escrow_account,
    )]
    pub escrow_token_account: Account <'info, TokenAccount>,

    #[account(
        mut,
        constraint = owner_token_account.owner == escrow_account.owner_address,
        constraint = owner_token_account.mint == usdc_mint.key(),
    )]
    pub owner_token_account: Account<'info, TokenAccount>,
    
    ///CHECK: just reading the guest address from escrow_account
    pub guest :UncheckedAccount <'info> ,

    pub usdc_mint: Account<'info, Mint>,
    
    pub token_program: Program<'info, Token>,

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
    pub rent_ended: bool,
    pub reserved: [u8; 64]
}

impl EscrowAccount {
    pub const LEN: usize = Self::DISCRIMINATOR.len() + Self::INIT_SPACE;
}

#[error_code]
pub enum EscrowError {
    #[msg("Payment has already been released")]
    PaymentAlreadyReleased,
    #[msg("Check-in date has not been reached yet")]
    CheckInDateNotReached,
}