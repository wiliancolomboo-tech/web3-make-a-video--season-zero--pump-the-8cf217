use anchor_lang::prelude::*;

#[error_code]
pub enum CampaignError {
    #[msg("Campaign is currently paused or inactive.")]
    CampaignInactive,
    #[msg("Provided quest ID exceeds maximum index allowed (0-127).")]
    InvalidQuestId,
    #[msg("Quest has already been completed by this user.")]
    QuestAlreadyCompleted,
    #[msg("Cryptographic signature verification failed.")]
    InvalidOracleSignature,
    #[msg("Deposit amount is strictly below the minimum required for Pump the Pool.")]
    DepositBelowMinimum,
    #[msg("Numerical overflow occurred in calculations.")]
    MathOverflow,
    #[msg("Unauthorized account invoked this instruction.")]
    Unauthorized,
}