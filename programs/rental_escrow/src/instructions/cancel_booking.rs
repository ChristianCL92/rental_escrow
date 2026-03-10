use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};

use crate::errors::EscrowError;
use crate::state::EscrowAccount;

pub fn handler(ctx: Context<CancelBooking>) -> Result<()> {
    let escrow_account = &ctx.accounts.escrow_account;

    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp < escrow_account.rent_time as i64,
        EscrowError::CannotCancelAfterCheckIn
    );

    let apartment_id = escrow_account.apartment_id;
    let guest_address = escrow_account.guest_address;
    let amount = escrow_account.amount;

    let seeds = &[
        b"escrow",
        guest_address.as_ref(),
        &apartment_id.to_le_bytes(),
        &[ctx.bumps.escrow_account],
    ];

    let signer_seeds = &[&seeds[..]];

    let tx_to_guest = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            to: ctx.accounts.guest_token_account.to_account_info(),
            authority: ctx.accounts.escrow_account.to_account_info(),
        },
        signer_seeds,
    );

    token::transfer(tx_to_guest, amount)?;

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

    msg!(
        "Booking cancelled with {} USDC being returned to guest",
        amount
    );

    Ok(())
}

#[derive(Accounts)]
pub struct CancelBooking<'info> {
    #[account(
        mut,
        close = guest,
        seeds = [b"escrow", guest.key().as_ref(), escrow_account.apartment_id.to_le_bytes().as_ref()],
        bump,
        constraint = escrow_account.guest_address == guest.key()
    )]
    pub escrow_account: Account<'info, EscrowAccount>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = escrow_account
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub guest: Signer<'info>,

    #[account(
        mut,
        constraint = guest_token_account.owner == guest.key(),
        constraint = guest_token_account.mint == usdc_mint.key()
    )]
    pub guest_token_account: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,

    pub system_program: Program<'info, System>,
}
