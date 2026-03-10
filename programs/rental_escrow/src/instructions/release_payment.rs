use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};

use crate::errors::EscrowError;
use crate::state::EscrowAccount;

pub fn handler(ctx: Context<ReleasePayment>) -> Result<()> {
    let amount = ctx.accounts.escrow_account.amount;
    let apartment_id = ctx.accounts.escrow_account.apartment_id;
    let guest_key = ctx.accounts.escrow_account.guest_address;

    let escrow_account = &mut ctx.accounts.escrow_account;

    require!(
        !escrow_account.rent_ended,
        EscrowError::PaymentAlreadyReleased
    );

    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp >= escrow_account.rent_time as i64,
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
        Transfer {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            to: ctx.accounts.owner_token_account.to_account_info(),
            authority: ctx.accounts.escrow_account.to_account_info(),
        },
        signer_seeds,
    );

    token::transfer(tx_to_owner, amount)?;

    let close_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.escrow_token_account.to_account_info(),
            destination: ctx.accounts.guest.to_account_info(),
            authority: ctx.accounts.escrow_account.to_account_info(),
        },
        signer_seeds,
    );

    token::close_account(close_ctx)?;

    msg!("Payment released! {} USDC transferred to owner", amount);
    Ok(())
}

#[derive(Accounts)]
pub struct ReleasePayment<'info> {
    #[account(
        mut,
        close = guest,
        seeds = [b"escrow", guest.key().as_ref(), escrow_account.apartment_id.to_le_bytes().as_ref()],
        bump
    )]
    pub escrow_account: Account<'info, EscrowAccount>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = escrow_account,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = owner_token_account.owner == escrow_account.owner_address,
        constraint = owner_token_account.mint == usdc_mint.key(),
    )]
    pub owner_token_account: Account<'info, TokenAccount>,

    #[account(constraint = owner.key() == escrow_account.owner_address @ EscrowError::InvalidOwner)]
    pub owner: Signer<'info>,

    /// CHECK: Guest address that originally made the booking, receives rent refund
    #[account(
        mut,
        constraint = guest.key() == escrow_account.guest_address @ EscrowError::InvalidGuest
    )]
    pub guest: UncheckedAccount<'info>,

    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
}
