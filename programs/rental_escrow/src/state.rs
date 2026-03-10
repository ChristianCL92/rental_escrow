use anchor_lang::prelude::*;

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
    pub reserved: [u8; 64],
}

impl EscrowAccount {
    pub const LEN: usize = Self::DISCRIMINATOR.len() + Self::INIT_SPACE;
}
