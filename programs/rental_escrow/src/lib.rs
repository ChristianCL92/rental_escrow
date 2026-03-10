use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("2mGptfx2M9rTGsGExE9T3yLZ6MHSXLcgiQjD1NoVsfVa");

#[program]
pub mod rental_escrow {
    use super::*;

    pub fn initialize(
        ctx: Context<InitializeEscrow>,
        apartment_id: u64,
        amount: u64,
        rent_time: u64,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, apartment_id, amount, rent_time)
    }

    pub fn release_payment(ctx: Context<ReleasePayment>) -> Result<()> {
        instructions::release_payment::handler(ctx)
    }

    pub fn cancel_booking(ctx: Context<CancelBooking>) -> Result<()> {
        instructions::cancel_booking::handler(ctx)
    }
}
