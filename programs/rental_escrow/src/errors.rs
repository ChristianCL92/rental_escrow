use anchor_lang::prelude::*;

#[error_code]
pub enum EscrowError {
    #[msg("Payment has already been released")]
    PaymentAlreadyReleased,
    #[msg("Check-in date has not been reached yet")]
    CheckInDateNotReached,
    #[msg("Cannot cancel booking after check-in date")]
    CannotCancelAfterCheckIn,
    #[msg("Invalid guest address")]
    InvalidGuest,
    #[msg("Invalid owner address")]
    InvalidOwner,
    #[msg("Apartment number does not exist")]
    InvalidApartmentId,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Rent time must be in the future")]
    InvalidRentTime,
}
